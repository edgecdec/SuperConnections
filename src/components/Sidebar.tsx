import React from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Divider,
  IconButton,
  Collapse,
  Slider,
  FormControlLabel,
  Switch
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { UserGroup } from '../types';

interface SidebarProps {
  score: number;
  gridSize: number;
  mistakes: number;
  completedCategories: string[];
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  settingsExpanded: boolean;
  setSettingsExpanded: (expanded: boolean) => void;
  tilesPerRow: number;
  autoRefill: boolean;
  groupStats: (UserGroup & { count: number })[];
  isHost: boolean;
  onUpdateSettings: (settings: { tilesPerRow?: number; autoRefill?: boolean }) => void;
  onRefillBoard: () => void;
  onQuitGame: () => void;
  onCreateNewGroup: () => void;
  onOpenRenameDialog: (groupId: string, name: string) => void;
}

export const Sidebar = ({
  score,
  gridSize,
  mistakes,
  completedCategories,
  sidebarExpanded,
  setSidebarExpanded,
  settingsExpanded,
  setSettingsExpanded,
  tilesPerRow,
  autoRefill,
  groupStats,
  isHost,
  onUpdateSettings,
  onRefillBoard,
  onQuitGame,
  onCreateNewGroup,
  onOpenRenameDialog
}: SidebarProps) => {
  if (!sidebarExpanded) return null;

  return (
    <Paper sx={{ flex: 1, minWidth: '300px', maxWidth: '350px', p: 2, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <IconButton 
        size="small" 
        onClick={() => setSidebarExpanded(false)}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <ChevronRightIcon />
      </IconButton>
      <Typography variant="h6">Score & Progress</Typography>
      <Typography variant="body1">Score: {score} ({gridSize > 1 ? Math.round((score / (gridSize * (gridSize - 1))) * 100) : 0}%)</Typography>
      <Typography variant="body1">Mistakes: {mistakes}</Typography>
      <Typography variant="body1">
        Completed: {completedCategories.length} / {gridSize}
      </Typography>
    
      <Divider sx={{ my: 2 }} />

      <Box mb={2}>
        <Box 
          display="flex" 
          justifyContent="space-between" 
          alignItems="center" 
          sx={{ cursor: 'pointer' }}
          onClick={() => setSettingsExpanded(!settingsExpanded)}
        >
          <Typography variant="h6">Settings</Typography>
          {settingsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </Box>
        <Collapse in={settingsExpanded}>
          <Box mt={2}>
            <Typography gutterBottom>
              Items per Row: {tilesPerRow}
            </Typography>
            <Slider
              value={tilesPerRow}
              min={2}
              max={50}
              onChange={(e, val) => onUpdateSettings({ tilesPerRow: val as number })}
            />
            <FormControlLabel
              control={
                <Switch 
                  checked={autoRefill} 
                  onChange={(e) => onUpdateSettings({ autoRefill: e.target.checked })} 
                />
              }
              label="Auto-Refill Rows"
            />
            <Button 
              variant="outlined" 
              size="small" 
              fullWidth 
              sx={{ mt: 1 }}
              onClick={onRefillBoard}
            >
              Refill Board
            </Button>
            {isHost && (
              <Button 
                variant="contained" 
                color="error"
                size="small" 
                fullWidth 
                sx={{ mt: 2 }}
                onClick={onQuitGame}
              >
                Quit Game
              </Button>
            )}
          </Box>
        </Collapse>
      </Box>

      <Divider sx={{ mb: 2 }} />
      
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6">Your Groups</Typography>
        <Button startIcon={<AddCircleIcon />} size="small" onClick={onCreateNewGroup}>New</Button>
      </Box>

      <Box flex={1} sx={{ overflowY: 'auto' }}>
        {groupStats.map((group) => (
          <Paper
            key={group.id}
            sx={{ p: 1, mb: 1, backgroundColor: group.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{group.name}</Typography>
              <Typography variant="caption">{group.count} / {gridSize} items</Typography>
            </Box>
            <Button size="small" onClick={() => onOpenRenameDialog(group.id, group.name)}>Rename</Button>
          </Paper>
        ))}
        {groupStats.length === 0 && (
          <Typography variant="body2" color="textSecondary">No groups created yet. Click the tag icon on a tile to start grouping!</Typography>
        )}
      </Box>
    </Paper>
  );
};
