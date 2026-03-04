import React, { useState, useMemo } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  List, ListItem, ListItemButton, ListItemIcon, ListItemText, Checkbox, 
  Typography, Box, TextField
} from '@mui/material';
import { CategoryData } from '../types';

interface CategoryPickerModalProps {
  open: boolean;
  onClose: () => void;
  categoriesData: Record<string, CategoryData>;
  selectedCategories: string[];
  onSave: (selected: string[]) => void;
}

export const CategoryPickerModal = ({ open, onClose, categoriesData, selectedCategories, onSave }: CategoryPickerModalProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedCategories));
  const [search, setSearch] = useState('');

  // Update internal state when modal opens
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedCategories));
      setSearch('');
    }
  }, [open, selectedCategories]);

  const handleToggle = (catName: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(catName)) {
      newSelected.delete(catName);
    } else {
      newSelected.add(catName);
    }
    setSelected(newSelected);
  };

  const groupedCategories = useMemo(() => {
    const groups: Record<string, string[]> = {};
    Object.entries(categoriesData).forEach(([name, data]) => {
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return;
      
      const primaryTag = data.tags && data.tags.length > 0 ? data.tags[0] : 'Other';
      if (!groups[primaryTag]) groups[primaryTag] = [];
      groups[primaryTag].push(name);
    });

    // Sort groups and items
    const sortedGroups = Object.keys(groups).sort();
    sortedGroups.forEach(g => groups[g].sort());
    
    return { groups, sortedGroups };
  }, [categoriesData, search]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Select Specific Categories</span>
        <Typography variant="body2" color="primary" fontWeight="bold">
          {selected.size} Selected
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box p={2} pb={0}>
          <TextField
            fullWidth
            size="small"
            label="Search categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </Box>
        <List dense>
          {groupedCategories.sortedGroups.map(tag => (
            <React.Fragment key={tag}>
              <ListItem sx={{ bgcolor: 'action.hover', mt: 1 }}>
                <Typography variant="overline" fontWeight="bold">{tag}</Typography>
              </ListItem>
              {groupedCategories.groups[tag].map(catName => (
                <ListItemButton key={catName} onClick={() => handleToggle(catName)}>
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={selected.has(catName)}
                      tabIndex={-1}
                      disableRipple
                    />
                  </ListItemIcon>
                  <ListItemText 
                    primary={catName} 
                    secondary={categoriesData[catName].niche ? 'Niche' : null}
                  />
                </ListItemButton>
              ))}
            </React.Fragment>
          ))}
          {groupedCategories.sortedGroups.length === 0 && (
            <Box p={4} textAlign="center">
              <Typography color="textSecondary">No categories found.</Typography>
            </Box>
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(Array.from(selected))} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
};
