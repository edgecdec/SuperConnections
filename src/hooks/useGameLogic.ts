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
    autoRefill: false
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [lastActionResult, setLastActionResult] = useState<ActionResponse | null>(null);
  
  const isRemoteUpdate = useRef(false);

  // SURGICAL MERGE: No more deep cloning
  const applyMergeSurgical = (prevState: GameState, survivorId: string, mergedId: string, newGroupColor: string, forceGroupId?: string): { next: GameState, success: boolean } => {
    const survivor = prevState.tiles.find(t => t.id === survivorId);
    const merged = prevState.tiles.find(t => t.id === mergedId);

    if (!survivor || !merged || survivor.id === mergedId || survivor.hidden || merged.hidden) {
      return { next: prevState, success: false };
    }

    if (survivor.realCategory === merged.realCategory) {
      let targetId = survivor.userGroupId || merged.userGroupId || forceGroupId;
      let newUserGroups = [...prevState.userGroups];
      
      if (!targetId) {
        targetId = Math.random().toString(36).substring(2, 9);
        newUserGroups.push({ 
          id: targetId, 
          name: `Group ${newUserGroups.length + 1}`, 
          color: newGroupColor, 
          lastUpdated: Date.now() 
        });
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
        if ((sOldId && t.userGroupId === sOldId) || (mOldId && t.userGroupId === mOldId)) {
          return { ...t, userGroupId: targetId };
        }
        return t;
      });

      return { 
        next: { ...prevState, tiles: nextTiles, userGroups: newUserGroups, score: prevState.score + 1 }, 
        success: true 
      };
    } else {
      return { next: { ...prevState, mistakes: prevState.mistakes + 1 }, success: false };
    }
  };

  const applyActionToState = useCallback((action: GameAction, prevState: GameState): { next: GameState, success: boolean } => {
    let result = { next: prevState, success: true };
    
    switch (action.type) {
      case 'MERGE_TILES':
        result = applyMergeSurgical(prevState, action.payload.tile1Id, action.payload.tile2Id, action.payload.newGroupColor, action.payload.newGroupId);
        break;
      
      case 'RENAME_GROUP':
        result.next = {
          ...prevState,
          userGroups: prevState.userGroups.map(g => g.id === action.payload.groupId ? { ...g, name: action.payload.newName } : g)
        };
        break;

      case 'TAG_TILE': {
        const { tileId, groupId, newGroupId } = action.payload;
        const primary = prevState.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
        if (primary) {
          result = applyMergeSurgical(prevState, primary.id, tileId, '#fff', newGroupId);
        } else {
          result.next = {
            ...prevState,
            tiles: prevState.tiles.map(t => t.id === tileId ? { ...t, userGroupId: groupId } : t)
          };
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
        const u = prevState.tiles.filter(t => !t.locked && !t.hidden);
        const l = prevState.tiles.filter(t => t.locked);
        result.next = { ...prevState, tiles: [...u, ...l] };
        break;

      case 'UPDATE_SETTINGS':
        result.next = { 
          ...prevState, 
          tilesPerRow: action.payload.tilesPerRow ?? prevState.tilesPerRow,
          autoRefill: action.payload.autoRefill ?? prevState.autoRefill
        };
        break;
    }

    // Completion Logic (Surgical - Handles multiple completions)
    const groupCounts: Record<string, number> = {};
    result.next.tiles.forEach(tile => {
        if (tile.userGroupId && !tile.locked && !tile.hidden) {
            groupCounts[tile.userGroupId] = (groupCounts[tile.userGroupId] || 0) + tile.itemCount;
        }
    });

    const finishedGids = Object.entries(groupCounts)
      .filter(([gid, count]) => {
        if (count === prevState.gridSize) {
          const tilesInGroup = result.next.tiles.filter(t => t.userGroupId === gid && !t.locked);
          if (tilesInGroup.length > 0) {
            const cat = tilesInGroup[0].realCategory;
            return tilesInGroup.every(t => t.realCategory === cat) && !prevState.completedCategories.includes(cat);
          }
        }
        return false;
      })
      .map(([gid]) => gid);

    if (finishedGids.length > 0) {
      const newCats: string[] = [];
      const updatedTiles = result.next.tiles.map(t => {
        if (t.userGroupId && finishedGids.includes(t.userGroupId)) {
          if (!newCats.includes(t.realCategory)) newCats.push(t.realCategory);
          return { ...t, locked: true, userGroupId: null };
        }
        return t;
      });

      result.next = {
        ...result.next,
        completedCategories: [...result.next.completedCategories, ...newCats.filter(c => !result.next.completedCategories.includes(c))],
        tiles: updatedTiles
      };
    }

    return result;
  }, []);

  const onStateUpdate = useCallback((newState: GameState) => {
    isRemoteUpdate.current = true;
    setState(newState);
    setIsPlaying(true);
    setTimeout(() => {
      isRemoteUpdate.current = false;
    }, 200);
  }, []);

  const onRemoteAction = useCallback((action: GameAction) => {
    setState(prev => applyActionToState(action, prev).next);
  }, [applyActionToState]);

  const onActionResult = useCallback((response: ActionResponse) => {
    setLastActionResult(response);
    setTimeout(() => setLastActionResult(null), 1000);
  }, []);

  const { dispatchAction, isHost } = useSocket(state.roomCode, onStateUpdate, () => isPlaying ? state : null, onRemoteAction, onActionResult);

  useEffect(() => {
    if (isLoaded) return;
    const saved = localStorage.getItem('superConnectionsState');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.isPlaying && (!initialRoomCode || parsed.roomCode === initialRoomCode)) {
        setState(parsed);
        setIsPlaying(true);
      }
    }
    setIsLoaded(true);
  }, [initialRoomCode, isLoaded]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isPlaying && !state.roomCode) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        localStorage.setItem('superConnectionsState', JSON.stringify({ ...state, isPlaying: true }));
      }, 1000);
    } else if (!isPlaying && !state.roomCode) {
      localStorage.removeItem('superConnectionsState');
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [state, isPlaying]);

  const handleAction = useCallback((action: GameAction) => {
    setState(prev => {
      const result = applyActionToState(action, prev);
      if (!state.roomCode) {
        setLastActionResult({ success: result.success, actionType: action.type });
        setTimeout(() => setLastActionResult(null), 1000);
      }
      return result.next;
    });

    if (state.roomCode) {
      dispatchAction(action);
    }
  }, [state.roomCode, dispatchAction, applyActionToState]);

  const handleStart = useCallback((multiplayer: boolean, size: number) => {
    const x = Math.min(Math.max(size, 2), 50);
    const allCatNames = Object.keys(categoriesData);
    const shuffledCatNames = [...allCatNames].sort(() => 0.5 - Math.random());
    
    const usedItems = new Set<string>();
    const selectedCats: string[] = [];
    let initialTiles: Tile[] = [];

    for (const cat of shuffledCatNames) {
      if (selectedCats.length >= x) break;
      
      const items = categoriesData[cat].slice(0, x);
      // Skip category if ANY of its top items overlap with items already on the board
      const hasOverlap = items.some(item => usedItems.has(item.toLowerCase()));
      
      if (!hasOverlap) {
        selectedCats.push(cat);
        items.forEach(item => {
          usedItems.add(item.toLowerCase());
          initialTiles.push({ 
            id: Math.random().toString(36).substring(2, 9), 
            text: item, 
            realCategory: cat, 
            userGroupId: null, 
            locked: false, 
            itemCount: 1 
          });
        });
      }
    }

    // Fisher-Yates
    for (let i = initialTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [initialTiles[i], initialTiles[j]] = [initialTiles[j], initialTiles[i]];
    }

    const newState: GameState = {
      roomCode: multiplayer ? Math.random().toString(36).substring(2, 7).toUpperCase() : null,
      gridSize: x,
      tiles: initialTiles,
      userGroups: [],
      completedCategories: [],
      mistakes: 0,
      score: 0,
      tilesPerRow: x,
      autoRefill: false
    };

    setState(newState);
    setIsPlaying(true);
    if (multiplayer) router.push(`/?room=${newState.roomCode}`);
    else router.push('/');
  }, [router]);

  const quitGame = useCallback(() => {
    localStorage.removeItem('superConnectionsState');
    setIsPlaying(false);
    setState(prev => ({ ...prev, roomCode: null }));
    router.push('/');
  }, [router]);

  const groupStats = useMemo(() => {
    const stats: Record<string, number> = {};
    state.userGroups.forEach(g => stats[g.id] = 0);
    state.tiles.forEach(t => { if (t.userGroupId && !t.locked && !t.hidden) stats[t.userGroupId] += t.itemCount; });
    return state.userGroups.map(g => ({ ...g, count: stats[g.id] })).filter(g => g.count > 0).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [state.tiles, state.userGroups]);

  return {
    state,
    isPlaying,
    isHost,
    groupStats,
    selectedTile,
    setSelectedTile,
    lastActionResult,
    handleAction,
    handleStart,
    quitGame,
    setIsPlaying,
    setGridSize: (size: number) => setState(s => ({ ...s, gridSize: size }))
  };
}
