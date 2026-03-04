import React, { useState } from 'react';
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
  Switch,
  Tooltip,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import TimerIcon from '@mui/icons-material/Timer';
import PeopleIcon from '@mui/icons-material/People';
import { UserGroup, PlayerStats } from '../types';
import { RenameDialog } from './RenameDialog';

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
  groupItemMap: Record<string, string>;
  onDropOnGroup: (e: React.DragEvent, groupId: string) => void;
  elapsedTime: number;
  playerStats: Record<string, PlayerStats>;
  onSetPlayerName: (name: string) => void;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const Sidebar = React.memo(({
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
  onOpenRenameDialog,
  groupItemMap,
  onDropOnGroup,
  elapsedTime,
  playerStats,
  onSetPlayerName
}: SidebarProps) => {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [tempName, setTempName] = useState('');

  if (!sidebarExpanded) return null;

  const totalPossibleScore = gridSize * (gridSize - 1);
  const progressPercent = totalPossibleScore > 0 ? Math.round((score / totalPossibleScore) * 100) : 0;

  return (
    <Paper sx={{ flex: 1, minWidth: '300px', maxWidth: '350px', p: 2, display: 'flex', flexDirection: 'column', position: 'relative', overflowY: 'auto' }}>
      <IconButton 
        size="small" 
        onClick={() => setSidebarExpanded(false)}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <ChevronRightIcon />
      </IconButton>
      
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <TimerIcon fontSize="small" color="action" />
        <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(elapsedTime)}
        </Typography>
      </Box>

      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
        Overall Progress: {progressPercent}%
      </Typography>
      
      <Typography variant="body1">Score: {score}</Typography>
      <Typography variant="body1">Mistakes: {mistakes}</Typography>
      <Typography variant="body1">
        Completed: {completedCategories.length} / {gridSize}
      </Typography>
    
      <Divider sx={{ my: 2 }} />

      {/* NEW: Detailed Player Stats Section */}
      <Box mb={1}>
        <Box 
          display="flex" 
          justifyContent="space-between" 
          alignItems="center" 
          sx={{ cursor: 'pointer' }}
          onClick={() => setStatsExpanded(!statsExpanded)}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <PeopleIcon fontSize="small" />
            <Typography variant="h6">Player Stats</Typography>
          </Box>
          {statsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </Box>
        <Collapse in={statsExpanded}>
          <Box sx={{ pt: 1, textAlign: 'center' }}>
            <Button size="small" variant="outlined" onClick={() => setNameDialogOpen(true)} sx={{ mb: 1 }}>Set My Name</Button>
          </Box>
          <List dense>
            {Object.entries(playerStats).map(([id, stats]) => (
              <ListItem key={id} divider sx={{ px: 1 }}>
                <ListItemText 
                  primary={stats.name}
                  secondary={`Score: ${stats.score} | Mistakes: ${stats.mistakes}`}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 'bold' }}
                />
              </ListItem>
            ))}
          </List>
        </Collapse>
      </Box>

      {/* Name Change Dialog */}
      <RenameDialog 
        open={nameDialogOpen} 
        onClose={() => setNameDialogOpen(false)} 
        initialGroupName="" 
        onSave={(name) => { onSetPlayerName(name); setNameDialogOpen(false); }}
      />

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
        {groupStats.map((group) => {
          const groupItems = groupItemMap[group.id] || '';

          return (
            <Tooltip key={group.id} title={groupItems} arrow placement="left" disableInteractive>
              <Paper
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropOnGroup(e, group.id)}
                sx={{ p: 1, mb: 1, backgroundColor: group.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{group.name}</Typography>
                  <Typography variant="caption">{group.count} / {gridSize} items</Typography>
                </Box>
                <Button size="small" onClick={() => onOpenRenameDialog(group.id, group.name)}>Rename</Button>
              </Paper>
            </Tooltip>
          );
        })}
        {groupStats.length === 0 && (
          <Typography variant="body2" color="textSecondary">No groups created yet. Click the tag icon on a tile to start grouping!</Typography>
        )}
      </Box>
    </Paper>
  );
});

Sidebar.displayName = 'Sidebar';
