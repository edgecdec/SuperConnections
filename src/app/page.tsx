'use client';

import React, { useState, useCallback, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Container, Snackbar, Alert, Box } from '@mui/material';

import { useGameLogic } from '../hooks/useGameLogic';
import { Sidebar } from '../components/Sidebar';
import { SetupScreen } from '../components/SetupScreen';
import { GameGrid } from '../components/GameGrid';
import { TileMenu } from '../components/TileMenu';
import { RenameDialog } from '../components/RenameDialog';

function GameContent() {
  const searchParams = useSearchParams();
  const roomCodeFromUrl = searchParams.get('room');

  const {
    state, isPlaying, isHost, groupStats, selectedTile, setSelectedTile, lastActionResult,
    game, groupIdMap, groupItemMap, solvedItemMap, activeTiles
  } = useGameLogic(roomCodeFromUrl);

  const [gridSizeInput, setGridSizeInput] = useState<number>(state.gridSize);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [groupToRename, setGroupToRename] = useState<string | null>(null);
  const [initialGroupName, setInitialGroupName] = useState('');

  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'warning' | 'info' | 'error' }>({
    open: false, message: '', severity: 'info',
  });

  useEffect(() => {
    if (lastActionResult) {
      const actionLabel = lastActionResult.actionType ? lastActionResult.actionType.replace('_', ' ') : 'Action';
      setToast({ 
        open: true, 
        message: lastActionResult.success ? `${actionLabel} Successful!` : (lastActionResult.message || 'Incorrect match!'), 
        severity: lastActionResult.success ? 'success' : 'error' 
      });
    }
  }, [lastActionResult]);

  const onMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>, tileId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setActiveTileId(tileId);
  }, []);

  const onTileClick = useCallback((tile: any) => {
    if (tile.locked) return;
    setSelectedTile((prev: any) => {
      if (prev && prev.id === tile.id) return null;
      if (prev) { game.merge(tile.id, prev.id); return null; }
      return tile;
    });
  }, [game]);

  const onDrop = useCallback((e: React.DragEvent, targetTile: any) => {
    e.preventDefault();
    if (targetTile.locked) return;
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData);
      if (draggedTile.id !== targetTile.id) game.merge(targetTile.id, draggedTile.id);
    } catch (err) { console.error(err); }
  }, [game]);

  const renderGame = () => (
    <Box display="flex" height="100vh" p={2} gap={2}>
      <GameGrid 
        roomCode={state.roomCode} tiles={state.tiles} gridSize={state.gridSize} tilesPerRow={state.tilesPerRow}
        completedCategories={state.completedCategories} activeTiles={activeTiles} selectedTile={selectedTile}
        lastActionResult={lastActionResult} groupIdMap={groupIdMap} groupItemMap={groupItemMap} solvedItemMap={solvedItemMap}
        onCopyRoomLink={() => { navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomCode}`); setToast({ open: true, message: 'Link copied!', severity: 'info' }); }}
        onMenuOpen={onMenuOpen} onTileClick={onTileClick} onDragStart={(e, t) => e.dataTransfer.setData('application/json', JSON.stringify(t))} onDrop={onDrop}
      />

      <Sidebar 
        {...state} sidebarExpanded={sidebarExpanded} setSidebarExpanded={setSidebarExpanded} settingsExpanded={settingsExpanded}
        setSettingsExpanded={setSettingsExpanded} groupStats={groupStats} isHost={isHost}
        onUpdateSettings={game.updateSettings} onRefillBoard={game.refill} onQuitGame={game.quit}
        onCreateNewGroup={() => {
          const newId = game.createGroup();
          if (newId) {
            const group = state.userGroups.find(g => g.id === newId);
            setGroupToRename(newId); setInitialGroupName(group?.name || 'New Group'); setRenameDialogOpen(true);
          }
        }}
        onOpenRenameDialog={(id, name) => { setGroupToRename(id); setInitialGroupName(name); setRenameDialogOpen(true); }}
        groupItemMap={groupItemMap}
      />

      <TileMenu 
        anchorEl={anchorEl} onClose={() => setAnchorEl(null)} activeTileId={activeTileId}
        tiles={state.tiles} userGroups={state.userGroups}
        onCreateGroup={(tileId) => {
          const newId = game.createGroup(tileId);
          if (newId) {
            const group = state.userGroups.find(g => g.id === newId);
            setGroupToRename(newId); setInitialGroupName(group?.name || 'New Group'); setRenameDialogOpen(true);
          }
        }}
        onTagTile={game.tag}
      />

      <RenameDialog 
        open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}
        initialGroupName={initialGroupName} onSave={(newName) => { game.renameGroup(groupToRename!, newName); setRenameDialogOpen(false); }}
      />

      <Snackbar open={toast.open} autoHideDuration={1500} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );

  return (
    <Container maxWidth={false} disableGutters>
      {!isPlaying ? (
        <SetupScreen gridSizeInput={gridSizeInput} setGridSizeInput={setGridSizeInput} onStart={game.start} />
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
