import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button } from '@mui/material';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  initialValue: string;
  onSave: (newValue: string) => void;
  title?: string;
  label?: string;
}

export const RenameDialog = ({ 
  open, 
  onClose, 
  initialValue, 
  onSave, 
  title = "Rename Group", 
  label = "Group Name" 
}: RenameDialogProps) => {
  const [value, setValue] = useState(initialValue);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField 
          autoFocus 
          margin="dense" 
          label={label} 
          fullWidth 
          variant="standard" 
          value={value} 
          onChange={e => setValue(e.target.value)} 
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(value)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};
