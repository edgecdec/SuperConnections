import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Tile, UserGroup, GameState, GameAction } from '../types';
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
  
  const isRemoteUpdate = useRef(false);

  const applyActionToState = useCallback((action: GameAction, prevState: GameState): GameState => {
    // Avoid heavy JSON clone, update surgically
    const next: GameState = { ...prevState };
    
    switch (action.type) {
      case 'MERGE_TILES': {
        const { tile1Id, tile2Id } = action.payload;
        // tile1Id is the survivor, tile2Id is being merged/hidden
        const t1 = next.tiles.find(t => t.id === tile1Id);
        const t2 = next.tiles.find(t => t.id === tile2Id);
        
        if (t1 && t2 && t1.id !== t2.id && t1.realCategory === t2.realCategory) {
          next.score = prevState.score + 1;
          let targetId = t1.userGroupId || t2.userGroupId;
          
          if (!targetId) {
            targetId = Math.random().toString(36).substring(2, 9);
            next.userGroups = [...prevState.userGroups, { 
              id: targetId, 
              name: `Group ${prevState.userGroups.length + 1}`, 
              color: action.payload.newGroupColor, 
              lastUpdated: Date.now() 
            }];
          } else {
            next.userGroups = prevState.userGroups.map(g => 
              g.id === targetId ? { ...g, lastUpdated: Date.now() } : g
            );
          }

          const t1OldGroupId = t1.userGroupId;
          const t2OldGroupId = t2.userGroupId;

          next.tiles = prevState.tiles.map(t => {
            if (t.id === tile2Id) {
              return { ...t, hidden: true, userGroupId: targetId };
            }
            if (t.id === tile1Id) {
              return { 
                ...t, 
                text: t.text + ', ' + t2.text, 
                userGroupId: targetId, 
                itemCount: t1.itemCount + t2.itemCount 
              };
            }
            // Update any other tiles that were in either of the two merged groups
            if ((t1OldGroupId && t.userGroupId === t1OldGroupId) || 
                (t2OldGroupId && t.userGroupId === t2OldGroupId)) {
              return { ...t, userGroupId: targetId };
            }
            return t;
          });
        } else if (t1 && t2) {
          next.mistakes = prevState.mistakes + 1;
        }
        break;
      }
      case 'RENAME_GROUP':
        next.userGroups = prevState.userGroups.map(g => g.id === action.payload.groupId ? { ...g, name: action.payload.newName } : g);
        break;
      case 'TAG_TILE':
        next.tiles = prevState.tiles.map(t => t.id === action.payload.tileId ? { ...t, userGroupId: action.payload.groupId } : t);
        break;
      case 'CREATE_GROUP':
        const updatedGroups = [...prevState.userGroups, action.payload.group];
        next.userGroups = updatedGroups;
        if (action.payload.tileId) {
          next.tiles = prevState.tiles.map(t => t.id === action.payload.tileId ? { ...t, userGroupId: action.payload.group.id } : t);
        }
        break;
      case 'REFILL_BOARD':
        const u = prevState.tiles.filter(t => !t.locked && !t.hidden);
        const l = prevState.tiles.filter(t => t.locked);
        next.tiles = [...u, ...l];
        break;
      case 'UPDATE_SETTINGS':
        if (action.payload.tilesPerRow !== undefined) next.tilesPerRow = action.payload.tilesPerRow;
        if (action.payload.autoRefill !== undefined) next.autoRefill = action.payload.autoRefill;
        break;
    }

    // Check for completed categories
    const groupCounts: Record<string, number> = {};
    next.tiles.forEach(tile => {
        if (tile.userGroupId && !tile.locked && !tile.hidden) {
            groupCounts[tile.userGroupId] = (groupCounts[tile.userGroupId] || 0) + tile.itemCount;
        }
    });

    let completedCat: string | null = null;
    let completedGroupId: string | null = null;

    for (const [groupId, count] of Object.entries(groupCounts)) {
        if (count === next.gridSize) {
            const groupTiles = next.tiles.filter(t => t.userGroupId === groupId && !t.locked);
            if (groupTiles.length > 0) {
                const firstCategory = groupTiles[0].realCategory;
                if (groupTiles.every(t => t.realCategory === firstCategory)) {
                    if (!next.completedCategories.includes(firstCategory)) {
                        completedCat = firstCategory;
                        completedGroupId = groupId;
                        break;
                    }
                }
            }
        }
    }

    if (completedCat && completedGroupId) {
        next.completedCategories = [...next.completedCategories, completedCat];
        next.tiles = next.tiles.map(t => 
            t.userGroupId === completedGroupId ? { ...t, locked: true, userGroupId: null } : t
        );
    }

    return next;
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
    setState(prev => applyActionToState(action, prev));
  }, [applyActionToState]);

  const getLatestState = useCallback(() => isPlaying ? state : null, [isPlaying, state]);

  const { dispatchAction, isHost } = useSocket(state.roomCode, onStateUpdate, getLatestState, onRemoteAction);

  // Persistence logic
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

  useEffect(() => {
    if (isPlaying && !state.roomCode) {
      localStorage.setItem('superConnectionsState', JSON.stringify({ ...state, isPlaying: true }));
    } else if (!isPlaying && !state.roomCode) {
      localStorage.removeItem('superConnectionsState');
    }
  }, [state, isPlaying]);

  const handleAction = useCallback((action: GameAction) => {
    setState(prev => applyActionToState(action, prev));
    if (state.roomCode) {
      dispatchAction(action);
    }
  }, [state.roomCode, dispatchAction, applyActionToState]);

  const handleStart = useCallback((multiplayer: boolean, size: number) => {
    const x = Math.min(Math.max(size, 2), 50);
    const selectedCats = Object.keys(categoriesData).slice(0, x);
    let initialTiles: Tile[] = [];
    selectedCats.forEach(cat => {
      categoriesData[cat].slice(0, x).forEach(item => {
        initialTiles.push({ id: Math.random().toString(36).substring(2, 9), text: item, realCategory: cat, userGroupId: null, locked: false, itemCount: 1 });
      });
    });
    initialTiles.sort(() => 0.5 - Math.random());

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
    handleAction,
    handleStart,
    quitGame,
    setIsPlaying,
    setGridSize: (size: number) => setState(s => ({ ...s, gridSize: size }))
  };
}
