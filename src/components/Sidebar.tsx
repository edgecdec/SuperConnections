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
  Tooltip
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import TimerIcon from '@mui/icons-material/Timer';
import { UserGroup, PlayerStats as PlayerStatsType, GameSettings } from '../types';
import { PlayerStats } from './PlayerStats';
import { getGroupDisplayName } from '../utils/groupUtils';

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
  onUpdateSettings: (settings: { tilesPerRow?: number; autoRefill?: boolean; soundEnabled?: boolean }) => void;
  onRefillBoard: () => void;
  onShuffleBoard: () => void;
  onQuitGame: () => void;
  onCreateNewGroup: () => void;
  onOpenRenameDialog: (groupId: string, name: string) => void;
  groupItemMap: Record<string, string>;
  onDropOnGroup: (e: React.DragEvent, groupId: string) => void;
  elapsedTime: number;
  playerStats: Record<string, PlayerStatsType>;
  onSetPlayerName: (name: string) => void;
  settings: GameSettings;
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
  onShuffleBoard,
  onQuitGame,
  onCreateNewGroup,
  onOpenRenameDialog,
  groupItemMap,
  onDropOnGroup,
  elapsedTime,
  playerStats,
  onSetPlayerName,
  settings
}: SidebarProps) => {
  if (!sidebarExpanded) return null;

  const totalPossibleMerges = settings.numCategories * (settings.itemsPerCategory - 1);
  const progressPercent = totalPossibleMerges > 0 ? Math.round((score / totalPossibleMerges) * 100) : 0;

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
        Completed: {completedCategories.length} / {settings.numCategories}
      </Typography>
    
      <Divider sx={{ my: 2 }} />

      <PlayerStats playerStats={playerStats} onSetPlayerName={onSetPlayerName} />

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
            <FormControlLabel
              control={
                <Switch 
                  checked={settings.soundEnabled ?? true} 
                  onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })} 
                />
              }
              label="Sound Effects"
            />
            <Box display="flex" flexDirection="column" gap={1} mt={1}>
              <Button 
                variant="outlined" 
                size="small" 
                fullWidth 
                onClick={onRefillBoard}
              >
                Clean Grid (Preserve Order)
              </Button>
              <Button 
                variant="outlined" 
                size="small" 
                fullWidth 
                onClick={onShuffleBoard}
              >
                Shuffle Board (Randomize)
              </Button>
            </Box>
            <Button 
              variant="contained" 
              color="error"
              size="small" 
              fullWidth 
              sx={{ mt: 2 }}
              onClick={onQuitGame}
            >
              Exit Game
            </Button>
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
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{getGroupDisplayName(group.name, groupItems)}</Typography>
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
