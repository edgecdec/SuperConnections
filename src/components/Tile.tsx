import React from 'react';
import { Paper, Typography, IconButton, Tooltip } from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import { Tile, UserGroup } from '../types';
import { getGroupDisplayName } from '../utils/groupUtils';

interface TileProps {
  tile: Tile;
  group?: UserGroup;
  gridSize: number;
  isSelected: boolean;
  isError: boolean;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, id: string) => void;
  onTileClick: (e: React.MouseEvent, tile: Tile) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  onTileAuxClick: (e: React.MouseEvent, tile: Tile) => void;
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
  onTileAuxClick,
  tooltipText
}: TileProps) => {
  // --- PERFORMANCE LOG ---
  console.log(`[${new Date().toLocaleTimeString()}] [RENDER] Tile ${tile.id}`);
  
  let displayText = tile.text;
  if (tile.itemCount > 1) {
    if (group) {
      displayText = getGroupDisplayName(group.name, tooltipText);
    } else {
      const items = tile.text.split(', ').map(s => s.trim());
      displayText = items.length <= 2 ? items.join(', ') : `${items.slice(0, 2).join(', ')}...`;
    }
  }

  return (
    <Tooltip title={tooltipText} arrow placement="top" disableInteractive>
      <Paper
        elevation={isSelected ? 6 : 3}
        onClick={(e) => onTileClick(e, tile)}
        onAuxClick={(e) => onTileAuxClick(e, tile)}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
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
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s, opacity 0.2s',
          transform: isSelected ? 'scale(1.05)' : 'scale(1)',
          zIndex: isSelected ? 10 : 1,
          opacity: tile.locked ? 0.6 : 1,
          '&:active': {
            transform: 'scale(0.95)',
          }
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
