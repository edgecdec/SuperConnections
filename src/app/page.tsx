'use client';

import React, { useState, useCallback, Suspense, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Container, Snackbar, Alert, Box } from '@mui/material';

import { Tile } from '../types';
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
    state, isPlaying, isHost, groupStats, selectedTile, setSelectedTile,
    game, groupIdMap, groupItemMap, solvedItemMap, activeTiles, localTouchedGroupIds
  } = useGameLogic(roomCodeFromUrl);

  const lastActionResult = state.lastActionResult;

  const [gridSizeInput, setGridSizeInput] = useState<number>(state.gridSize);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  const [taggingDialogOpen, setTaggingDialogOpen] = useState(false);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [groupToRename, setGroupToRename] = useState<string | null>(null);
  const [initialGroupName, setInitialGroupName] = useState('');

  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'warning' | 'info' | 'error' }>({
    open: false, message: '', severity: 'info',
  });

  // --- STABLE HANDLERS (Refs + Callbacks) ---
  
  const onMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>, tileId: string) => {
    event.stopPropagation();
    setActiveTileId(tileId);
    setTaggingDialogOpen(true);
  }, []);

  const onTileClick = useCallback((tile: Tile) => {
    if (tile.locked) return;
    setSelectedTile((prev) => {
      if (prev && prev.id === tile.id) return null;
      if (prev) { game.merge(tile.id, prev.id); return null; }
      return tile;
    });
  }, [game, setSelectedTile]);

  const onDragStart = useCallback((e: React.DragEvent, tile: Tile) => {
    if (tile.locked) return;
    e.dataTransfer.setData('application/json', JSON.stringify(tile));
  }, []);

  const onDrop = useCallback((e: React.DragEvent, targetTile: Tile) => {
    e.preventDefault();
    if (targetTile.locked) return;
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData) as Tile;
      if (draggedTile.id !== targetTile.id) game.merge(targetTile.id, draggedTile.id);
    } catch (err) { console.error(err); }
  }, [game]);

  const onDropOnGroup = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData) as Tile;
      game.tag(draggedTile.id, groupId);
    } catch (err) { console.error(err); }
  }, [game]);

  const onRenameSave = useCallback((newName: string) => {
    if (groupToRename) {
      game.renameGroup(groupToRename, newName);
      setRenameDialogOpen(false);
    }
  }, [game, groupToRename]);

  const handleCopyRoomLink = useCallback(() => {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomCode}`);
    setToast({ open: true, message: 'Link copied!', severity: 'info' });
  }, [state.roomCode]);

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

  const renderGame = () => (
    <Box display="flex" height="100vh" p={2} gap={2}>
      <GameGrid 
        roomCode={state.roomCode} tiles={state.tiles} gridSize={state.gridSize} tilesPerRow={state.tilesPerRow}
        completedCategories={state.completedCategories} activeTiles={activeTiles} selectedTile={selectedTile}
        lastActionResult={lastActionResult} groupIdMap={groupIdMap} groupItemMap={groupItemMap} solvedItemMap={solvedItemMap}
        onCopyRoomLink={handleCopyRoomLink} onMenuOpen={onMenuOpen} onTileClick={onTileClick} onDragStart={onDragStart} onDrop={onDrop}
      />

      <Sidebar 
        {...state} sidebarExpanded={sidebarExpanded} setSidebarExpanded={setSidebarExpanded} settingsExpanded={settingsExpanded}
        setSettingsExpanded={setSettingsExpanded} groupStats={groupStats} isHost={isHost}
        onUpdateSettings={game.updateSettings} onRefillBoard={game.refill} onQuitGame={game.quit}
        onCreateNewGroup={() => {
          const newId = game.createGroup();
          if (newId) {
            const group = groupIdMap[newId];
            setGroupToRename(newId); setInitialGroupName(group?.name || 'New Group'); setRenameDialogOpen(true);
          }
        }}
        onOpenRenameDialog={(id, name) => { setGroupToRename(id); setInitialGroupName(name); setRenameDialogOpen(true); }}
        groupItemMap={groupItemMap}
        onDropOnGroup={onDropOnGroup}
      />

      <TileMenu 
        open={taggingDialogOpen}
        onClose={() => setTaggingDialogOpen(false)}
        activeTileId={activeTileId}
        tiles={state.tiles}
        userGroups={state.userGroups}
        localTouchedGroupIds={localTouchedGroupIds}
        onCreateGroup={(tileId) => {
          const newId = game.createGroup(tileId);
          if (newId) {
            const group = groupIdMap[newId];
            setGroupToRename(newId); setInitialGroupName(group?.name || 'New Group'); setRenameDialogOpen(true);
          }
        }}
        onTagTile={game.tag}
      />

      <RenameDialog 
        open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}
        initialGroupName={initialGroupName} onSave={onRenameSave}
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
