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
  onSetPlayerName: (name: string) => void;
}

export const PlayerStats = React.memo(({ playerStats, onSetPlayerName }: PlayerStatsProps) => {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);

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
