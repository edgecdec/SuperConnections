'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Container,
  Typography,
  Box,
  Button,
  TextField,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Collapse,
  Switch,
  FormControlLabel,
  Slider,
  Tooltip
} from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import categoriesDataRaw from '../data/categories.json';
import { useSocket } from '../hooks/useSocket';

const categoriesData = categoriesDataRaw as Record<string, string[]>;

type Tile = {
  id: string;
  text: string;
  realCategory: string;
  userGroupId: string | null;
  locked: boolean;
  itemCount: number;
  hidden?: boolean;
};

type UserGroup = {
  id: string;
  name: string;
  color: string;
  lastUpdated: number;
};

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

const TileComponent = React.memo(({
  tile,
  group,
  gridSize,
  isSelected,
  onMenuOpen,
  onTileClick,
  onDragStart,
  onDragOver,
  onDrop
}: {
  tile: Tile;
  group?: UserGroup;
  gridSize: number;
  isSelected: boolean;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, id: string) => void;
  onTileClick: (tile: Tile) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
}) => {
  let displayText = tile.text;
  if (tile.itemCount > 2) {
     const firstItem = tile.text.split(',')[0];
     const groupName = group?.name || 'Group';
     displayText = `${groupName}: ${firstItem}...`;
  }

  return (
    <Paper
      elevation={isSelected ? 6 : 3}
      onClick={() => onTileClick(tile)}
      draggable={!tile.locked}
      onDragStart={(e) => onDragStart(e, tile)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, tile)}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 1,
        textAlign: 'center',
        minHeight: '80px',
        backgroundColor: group ? group.color : '#fff',
        border: group ? '2px solid #333' : '2px solid transparent',
        outline: isSelected ? '4px solid #1976d2' : 'none',
        cursor: tile.locked ? 'default' : 'pointer',
        wordBreak: 'normal',
        overflowWrap: 'break-word',
        fontSize: gridSize > 10 ? '0.7rem' : '1rem',
        transition: 'all 0.2s ease-in-out',
        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
        zIndex: isSelected ? 10 : 1,
        opacity: tile.locked ? 0.6 : 1
      }}
    >
      <Typography variant="body2" fontWeight="bold">
        {displayText}
      </Typography>
      {tile.itemCount > 1 && (
        <Typography variant="caption" sx={{ position: 'absolute', bottom: 2, right: 4, fontWeight: 'bold', fontSize: '0.7em', color: group ? '#333' : '#666' }}>
          [{tile.itemCount}]
        </Typography>
      )}
      <IconButton
        size="small"
        onClick={(e) => onMenuOpen(e, tile.id)}
        sx={{ position: 'absolute', top: 0, right: 0, padding: '2px' }}
      >
        <LabelIcon fontSize="small" sx={{ color: group ? '#333' : '#ccc' }} />
      </IconButton>
    </Paper>
  );
});

function GameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCodeFromUrl = searchParams.get('room');

  const [gridSize, setGridSize] = useState<number>(4);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [completedCategories, setCompletedCategories] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [roomCode, setRoomCode] = useState<string | null>(roomCodeFromUrl);

  const [tilesPerRow, setTilesPerRow] = useState<number>(12);
  const [autoRefill, setAutoRefill] = useState<boolean>(false);
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(false);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);

  const isRemoteUpdate = useRef(false);
  const hasJoined = useRef(false);

  const handleSocketUpdate = useCallback((newState: any) => {
    if (!newState) return;
    isRemoteUpdate.current = true;
    hasJoined.current = true;
    setGridSize(newState.gridSize);
    setTiles(newState.tiles);
    setUserGroups(newState.userGroups);
    setCompletedCategories(newState.completedCategories);
    setMistakes(newState.mistakes);
    setScore(newState.score);
    setTilesPerRow(newState.tilesPerRow);
    setAutoRefill(newState.autoRefill);
    setIsPlaying(true);
    // Use a small timeout to allow React to process state updates before clearing the flag
    setTimeout(() => {
      isRemoteUpdate.current = false;
    }, 100);
  }, []);

  const { updateServerState, isHost } = useSocket(roomCode, handleSocketUpdate);

  const syncState = useCallback(() => {
    // Only sync if we are the host OR if we have already successfully joined and synced with the server once
    const canSync = isHost || hasJoined.current;

    if (roomCode && !isRemoteUpdate.current && tiles.length > 0 && canSync) {
      updateServerState({
        gridSize,
        tiles,
        userGroups,
        completedCategories,
        mistakes,
        score,
        tilesPerRow,
        autoRefill
      });
    }
  }, [roomCode, updateServerState, gridSize, tiles, userGroups, completedCategories, mistakes, score, tilesPerRow, autoRefill, isHost]);

  // Load state from local storage on mount
  useEffect(() => {
    if (roomCodeFromUrl) return; // Prioritize socket state if in a room
    try {
      const saved = localStorage.getItem('superConnectionsState');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isPlaying) {
          isRemoteUpdate.current = true;
          setGridSize(parsed.gridSize || 4);
          setIsPlaying(parsed.isPlaying);
          setTiles(parsed.tiles || []);
          setUserGroups(parsed.userGroups || []);
          setCompletedCategories(parsed.completedCategories || []);
          setMistakes(parsed.mistakes || 0);
          setScore(parsed.score || 0);
          if (parsed.tilesPerRow) setTilesPerRow(parsed.tilesPerRow);
          if (parsed.autoRefill !== undefined) setAutoRefill(parsed.autoRefill);
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 100);
        }
      }
    } catch (e) {
      console.error('Failed to load state', e);
    }
  }, [roomCodeFromUrl]);

  // Save state to local storage when it changes
  useEffect(() => {
    if (isRemoteUpdate.current) return;

    if (isPlaying) {
      const stateToSave = {
        gridSize,
        isPlaying,
        tiles,
        userGroups,
        completedCategories,
        mistakes,
        score,
        tilesPerRow,
        autoRefill
      };
      if (!roomCode) {
        localStorage.setItem('superConnectionsState', JSON.stringify(stateToSave));
      } else {
        syncState();
      }
    } else if (!roomCode) {
      localStorage.removeItem('superConnectionsState');
    }
  }, [gridSize, isPlaying, tiles, userGroups, completedCategories, mistakes, score, tilesPerRow, autoRefill, roomCode, syncState]);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [groupToRename, setGroupToRename] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'warning' | 'info' | 'error' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const openRenameDialog = useCallback((groupId: string, currentName: string) => {
    setGroupToRename(groupId);
    setNewGroupName(currentName);
    setRenameDialogOpen(true);
  }, []);

  const handleStart = (multiplayer: boolean = false) => {
    const x = Math.min(Math.max(gridSize, 2), 50);
    setGridSize(x);
    setTilesPerRow(x);

    const allCats = Object.keys(categoriesData);
    const selectedCats = allCats.slice(0, x);

    let initialTiles: Tile[] = [];

    selectedCats.forEach((cat) => {
      const items = categoriesData[cat];
      const topItems = items.slice(0, x);
      topItems.forEach((item) => {
        initialTiles.push({
          id: Math.random().toString(36).substring(2, 9),
          text: item,
          realCategory: cat,
          userGroupId: null,
          locked: false,
          itemCount: 1,
        });
      });
    });

    initialTiles = initialTiles.sort(() => 0.5 - Math.random());

    setTiles(initialTiles);
    setUserGroups([]);
    setCompletedCategories([]);
    setMistakes(0);
    setScore(0);
    setIsPlaying(true);

    if (multiplayer) {
      const newRoomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      setRoomCode(newRoomCode);
      router.push(`/?room=${newRoomCode}`);
    }
  };

  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const handleMergeAttempt = useCallback((tile1: Tile, tile2: Tile) => {
    if (tile1.id === tile2.id) return;

    if (tile1.realCategory === tile2.realCategory) {
      setScore((s) => s + 1);
      let finalTargetGroupId = tile1.userGroupId || tile2.userGroupId;
      
      if (!finalTargetGroupId) {
         finalTargetGroupId = Math.random().toString(36).substring(2, 9);
         const newName = `Group ${userGroups.length + 1}`;
         setUserGroups(prevGroups => {
            const usedColors = prevGroups.map((g) => g.color);
            const newGroup = {
              id: finalTargetGroupId as string,
              name: newName,
              color: getRandomColor(usedColors),
              lastUpdated: Date.now()
            };
            return [...prevGroups, newGroup];
         });
         openRenameDialog(finalTargetGroupId, newName);
      } else {
         setUserGroups(prevGroups => 
           prevGroups.map(g => g.id === finalTargetGroupId ? { ...g, lastUpdated: Date.now() } : g)
         );
      }

      setTiles((currentTiles) => {
         return currentTiles.map(t => {
            if (t.id === tile2.id) {
                return { ...t, hidden: true };
            }
            if (t.id === tile1.id) {
                const newCount = t.itemCount + tile2.itemCount;
                const newText = t.text + ', ' + tile2.text;
                return { 
                   ...t, 
                   text: newText,
                   userGroupId: finalTargetGroupId,
                   itemCount: newCount
                };
            }
            if (
               (tile1.userGroupId && t.userGroupId === tile1.userGroupId) ||
               (tile2.userGroupId && t.userGroupId === tile2.userGroupId)
            ) {
                return { ...t, userGroupId: finalTargetGroupId };
            }
            return t;
         });
      });
    } else {
      setMistakes((m) => m + 1);
      setToast({ open: true, message: 'Those items do not belong in the same category.', severity: 'error' });
    }
  }, [userGroups.length, openRenameDialog]);

  const handleTileClick = useCallback((tile: Tile) => {
    if (tile.locked) return;

    setSelectedTile((prevSelected) => {
      if (prevSelected && prevSelected.id === tile.id) {
        return null;
      }
      if (!prevSelected) {
        return tile;
      }
      handleMergeAttempt(prevSelected, tile);
      return null;
    });
  }, [handleMergeAttempt]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, tile: Tile) => {
    if (tile.locked) return;
    e.dataTransfer.setData('application/json', JSON.stringify(tile));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetTile: Tile) => {
    e.preventDefault();
    if (targetTile.locked) return;
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData) as Tile;
      handleMergeAttempt(targetTile, draggedTile);
      setSelectedTile(null);
    } catch (err) {
      console.error("Drop error", err);
    }
  }, [handleMergeAttempt]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>, tileId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setActiveTileId(tileId);
  }, []);

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveTileId(null);
  };

  const assignGroupToTile = (tileId: string, groupId: string | null) => {
    if (groupId === null) {
      setTiles((prev) => prev.map((t) => (t.id === tileId ? { ...t, userGroupId: null } : t)));
      handleMenuClose();
      return;
    }
    const currentTile = tiles.find(t => t.id === tileId);
    const existingTileInGroup = tiles.find(t => t.userGroupId === groupId && t.id !== tileId);
    if (existingTileInGroup && currentTile) {
      handleMergeAttempt(existingTileInGroup, currentTile);
    } else {
      setTiles((prev) => prev.map((t) => (t.id === tileId ? { ...t, userGroupId: groupId } : t)));
    }
    handleMenuClose();
  };

  const createNewGroup = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    const usedColors = userGroups.map((g) => g.color);
    const newName = `Group ${userGroups.length + 1}`;
    const newGroup: UserGroup = {
      id: newId,
      name: newName,
      color: getRandomColor(usedColors),
      lastUpdated: Date.now()
    };
    setUserGroups((prev) => [...prev, newGroup]);
    if (activeTileId) {
      assignGroupToTile(activeTileId, newId);
    }
    openRenameDialog(newId, newName);
  };

  const checkGroups = () => {
    const groupCounts = tiles.reduce((acc, tile) => {
      if (tile.userGroupId && !tile.locked && !tile.hidden) {
        acc[tile.userGroupId] = (acc[tile.userGroupId] || 0) + tile.itemCount;
      }
      return acc;
    }, {} as Record<string, number>);

    let foundCompletion = false;
    let madeMistake = false;

    for (const [groupId, count] of Object.entries(groupCounts)) {
      if (count === gridSize) {
        const groupTiles = tiles.filter((t) => t.userGroupId === groupId && !t.locked);
        const firstCategory = groupTiles[0].realCategory;
        const allSameCategory = groupTiles.every((t) => t.realCategory === firstCategory);

        if (allSameCategory) {
          foundCompletion = true;
          setCompletedCategories((prev) => [...prev, firstCategory]);
          setTiles((prev) =>
            prev.map((t) => (t.userGroupId === groupId ? { ...t, locked: true, userGroupId: null } : t))
          );
          setToast({ open: true, message: `Completed Category: ${firstCategory}!`, severity: 'success' });
        } else {
          madeMistake = true;
        }
      }
    }

    if (madeMistake && !foundCompletion) {
      setMistakes((prev) => prev + 1);
      setToast({ open: true, message: 'One of your full groups is incorrect.', severity: 'warning' });
    }
  };

  useEffect(() => {
    if (isPlaying) {
      checkGroups();
    }
  }, [tiles, isPlaying]);

  useEffect(() => {
    if (isPlaying && autoRefill) {
       setTiles((prev) => {
          const unlocked = prev.filter(t => !t.locked && !t.hidden);
          const locked = prev.filter(t => t.locked);
          if (unlocked.length + locked.length !== prev.length) {
             return [...unlocked, ...locked];
          }
          let changed = false;
          for (let i = 0; i < unlocked.length; i++) {
             if (prev[i].id !== unlocked[i].id) {
                changed = true;
                break;
             }
          }
          if (changed) {
             return [...unlocked, ...locked];
          }
          return prev;
       });
    }
  }, [tiles, isPlaying, autoRefill]);

  const handleRenameSubmit = () => {
    if (groupToRename && newGroupName.trim()) {
      setUserGroups((prev) =>
        prev.map((g) => (g.id === groupToRename ? { ...g, name: newGroupName.trim() } : g))
      );
    }
    setRenameDialogOpen(false);
    setGroupToRename(null);
  };

  const renderSetup = () => (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh">
      <Typography variant="h3" gutterBottom>
        Super Connections
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Choose board size (X by X)
      </Typography>
      <Box display="flex" gap={2} alignItems="center" mt={2}>
        <TextField
          type="number"
          label="Grid Size"
          value={isNaN(gridSize) ? '' : gridSize}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setGridSize(val);
          }}
          inputProps={{ min: 2, max: 50 }}
        />
        <Button variant="contained" size="large" onClick={() => handleStart(false)}>
          Play Solo
        </Button>
        <Button variant="outlined" color="primary" size="large" onClick={() => handleStart(true)}>
          Host Multiplayer
        </Button>
      </Box>
      {roomCodeFromUrl && (
        <Box mt={4} textAlign="center">
          <Typography variant="body1" gutterBottom>You are invited to join room: <strong>{roomCodeFromUrl}</strong></Typography>
          <Button variant="contained" color="secondary" onClick={() => { setRoomCode(roomCodeFromUrl); setIsPlaying(true); }}>
            Join Game
          </Button>
        </Box>
      )}
    </Box>
  );

  const groupStats = useMemo(() => {
    const stats: Record<string, number> = {};
    userGroups.forEach((g) => (stats[g.id] = 0));
    tiles.forEach((t) => {
      if (t.userGroupId && !t.locked) {
        stats[t.userGroupId] = (stats[t.userGroupId] || 0) + t.itemCount;
      }
    });
    return userGroups
      .map((g) => ({ ...g, count: stats[g.id] }))
      .filter((g) => g.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [tiles, userGroups]);

  const copyRoomLink = () => {
    const link = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(link);
    setToast({ open: true, message: 'Room link copied to clipboard!', severity: 'info' });
  };

  const renderGame = () => (
    <Box display="flex" height="100vh" p={2} gap={2}>
      <Box flex={3} display="flex" flexDirection="column" sx={{ overflowY: 'auto' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h4" gutterBottom>Super Connections ({gridSize}x{gridSize})</Typography>
          {roomCode && (
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" color="primary">Room: {roomCode}</Typography>
              <Tooltip title="Copy Invite Link">
                <IconButton size="small" onClick={copyRoomLink}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
        
        {completedCategories.length > 0 && (
          <Box mb={2}>
            {completedCategories.map((cat) => (
              <Paper key={cat} sx={{ p: 2, mb: 1, backgroundColor: '#d4edda', textAlign: 'center' }}>
                <Typography variant="h6">{cat}</Typography>
                <Typography variant="body2">
                  {tiles.filter(t => t.realCategory === cat).map(t => t.text).join(', ')}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}

        <Box sx={{ flexGrow: 1, overflowX: 'auto', pb: 2 }}>
          <Box
            display="grid"
            gap={1}
            gridTemplateColumns={`repeat(${tilesPerRow}, minmax(100px, 1fr))`}
            sx={{ minWidth: 'min-content' }}
          >
            {tiles.filter(t => !t.locked).map((tile) => {
              if (tile.hidden) {
                return <Box key={tile.id} sx={{ minHeight: '80px', visibility: 'hidden' }} />;
              }
              const group = userGroups.find((g) => g.id === tile.userGroupId);
              const isSelected = selectedTile?.id === tile.id;
              return (
                <TileComponent
                  key={tile.id}
                  tile={tile}
                  group={group}
                  gridSize={gridSize}
                  isSelected={isSelected}
                  onMenuOpen={handleMenuOpen}
                  onTileClick={handleTileClick}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              );
            })}
          </Box>
        </Box>
      </Box>

      {sidebarExpanded ? (
        <Paper sx={{ flex: 1, minWidth: '300px', maxWidth: '350px', p: 2, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <IconButton 
            size="small" 
            onClick={() => setSidebarExpanded(false)}
            sx={{ position: 'absolute', top: 8, right: 8 }}
          >
            <ChevronRightIcon />
          </IconButton>
          <Typography variant="h6">Score & Progress</Typography>
          <Typography variant="body1">Score: {score} ({Math.round((score / (gridSize * (gridSize - 1))) * 100)}%)</Typography>
          <Typography variant="body1">Mistakes: {mistakes}</Typography>
          <Typography variant="body1">
            Completed: {completedCategories.length} / {gridSize}
          </Typography>
        
        <Divider sx={{ my: 2 }} />

        <Box mb={2}>
          <Box 
            display="flex" 
            justifyContent="space-between" 
            alignItems="center" 
            sx={{ cursor: 'pointer' }}
            onClick={() => setSettingsExpanded(!settingsExpanded)}
          >
            <Typography variant="h6">Settings</Typography>
            {settingsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
          <Collapse in={settingsExpanded}>
            <Box mt={2}>
              <Typography id="tiles-per-row-slider" gutterBottom>
                Items per Row: {tilesPerRow}
              </Typography>
              <Slider
                value={tilesPerRow}
                min={2}
                max={50}
                onChange={(e, val) => setTilesPerRow(val as number)}
                aria-labelledby="tiles-per-row-slider"
              />
              <FormControlLabel
                control={
                  <Switch 
                    checked={autoRefill} 
                    onChange={(e) => setAutoRefill(e.target.checked)} 
                  />
                }
                label="Auto-Refill Rows"
              />
              <Button 
                variant="outlined" 
                size="small" 
                fullWidth 
                sx={{ mt: 1 }}
                onClick={() => {
                   setTiles((prev) => {
                      const unlocked = prev.filter(t => !t.locked && !t.hidden);
                      const locked = prev.filter(t => t.locked);
                      return [...unlocked, ...locked];
                   });
                }}
              >
                Refill Board
              </Button>
              <Button 
                variant="contained" 
                color="error"
                size="small" 
                fullWidth 
                sx={{ mt: 2 }}
                onClick={() => {
                   if (confirm("Are you sure you want to quit? Your current game progress will be lost forever.")) {
                       localStorage.removeItem('superConnectionsState');
                       setIsPlaying(false);
                       setRoomCode(null);
                       router.push('/');
                   }
                }}
              >
                Quit Game
              </Button>
            </Box>
          </Collapse>
        </Box>

        <Divider sx={{ mb: 2 }} />
        
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">Your Groups</Typography>
          <Button startIcon={<AddCircleIcon />} size="small" onClick={() => createNewGroup()}>New</Button>
        </Box>

        <Box flex={1} sx={{ overflowY: 'auto' }}>
          {groupStats.map((group) => (
            <Paper
              key={group.id}
              sx={{ p: 1, mb: 1, backgroundColor: group.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{group.name}</Typography>
                <Typography variant="caption">{group.count} / {gridSize} items</Typography>
              </Box>
              <Button size="small" onClick={() => openRenameDialog(group.id, group.name)}>Rename</Button>
            </Paper>
          ))}
          {groupStats.length === 0 && (
            <Typography variant="body2" color="textSecondary">No groups created yet. Click the tag icon on a tile to start grouping!</Typography>
          )}
        </Box>
      </Paper>
      ) : (
        <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 100 }}>
          <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255, 255, 255, 0.95)', boxShadow: 3 }}>
            <Box display="flex" gap={2}>
              <Typography variant="body2" fontWeight="bold">Score: {score}</Typography>
              <Typography variant="body2" color="error">Mistakes: {mistakes}</Typography>
              <Typography variant="body2" color="primary">Progress: {Math.round((score / (gridSize * (gridSize - 1))) * 100)}%</Typography>
            </Box>
            <IconButton size="small" onClick={() => setSidebarExpanded(true)}>
              <MenuIcon />
            </IconButton>
          </Paper>
        </Box>
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={createNewGroup}>
          <ListItemIcon><AddCircleIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Create New Group</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => assignGroupToTile(activeTileId!, null)}>
          <ListItemText>Remove Group</ListItemText>
        </MenuItem>
        {userGroups
          .slice()
          .sort((a, b) => b.lastUpdated - a.lastUpdated)
          .map((group) => {
            const currentCount = tiles.reduce((acc, t) => {
               if (t.userGroupId === group.id && !t.locked && !t.hidden) return acc + t.itemCount;
               return acc;
            }, 0);
            if (currentCount === 0) return null;
            
            return (
              <MenuItem key={group.id} onClick={() => assignGroupToTile(activeTileId!, group.id)}>
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: group.color, mr: 1, border: '1px solid #000' }} />
                <ListItemText>{group.name} ({currentCount})</ListItemText>
              </MenuItem>
            );
        })}
      </Menu>

      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>Rename Group</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Group Name"
            fullWidth
            variant="standard"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRenameSubmit}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );

  return (
    <Container maxWidth={false} disableGutters>
      {!isPlaying ? renderSetup() : renderGame()}
    </Container>
  );
}

export default function Game() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GameContent />
    </Suspense>
  );
}
