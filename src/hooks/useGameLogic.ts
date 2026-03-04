import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Tile, UserGroup, GameState, GameAction, ActionResponse } from '../types';
import { useSocket } from './useSocket';
import { getRandomColor } from '../utils/colors';
import categoriesDataRaw from '../data/categories.json';

const categoriesData = categoriesDataRaw as Record<string, string[]>;

export function useGameLogic(initialRoomCode: string | null) {
  const router = useRouter();
  const [state, setState] = useState<GameState>({
    roomCode: initialRoomCode,
    gridSize: 4,
    tiles: [],
    userGroups: [],
    completedCategories: [],
    mistakes: 0,
    score: 0,
    tilesPerRow: 12,
    autoRefill: false,
    lastActionResult: null
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  
  const isRemoteUpdate = useRef(false);
  const stateRef = useRef(state);
  const selectedTileRef = useRef<Tile | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { selectedTileRef.current = selectedTile; }, [selectedTile]);

  // --- ATOMIC SURGICAL ENGINE ---

  const applyMergeSurgical = (prevState: GameState, survivorId: string, mergedId: string, newGroupColor: string, forceGroupId?: string): { next: GameState, success: boolean } => {
    const survivor = prevState.tiles.find(t => t.id === survivorId);
    const merged = prevState.tiles.find(t => t.id === mergedId);

    if (!survivor || !merged || survivor.id === mergedId || survivor.hidden || merged.hidden) return { next: prevState, success: false };

    if (survivor.realCategory === merged.realCategory) {
      let targetId = survivor.userGroupId || merged.userGroupId || forceGroupId;
      
      if (!targetId) {
        targetId = Math.random().toString(36).substring(2, 9);
      }

      let newUserGroups = [...prevState.userGroups];
      
      if (!prevState.userGroups.find(g => g.id === targetId)) {
        newUserGroups.push({ id: targetId as string, name: `Group ${newUserGroups.length + 1}`, color: newGroupColor, lastUpdated: Date.now() });
      } else {
        newUserGroups = newUserGroups.map(g => g.id === targetId ? { ...g, lastUpdated: Date.now() } : g);
      }

      const sOldId = survivor.userGroupId;
      const mOldId = merged.userGroupId;

      const nextTiles = prevState.tiles.map(t => {
        if (t.id === mergedId) return { ...t, hidden: true, userGroupId: targetId };
        if (t.id === survivorId) {
          const survivorItems = t.text.split(', ').map(s => s.trim());
          const mergedItems = merged.text.split(', ').map(s => s.trim());
          return { 
            ...t, 
            text: Array.from(new Set([...survivorItems, ...mergedItems])).join(', '),
            itemCount: t.itemCount + merged.itemCount,
            userGroupId: targetId
          };
        }
        if ((sOldId && t.userGroupId === sOldId) || (mOldId && t.userGroupId === mOldId)) return { ...t, userGroupId: targetId };
        return t;
      });

      return { next: { ...prevState, tiles: nextTiles, userGroups: newUserGroups, score: prevState.score + 1 }, success: true };
    } else {
      return { next: { ...prevState, mistakes: prevState.mistakes + 1 }, success: false };
    }
  };

  const applyActionToState = useCallback((action: GameAction, prevState: GameState): { next: GameState, success: boolean } => {
    let result: { next: GameState, success: boolean } = { next: { ...prevState, lastActionResult: null }, success: true };
    
    switch (action.type) {
      case 'MERGE_TILES': {
        const mergeResult = applyMergeSurgical(prevState, action.payload.tile1Id, action.payload.tile2Id, action.payload.newGroupColor, action.payload.newGroupId);
        result = { next: { ...mergeResult.next, lastActionResult: null }, success: mergeResult.success };
        break;
      }
      case 'RENAME_GROUP':
        result.next = { ...prevState, userGroups: prevState.userGroups.map(g => g.id === action.payload.groupId ? { ...g, name: action.payload.newName } : g) };
        break;
      case 'TAG_TILE': {
        const { tileId, groupId, newGroupId } = action.payload;
        if (groupId === null) {
          const tile = prevState.tiles.find(t => t.id === tileId);
          const currentGroupId = tile?.userGroupId;
          const groupCount = currentGroupId ? prevState.tiles.reduce((acc, t) => (t.userGroupId === currentGroupId && !t.hidden && !t.locked) ? acc + t.itemCount : acc, 0) : 0;
          if (tile && tile.itemCount === 1 && groupCount === 1) nextState: { result.next = { ...prevState, tiles: prevState.tiles.map(t => t.id === tileId ? { ...t, userGroupId: null } : t) }; }
          else result.success = false;
        } else {
          const primary = prevState.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
          if (primary) result = applyMergeSurgical(prevState, primary.id, tileId, '#fff', newGroupId);
          else result.next = { ...prevState, tiles: prevState.tiles.map(t => t.id === tileId ? { ...t, userGroupId: groupId } : t) };
        }
        break;
      }
      case 'CREATE_GROUP':
        const existing = prevState.userGroups.find(g => g.id === action.payload.group.id);
        result.next = { 
          ...prevState, 
          userGroups: existing ? prevState.userGroups : [...prevState.userGroups, action.payload.group],
          tiles: action.payload.tileId ? prevState.tiles.map(t => t.id === action.payload.tileId ? { ...t, userGroupId: action.payload.group.id } : t) : prevState.tiles
        };
        break;
      case 'REFILL_BOARD':
        result.next = { ...prevState, tiles: [...prevState.tiles.filter(t => !t.locked && !t.hidden), ...prevState.tiles.filter(t => t.locked)] };
        break;
      case 'UPDATE_SETTINGS':
        result.next = { ...prevState, tilesPerRow: action.payload.tilesPerRow ?? prevState.tilesPerRow, autoRefill: action.payload.autoRefill ?? prevState.autoRefill };
        break;
      case 'CLEAR_RESULT':
        result.next = { ...prevState, lastActionResult: null };
        break;
    }

    // Surgical Completion Pass
    const groupCounts: Record<string, number> = {};
    result.next.tiles.forEach(tile => { if (tile.userGroupId && !tile.locked && !tile.hidden) groupCounts[tile.userGroupId] = (groupCounts[tile.userGroupId] || 0) + tile.itemCount; });
    const finishedGids = Object.entries(groupCounts).filter(([gid, count]) => count === prevState.gridSize).map(([gid]) => gid);
    
    if (finishedGids.length > 0) {
      const newCats: string[] = [];
      const updatedTiles = result.next.tiles.map(t => {
        if (t.userGroupId && finishedGids.includes(t.userGroupId)) {
          const groupTiles = result.next.tiles.filter(gt => gt.userGroupId === t.userGroupId && !gt.locked);
          if (groupTiles.every(gt => gt.realCategory === groupTiles[0].realCategory)) {
            if (!newCats.includes(t.realCategory)) newCats.push(t.realCategory);
            return { ...t, locked: true, userGroupId: null };
          }
        }
        return t;
      });
      result.next = { ...result.next, completedCategories: [...result.next.completedCategories, ...newCats.filter(c => !result.next.completedCategories.includes(c))], tiles: updatedTiles };
    }

    // Atomic Feedback Payload
    if (!prevState.roomCode) {
      let involvedTileIds: string[] | undefined = undefined;
      if (action.type === 'MERGE_TILES') involvedTileIds = [action.payload.tile1Id, action.payload.tile2Id];
      else if (action.type === 'TAG_TILE') involvedTileIds = [action.payload.tileId];
      
      result.next.lastActionResult = { success: result.success, actionType: action.type, involvedTileIds };
    }

    return result;
  }, []);

  // --- HANDLERS ---

  const onActionResult = useCallback((response: ActionResponse) => {
    setState(prev => ({ ...prev, lastActionResult: response }));
    setTimeout(() => setState(prev => ({ ...prev, lastActionResult: null })), 1500);
  }, []);

  const { dispatchAction, isHost } = useSocket(state.roomCode, (ns) => { isRemoteUpdate.current = true; setState(ns); setIsPlaying(true); setTimeout(() => { isRemoteUpdate.current = false; }, 200); }, () => isPlaying ? stateRef.current : null, (a) => setState(prev => applyActionToState(a, prev).next), onActionResult);

  const handleAction = useCallback((action: GameAction) => {
    const startTime = performance.now();
    setState(prev => {
      const result = applyActionToState(action, prev);
      return result.next;
    });
    if (stateRef.current.roomCode) dispatchAction(action);
    const endTime = performance.now();
    console.log(`[PERF] ${action.type} processed in ${(endTime - startTime).toFixed(2)}ms`);
  }, [dispatchAction, applyActionToState]);

  // PUBLIC MODULAR API
  const game = useMemo(() => ({
    merge: (t1: string, t2: string) => handleAction({ type: 'MERGE_TILES', payload: { tile1Id: t1, tile2Id: t2, newGroupColor: getRandomColor(stateRef.current.userGroups.map(g => g.color)), newGroupId: Math.random().toString(36).substring(2, 9) } }),
    tag: (tileId: string, groupId: string | null) => handleAction({ type: 'TAG_TILE', payload: { tileId, groupId, newGroupId: Math.random().toString(36).substring(2, 9) } }),
    createGroup: (tileId: string | null = null) => {
      const targetId = tileId || selectedTileRef.current?.id;
      const targetTile = stateRef.current.tiles.find(t => t.id === targetId);
      if (targetTile?.userGroupId) return null;
      const newId = Math.random().toString(36).substring(2, 9);
      handleAction({ type: 'CREATE_GROUP', payload: { tileId: targetId || null, group: { id: newId, name: `Group ${stateRef.current.userGroups.length + 1}`, color: getRandomColor(stateRef.current.userGroups.map(g => g.color)), lastUpdated: Date.now() } } });
      return newId;
    },
    renameGroup: (groupId: string, newName: string) => handleAction({ type: 'RENAME_GROUP', payload: { groupId, newName } }),
    updateSettings: (s: any) => handleAction({ type: 'UPDATE_SETTINGS', payload: s }),
    refill: () => handleAction({ type: 'REFILL_BOARD' }),
    start: (multi: boolean, size: number) => {
      const x = Math.min(Math.max(size, 2), 50);
      const allCatNames = Object.keys(categoriesData);
      const shuffledCatNames = [...allCatNames].sort(() => 0.5 - Math.random());
      const usedItems = new Set<string>();
      const selectedCats: string[] = [];
      let initialTiles: Tile[] = [];
      for (const cat of shuffledCatNames) {
        if (selectedCats.length >= x) break;
        const items = categoriesData[cat].slice(0, x);
        if (!items.some(item => usedItems.has(item.toLowerCase()))) {
          selectedCats.push(cat);
          items.forEach(item => { usedItems.add(item.toLowerCase()); initialTiles.push({ id: Math.random().toString(36).substring(2, 9), text: item, realCategory: cat, userGroupId: null, locked: false, itemCount: 1 }); });
        }
      }
      for (let i = initialTiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [initialTiles[i], initialTiles[j]] = [initialTiles[j], initialTiles[i]]; }
      const newState: GameState = { roomCode: multi ? Math.random().toString(36).substring(2, 7).toUpperCase() : null, gridSize: x, tiles: initialTiles, userGroups: [], completedCategories: [], mistakes: 0, score: 0, tilesPerRow: x, autoRefill: false, lastActionResult: null };
      setState(newState); setIsPlaying(true);
      if (multi) router.push(`/?room=${newState.roomCode}`); else router.push('/');
    },
    quit: () => { localStorage.removeItem('superConnectionsState'); setIsPlaying(false); setState(prev => ({ ...prev, roomCode: null })); router.push('/'); }
  }), [handleAction, router]);

  // Persistence
  useEffect(() => {
    if (isLoaded) return;
    const saved = localStorage.getItem('superConnectionsState');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.isPlaying && (!initialRoomCode || parsed.roomCode === initialRoomCode)) { setState(parsed); setIsPlaying(true); }
    }
    setIsLoaded(true);
  }, [initialRoomCode, isLoaded]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isPlaying && !state.roomCode) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => { localStorage.setItem('superConnectionsState', JSON.stringify({ ...state, isPlaying: true })); }, 1000);
    } else if (!isPlaying && !state.roomCode) { localStorage.removeItem('superConnectionsState'); }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [state, isPlaying]);

  const groupStats = useMemo(() => {
    const stats: Record<string, number> = {};
    state.userGroups.forEach(g => stats[g.id] = 0);
    state.tiles.forEach(t => { if (t.userGroupId && !t.locked && !t.hidden) stats[t.userGroupId] += t.itemCount; });
    return state.userGroups.map(g => ({ ...g, count: stats[g.id] })).filter(g => g.count > 0).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [state.tiles, state.userGroups]);

  const groupIdMap = useMemo(() => {
    const map: Record<string, UserGroup> = {};
    state.userGroups.forEach(g => map[g.id] = g);
    return map;
  }, [state.userGroups]);

  const groupItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    state.tiles.forEach(t => { if (t.userGroupId && !t.hidden) { if (!map[t.userGroupId]) map[t.userGroupId] = t.text; else map[t.userGroupId] += ', ' + t.text; } });
    return map;
  }, [state.tiles]);

  const solvedItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    state.completedCategories.forEach(cat => { map[cat] = state.tiles.filter(t => t.realCategory === cat && !t.hidden).map(t => t.text).join(', '); });
    return map;
  }, [state.completedCategories, state.tiles]);

  const activeTiles = useMemo(() => state.tiles.filter(t => !t.locked), [state.tiles]);

  return { state, isPlaying, isHost, groupStats, selectedTile, setSelectedTile, game, groupIdMap, groupItemMap, solvedItemMap, activeTiles };
}
