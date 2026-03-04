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

  const applyMerge = useCallback((state: GameState, survivorId: string, mergedId: string, newGroupColor: string, forceGroupId?: string): boolean => {
    const survivor = state.tiles.find(t => t.id === survivorId);
    const merged = state.tiles.find(t => t.id === mergedId);

    if (!survivor || !merged || survivor.id === mergedId || survivor.hidden || merged.hidden) return false;

    if (survivor.realCategory === merged.realCategory) {
      state.score += 1;
      let targetId = survivor.userGroupId || merged.userGroupId || forceGroupId;
      
      if (!targetId) {
        targetId = Math.random().toString(36).substring(2, 9);
      }

      const existingGroup = state.userGroups.find(g => g.id === targetId);
      if (!existingGroup) {
        state.userGroups.push({ 
          id: targetId, 
          name: `Group ${state.userGroups.length + 1}`, 
          color: newGroupColor, 
          lastUpdated: Date.now() 
        });
      } else {
        existingGroup.lastUpdated = Date.now();
      }

      const sOldId = survivor.userGroupId;
      const mOldId = merged.userGroupId;

      // Update survivor
      survivor.text = survivor.text + ', ' + merged.text;
      survivor.itemCount = survivor.itemCount + merged.itemCount;
      survivor.userGroupId = targetId;

      // Hide merged
      merged.hidden = true;
      merged.userGroupId = targetId;

      // Move followers
      state.tiles.forEach(t => {
        if (t.id === survivorId || t.id === mergedId) return;
        if ((sOldId && t.userGroupId === sOldId) || (mOldId && t.userGroupId === mOldId)) {
          t.userGroupId = targetId;
        }
      });
      return true;
    } else {
      state.mistakes += 1;
      return false;
    }
  }, []);

  const applyActionToState = useCallback((action: GameAction, prevState: GameState): GameState => {
    const next: GameState = JSON.parse(JSON.stringify(prevState));
    
    switch (action.type) {
      case 'MERGE_TILES': {
        applyMerge(next, action.payload.tile1Id, action.payload.tile2Id, action.payload.newGroupColor, action.payload.newGroupId);
        break;
      }
      case 'RENAME_GROUP':
        const group = next.userGroups.find(g => g.id === action.payload.groupId);
        if (group) group.name = action.payload.newName;
        break;
      case 'TAG_TILE': {
        const { tileId, groupId, newGroupId } = action.payload;
        const tile = next.tiles.find(t => t.id === tileId);
        if (tile) {
          if (groupId === null) {
            tile.userGroupId = null;
          } else {
            const primary = next.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
            if (primary) {
              applyMerge(next, primary.id, tileId, '#fff'); 
            } else {
              tile.userGroupId = groupId;
            }
          }
        }
        break;
      }
      case 'CREATE_GROUP':
        const existing = next.userGroups.find(g => g.id === action.payload.group.id);
        if (!existing) {
          next.userGroups.push(action.payload.group);
        }
        if (action.payload.tileId) {
          const t = next.tiles.find(tile => tile.id === action.payload.tileId);
          if (t) t.userGroupId = action.payload.group.id;
        }
        break;
      case 'REFILL_BOARD':
        const u = next.tiles.filter(t => !t.locked && !t.hidden);
        const l = next.tiles.filter(t => t.locked);
        next.tiles = [...u, ...l];
        break;
      case 'UPDATE_SETTINGS':
        if (action.payload.tilesPerRow !== undefined) next.tilesPerRow = action.payload.tilesPerRow;
        if (action.payload.autoRefill !== undefined) next.autoRefill = action.payload.autoRefill;
        break;
    }

    // Completion Logic (Same as before but using unified state)
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
        if (!next.completedCategories.includes(completedCat)) {
            next.completedCategories.push(completedCat);
        }
        next.tiles.forEach(t => {
          if (t.userGroupId === completedGroupId) {
            t.locked = true;
            t.userGroupId = null;
          }
        });
    }

    return next;
  }, [applyMerge]);

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

  // Persistence and logic...
  
  const handleAction = useCallback((action: GameAction) => {
    setState(prev => applyActionToState(action, prev));
    if (state.roomCode) {
      dispatchAction(action);
    }
  }, [state.roomCode, dispatchAction, applyActionToState]);

  const handleStart = useCallback((multiplayer: boolean, size: number) => {
    const x = Math.min(Math.max(size, 2), 50);
    const allCatNames = Object.keys(categoriesData);
    
    // Shuffle category names to pick random ones
    const shuffledCatNames = [...allCatNames];
    for (let i = shuffledCatNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCatNames[i], shuffledCatNames[j]] = [shuffledCatNames[j], shuffledCatNames[i]];
    }

    const selectedCats = shuffledCatNames.slice(0, x);
    let initialTiles: Tile[] = [];
    selectedCats.forEach(cat => {
      // Pick the first x items (the most recognizable ones)
      categoriesData[cat].slice(0, x).forEach(item => {
        initialTiles.push({ id: Math.random().toString(36).substring(2, 9), text: item, realCategory: cat, userGroupId: null, locked: false, itemCount: 1 });
      });
    });

    // Robust Fisher-Yates Shuffle for the tiles on the board
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
    handleAction,
    handleStart,
    quitGame,
    setIsPlaying,
    setGridSize: (size: number) => setState(s => ({ ...s, gridSize: size }))
  };
}
