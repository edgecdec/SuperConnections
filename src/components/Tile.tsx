import React from 'react';
import { Paper, Typography, IconButton, Tooltip } from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import { Tile, UserGroup } from '../types';

interface TileProps {
  tile: Tile;
  group?: UserGroup;
  gridSize: number;
  isSelected: boolean;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, id: string) => void;
  onTileClick: (tile: Tile) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, tile: Tile) => void;
  allTiles?: Tile[];
}

export const TileComponent = React.memo(({
  tile,
  group,
  gridSize,
  isSelected,
  onMenuOpen,
  onTileClick,
  onDragStart,
  onDragOver,
  onDrop,
  allTiles = []
}: TileProps) => {
  let displayText = tile.text;
  if (tile.itemCount > 2) {
     const firstItem = tile.text.split(',')[0];
     const groupName = group?.name || 'Group';
     displayText = `${groupName}: ${firstItem}...`;
  }

  // Find all items in this group across all tiles if needed
  const tooltipContent = group 
    ? allTiles.filter(t => t.userGroupId === group.id).map(t => t.text).join(', ')
    : tile.text;

  return (
    <Tooltip title={tooltipContent} arrow placement="top" disableInteractive>
      <Paper
        elevation={isSelected ? 6 : 3}
        onClick={() => onTileClick(tile)}
        draggable={!tile.locked}
        onDragStart={(e) => onDragStart(e, tile)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, tile)}
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
          transition: 'all 0.2s ease-in-out',
          transform: isSelected ? 'scale(1.05)' : 'scale(1)',
          zIndex: isSelected ? 10 : 1,
          opacity: tile.locked ? 0.6 : 1
        }}
      >
        <Typography variant="body2" fontWeight="bold">
          {displayText}
        </Typography>
        {tile.itemCount > 1 && (
          <Typography variant="caption" sx={{ position: 'absolute', bottom: 2, right: 4, fontWeight: 'bold', fontSize: '0.7em', color: group ? '#333' : '#666' }}>
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
});

TileComponent.displayName = 'TileComponent';
