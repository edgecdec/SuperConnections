import React, { useState, useMemo, useEffect } from 'react';
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
  Typography,
  IconButton
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import HistoryIcon from '@mui/icons-material/History';
import GroupIcon from '@mui/icons-material/Group';
import EditIcon from '@mui/icons-material/Edit';
import { UserGroup, Tile } from '../types';
import { getGroupDisplayName } from '../utils/groupUtils';

interface TileMenuProps {
  open: boolean;
  onClose: () => void;
  activeTileId: string | null;
  tiles: Tile[];
  userGroups: UserGroup[];
  localTouchedGroupIds: string[];
  onCreateGroup: (tileId: string, initialName?: string) => void;
  onTagTile: (tileId: string, groupId: string | null) => void;
  onOpenRenameDialog: (groupId: string, currentName: string) => void;
}

export const TileMenu = ({
  open,
  onClose,
  activeTileId,
  tiles,
  userGroups,
  localTouchedGroupIds,
  onCreateGroup,
  onTagTile,
  onOpenRenameDialog
}: TileMenuProps) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const activeTile = tiles.find(t => t.id === activeTileId);
  
  // Calculate group counts and items
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tiles.forEach(t => {
      if (t.userGroupId && !t.hidden && !t.locked) {
        counts[t.userGroupId] = (counts[t.userGroupId] || 0) + t.itemCount;
      }
    });
    return counts;
  }, [tiles]);

  const groupItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    tiles.forEach(t => {
      if (t.userGroupId && !t.hidden) {
        if (!map[t.userGroupId]) map[t.userGroupId] = t.text;
        else map[t.userGroupId] += ', ' + t.text;
      }
    });
    return map;
  }, [tiles]);

  // Sort groups: Local Touch First -> Search Filter -> Global Recency
  const sortedGroups = useMemo(() => {
    const localSet = new Set(localTouchedGroupIds);
    
    return [...userGroups]
      .filter(g => {
        if (!search) return groupCounts[g.id] > 0;
        const displayName = getGroupDisplayName(g.name, groupItemMap[g.id] || '');
        return displayName.toLowerCase().includes(search.toLowerCase()) && groupCounts[g.id] > 0;
      })
      .sort((a, b) => {
        const aLocalIdx = localTouchedGroupIds.indexOf(a.id);
        const bLocalIdx = localTouchedGroupIds.indexOf(b.id);

        if (aLocalIdx !== -1 && bLocalIdx !== -1) return aLocalIdx - bLocalIdx;
        if (aLocalIdx !== -1) return -1;
        if (bLocalIdx !== -1) return 1;

        return b.lastUpdated - a.lastUpdated;
      });
  }, [userGroups, search, localTouchedGroupIds, groupCounts, groupItemMap]);

  const canRemoveGroup = activeTile && activeTile.userGroupId && (groupCounts[activeTile.userGroupId] || 0) === 1 && activeTile.itemCount === 1;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth scroll="paper" disableScrollLock>
      <DialogTitle sx={{ pb: 1 }}>Assign Group</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField
          autoFocus
          margin="dense"
          label="Search or enter new group name..."
          fullWidth
          variant="outlined"
          size="small"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ mb: 2 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && activeTileId) {
              onCreateGroup(activeTileId, search);
              onClose();
            }
          }}
        />
        
        <List sx={{ pt: 0 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={() => { if (activeTileId) onCreateGroup(activeTileId, search); onClose(); }}>
              <ListItemIcon><AddCircleIcon color="primary" /></ListItemIcon>
              <ListItemText primary={`Create New Group${search ? ` "${search}"` : ''}`} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          </ListItem>
          
          <ListItem disablePadding>
            <ListItemButton 
              disabled={!canRemoveGroup}
              onClick={() => { if (activeTileId) onTagTile(activeTileId, null); onClose(); }}
            >
              <ListItemText inset primary="Remove from Group" primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          </ListItem>

          <Divider sx={{ my: 1 }} />
          
          <Typography variant="overline" sx={{ px: 2, display: 'block', color: 'text.secondary' }}>
            {search ? 'Search Results' : 'Available Groups'}
          </Typography>

          {sortedGroups.map(group => {
            const displayName = getGroupDisplayName(group.name, groupItemMap[group.id] || '');
            return (
              <ListItem 
                key={group.id} 
                disablePadding
                secondaryAction={
                  <IconButton 
                    edge="end" 
                    aria-label="edit" 
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRenameDialog(group.id, group.name);
                      onClose();
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => { if (activeTileId) onTagTile(activeTileId, group.id); onClose(); }}>
                  <ListItemIcon>
                    <Box sx={{ 
                      width: 20, 
                      height: 20, 
                      borderRadius: '50%', 
                      backgroundColor: group.color, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      border: '1px solid #000'
                    }}>
                      {localTouchedGroupIds.includes(group.id) ? <HistoryIcon sx={{ fontSize: 12, color: 'rgba(0,0,0,0.5)' }} /> : <GroupIcon sx={{ fontSize: 12, color: 'rgba(0,0,0,0.5)' }} />}
                    </Box>
                  </ListItemIcon>
                  <ListItemText 
                    primary={`${displayName} (${groupCounts[group.id] || 0})`} 
                    primaryTypographyProps={{ noWrap: true, variant: 'body2', pr: 4 }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
          
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
