import React from 'react';
import { Box, Typography, Paper, IconButton } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Tile, UserGroup, ActionResponse } from '../types';
import { TileComponent } from './Tile';

interface GameGridProps {
  roomCode: string | null;
  tiles: Tile[];
  gridSize: number;
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
  onDrop: (e: React.DragEvent, targetTile: Tile) => void;
}

export const GameGrid = ({
  roomCode,
  tiles,
  gridSize,
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
  onDrop
}: GameGridProps) => {
  if (roomCode && tiles.length === 0) {
    return (
      <Box flex={3} display="flex" alignItems="center" justifyContent="center">
        <Typography variant="h5">Syncing with room {roomCode}...</Typography>
      </Box>
    );
  }

  return (
    <Box flex={3} display="flex" flexDirection="column" sx={{ overflowY: 'auto' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4" gutterBottom>Super Connections ({gridSize}x{gridSize})</Typography>
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
            const isSelected = selectedTile?.id === tile.id;
            const isError = !lastActionResult?.success && lastActionResult?.involvedTileIds?.includes(tile.id);
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
                onDragStart={e => { if (tile.locked) return; e.dataTransfer.setData('application/json', JSON.stringify(tile)); }} 
                onDragOver={e => e.preventDefault()} 
                onDrop={onDrop} 
                tooltipText={tooltipText}
              />;
          })}
        </Box>
      </Box>
    </Box>
  );
};
