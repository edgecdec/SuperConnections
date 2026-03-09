import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Collapse, 
  List, 
  ListItem, 
  ListItemText 
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { PlayerStats as PlayerStatsType } from '../types';
import { RenameDialog } from './RenameDialog';

interface PlayerStatsProps {
  playerStats: Record<string, PlayerStatsType>;
  currentUserId: string | null;
  onSetPlayerName: (name: string) => void;
}

export const PlayerStats = React.memo(({ playerStats, currentUserId, onSetPlayerName }: PlayerStatsProps) => {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);

  // Filter out 'local' if we are in multiplayer and have a real userId
  const filteredStats = Object.entries(playerStats).filter(([id]) => {
    if (currentUserId && id === 'local') return false;
    return true;
  });

  return (
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
          {filteredStats.map(([id, stats]) => {
            const isMe = id === currentUserId || (!currentUserId && id === 'local');
            return (
              <ListItem key={id} divider sx={{ px: 1 }}>
                <ListItemText 
                  primary={isMe ? `${stats.name} (You)` : stats.name}
                  secondary={`Score: ${stats.score} | Mistakes: ${stats.mistakes}`}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: isMe ? 'bold' : 'normal', color: isMe ? 'primary' : 'textPrimary' }}
                />
              </ListItem>
            );
          })}
        </List>
      </Collapse>

      <RenameDialog 
        open={nameDialogOpen} 
        onClose={() => setNameDialogOpen(false)} 
        initialValue="" 
        onSave={(name) => { onSetPlayerName(name); setNameDialogOpen(false); }}
        title="Set Player Name"
        label="Your Display Name"
      />
    </Box>
  );
});

PlayerStats.displayName = 'PlayerStats';
