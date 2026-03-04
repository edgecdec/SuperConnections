import React, { useState, useMemo } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  TextField, 
  DialogActions, 
  Button, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText, 
  Divider,
  Box,
  Typography
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import HistoryIcon from '@mui/icons-material/History';
import GroupIcon from '@mui/icons-material/Group';
import { UserGroup, Tile } from '../types';

interface TileMenuProps {
  open: boolean;
  onClose: () => void;
  activeTileId: string | null;
  tiles: Tile[];
  userGroups: UserGroup[];
  localTouchedGroupIds: string[];
  onCreateGroup: (tileId: string) => void;
  onTagTile: (tileId: string, groupId: string | null) => void;
}

export const TileMenu = ({
  open,
  onClose,
  activeTileId,
  tiles,
  userGroups,
  localTouchedGroupIds,
  onCreateGroup,
  onTagTile
}: TileMenuProps) => {
  const [search, setSearch] = useState('');

  const activeTile = tiles.find(t => t.id === activeTileId);
  
  // Calculate group counts
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tiles.forEach(t => {
      if (t.userGroupId && !t.hidden && !t.locked) {
        counts[t.userGroupId] = (counts[t.userGroupId] || 0) + t.itemCount;
      }
    });
    return counts;
  }, [tiles]);

  // Sort groups: Local Touch First -> Search Filter -> Global Recency
  const sortedGroups = useMemo(() => {
    const localSet = new Set(localTouchedGroupIds);
    
    return [...userGroups]
      .filter(g => {
        if (!search) return groupCounts[g.id] > 0;
        return g.name.toLowerCase().includes(search.toLowerCase()) && groupCounts[g.id] > 0;
      })
      .sort((a, b) => {
        const aLocalIdx = localTouchedGroupIds.indexOf(a.id);
        const bLocalIdx = localTouchedGroupIds.indexOf(b.id);

        if (aLocalIdx !== -1 && bLocalIdx !== -1) return aLocalIdx - bLocalIdx;
        if (aLocalIdx !== -1) return -1;
        if (bLocalIdx !== -1) return 1;

        return b.lastUpdated - a.lastUpdated;
      });
  }, [userGroups, search, localTouchedGroupIds, groupCounts]);

  const canRemoveGroup = activeTile && activeTile.userGroupId && (groupCounts[activeTile.userGroupId] || 0) === 1 && activeTile.itemCount === 1;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth scroll="paper">
      <DialogTitle sx={{ pb: 1 }}>Assign Group</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField
          autoFocus
          margin="dense"
          label="Search groups..."
          fullWidth
          variant="outlined"
          size="small"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        <List sx={{ pt: 0 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={() => { if (activeTileId) onCreateGroup(activeTileId); onClose(); }}>
              <ListItemIcon><AddCircleIcon color="primary" /></ListItemIcon>
              <ListItemText primary="Create New Group" secondary="Start a fresh group for this item" />
            </ListItemButton>
          </ListItem>
          
          <ListItem disablePadding>
            <ListItemButton 
              disabled={!canRemoveGroup}
              onClick={() => { if (activeTileId) onTagTile(activeTileId, null); onClose(); }}
            >
              <ListItemText inset primary="Remove from Group" />
            </ListItemButton>
          </ListItem>

          <Divider sx={{ my: 1 }} />
          
          <Typography variant="overline" sx={{ px: 2, display: 'block', color: 'text.secondary' }}>
            {search ? 'Search Results' : 'Available Groups'}
          </Typography>

          {sortedGroups.map(group => (
            <ListItem key={group.id} disablePadding>
              <ListItemButton onClick={() => { if (activeTileId) onTagTile(activeTileId, group.id); onClose(); }}>
                <ListItemIcon>
                  <Box sx={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: '50%', 
                    backgroundColor: group.color, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid #000'
                  }}>
                    {localTouchedGroupIds.includes(group.id) ? <HistoryIcon sx={{ fontSize: 14, color: 'rgba(0,0,0,0.5)' }} /> : <GroupIcon sx={{ fontSize: 14, color: 'rgba(0,0,0,0.5)' }} />}
                  </Box>
                </ListItemIcon>
                <ListItemText 
                  primary={group.name} 
                  secondary={`${groupCounts[group.id] || 0} items`} 
                />
              </ListItemButton>
            </ListItem>
          ))}
          
          {sortedGroups.length === 0 && (
            <ListItem sx={{ py: 4, justifyContent: 'center' }}>
              <Typography variant="body2" color="textSecondary">
                {search ? 'No groups found matching your search' : 'No other groups found'}
              </Typography>
            </ListItem>
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
