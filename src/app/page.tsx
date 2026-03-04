'use client';

import React, { useState, useCallback, Suspense, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Container, Snackbar, Alert, Box } from '@mui/material';

import { Tile, GameAction } from '../types';
import { useGameLogic } from '../hooks/useGameLogic';
import { Sidebar } from '../components/Sidebar';
import { SetupScreen } from '../components/SetupScreen';
import { GameGrid } from '../components/GameGrid';
import { TileMenu } from '../components/TileMenu';
import { RenameDialog } from '../components/RenameDialog';
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
    lastActionResult,
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

  useEffect(() => {
    if (lastActionResult) {
      const actionLabel = lastActionResult.actionType ? lastActionResult.actionType.replace('_', ' ') : 'Action';
      if (lastActionResult.success) {
        setToast({ open: true, message: `${actionLabel} Successful!`, severity: 'success' });
      } else {
        setToast({ open: true, message: lastActionResult.message || 'Incorrect match!', severity: 'error' });
      }
    }
  }, [lastActionResult]);

  const stateRef = useRef(state);
  const selectedTileRef = useRef(selectedTile);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { selectedTileRef.current = selectedTile; }, [selectedTile]);

  const onMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>, tileId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setActiveTileId(tileId);
  }, []);

  const onTileClick = useCallback((tile: Tile) => {
    if (tile.locked) return;
    const currentSelected = selectedTileRef.current;
    if (currentSelected) {
      if (currentSelected.id === tile.id) {
        setSelectedTile(null);
      } else {
        const newGroupId = Math.random().toString(36).substring(2, 9);
        handleAction({ 
          type: 'MERGE_TILES', 
          payload: { 
            tile1Id: tile.id, 
            tile2Id: currentSelected.id, 
            newGroupColor: getRandomColor(stateRef.current.userGroups.map(g => g.color)),
            newGroupId
          } 
        });
        setSelectedTile(null);
        setToast({ open: true, message: 'Processing merge...', severity: 'info' });
      }
    } else {
      setSelectedTile(tile);
    }
  }, [handleAction, setSelectedTile]);

  const onDrop = useCallback((e: React.DragEvent, targetTile: Tile) => {
    e.preventDefault();
    if (targetTile.locked) return;
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData) as Tile;
      if (draggedTile.id === targetTile.id) return;
      
      const newGroupId = Math.random().toString(36).substring(2, 9);
      handleAction({ 
        type: 'MERGE_TILES', 
        payload: { 
          tile1Id: targetTile.id, 
          tile2Id: draggedTile.id, 
          newGroupColor: getRandomColor(stateRef.current.userGroups.map(g => g.color)),
          newGroupId
        } 
      });
      setSelectedTile(null);
      setToast({ open: true, message: 'Processing merge...', severity: 'info' });
    } catch (err) { console.error(err); }
  }, [handleAction, setSelectedTile]);

  const groupIdMap = useMemo(() => {
    const map: Record<string, any> = {};
    state.userGroups.forEach(g => map[g.id] = g);
    return map;
  }, [state.userGroups]);

  const groupItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    state.tiles.forEach(t => {
      if (t.userGroupId && !t.hidden) {
        if (!map[t.userGroupId]) map[t.userGroupId] = t.text;
        else map[t.userGroupId] += ', ' + t.text;
      }
    });
    return map;
  }, [state.tiles]);

  const solvedItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    state.completedCategories.forEach(cat => {
      map[cat] = state.tiles.filter(t => t.realCategory === cat && !t.hidden).map(t => t.text).join(', ');
    });
    return map;
  }, [state.completedCategories, state.tiles]);

  const activeTiles = useMemo(() => state.tiles.filter(t => !t.locked), [state.tiles]);

  const onCreateGroupFromMenu = (tileId: string) => {
    const targetTile = state.tiles.find(t => t.id === tileId);
    if (targetTile?.userGroupId) { setToast({ open: true, message: 'Already in a group!', severity: 'warning' }); return; }
    const newId = Math.random().toString(36).substring(2, 9);
    const name = `Group ${state.userGroups.length + 1}`;
    handleAction({ type: 'CREATE_GROUP', payload: { tileId, group: { id: newId, name, color: getRandomColor(state.userGroups.map(g => g.color)), lastUpdated: Date.now() } } });
    setGroupToRename(newId); setNewGroupName(name); setRenameDialogOpen(true);
  };

  const onTagTile = (tileId: string, groupId: string | null) => {
    const newGroupId = Math.random().toString(36).substring(2, 9);
    handleAction({ type: 'TAG_TILE', payload: { tileId, groupId, newGroupId } });
    if (groupId) setToast({ open: true, message: 'Tagging tile...', severity: 'info' });
  };

  const handleCopyRoomLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomCode}`);
    setToast({ open: true, message: 'Link copied!', severity: 'info' });
  };

  const renderGame = () => (
    <Box display="flex" height="100vh" p={2} gap={2}>
      <GameGrid 
        roomCode={state.roomCode}
        tiles={state.tiles}
        gridSize={state.gridSize}
        tilesPerRow={state.tilesPerRow}
        completedCategories={state.completedCategories}
        activeTiles={activeTiles}
        selectedTile={selectedTile}
        lastActionResult={lastActionResult}
        groupIdMap={groupIdMap}
        groupItemMap={groupItemMap}
        solvedItemMap={solvedItemMap}
        onCopyRoomLink={handleCopyRoomLink}
        onMenuOpen={onMenuOpen}
        onTileClick={onTileClick}
        onDrop={onDrop}
      />

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
          const targetTileId = selectedTileRef.current?.id || activeTileId;
          if (targetTileId) onCreateGroupFromMenu(targetTileId);
          else {
            const newId = Math.random().toString(36).substring(2, 9);
            const name = `Group ${state.userGroups.length + 1}`;
            handleAction({ type: 'CREATE_GROUP', payload: { tileId: null, group: { id: newId, name, color: getRandomColor(state.userGroups.map(g => g.color)), lastUpdated: Date.now() } } });
            setGroupToRename(newId); setNewGroupName(name); setRenameDialogOpen(true);
          }
        }}
        onOpenRenameDialog={(id, name) => { setGroupToRename(id); setNewGroupName(name); setRenameDialogOpen(true); }}
        tiles={state.tiles}
      />

      <TileMenu 
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        activeTileId={activeTileId}
        tiles={state.tiles}
        userGroups={state.userGroups}
        onCreateGroup={onCreateGroupFromMenu}
        onTagTile={onTagTile}
      />

      <RenameDialog 
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        onSave={() => { 
          handleAction({ type: 'RENAME_GROUP', payload: { groupId: groupToRename!, newName: newGroupName.trim() } }); 
          setRenameDialogOpen(false); 
          setToast({ open: true, message: 'Renaming group...', severity: 'info' });
        }}
      />

      <Snackbar open={toast.open} autoHideDuration={1500} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );

  return (
    <Container maxWidth={false} disableGutters>
      {!isPlaying ? (
        <SetupScreen 
          gridSizeInput={gridSizeInput}
          setGridSizeInput={setGridSizeInput}
          onStart={handleStart}
        />
      ) : renderGame()}
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
