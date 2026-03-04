import React, { useState, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails, 
  FormControlLabel, 
  Checkbox, 
  ToggleButtonGroup, 
  ToggleButton, 
  Autocomplete,
  Chip,
  Paper,
  Divider,
  Switch
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { GameSettings, GameDifficulty, CategoryMap } from '../types';
import categoriesDataRaw from '../data/categories.json';
import { CategoryPickerModal } from './CategoryPickerModal';

const categoriesData = categoriesDataRaw as CategoryMap;

interface SetupScreenProps {
  onStart: (multiplayer: boolean, settings: GameSettings) => void;
}

export const SetupScreen = ({ onStart }: SetupScreenProps) => {
  const [numCategories, setNumCategories] = useState(25);
  const [itemsPerCategory, setItemsPerCategory] = useState(25);
  const [difficulty, setDifficulty] = useState<GameDifficulty>('easy');
  const [includeNiche, setIncludeNiche] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [popToTop, setPopToTop] = useState(true);
  const [gravity, setGravity] = useState<'none' | 'up'>('up');
  
  // CSV State
  const [csvData, setCsvData] = useState<{ name: string, items: string[] }[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const allCategories = useMemo(() => Object.keys(categoriesData).sort(), []);
  
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    Object.values(categoriesData).forEach(cat => cat.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, []);

  const numError = numCategories < 2 || numCategories > 50;
  const itemsError = itemsPerCategory < 2 || itemsPerCategory > 50;

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').map(r => r.split(',').map(c => c.trim()));
      
      if (rows.length < 2) {
        setCsvError("CSV must have at least a header row and one item row.");
        return;
      }

      const headers = rows[0];
      const data: { name: string, items: string[] }[] = headers.map((name, index) => ({
        name: name || `Category ${index + 1}`,
        items: rows.slice(1).map(row => row[index]).filter(item => item)
      }));

      const minItems = Math.min(...data.map(d => d.items.length));
      if (minItems < 2) {
        setCsvError("Each category in CSV must have at least 2 items.");
        return;
      }

      setCsvData(data);
      setNumCategories(data.length);
      setItemsPerCategory(minItems);
      setCsvError(null);
    };
    reader.readAsText(file);
  };

  const handleBegin = (multiplayer: boolean) => {
    if (numError || itemsError) return;

    const settings: GameSettings = {
      numCategories,
      itemsPerCategory,
      difficulty,
      includeNiche,
      activeTags,
      manualCategories,
      customCategories: csvData || undefined,
      popToTop,
      gravity
    };
    
    onStart(multiplayer, settings);
  };

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh" p={4} sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h2" gutterBottom fontWeight="bold" color="primary">Super Connections</Typography>
      
      <Paper elevation={3} sx={{ p: 4, width: '100%', borderRadius: 4 }}>
        <Box display="flex" flexDirection="column" gap={3}>
          <Box display="flex" gap={2}>
            <TextField 
              fullWidth
              type="number" 
              label="Number of Categories" 
              value={numCategories} 
              onChange={e => setNumCategories(parseInt(e.target.value) || 0)}
              error={numError}
              helperText={numError ? "Range: 2 - 50" : ""}
            />
            <TextField 
              fullWidth
              type="number" 
              label="Items per Category" 
              value={itemsPerCategory} 
              onChange={e => setItemsPerCategory(parseInt(e.target.value) || 0)}
              error={itemsError}
              helperText={itemsError ? "Range: 2 - 50" : ""}
            />
          </Box>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Advanced Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box display="flex" flexDirection="column" gap={3}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Difficulty</Typography>
                  <ToggleButtonGroup
                    value={difficulty}
                    exclusive
                    onChange={(e, val) => val && setDifficulty(val)}
                    fullWidth
                    size="small"
                  >
                    <ToggleButton value="easy">Easy (Common)</ToggleButton>
                    <ToggleButton value="random">Random</ToggleButton>
                    <ToggleButton value="hard">Hard (Obscure)</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                <Divider />

                <Box display="flex" flexDirection="column" gap={1}>
                  <FormControlLabel
                    control={<Checkbox checked={includeNiche} onChange={e => setIncludeNiche(e.target.checked)} />}
                    label="Include Niche/Specialized Categories"
                  />
                  <FormControlLabel
                    control={<Switch checked={popToTop} onChange={e => setPopToTop(e.target.checked)} />}
                    label="Pop combined items to Top"
                  />
                  <FormControlLabel
                    control={<Switch checked={gravity === 'up'} onChange={e => setGravity(e.target.checked ? 'up' : 'none')} />}
                    label="Gravity (Collapse upwards)"
                  />
                </Box>

                <Autocomplete
                  multiple
                  options={allTags}
                  value={activeTags}
                  onChange={(e, val) => setActiveTags(val)}
                  renderInput={(params) => <TextField {...params} label="Filter by Types (Sports, Music, etc.)" />}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const { key, ...tagProps } = getTagProps({ index });
                      return <Chip key={key} label={option} {...tagProps} size="small" />;
                    })
                  }
                />

                <Box>
                  <Button 
                    variant="outlined" 
                    fullWidth 
                    onClick={() => setPickerOpen(true)}
                  >
                    Select Specific Categories ({manualCategories.length} pinned)
                  </Button>
                </Box>

                <CategoryPickerModal 
                  open={pickerOpen}
                  onClose={() => setPickerOpen(false)}
                  categoriesData={categoriesData}
                  selectedCategories={manualCategories}
                  onSave={(selected) => {
                    setManualCategories(selected);
                    setPickerOpen(false);
                  }}
                />

                <Divider />

                <Box>
                  <Typography variant="subtitle2" gutterBottom>Custom Board (CSV)</Typography>
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUploadIcon />}
                    fullWidth
                  >
                    Upload CSV
                    <input type="file" hidden accept=".csv" onChange={handleCsvUpload} />
                  </Button>
                  {csvData && (
                    <Typography variant="caption" color="success.main" display="block" sx={{ mt: 1 }}>
                      ✓ Loaded {csvData.length} categories from {csvData[0].items.length} rows.
                    </Typography>
                  )}
                  {csvError && (
                    <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                      {csvError}
                    </Typography>
                  )}
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>

          <Box display="flex" gap={2} mt={2}>
            <Button 
              fullWidth 
              variant="contained" 
              size="large" 
              onClick={() => handleBegin(false)}
              disabled={numError || itemsError}
              sx={{ height: 56, borderRadius: 3 }}
            >
              Play Solo
            </Button>
            <Button 
              fullWidth 
              variant="outlined" 
              color="primary" 
              size="large" 
              onClick={() => handleBegin(true)}
              disabled={numError || itemsError}
              sx={{ height: 56, borderRadius: 3 }}
            >
              Host Multiplayer
            </Button>
          </Box>
        </Box>
      </Paper>
      
      <Typography variant="caption" color="textSecondary" sx={{ mt: 4 }}>
        Massive scaling supported from 2x2 to 50x50 grids
      </Typography>
    </Box>
  );
};
