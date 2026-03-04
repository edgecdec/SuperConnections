import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider, Box } from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { UserGroup, Tile } from '../types';

interface TileMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  activeTileId: string | null;
  tiles: Tile[];
  userGroups: UserGroup[];
  onCreateGroup: (tileId: string) => void;
  onTagTile: (tileId: string, groupId: string | null) => void;
}

export const TileMenu = ({
  anchorEl,
  onClose,
  activeTileId,
  tiles,
  userGroups,
  onCreateGroup,
  onTagTile
}: TileMenuProps) => {
  const activeTile = tiles.find(t => t.id === activeTileId);

  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      <MenuItem onClick={() => { if (activeTileId) onCreateGroup(activeTileId); onClose(); }}>
        <ListItemIcon><AddCircleIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Create New Group</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={() => { if (activeTileId) onTagTile(activeTileId, null); onClose(); }}>
        <ListItemText>Remove Group</ListItemText>
      </MenuItem>
      {userGroups.slice().sort((a, b) => b.lastUpdated - a.lastUpdated).map(group => {
        const count = tiles.reduce((acc, t) => (t.userGroupId === group.id && !t.locked && !t.hidden) ? acc + t.itemCount : acc, 0);
        if (count === 0) return null;
        return (
          <MenuItem key={group.id} onClick={() => { if (activeTileId) onTagTile(activeTileId, group.id); onClose(); }}>
            <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: group.color, mr: 1, border: '1px solid #000' }} />
            <ListItemText>{group.name} ({count})</ListItemText>
          </MenuItem>
        );
      })}
    </Menu>
  );
};
