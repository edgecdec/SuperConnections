import React from 'react';
import { Box, Typography, Paper, IconButton } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Tile, UserGroup, ActionResponse } from '../types';
import { TileComponent } from './Tile';

interface GameGridProps {
  roomCode: string | null;
  tiles: Tile[];
  gridSize: number;
  numCategories: number;
  tilesPerRow: number;
  completedCategories: string[];
  activeTiles: Tile[];
  selectedTile: Tile | null;
  lastActionResult: ActionResponse | null;
  groupIdMap: Record<string, UserGroup>;
  groupItemMap: Record<string, string>;
  solvedItemMap: Record<string, string>;
  onCopyRoomLink: () => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, id: string) => void;
  onTileClick: (tile: Tile) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, targetTile: Tile) => void;
}

export const GameGrid = React.memo(({
  roomCode,
  tiles,
  gridSize,
  numCategories,
  tilesPerRow,
  completedCategories,
  activeTiles,
  selectedTile,
  lastActionResult,
  groupIdMap,
  groupItemMap,
  solvedItemMap,
  onCopyRoomLink,
  onMenuOpen,
  onTileClick,
  onDragStart,
  onDrop
}: GameGridProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollPosRef = React.useRef(0);

  // Capture scroll position before each render pass
  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    scrollPosRef.current = e.currentTarget.scrollTop;
  }, []);

  // Restore scroll position after DOM mutations to prevent 'jump to top' on reorder
  React.useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = scrollPosRef.current;
    }
  });

  const renderStartTime = performance.now();
  
  React.useEffect(() => {
    const renderEndTime = performance.now();
    console.log(`[${new Date().toLocaleTimeString()}] [PERF] GameGrid render committed in ${(renderEndTime - renderStartTime).toFixed(2)}ms`);
  });

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (roomCode && tiles.length === 0) {
    return (
      <Box flex={3} display="flex" alignItems="center" justifyContent="center">
        <Typography variant="h5">Syncing with room {roomCode}...</Typography>
      </Box>
    );
  }

  const involvedTileIds = lastActionResult?.involvedTileIds || [];
  const actionFailed = lastActionResult?.success === false;

  return (
    <Box 
      ref={containerRef}
      onScroll={handleScroll}
      flex={3} 
      display="flex" 
      flexDirection="column" 
      sx={{ overflowY: 'auto', position: 'relative' }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4" gutterBottom>Super Connections ({numCategories}x{gridSize})</Typography>
        {roomCode && (
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h6" color="primary">Room: {roomCode}</Typography>
            <IconButton size="small" onClick={onCopyRoomLink}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
      <Box sx={{ flexGrow: 1, overflowX: 'auto', pb: 2 }}>
        <Box display="grid" gap={1} gridTemplateColumns={`repeat(${tilesPerRow}, minmax(100px, 1fr))`} sx={{ minWidth: 'min-content' }}>
          {completedCategories.map(cat => (
            <Paper key={cat} sx={{ gridColumn: '1 / -1', p: 2, mb: 1, backgroundColor: '#d4edda', textAlign: 'center', border: '2px solid #2e7d32' }}>
              <Typography variant="h6" sx={{ color: '#1b5e20', fontWeight: 'bold' }}>{cat}</Typography>
              <Typography variant="body2">{solvedItemMap[cat]}</Typography>
            </Paper>
          ))}
          {activeTiles.map((tile) => {
            const isSelected = !!(selectedTile && selectedTile.id === tile.id);
            const isError = !!(actionFailed && involvedTileIds.includes(tile.id));
            const group = groupIdMap[tile.userGroupId || ''];
            const tooltipText = group ? groupItemMap[group.id] : tile.text;

            return tile.hidden ? 
              <Box key={tile.id} sx={{ minHeight: '80px', visibility: 'hidden' }} /> :
              <TileComponent 
                key={tile.id} 
                tile={tile} 
                group={group}
                gridSize={gridSize} 
                isSelected={isSelected} 
                isError={isError}
                onMenuOpen={onMenuOpen} 
                onTileClick={onTileClick} 
                onDragStart={onDragStart} 
                onDragOver={handleDragOver} 
                onDrop={onDrop} 
                tooltipText={tooltipText}
              />;
          })}
        </Box>
      </Box>
    </Box>
  );
});

GameGrid.displayName = 'GameGrid';
