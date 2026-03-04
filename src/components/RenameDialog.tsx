import React from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button } from '@mui/material';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  newGroupName: string;
  setNewGroupName: (name: string) => void;
  onSave: () => void;
}

export const RenameDialog = ({ open, onClose, newGroupName, setNewGroupName, onSave }: RenameDialogProps) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Rename Group</DialogTitle>
    <DialogContent>
      <TextField 
        autoFocus 
        margin="dense" 
        label="Group Name" 
        fullWidth 
        variant="standard" 
        value={newGroupName} 
        onChange={e => setNewGroupName(e.target.value)} 
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button onClick={onSave}>Save</Button>
    </DialogActions>
  </Dialog>
);
