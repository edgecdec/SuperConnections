export type Tile = {
  id: string;
  text: string;
  realCategory: string;
  userGroupId: string | null;
  locked: boolean;
  itemCount: number;
  col: number;
  order: number;
  durableKey: number;
  isMaster?: boolean;
  hidden?: boolean;
};

export type UserGroup = {
  id: string;
  name: string;
  color: string;
  words: string[];
  lastUpdated: number;
};

export type ActionResponse = {
  success: boolean;
  actionType: string;
  message?: string;
  involvedTileIds?: string[];
};

export type PlayerStats = {
  name: string;
  score: number;
  mistakes: number;
  lastActive: number;
};

export type CategoryData = {
  items: string[];
  tags: string[];
  niche: boolean;
};

export type CategoryMap = Record<string, CategoryData>;

export type GameDifficulty = 'easy' | 'random' | 'hard';

export type GameSettings = {
  numCategories: number;
  itemsPerCategory: number;
  difficulty: GameDifficulty;
  includeNiche: boolean;
  activeTags: string[];
  manualCategories: string[];
  customCategories?: { name: string, items: string[] }[];
  popToTop: boolean;
  gravity: 'none' | 'up';
  soundEnabled?: boolean;
};

export type GameState = {
  roomCode: string | null;
  gridSize: number; // For backward compatibility or general size ref
  settings: GameSettings;
  tiles: Tile[];
  userGroups: UserGroup[];
  completedCategories: string[];
  mistakes: number;
  score: number;
  tilesPerRow: number;
  autoRefill: boolean;
  lastActionResult: ActionResponse | null;
  startTime: number | null;
  playerStats: Record<string, PlayerStats>;
};

export type GameAction = 
  | { type: 'MERGE_TILES'; payload: { tile1Id: string; tile2Id: string; newGroupColor: string; newGroupId: string } }
  | { type: 'RENAME_GROUP'; payload: { groupId: string; newName: string } }
  | { type: 'TAG_TILE'; payload: { tileId: string; groupId: string | null; newGroupId?: string } }
  | { type: 'CREATE_GROUP'; payload: { tileId: string | null; group: UserGroup } }
  | { type: 'REFILL_BOARD'; payload?: never }
  | { type: 'SHUFFLE_BOARD'; payload?: never }
  | { type: 'UPDATE_SETTINGS'; payload: { tilesPerRow?: number; autoRefill?: boolean; soundEnabled?: boolean } }
  | { type: 'CLEAR_RESULT'; payload?: never }
  | { type: 'SET_PLAYER_NAME'; payload: { name: string } }
  | { type: 'START_GAME'; payload: { settings: GameSettings; tiles: Tile[] } }
  | { type: 'REORDER_TILE'; payload: { tileId: string; direction: 'top' | 'bottom' } }
  | { type: 'INSERT_TILE'; payload: { draggedTileId: string; targetTileId: string; position: 'before' | 'after' } };
