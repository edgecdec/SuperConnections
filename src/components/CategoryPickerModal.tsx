import React, { useState, useMemo } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  List, ListItemButton, ListItemIcon, ListItemText, Checkbox, 
  Typography, Box, TextField, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Update internal state when modal opens
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedCategories));
      setSearch('');
      setExpandedGroups(new Set()); // Start collapsed
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

  const handleAccordionToggle = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  const groupedCategories = useMemo(() => {
    const groups: Record<string, string[]> = {};
    Object.entries(categoriesData).forEach(([name, data]) => {
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return;
      
      const primaryTag = data.tags && data.tags.length > 0 ? data.tags[0] : 'Other';
      if (!groups[primaryTag]) groups[primaryTag] = [];
      groups[primaryTag].push(name);
    });

    // Sort groups alphabetically
    const sortedGroups = Object.keys(groups).sort();
    
    // Sort items within groups: non-niche first, then alphabetical
    sortedGroups.forEach(g => {
      groups[g].sort((a, b) => {
        const aNiche = categoriesData[a].niche;
        const bNiche = categoriesData[b].niche;
        
        if (aNiche === bNiche) {
          return a.localeCompare(b);
        }
        return aNiche ? 1 : -1; // non-niche (false) comes before niche (true)
      });
    });
    
    return { groups, sortedGroups };
  }, [categoriesData, search]);

  // If searching, auto-expand all groups that have results
  const effectiveExpandedGroups = useMemo(() => {
    if (search) {
      return new Set(groupedCategories.sortedGroups);
    }
    return expandedGroups;
  }, [search, expandedGroups, groupedCategories.sortedGroups]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper" disableScrollLock>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Select Specific Categories</span>
        <Typography variant="body2" color="primary" fontWeight="bold">
          {selected.size} Selected
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box p={2} pb={2}>
          <TextField
            fullWidth
            size="small"
            label="Search categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </Box>
        <Box px={2} pb={2}>
          {groupedCategories.sortedGroups.map(tag => {
            const groupItems = groupedCategories.groups[tag];
            const selectedInGroup = groupItems.filter(item => selected.has(item)).length;
            
            return (
              <Accordion 
                key={tag} 
                disableGutters 
                elevation={0} 
                square 
                sx={{ border: '1px solid #e0e0e0', '&:not(:last-child)': { borderBottom: 0 }, '&:before': { display: 'none' } }}
                expanded={effectiveExpandedGroups.has(tag)}
                onChange={() => handleAccordionToggle(tag)}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ backgroundColor: 'rgba(0, 0, 0, .03)', flexDirection: 'row-reverse', '& .MuiAccordionSummary-content': { ml: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }}>
                  <Typography variant="subtitle2" fontWeight="bold">{tag}</Typography>
                  {selectedInGroup > 0 && (
                    <Typography variant="caption" color="primary" fontWeight="bold">
                      {selectedInGroup} selected
                    </Typography>
                  )}
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <List dense disablePadding>
                    {groupItems.map(catName => {
                      const isNiche = categoriesData[catName].niche;
                      return (
                        <ListItemButton key={catName} onClick={() => handleToggle(catName)} sx={{ pl: 4 }}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox
                              edge="start"
                              checked={selected.has(catName)}
                              tabIndex={-1}
                              disableRipple
                              size="small"
                            />
                          </ListItemIcon>
                          <ListItemText 
                            primary={catName} 
                            secondary={isNiche ? 'Niche' : null}
                            primaryTypographyProps={{ variant: 'body2', color: isNiche ? 'text.secondary' : 'text.primary' }}
                            secondaryTypographyProps={{ variant: 'caption', fontStyle: 'italic' }}
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </AccordionDetails>
              </Accordion>
            );
          })}
          {groupedCategories.sortedGroups.length === 0 && (
            <Box p={4} textAlign="center">
              <Typography color="textSecondary">No categories found.</Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(Array.from(selected))} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
};
