import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';

interface SetupScreenProps {
  gridSizeInput: number;
  setGridSizeInput: (size: number) => void;
  onStart: (multiplayer: boolean, size: number) => void;
}

export const SetupScreen = ({ gridSizeInput, setGridSizeInput, onStart }: SetupScreenProps) => (
  <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh">
    <Typography variant="h3" gutterBottom>Super Connections</Typography>
    <Box display="flex" gap={2} alignItems="center" mt={2}>
      <TextField 
        type="number" 
        label="Grid Size" 
        value={gridSizeInput || ''} 
        onChange={e => setGridSizeInput(parseInt(e.target.value, 10) || 0)} 
        inputProps={{ min: 2, max: 50 }} 
      />
      <Button variant="contained" size="large" onClick={() => onStart(false, gridSizeInput)}>Play Solo</Button>
      <Button variant="outlined" color="primary" size="large" onClick={() => onStart(true, gridSizeInput)}>Host Multiplayer</Button>
    </Box>
  </Box>
);
