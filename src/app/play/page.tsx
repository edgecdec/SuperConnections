'use client';

import React, { useState, useCallback, Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Container, Snackbar, Alert, Box, Paper, Typography, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import confetti from 'canvas-confetti';

import { Tile } from '../../types';
import { useGameLogic } from '../../hooks/useGameLogic';
import { Sidebar } from '../../components/Sidebar';
import { GameGrid } from '../../components/GameGrid';
import { TileMenu } from '../../components/TileMenu';
import { RenameDialog } from '../../components/RenameDialog';

function GameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCodeFromUrl = searchParams.get('room');

  const {
    state, isPlaying, isLoaded, isHost, userId, groupStats, selectedTile, setSelectedTile,
    game, groupIdMap, groupItemMap, solvedItemMap, activeTiles, localTouchedGroupIds, elapsedTime, scrollPosRef
  } = useGameLogic(roomCodeFromUrl, false);

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

  const prevCompletedCountRef = useRef(0);
  const selectedTileRefLocal = useRef(selectedTile);
  const gameRef = useRef(game);

  const [localVolume, setLocalVolume] = useState<number>(0.3);

  useEffect(() => {
    const savedVol = localStorage.getItem('superConnectionsVolume');
    if (savedVol !== null) setLocalVolume(parseFloat(savedVol));
  }, []);

  const handleVolumeChange = useCallback((newVol: number) => {
    setLocalVolume(newVol);
    localStorage.setItem('superConnectionsVolume', newVol.toString());
  }, []);

  useEffect(() => {
    selectedTileRefLocal.current = selectedTile;
  }, [selectedTile]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (isLoaded && !isPlaying && !roomCodeFromUrl) {
      router.push('/');
    }
  }, [isLoaded, isPlaying, roomCodeFromUrl, router]);

  useEffect(() => {
    if (!isPlaying) {
      prevCompletedCountRef.current = 0;
      return;
    }

    const currentCount = state.completedCategories.length;
    if (currentCount > prevCompletedCountRef.current) {
      const isFullWin = currentCount === state.settings.numCategories;
      
      if (localVolume > 0) {
        const audio = new Audio(isFullWin ? '/sounds/dailydouble.mp3' : '/sounds/board_fill.mp3');
        audio.volume = localVolume;
        audio.play().catch(e => console.error("Audio playback failed:", e));
      }

      if (isFullWin) {
        const duration = 5 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
      } else {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.8 },
          zIndex: 10000
        });
      }

      prevCompletedCountRef.current = currentCount;
    } else if (currentCount < prevCompletedCountRef.current) {
      prevCompletedCountRef.current = currentCount; // Just in case of resets
    }
  }, [state.completedCategories.length, state.settings?.numCategories, localVolume, isPlaying]);

  // --- STABLE HANDLERS (Refs + Callbacks) ---
  
  const onMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>, tileId: string) => {
    event.stopPropagation();
    setActiveTileId(tileId);
    setTaggingDialogOpen(true);
  }, []);

  const onTileClick = useCallback((e: React.MouseEvent, tile: Tile) => {
    if (tile.locked) return;

    if (e.ctrlKey) {
      // Ctrl + Click -> Bottom
      gameRef.current.reorder(tile.id, 'bottom');
      return;
    }

    const currentSelected = selectedTileRefLocal.current;

    if (currentSelected && currentSelected.id === tile.id) {
      setSelectedTile(null);
    } else if (currentSelected) {
      gameRef.current.merge(tile.id, currentSelected.id);
      setSelectedTile(null);
    } else {
      setSelectedTile(tile);
    }
  }, [setSelectedTile]);

  const onTileAuxClick = useCallback((e: React.MouseEvent, tile: Tile) => {
    if (tile.locked) return;
    if (e.button === 1) {
      // Middle Click -> Top (Except combined)
      if (tile.itemCount === 1) {
        gameRef.current.reorder(tile.id, 'top');
      }
    }
  }, []);

  const onDragStart = useCallback((e: React.DragEvent, tile: Tile) => {
    if (tile.locked) return;
    e.dataTransfer.setData('application/json', JSON.stringify(tile));
  }, []);

  const onDrop = useCallback((e: React.DragEvent, targetTile: Tile, intent: 'before' | 'after' | 'merge') => {
    e.preventDefault();
    if (targetTile.locked) return;
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData) as Tile;
      if (draggedTile.id !== targetTile.id) {
        if (intent === 'merge') {
          gameRef.current.merge(targetTile.id, draggedTile.id);
        } else {
          gameRef.current.insert(draggedTile.id, targetTile.id, intent);
        }
      }
    } catch (err) { console.error(err); }
  }, []);

  const onDropOnGroup = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    try {
      const draggedTileData = e.dataTransfer.getData('application/json');
      if (!draggedTileData) return;
      const draggedTile = JSON.parse(draggedTileData) as Tile;
      gameRef.current.tag(draggedTile.id, groupId);
    } catch (err) { console.error(err); }
  }, []);

  const onRenameSave = useCallback((newName: string) => {
    if (groupToRename) {
      gameRef.current.renameGroup(groupToRename, newName);
      setRenameDialogOpen(false);
    }
  }, [groupToRename]);

  const handleCopyRoomLink = useCallback(() => {
    navigator.clipboard.writeText(`${window.location.origin}/play?room=${state.roomCode}`);
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

      // Play Sound Effects
      if (localVolume > 0) {
        if (lastActionResult.actionType === 'MERGE_TILES' || lastActionResult.actionType === 'TAG_TILE') {
          const audio = new Audio(lastActionResult.success ? '/sounds/correct.mp3' : '/sounds/wrong.mp3');
          audio.volume = localVolume;
          audio.play().catch(e => console.error("Audio playback failed:", e));
        }
      }
    }
  }, [lastActionResult, localVolume]);

  const renderGame = () => (
    <Box display="flex" height="100vh" p={2} gap={2}>
      <GameGrid 
        roomCode={state.roomCode} tiles={state.tiles} gridSize={state.gridSize} 
        numCategories={state.settings.numCategories} tilesPerRow={state.tilesPerRow}
        completedCategories={state.completedCategories} activeTiles={activeTiles} selectedTile={selectedTile}
        lastActionResult={lastActionResult} groupIdMap={groupIdMap} groupItemMap={groupItemMap} solvedItemMap={solvedItemMap}
        onCopyRoomLink={handleCopyRoomLink} onMenuOpen={onMenuOpen} onTileClick={onTileClick} onDragStart={onDragStart} onDrop={onDrop}
        onTileAuxClick={onTileAuxClick}
        scrollPosRef={scrollPosRef}
      />

      <Sidebar 
        {...state} currentUserId={userId} sidebarExpanded={sidebarExpanded} setSidebarExpanded={setSidebarExpanded} settingsExpanded={settingsExpanded}
        setSettingsExpanded={setSettingsExpanded} groupStats={groupStats} isHost={isHost}
        onUpdateSettings={game.updateSettings} onRefillBoard={game.refill} onShuffleBoard={game.shuffle} onQuitGame={game.quit}
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
        localVolume={localVolume}
        onUpdateLocalVolume={handleVolumeChange}
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
        onCreateGroup={(tileId, initialName) => {
          const newId = game.createGroup(tileId, initialName);
          if (newId) {
            if (!initialName) {
              setGroupToRename(newId); setInitialGroupName(''); setRenameDialogOpen(true);
            }
          }
        }}
        onTagTile={game.tag}
        onOpenRenameDialog={(id, name) => { setGroupToRename(id); setInitialGroupName(name); setRenameDialogOpen(true); }}
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
      {isPlaying ? renderGame() : (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
          <Typography variant="h5" color="textSecondary" gutterBottom>
            {roomCodeFromUrl ? `Connecting to room ${roomCodeFromUrl}...` : "Loading your game..."}
          </Typography>
        </Box>
      )}
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
