import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Tile, UserGroup, GameState, GameAction } from '../types';
import { useSocket } from './useSocket';
import categoriesDataRaw from '../data/categories.json';

const categoriesData = categoriesDataRaw as Record<string, string[]>;

const COLORS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#A0E8AF', '#FFC8A2', '#D4A5A5', '#9EB3C2', '#C7CEEA',
  '#F1CBFF', '#E2F0CB', '#FFDAC1', '#FF9AA2', '#B5EAD7',
];

function getRandomColor(exclude: string[] = []) {
  const available = COLORS.filter((c) => !exclude.includes(c));
  if (available.length === 0) return COLORS[Math.floor(Math.random() * COLORS.length)];
  return available[Math.floor(Math.random() * available.length)];
}

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
  const isRemoteUpdate = useRef(false);

  const onStateUpdate = useCallback((newState: GameState) => {
    isRemoteUpdate.current = true;
    setState(newState);
    setIsPlaying(true);
    setTimeout(() => {
      isRemoteUpdate.current = false;
    }, 200);
  }, []);

  const getLatestState = useCallback(() => isPlaying ? state : null, [isPlaying, state]);

  const { dispatchAction, isHost } = useSocket(state.roomCode, onStateUpdate, getLatestState);

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
    if (state.roomCode) {
      dispatchAction(action);
    } else {
      // Local implementation of game logic
      setState(prev => {
        let next = { ...prev };
        switch (action.type) {
          case 'MERGE_TILES': {
            const { tile1Id, tile2Id } = action.payload;
            const t1 = next.tiles.find(t => t.id === tile1Id);
            const t2 = next.tiles.find(t => t.id === tile2Id);
            if (t1 && t2 && t1.realCategory === t2.realCategory) {
              next.score += 1;
              let targetId = t1.userGroupId || t2.userGroupId;
              if (!targetId) {
                targetId = Math.random().toString(36).substring(2, 9);
                next.userGroups.push({ id: targetId, name: `Group ${next.userGroups.length + 1}`, color: action.payload.newGroupColor, lastUpdated: Date.now() });
              }
              next.tiles = next.tiles.map(t => {
                if (t.id === tile2Id) return { ...t, hidden: true };
                if (t.id === tile1Id) return { ...t, text: t.text + ', ' + t2.text, userGroupId: targetId, itemCount: t.itemCount + t2.itemCount };
                if ((t1.userGroupId && t.userGroupId === t1.userGroupId) || (t2.userGroupId && t.userGroupId === t2.userGroupId)) return { ...t, userGroupId: targetId };
                return t;
              });
            } else {
              next.mistakes += 1;
            }
            break;
          }
          case 'RENAME_GROUP':
            next.userGroups = next.userGroups.map(g => g.id === action.payload.groupId ? { ...g, name: action.payload.newName } : g);
            break;
          case 'TAG_TILE':
            // Logic for manual tagging
            next.tiles = next.tiles.map(t => t.id === action.payload.tileId ? { ...t, userGroupId: action.payload.groupId } : t);
            break;
          case 'CREATE_GROUP':
            next.userGroups.push(action.payload.group);
            if (action.payload.tileId) next.tiles = next.tiles.map(t => t.id === action.payload.tileId ? { ...t, userGroupId: action.payload.group.id } : t);
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
        return next;
      });
    }
  }, [state.roomCode, dispatchAction]);

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

  // Derived stats
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
    handleAction,
    handleStart,
    quitGame,
    setIsPlaying,
    setGridSize: (size: number) => setState(s => ({ ...s, gridSize: size }))
  };
}
