import React from 'react';
import { Paper, Typography, IconButton, Tooltip } from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import { Tile, UserGroup } from '../types';

interface TileProps {
  tile: Tile;
  group?: UserGroup;
  gridSize: number;
  isSelected: boolean;
  isError: boolean;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, id: string) => void;
  onTileClick: (tile: Tile) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  tooltipText: string;
}

export const TileComponent = React.memo(({
  tile,
  group,
  gridSize,
  isSelected,
  isError,
  onMenuOpen,
  onTileClick,
  onDragStart,
  onDragOver,
  onDrop,
  tooltipText
}: TileProps) => {
  // --- PERFORMANCE LOG ---
  console.log(`[${new Date().toLocaleTimeString()}] [RENDER] Tile ${tile.id}`);
  
  let displayText = tile.text;
  if (tile.itemCount > 2) {
     const firstItem = tile.text.split(',')[0];
     const groupName = group?.name || 'Group';
     displayText = `${groupName}: ${firstItem}...`;
  }

  return (
    <Tooltip title={tooltipText} arrow placement="top" disableInteractive>
      <Paper
        elevation={isSelected ? 6 : 3}
        onClick={() => onTileClick(tile)}
        draggable={!tile.locked}
        onDragStart={(e) => onDragStart(e, tile)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, tile)}
        className={isError ? 'shake-error' : ''}
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
          transition: 'all 0.1s ease-in-out',
          transform: isSelected ? 'scale(1.05)' : 'scale(1)',
          zIndex: isSelected ? 10 : 1,
          opacity: tile.locked ? 0.6 : 1
        }}
      >
        <Typography variant="body2" fontWeight="bold" sx={{ pointerEvents: 'none' }}>
          {displayText}
        </Typography>
        {tile.itemCount > 1 && (
          <Typography variant="caption" sx={{ position: 'absolute', bottom: 2, right: 4, fontWeight: 'bold', fontSize: '0.7em', color: group ? '#333' : '#666', pointerEvents: 'none' }}>
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
    </Tooltip>
  );
}, (prev, next) => {
  // DEEP MEMOIZATION
  return prev.isSelected === next.isSelected &&
         prev.isError === next.isError &&
         prev.gridSize === next.gridSize &&
         prev.tooltipText === next.tooltipText &&
         prev.tile.id === next.tile.id &&
         prev.tile.text === next.tile.text &&
         prev.tile.userGroupId === next.tile.userGroupId &&
         prev.tile.itemCount === next.tile.itemCount &&
         prev.tile.locked === next.tile.locked &&
         prev.tile.hidden === next.tile.hidden &&
         prev.group?.color === next.group?.color &&
         prev.group?.name === next.group?.name;
});

TileComponent.displayName = 'TileComponent';
