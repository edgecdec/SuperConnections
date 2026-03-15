import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Tile, UserGroup, GameState, GameAction, ActionResponse, CategoryMap, GameSettings } from '../types';
import { useSocket } from './useSocket';
import { getRandomColor } from '../utils/colors';
import categoriesDataRaw from '../data/categories.json';
import { applyGridPhysics } from '../utils/physics';

const categoriesData = categoriesDataRaw as CategoryMap;

const DEFAULT_SETTINGS: GameSettings = {
  numCategories: 25,
  itemsPerCategory: 25,
  difficulty: 'easy',
  includeNiche: false,
  activeTags: [],
  manualCategories: [],
  popToTop: true,
  gravity: 'up'
};

const shuffleArray = <T>(array: T[]): T[] => {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

export function useGameLogic(initialRoomCode: string | null, ignoreLocalSave: boolean = false) {
  const router = useRouter();
  const [state, setState] = useState<GameState>({
    roomCode: initialRoomCode,
    gridSize: 25,
    settings: DEFAULT_SETTINGS,
    tiles: [],
    userGroups: [],
    completedCategories: [],
    mistakes: 0,
    score: 0,
    tilesPerRow: 25,
    autoRefill: false,
    lastActionResult: null,
    startTime: null,
    playerStats: {}
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const isRemoteUpdate = useRef(false);
  const stateRef = useRef(state);
  const selectedTileRef = useRef<Tile | null>(null);
  const scrollPosRef = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { selectedTileRef.current = selectedTile; }, [selectedTile]);

  // Timer Effect (Client-side only)
  useEffect(() => {
    if (isPlaying && state.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - state.startTime!) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [isPlaying, state.startTime]);

  const log = (msg: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [LOGIC] ${msg}`);
  };

  // --- ATOMIC SURGICAL ENGINE ---

  const applyMergeSurgical = useCallback((prevState: GameState, survivorId: string, mergedId: string, newGroupColor: string, forceGroupId?: string): { next: GameState, success: boolean } => {
    const survivor = prevState.tiles.find(t => t.id === survivorId);
    const merged = prevState.tiles.find(t => t.id === mergedId);

    if (!survivor || !merged || survivor.id === mergedId || survivor.hidden || merged.hidden) return { next: prevState, success: false };

    if (survivor.realCategory === merged.realCategory) {
      let targetId = survivor.userGroupId || merged.userGroupId || forceGroupId;
      if (!targetId) targetId = Math.random().toString(36).substring(2, 9);

      let newUserGroups = [...prevState.userGroups];
      const existingGroupIndex = newUserGroups.findIndex(g => g.id === targetId);

      // Extract words from both tiles
      const mergedWords = merged.userGroupId ? 
        (prevState.userGroups.find(g => g.id === merged.userGroupId)?.words || [merged.text]) : 
        [merged.text];

      const survivorWords = survivor.userGroupId ? 
        (prevState.userGroups.find(g => g.id === survivor.userGroupId)?.words || [survivor.text]) : 
        [survivor.text];

      if (existingGroupIndex === -1) {
        newUserGroups.push({ 
          id: targetId as string, 
          name: '', 
          color: newGroupColor, 
          words: Array.from(new Set([...survivorWords, ...mergedWords])),
          lastUpdated: Date.now() 
        });
      } else {
        const existingGroup = newUserGroups[existingGroupIndex];
        const newWords = Array.from(new Set([...(existingGroup.words || []), ...survivorWords, ...mergedWords]));
        newUserGroups[existingGroupIndex] = { ...existingGroup, words: newWords, lastUpdated: Date.now() };
      }

      const sOldId = survivor.userGroupId;
      const mOldId = merged.userGroupId;

      let nextTiles = prevState.tiles.map(t => {
        if (t.id === mergedId) return { ...t, hidden: true, userGroupId: targetId, isMaster: false };
        if (t.id === survivorId) {
          return { 
            ...t, 
            itemCount: t.itemCount + merged.itemCount,
            userGroupId: targetId,
            isMaster: true,
            text: Array.from(new Set([...survivorWords, ...mergedWords])).join(', ')
          };
        }
        if ((sOldId && t.userGroupId === sOldId) || (mOldId && t.userGroupId === mOldId)) return { ...t, userGroupId: targetId };
        return t;
      });

      // Apply STABLE Grid Physics (PR Durable Key Logic)
      nextTiles = applyGridPhysics(nextTiles, prevState.settings, prevState.tilesPerRow, survivorId);

      return { next: { ...prevState, tiles: nextTiles, userGroups: newUserGroups, score: prevState.score + 1, lastActionResult: null }, success: true };
    } else {
      // Definitive physics pass on failure to maintain sync
      const nextTiles = applyGridPhysics(prevState.tiles, prevState.settings, prevState.tilesPerRow);
      return { next: { ...prevState, tiles: nextTiles, mistakes: prevState.mistakes + 1 }, success: false };
    }
  }, []);

  const applyActionToState = useCallback((action: GameAction, prevState: GameState): { next: GameState, success: boolean } => {
    let result: { next: GameState, success: boolean } = { next: { ...prevState, lastActionResult: null }, success: true };
    
    switch (action.type) {
      case 'START_GAME':
        result.next = {
          ...prevState,
          settings: action.payload.settings,
          tiles: action.payload.tiles,
          gridSize: action.payload.settings.itemsPerCategory,
          userGroups: [],
          completedCategories: [],
          mistakes: 0,
          score: 0,
          tilesPerRow: action.payload.settings.numCategories,
          startTime: Date.now(),
          playerStats: prevState.playerStats,
          lastActionResult: null
        };
        break;
      case 'MERGE_TILES':
        result = applyMergeSurgical(prevState, action.payload.tile1Id, action.payload.tile2Id, action.payload.newGroupColor, action.payload.newGroupId);
        break;
      case 'RENAME_GROUP':
        result.next = { ...prevState, userGroups: prevState.userGroups.map(g => g.id === action.payload.groupId ? { ...g, name: action.payload.newName } : g), lastActionResult: null };
        break;
      case 'TAG_TILE': {
        const { tileId, groupId, newGroupId } = action.payload;
        if (groupId === null) {
          const tile = prevState.tiles.find(t => t.id === tileId);
          const currentGroupId = tile?.userGroupId;
          const groupCount = currentGroupId ? prevState.tiles.reduce((acc, t) => (t.userGroupId === currentGroupId && !t.hidden && !t.locked) ? acc + t.itemCount : acc, 0) : 0;
          if (tile && tile.itemCount === 1 && groupCount === 1) {
            result.next = { ...prevState, tiles: prevState.tiles.map(t => t.id === tileId ? { ...t, userGroupId: null, isMaster: false } : t), lastActionResult: null };
          } else {
            result.success = false;
          }
        } else {
          const primary = prevState.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
          if (primary) result = applyMergeSurgical(prevState, primary.id, tileId, '#fff', newGroupId);
          else result.next = { ...prevState, tiles: prevState.tiles.map(t => t.id === tileId ? { ...t, userGroupId: groupId } : t), lastActionResult: null };
        }
        break;
      }
      case 'CREATE_GROUP': {
        const existing = prevState.userGroups.find(g => g.id === action.payload.group.id);
        const newGroup = { ...action.payload.group, words: [] as string[] };
        if (action.payload.tileId) {
          const t = prevState.tiles.find(tile => tile.id === action.payload.tileId);
          if (t) newGroup.words = t.userGroupId ? (prevState.userGroups.find(g => g.id === t.userGroupId)?.words || [t.text]) : [t.text];
        }
        result.next = { 
          ...prevState, 
          userGroups: existing ? prevState.userGroups : [...prevState.userGroups, newGroup],
          tiles: action.payload.tileId ? prevState.tiles.map(t => t.id === action.payload.tileId ? { ...t, userGroupId: action.payload.group.id, isMaster: true } : t) : prevState.tiles,
          lastActionResult: null
        };
        break;
      }
      case 'REFILL_BOARD': {
        // PURE PR Logic: Compact durable keys upward
        let act = [...prevState.tiles.filter(t => !t.locked && !t.hidden)];
        let inact = [...prevState.tiles.filter(t => t.locked || t.hidden)];
        act.sort((a, b) => (a.durableKey || 0) - (b.durableKey || 0));
        act = act.map((t, i) => ({ ...t, durableKey: i }));
        const tpr = prevState.tilesPerRow;
        result.next = { 
          ...prevState, 
          tiles: applyGridPhysics([...act, ...inact], prevState.settings, tpr),
          lastActionResult: null
        };
        break;
      }
      case 'SHUFFLE_BOARD': {
        const unlocked = prevState.tiles.filter(t => !t.locked && !t.hidden);
        const locked = prevState.tiles.filter(t => t.locked || t.hidden);
        const shuffledUnlocked = shuffleArray(unlocked);
        const tpr = prevState.tilesPerRow;
        const refilled = shuffledUnlocked.concat(locked).map((t, i) => ({ ...t, durableKey: i }));
        result.next = { 
          ...prevState, 
          tiles: applyGridPhysics(refilled, prevState.settings, tpr),
          lastActionResult: null
        };
        break;
      }
      case 'UPDATE_SETTINGS': {
        const tpr = action.payload.tilesPerRow ?? prevState.tilesPerRow;
        result.next = { 
          ...prevState, 
          tilesPerRow: tpr, 
          autoRefill: action.payload.autoRefill ?? prevState.autoRefill,
          tiles: applyGridPhysics(prevState.tiles, prevState.settings, tpr),
          lastActionResult: null
        };
        break;
      }
      case 'CLEAR_RESULT':
        result.next = { ...prevState, lastActionResult: null };
        break;
      case 'SET_PLAYER_NAME':
        const localId = Object.keys(prevState.playerStats).find(id => id === 'local') || 'local';
        result.next = {
          ...prevState,
          playerStats: {
            ...prevState.playerStats,
            [localId]: { ...prevState.playerStats[localId], name: action.payload.name }
          },
          lastActionResult: null
        };
        break;
      case 'INSERT_TILE': {
        const { draggedTileId, targetTileId, position } = action.payload;
        let nextTiles = [...prevState.tiles];
        const draggedIdx = nextTiles.findIndex(t => t.id === draggedTileId);
        const targetIdx = nextTiles.findIndex(t => t.id === targetTileId);
        if (draggedIdx === -1 || targetIdx === -1) break;

        const draggedTile = { ...nextTiles[draggedIdx] };
        const targetTile = nextTiles[targetIdx];

        // Move to the same column
        const targetCol = targetTile.durableKey % prevState.tilesPerRow;
        draggedTile.col = targetCol;
        
        // Adjust the order key slightly before or after the target so it sorts correctly in physics
        draggedTile.order = targetTile.order + (position === 'before' ? -0.5 : 0.5);
        draggedTile.durableKey = targetTile.durableKey; // ensure it buckets to the same column initially

        nextTiles[draggedIdx] = draggedTile;

        result.next = { ...prevState, tiles: applyGridPhysics(nextTiles, prevState.settings, prevState.tilesPerRow), lastActionResult: null };
        break;
      }
      case 'REORDER_TILE': {
        const { tileId, direction } = action.payload;
        let nextTiles = [...prevState.tiles];
        const tileIdx = nextTiles.findIndex(t => t.id === tileId);
        if (tileIdx === -1) break;

        if (direction === 'top') {
          nextTiles = applyGridPhysics(nextTiles, prevState.settings, prevState.tilesPerRow, tileId);
        } else {
          // Manual Bottom: Sinking logic adapted to durableKey
          const tile = nextTiles[tileIdx];
          tile.hidden = true; // Temporarily hide to let physics push it down
          nextTiles = applyGridPhysics(nextTiles, prevState.settings, prevState.tilesPerRow);
          const sunkenTile = nextTiles.find(t => t.id === tileId);
          if (sunkenTile) sunkenTile.hidden = false;
        }
        result.next = { ...prevState, tiles: nextTiles, lastActionResult: null };
        break;
      }
    }

    // Completion Logic
    if (result.success && (action.type === 'MERGE_TILES' || action.type === 'TAG_TILE' || action.type === 'START_GAME')) {
      const groupCounts: Record<string, number> = {};
      result.next.tiles.forEach(tile => { if (tile.userGroupId && !tile.locked && !tile.hidden) groupCounts[tile.userGroupId] = (groupCounts[tile.userGroupId] || 0) + tile.itemCount; });
      const finishedGids = Object.entries(groupCounts).filter(([gid, count]) => count === result.next.settings.itemsPerCategory).map(([gid]) => gid);
      
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
        if (newCats.length > 0) {
          result.next = { 
            ...result.next, 
            completedCategories: [...result.next.completedCategories, ...newCats.filter(c => !result.next.completedCategories.includes(c))], 
            tiles: updatedTiles 
          };
        }
      }
    }

    return result;
  }, [applyMergeSurgical]);

  // --- STABLE CALLBACKS FOR SOCKET ---

  const onActionResult = useCallback((response: ActionResponse) => {
    setState(prev => ({ ...prev, lastActionResult: response }));
    setTimeout(() => setState(prev => ({ ...prev, lastActionResult: null })), 1500);
  }, []);

  const { dispatchAction, isHost, userId } = useSocket(state.roomCode, ns => { 
    isRemoteUpdate.current = true; 
    setState(prev => ({ ...ns, roomCode: prev.roomCode })); 
    setIsPlaying(true); 
    setTimeout(() => { isRemoteUpdate.current = false; }, 200); 
  }, () => isPlaying ? stateRef.current : null, a => setState(prev => applyActionToState(a, prev).next), onActionResult);

  const [localTouchedGroupIds, setLocalTouchedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('superConnectionsLocalTouches');
    if (saved) {
      try { setLocalTouchedGroupIds(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const trackLocalTouch = useCallback((groupId: string) => {
    setLocalTouchedGroupIds(prev => {
      const next = [groupId, ...prev.filter(id => id !== groupId)].slice(0, 50);
      localStorage.setItem('superConnectionsLocalTouches', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleAction = useCallback((action: GameAction) => {
    const startTime = performance.now();
    
    // CAPTURE SCROLL
    if (typeof document !== 'undefined') {
      const grid = document.querySelector('.game-grid-scroll-container');
      if (grid) scrollPosRef.current = grid.scrollTop;
    }

    if (action.type === 'TAG_TILE' && action.payload.groupId) trackLocalTouch(action.payload.groupId);
    if (action.type === 'RENAME_GROUP') trackLocalTouch(action.payload.groupId);
    if (action.type === 'CREATE_GROUP') trackLocalTouch(action.payload.group.id);
    if (action.type === 'MERGE_TILES') {
      const t1 = stateRef.current.tiles.find(t => t.id === action.payload.tile1Id);
      const t2 = stateRef.current.tiles.find(t => t.id === action.payload.tile2Id);
      if (t1?.userGroupId) trackLocalTouch(t1.userGroupId);
      if (t2?.userGroupId) trackLocalTouch(t2.userGroupId);
    }

    setState(prev => {
      const result = applyActionToState(action, prev);
      
      const scoreDiff = result.next.score - prev.score;
      const mistakeDiff = result.next.mistakes - prev.mistakes;
      
      // Atomic Contribution Stats (Optimistic for both Local & Multiplayer)
      const currentUserId = prev.roomCode ? userId : 'local';
      
      if (currentUserId && prev.playerStats[currentUserId]) {
        const currentStats = prev.playerStats[currentUserId];
        const updatedStats = {
          ...currentStats,
          score: currentStats.score + (scoreDiff > 0 ? scoreDiff : 0),
          mistakes: currentStats.mistakes + (mistakeDiff > 0 ? mistakeDiff : 0),
          lastActive: Date.now()
        };
        
        let involvedTileIds: string[] | undefined = undefined;
        if (action.type === 'MERGE_TILES') involvedTileIds = [action.payload.tile1Id, action.payload.tile2Id];
        else if (action.type === 'TAG_TILE') involvedTileIds = [action.payload.tileId];
        
        return {
          ...result.next,
          playerStats: { ...prev.playerStats, [currentUserId]: updatedStats },
          lastActionResult: prev.roomCode ? null : { success: result.success, actionType: action.type, involvedTileIds }
        };
      }

      return result.next;
    });

    if (!stateRef.current.roomCode) {
      setTimeout(() => { setState(prev => ({ ...prev, lastActionResult: null })); }, 1500);
    }

    if (stateRef.current.roomCode) dispatchAction(action);
    const endTime = performance.now();
    log(`[PERF] ${action.type} processed in ${(endTime - startTime).toFixed(2)}ms`);
  }, [dispatchAction, applyActionToState, trackLocalTouch, userId]);

  // PUBLIC MODULAR API
  const game = useMemo(() => ({
    merge: (t1: string, t2: string) => handleAction({ type: 'MERGE_TILES', payload: { tile1Id: t1, tile2Id: t2, newGroupColor: getRandomColor(stateRef.current.userGroups.map(g => g.color)), newGroupId: Math.random().toString(36).substring(2, 9) } }),
    tag: (tileId: string, groupId: string | null) => handleAction({ type: 'TAG_TILE', payload: { tileId, groupId, newGroupId: Math.random().toString(36).substring(2, 9) } }),
    createGroup: (tileId: string | null = null, initialName: string = '') => {
      const targetId = tileId || selectedTileRef.current?.id;
      const targetTile = stateRef.current.tiles.find(t => t.id === targetId);
      if (targetTile?.userGroupId) return null;
      const newId = Math.random().toString(36).substring(2, 9);
      handleAction({ type: 'CREATE_GROUP', payload: { tileId: targetId || null, group: { id: newId, name: initialName, color: getRandomColor(stateRef.current.userGroups.map(g => g.color)), words: [], lastUpdated: Date.now() } } });
      return newId;
    },
    renameGroup: (groupId: string, newName: string) => handleAction({ type: 'RENAME_GROUP', payload: { groupId, newName } }),
    updateSettings: (s: any) => handleAction({ type: 'UPDATE_SETTINGS', payload: s }),
    refill: () => handleAction({ type: 'REFILL_BOARD' }),
    shuffle: () => handleAction({ type: 'SHUFFLE_BOARD' }),
    setPlayerName: (name: string) => handleAction({ type: 'SET_PLAYER_NAME', payload: { name } }),
    reorder: (tileId: string, direction: 'top' | 'bottom') => handleAction({ type: 'REORDER_TILE', payload: { tileId, direction } }),
    insert: (draggedTileId: string, targetTileId: string, position: 'before' | 'after') => handleAction({ type: 'INSERT_TILE', payload: { draggedTileId, targetTileId, position } }),
    start: (multi: boolean, settings: GameSettings) => {
      const { numCategories, itemsPerCategory, difficulty, includeNiche, activeTags, manualCategories, customCategories } = settings;
      let selectedCatsInfo: { name: string, items: string[] }[] = [];

      console.log(`[START_GAME] Settings: num=${numCategories}, items=${itemsPerCategory}, difficulty=${difficulty}, niche=${includeNiche}, tags=${activeTags.length}`);

      if (customCategories && customCategories.length > 0) {
        selectedCatsInfo = customCategories.map(c => ({ name: c.name, items: c.items.slice(0, itemsPerCategory) })).slice(0, numCategories);
      } else {
        const allCatNames = Object.keys(categoriesData);
        let pool = allCatNames.filter(name => {
          const cat = categoriesData[name];
          if (!includeNiche && cat.niche) return false;
          if (activeTags.length > 0 && !cat.tags.some(tag => activeTags.includes(tag))) return false;
          return true;
        });

        console.log(`[START_GAME] Category Pool Size: ${pool.length}`);

        let selectedNames: string[] = [];
        if (manualCategories.length > 0) { 
          selectedNames = manualCategories.filter(name => categoriesData[name]); 
          console.log(`[START_GAME] Manual Categories selected: ${selectedNames.length}`);
        }
        
        const remainingNeeded = numCategories - selectedNames.length;
        if (remainingNeeded > 0) {
          const shuffledPool = shuffleArray(pool.filter(name => !selectedNames.includes(name)));
          selectedNames = [...selectedNames, ...shuffledPool.slice(0, remainingNeeded)];
          console.log(`[START_GAME] Total names after random fill: ${selectedNames.length}`);
        }

        const usedItems = new Set<string>();
        selectedNames.forEach(catName => {
          const cat = categoriesData[catName];
          let itemsPool = [...cat.items];
          if (difficulty === 'random') itemsPool = shuffleArray(itemsPool);
          else if (difficulty === 'hard') itemsPool = [...itemsPool].reverse();

          let addedItems: string[] = [];
          for (const item of itemsPool) {
            if (addedItems.length >= itemsPerCategory) break;
            if (!usedItems.has(item.toLowerCase())) {
              usedItems.add(item.toLowerCase());
              addedItems.push(item);
            }
          }

          if (addedItems.length === itemsPerCategory) {
            selectedCatsInfo.push({ name: catName, items: addedItems });
          } else {
            console.log(`[START_GAME] Category "${catName}" rejected: only had ${addedItems.length}/${itemsPerCategory} unique items`);
          }
        });
      }

      console.log(`[START_GAME] Final selectedCatsInfo length: ${selectedCatsInfo.length}`);

      if (selectedCatsInfo.length === 0) {
        console.error("[START_GAME] No categories selected! Game cannot start.");
        return;
      }

      let initialTiles: Tile[] = [];
      selectedCatsInfo.forEach((cat, colIdx) => {
        cat.items.forEach((item, rowIdx) => {
          initialTiles.push({ 
            id: Math.random().toString(36).substring(2, 9), 
            text: item, 
            realCategory: cat.name, 
            userGroupId: null, 
            locked: false, 
            itemCount: 1, 
            col: colIdx,
            order: (colIdx * itemsPerCategory) + rowIdx,
            durableKey: (colIdx * itemsPerCategory) + rowIdx,
            isMaster: false
          });
        });
      });

      // PURE PR Logic: Shuffle and re-assign sequential durableKeys up to N
      let shuffledTiles = shuffleArray(initialTiles);
      shuffledTiles = shuffledTiles.map((t, idx) => ({ ...t, durableKey: idx }));

      const finalTiles = applyGridPhysics(shuffledTiles, settings, numCategories);

      const newState: GameState = { 
        roomCode: multi ? Math.random().toString(36).substring(2, 7).toUpperCase() : null, 
        gridSize: itemsPerCategory, 
        settings, 
        tiles: finalTiles, 
        userGroups: [], 
        completedCategories: [], 
        mistakes: 0, 
        score: 0, 
        tilesPerRow: numCategories, 
        autoRefill: false, 
        lastActionResult: null,
        startTime: Date.now(),
        playerStats: { local: { name: stateRef.current.playerStats['local']?.name || 'You', score: 0, mistakes: 0, lastActive: Date.now() } }
      };

      if (multi) {
        stateRef.current.roomCode = newState.roomCode;
        setState(newState);
        setIsPlaying(true);
        localStorage.setItem('superConnectionsState', JSON.stringify({ ...newState, isPlaying: true }));
        handleAction({ type: 'START_GAME', payload: { settings, tiles: finalTiles } });
        router.push(`/play?room=${newState.roomCode}`);
      } else {
        localStorage.setItem('superConnectionsState', JSON.stringify({ ...newState, isPlaying: true }));
        setState(newState);
        setIsPlaying(true);
        router.push('/play');
      }
    },
    quit: () => { localStorage.removeItem('superConnectionsState'); setIsPlaying(false); setState(prev => ({ ...prev, roomCode: null })); router.push('/'); }
  }), [handleAction, router, applyGridPhysics]);

  useEffect(() => {
    if (isLoaded) return;
    if (!ignoreLocalSave) {
      const saved = localStorage.getItem('superConnectionsState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.isPlaying && (!initialRoomCode || parsed.roomCode === initialRoomCode)) { setState(parsed); setIsPlaying(true); }
        } catch (e) {}
      }
    }
    setIsLoaded(true);
  }, [initialRoomCode, isLoaded, ignoreLocalSave]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isPlaying) {
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
    state.userGroups.forEach(g => {
      if (g.words && g.words.length > 0) {
        map[g.id] = g.words.join(', ');
      }
    });
    return map;
  }, [state.userGroups]);

  const solvedItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    state.completedCategories.forEach(cat => { 
      const masterTile = state.tiles.find(t => t.realCategory === cat && t.isMaster);
      if (masterTile && masterTile.text.includes(', ')) {
        map[cat] = masterTile.text;
      } else {
        // Find all original tiles for this category (even if hidden)
        const allWords = state.tiles
          .filter(t => t.realCategory === cat)
          .map(t => t.text)
          .flatMap(txt => txt.split(', ').map(s => s.trim()));
        map[cat] = Array.from(new Set(allWords)).join(', ');
      }
    });
    return map;
  }, [state.completedCategories, state.tiles]);

  const activeTiles = useMemo(() => {
    // Hidden placeholders are no longer needed because durableKey sets explicit grid positions.
    return state.tiles.filter(t => !t.locked && !t.hidden);
  }, [state.tiles]);

  return { state, isPlaying, isLoaded, isHost, userId, groupStats, selectedTile, setSelectedTile, game, groupIdMap, groupItemMap, solvedItemMap, activeTiles, localTouchedGroupIds, elapsedTime, scrollPosRef };
}
