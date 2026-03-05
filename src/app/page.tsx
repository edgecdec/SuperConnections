'use client';

import React, { useState, useCallback, Suspense, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Container, Snackbar, Alert, Box, Paper, Typography, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

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
    game, groupIdMap, groupItemMap, solvedItemMap, activeTiles, localTouchedGroupIds, elapsedTime, scrollPosRef
  } = useGameLogic(roomCodeFromUrl);

  const lastActionResult = state.lastActionResult;

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

  const onTileDoubleClick = useCallback((e: React.MouseEvent, tile: Tile) => {
    if (tile.locked) return;
    if (e.ctrlKey) {
      game.reorder(tile.id, 'bottom');
    } else {
      if (tile.itemCount === 1) {
        game.reorder(tile.id, 'top');
      }
    }
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
        roomCode={state.roomCode} tiles={state.tiles} gridSize={state.gridSize} 
        numCategories={state.settings.numCategories} tilesPerRow={state.tilesPerRow}
        completedCategories={state.completedCategories} activeTiles={activeTiles} selectedTile={selectedTile}
        lastActionResult={lastActionResult} groupIdMap={groupIdMap} groupItemMap={groupItemMap} solvedItemMap={solvedItemMap}
        onCopyRoomLink={handleCopyRoomLink} onMenuOpen={onMenuOpen} onTileClick={onTileClick} onDragStart={onDragStart} onDrop={onDrop}
        onTileDoubleClick={onTileDoubleClick}
        scrollPosRef={scrollPosRef}
      />

      <Sidebar 
        {...state} sidebarExpanded={sidebarExpanded} setSidebarExpanded={setSidebarExpanded} settingsExpanded={settingsExpanded}
        setSettingsExpanded={setSettingsExpanded} groupStats={groupStats} isHost={isHost}
        onUpdateSettings={game.updateSettings} onRefillBoard={game.refill} onQuitGame={game.quit}
        onCreateNewGroup={() => {
          const newId = game.createGroup();
          if (newId) {
            setGroupToRename(newId); setInitialGroupName(''); setRenameDialogOpen(true);
          }
        }}
        onOpenRenameDialog={(id, name) => { setGroupToRename(id); setInitialGroupName(name); setRenameDialogOpen(true); }}
        groupItemMap={groupItemMap}
        onDropOnGroup={onDropOnGroup}
        elapsedTime={elapsedTime}
        onSetPlayerName={game.setPlayerName}
      />

      {!sidebarExpanded && (
        <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 100 }}>
          <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255, 255, 255, 0.95)', boxShadow: 3 }}>
            <Box display="flex" gap={2}>
              <Typography variant="body2">Score: {state.score}</Typography>
              <Typography variant="body2" color="error">Mistakes: {state.mistakes}</Typography>
              <Typography variant="body2">
                Progress: {(() => {
                  const total = state.settings.numCategories * (state.settings.itemsPerCategory - 1);
                  return total > 0 ? Math.round((state.score / total) * 100) : 0;
                })()}%
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setSidebarExpanded(true)}><MenuIcon /></IconButton>
          </Paper>
        </Box>
      )}

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
            setGroupToRename(newId); setInitialGroupName(''); setRenameDialogOpen(true);
          }
        }}
        onTagTile={game.tag}
      />

      <RenameDialog 
        open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}
        initialValue={initialGroupName} onSave={onRenameSave}
      />

      <Snackbar open={toast.open} autoHideDuration={1500} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );

  return (
    <Container maxWidth={false} disableGutters>
      {!isPlaying ? (
        <SetupScreen onStart={game.start} />
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
