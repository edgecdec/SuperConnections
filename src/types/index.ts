export type Tile = {
  id: string;
  text: string;
  realCategory: string;
  userGroupId: string | null;
  locked: boolean;
  itemCount: number;
  hidden?: boolean;
};

export type UserGroup = {
  id: string;
  name: string;
  color: string;
  lastUpdated: number;
};

export type ActionResponse = {
  success: boolean;
  actionType: string;
  message?: string;
  involvedTileIds?: string[];
};

export type GameState = {
  roomCode: string | null;
  gridSize: number;
  tiles: Tile[];
  userGroups: UserGroup[];
  completedCategories: string[];
  mistakes: number;
  score: number;
  tilesPerRow: number;
  autoRefill: boolean;
  lastActionResult: ActionResponse | null;
};

export type GameAction = 
  | { type: 'MERGE_TILES'; payload: { tile1Id: string; tile2Id: string; newGroupColor: string; newGroupId: string } }
  | { type: 'RENAME_GROUP'; payload: { groupId: string; newName: string } }
  | { type: 'TAG_TILE'; payload: { tileId: string; groupId: string | null; newGroupId?: string } }
  | { type: 'CREATE_GROUP'; payload: { tileId: string | null; group: UserGroup } }
  | { type: 'REFILL_BOARD'; payload?: never }
  | { type: 'UPDATE_SETTINGS'; payload: { tilesPerRow?: number; autoRefill?: boolean } }
  | { type: 'CLEAR_RESULT'; payload?: never };
