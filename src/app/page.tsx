'use client';

import React, { useState, useCallback, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Alert
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { Tile, GameAction } from '../types';
import { useGameLogic } from '../hooks/useGameLogic';
import { TileComponent } from '../components/Tile';
import { Sidebar } from '../components/Sidebar';
import { getRandomColor } from '../utils/colors';

function GameContent() {
  const searchParams = useSearchParams();
  const roomCodeFromUrl = searchParams.get('room');

  const {
    state,
    isPlaying,
    isHost,
    groupStats,
    selectedTile,
    setSelectedTile,
    handleAction,
    handleStart,
    quitGame
  } = useGameLogic(roomCodeFromUrl);

  const [gridSizeInput, setGridSizeInput] = useState<number>(state.gridSize);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

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

  const onMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>, tileId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setActiveTileId(tileId);
  }, []);

  const onTileClick = useCallback((tile: Tile) => {
    if (tile.locked) return;
    setSelectedTile((prev) => {
      if (prev?.id === tile.id) return null;
      if (!prev) return tile;
      handleAction({ 
        type: 'MERGE_TILES', 
        payload: { 
          tile1Id: prev.id, 
          tile2Id: tile.id, 
          newGroupColor: getRandomColor(state.userGroups.map(g => g.color))
        } 
      });
      return null;
    });
  }, [handleAction, setSelectedTile, state.userGroups]);

  const onDragStart = useCallback((e: React.DragEvent, tile: Tile) => {
    if (tile.locked) return;
    e.dataTransfer.setData('application/json', JSON.stringify(tile));
  }, []);

  const onDrop = useCallback((e: React.DragEvent, targetTile: Tile) => {
    e.preventDefault();
    if (targetTile.locked) return;
    try {
      const draggedTile = JSON.parse(e.dataTransfer.getData('application/json')) as Tile;
      handleAction({ 
        type: 'MERGE_TILES', 
        payload: { 
          tile1Id: targetTile.id, 
          tile2Id: draggedTile.id, 
          newGroupColor: getRandomColor(state.userGroups.map(g => g.color))
        } 
      });
      setSelectedTile(null);
    } catch (err) { console.error(err); }
  }, [handleAction, setSelectedTile, state.userGroups]);

  const renderSetup = () => (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh">
      <Typography variant="h3" gutterBottom>Super Connections</Typography>
      <Box display="flex" gap={2} alignItems="center" mt={2}>
        <TextField 
          type="number" 
          label="Grid Size" 
          value={gridSizeInput || ''} 
          onChange={e => setGridSizeInput(parseInt(e.target.value, 10) || 0)} 
          inputProps={{ min: 2, max: 50 }} 
        />
        <Button variant="contained" size="large" onClick={() => handleStart(false, gridSizeInput)}>Play Solo</Button>
        <Button variant="outlined" color="primary" size="large" onClick={() => handleStart(true, gridSizeInput)}>Host Multiplayer</Button>
      </Box>
    </Box>
  );

  const activeTiles = useMemo(() => state.tiles.filter(t => !t.locked), [state.tiles]);

  const renderGame = () => (
    <Box display="flex" height="100vh" p={2} gap={2}>
      {state.roomCode && state.tiles.length === 0 ? (
        <Box flex={3} display="flex" alignItems="center" justifyContent="center">
          <Typography variant="h5">Syncing with room {state.roomCode}...</Typography>
        </Box>
      ) : (
        <Box flex={3} display="flex" flexDirection="column" sx={{ overflowY: 'auto' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h4" gutterBottom>Super Connections ({state.gridSize}x{state.gridSize})</Typography>
            {state.roomCode && (
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="h6" color="primary">Room: {state.roomCode}</Typography>
                <IconButton size="small" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomCode}`);
                  setToast({ open: true, message: 'Link copied!', severity: 'info' });
                }}><ContentCopyIcon fontSize="small" /></IconButton>
              </Box>
            )}
          </Box>
          {state.completedCategories.map(cat => (
            <Paper key={cat} sx={{ p: 2, mb: 1, backgroundColor: '#d4edda', textAlign: 'center' }}>
              <Typography variant="h6">{cat}</Typography>
              <Typography variant="body2">{state.tiles.filter(t => t.realCategory === cat).map(t => t.text).join(', ')}</Typography>
            </Paper>
          ))}
          <Box sx={{ flexGrow: 1, overflowX: 'auto', pb: 2 }}>
            <Box display="grid" gap={1} gridTemplateColumns={`repeat(${state.tilesPerRow}, minmax(100px, 1fr))`} sx={{ minWidth: 'min-content' }}>
              {activeTiles.map((tile) => (
                tile.hidden ? 
                  <Box key={tile.id} sx={{ minHeight: '80px', visibility: 'hidden' }} /> :
                  <TileComponent 
                    key={tile.id} 
                    tile={tile} 
                    group={state.userGroups.find(g => g.id === tile.userGroupId)} 
                    gridSize={state.gridSize} 
                    isSelected={selectedTile?.id === tile.id} 
                    onMenuOpen={onMenuOpen} 
                    onTileClick={onTileClick} 
                    onDragStart={onDragStart} 
                    onDragOver={e => e.preventDefault()} 
                    onDrop={onDrop} 
                  />
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Sidebar 
        {...state}
        sidebarExpanded={sidebarExpanded}
        setSidebarExpanded={setSidebarExpanded}
        settingsExpanded={settingsExpanded}
        setSettingsExpanded={setSettingsExpanded}
        groupStats={groupStats}
        isHost={isHost}
        onUpdateSettings={p => handleAction({ type: 'UPDATE_SETTINGS', payload: p })}
        onRefillBoard={() => handleAction({ type: 'REFILL_BOARD' })}
        onQuitGame={quitGame}
        onCreateNewGroup={() => {
          const newId = Math.random().toString(36).substring(2, 9);
          const name = `Group ${state.userGroups.length + 1}`;
          handleAction({ 
            type: 'CREATE_GROUP', 
            payload: { 
              tileId: activeTileId, 
              group: { id: newId, name, color: getRandomColor(state.userGroups.map(g => g.color)), lastUpdated: Date.now() } 
            } 
          });
          setGroupToRename(newId);
          setNewGroupName(name);
          setRenameDialogOpen(true);
        }}
        onOpenRenameDialog={(id, name) => {
          setGroupToRename(id);
          setNewGroupName(name);
          setRenameDialogOpen(true);
        }}
      />

      {!sidebarExpanded && (
        <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 100 }}>
          <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255, 255, 255, 0.95)', boxShadow: 3 }}>
            <Box display="flex" gap={2}>
              <Typography variant="body2" fontWeight="bold">Score: {state.score}</Typography>
              <Typography variant="body2" color="error">Mistakes: {state.mistakes}</Typography>
              <Typography variant="body2" color="primary">Progress: {Math.round((state.score / (state.gridSize * (state.gridSize - 1))) * 100)}%</Typography>
            </Box>
            <IconButton size="small" onClick={() => setSidebarExpanded(true)}><MenuIcon /></IconButton>
          </Paper>
        </Box>
      )}

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => {
          const newId = Math.random().toString(36).substring(2, 9);
          const name = `Group ${state.userGroups.length + 1}`;
          handleAction({ 
            type: 'CREATE_GROUP', 
            payload: { 
              tileId: activeTileId, 
              group: { id: newId, name, color: getRandomColor(state.userGroups.map(g => g.color)), lastUpdated: Date.now() } 
            } 
          });
          setGroupToRename(newId);
          setNewGroupName(name);
          setRenameDialogOpen(true);
          setAnchorEl(null);
        }}>Create New Group</MenuItem>
        <Divider />
        <MenuItem onClick={() => { handleAction({ type: 'TAG_TILE', payload: { tileId: activeTileId!, groupId: null } }); setAnchorEl(null); }}>Remove Group</MenuItem>
        {state.userGroups.slice().sort((a, b) => b.lastUpdated - a.lastUpdated).map(group => {
          const count = state.tiles.reduce((acc, t) => (t.userGroupId === group.id && !t.locked && !t.hidden) ? acc + t.itemCount : acc, 0);
          if (count === 0) return null;
          return <MenuItem key={group.id} onClick={() => { handleAction({ type: 'TAG_TILE', payload: { tileId: activeTileId!, groupId: group.id } }); setAnchorEl(null); }}><Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: group.color, mr: 1, border: '1px solid #000' }} /><ListItemText>{group.name} ({count})</ListItemText></MenuItem>;
        })}
      </Menu>

      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>Rename Group</DialogTitle>
        <DialogContent><TextField autoFocus margin="dense" label="Group Name" fullWidth variant="standard" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button><Button onClick={() => { handleAction({ type: 'RENAME_GROUP', payload: { groupId: groupToRename!, newName: newGroupName.trim() } }); setRenameDialogOpen(false); }}>Save</Button></DialogActions>
      </Dialog>
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={toast.severity} sx={{ width: '100%' }}>{toast.message}</Alert></Snackbar>
    </Box>
  );

  return <Container maxWidth={false} disableGutters>{!isPlaying ? renderSetup() : renderGame()}</Container>;
}

export default function Game() {
  return <Suspense fallback={<div>Loading...</div>}><GameContent /></Suspense>;
}
