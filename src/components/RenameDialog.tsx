import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button } from '@mui/material';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  initialGroupName: string;
  onSave: (newName: string) => void;
}

export const RenameDialog = ({ open, onClose, initialGroupName, onSave }: RenameDialogProps) => {
  const [name, setName] = useState(initialGroupName);

  // Reset name when dialog opens with a new group
  useEffect(() => {
    if (open) setName(initialGroupName);
  }, [open, initialGroupName]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Rename Group</DialogTitle>
      <DialogContent>
        <TextField 
          autoFocus 
          margin="dense" 
          label="Group Name" 
          fullWidth 
          variant="standard" 
          value={name} 
          onChange={e => setName(e.target.value)} 
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(name)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};
