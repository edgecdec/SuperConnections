const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { exec } = require('child_process');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3001;

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'my_super_secret_connections_token';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = {};

const parseCookie = (str, name) => {
    if (!str) return null;
    const match = str.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
};

// SHARED PHYSICS LOGIC (Mirror of src/utils/physics.ts)
function applyGridPhysics(tiles, settings, tilesPerRow, survivorId = null) {
  if (!settings || (!settings.popToTop && settings.gravity !== 'up')) {
    return tiles;
  }

  const numCols = tilesPerRow;
  const colBuckets = Array.from({ length: numCols }, () => []);

  tiles.forEach(tile => {
    const col = (tile.col !== undefined) ? tile.col : 0;
    if (colBuckets[col]) colBuckets[col].push(tile);
  });

  colBuckets.forEach(bucket => {
    if (bucket.length === 0) return;
    const active = bucket.filter(t => !t.hidden && !t.locked && t.id !== survivorId);
    const hiddenOrLocked = bucket.filter(t => t.hidden || t.locked);
    const survivor = bucket.find(t => t.id === survivorId);

    bucket.length = 0;
    if (survivor && settings.popToTop) {
      bucket.push(survivor);
    } else if (survivor) {
      active.unshift(survivor);
    }

    if (settings.gravity === 'up') {
      bucket.push(...active, ...hiddenOrLocked);
    } else {
      bucket.push(...active, ...hiddenOrLocked);
    }
  });

  const flattened = [];
  const maxRows = Math.max(...colBuckets.map(b => b.length));
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const tile = colBuckets[c][r];
      if (tile) flattened.push(tile);
    }
  }
  return flattened;
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      const { pathname } = parsedUrl;

      if (pathname === '/api/webhook' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const signature = req.headers['x-hub-signature-256'];
            if (!signature) { res.statusCode = 401; res.end('No signature'); return; }
            const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
            const digest = 'sha256=' + hmac.update(body).digest('hex');
            if (signature === digest) {
                console.log('Webhook verified. Deploying...');
                res.statusCode = 200; res.end('Deploying');
                exec('bash /var/www/SuperConnections/deploy_webhook.sh', (error, stdout, stderr) => {    
                    if (error) console.error(`exec error: ${error}`);
                    if (stdout) console.log(`stdout: ${stdout}`);
                    if (stderr) console.error(`stderr: ${stderr}`);
                });
            } else {
                res.statusCode = 403; res.end('Forbidden');
            }
        });
        return;
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    const cookieString = socket.request.headers.cookie;
    const userId = parseCookie(cookieString, 'super_connections_id');

    if (!userId) {
        socket.disconnect();
        return;
    }

    socket.on('join_room', ({ code, initialGameState }) => {
       if (!code) return;
       const roomCode = code.toUpperCase();
       socket.join(roomCode);

       if (!rooms[roomCode]) {
           rooms[roomCode] = {
               hostId: userId,
               state: initialGameState || null,
               version: initialGameState ? Date.now() : 0,
               cleanupTimer: null
           };
           if (rooms[roomCode].state) {
               rooms[roomCode].state.startTime = rooms[roomCode].state.startTime || Date.now();
               rooms[roomCode].state.playerStats = rooms[roomCode].state.playerStats || {};
           }
           console.log(`Room ${roomCode} created by host ${userId}`);
       } else if (rooms[roomCode].cleanupTimer) {
           clearTimeout(rooms[roomCode].cleanupTimer);
           rooms[roomCode].cleanupTimer = null;
       }

       const room = rooms[roomCode];
       if (room.state) {
           if (!room.state.playerStats) room.state.playerStats = {};
           if (!room.state.playerStats[userId]) {
               room.state.playerStats[userId] = {
                   name: `Player ${userId.substring(0, 4)}`,
                   score: 0,
                   mistakes: 0,
                   lastActive: Date.now()
               };
           }
       }

       socket.emit('init_session', { 
           isHost: room.hostId === userId,
           userId: userId
       });

       if (room.state && room.state.tiles && room.state.tiles.length > 0) {
           socket.emit('state_update', room.state);
       }
    });

    const performMerge = (state, survivorId, mergedId, newGroupColor, forceGroupId) => {
        const survivor = state.tiles.find(t => t.id === survivorId);
        const merged = state.tiles.find(t => t.id === mergedId);

        if (!survivor || !merged || survivor.id === mergedId || survivor.hidden || merged.hidden) return false;

        if (survivor.realCategory === merged.realCategory) {
            state.score += 1;
            let targetId = survivor.userGroupId || merged.userGroupId || forceGroupId;
            if (!targetId) targetId = Math.random().toString(36).substring(2, 9);

            const existingGroup = state.userGroups.find(g => g.id === targetId);
            if (!existingGroup) {
                state.userGroups.push({ id: targetId, name: '', color: newGroupColor, lastUpdated: Date.now() });
            } else {
                existingGroup.lastUpdated = Date.now();
            }

            const sOldId = survivor.userGroupId;
            const mOldId = merged.userGroupId;

            survivor.text = Array.from(new Set([...survivor.text.split(', ').map(s => s.trim()), ...merged.text.split(', ').map(s => s.trim())])).join(', ');
            survivor.itemCount = survivor.itemCount + merged.itemCount;
            survivor.userGroupId = targetId;

            merged.hidden = true;
            merged.userGroupId = targetId;

            state.tiles.forEach(t => {
                if (t.id === survivorId || t.id === mergedId) return;
                if ((sOldId && t.userGroupId === sOldId) || (mOldId && t.userGroupId === mOldId)) {
                    t.userGroupId = targetId;
                }
            });

            // Unified Physics Pass
            state.tiles = applyGridPhysics(state.tiles, state.settings, state.tilesPerRow, survivorId);
            return true;
        } else {
            state.mistakes += 1;
            return false;
        }
    };

    socket.on('game_action', ({ code, action }) => {
        if (!code) return;
        const roomCode = code.toUpperCase();
        const room = rooms[roomCode];
        if (!room || !room.state) return;

        if (room.cleanupTimer) clearTimeout(room.cleanupTimer);

        const state = room.state;
        let stateChanged = false;
        let actionResult = { success: true, message: '' };

        switch (action.type) {
            case 'START_GAME': {
                const { settings, tiles } = action.payload;
                state.settings = settings;
                state.tiles = tiles;
                state.gridSize = settings.itemsPerCategory;
                state.userGroups = [];
                state.completedCategories = [];
                state.mistakes = 0;
                state.score = 0;
                state.tilesPerRow = settings.numCategories;
                state.startTime = Date.now();
                if (state.playerStats) {
                    Object.keys(state.playerStats).forEach(id => {
                        state.playerStats[id].score = 0;
                        state.playerStats[id].mistakes = 0;
                    });
                }
                stateChanged = true;
                actionResult = { success: true, actionType: action.type };
                break;
            }
            case 'MERGE_TILES': {
                const success = performMerge(state, action.payload.tile1Id, action.payload.tile2Id, action.payload.newGroupColor, action.payload.newGroupId);
                actionResult = { success, actionType: action.type, involvedTileIds: [action.payload.tile1Id, action.payload.tile2Id] };
                stateChanged = true;
                break;
            }
            case 'RENAME_GROUP': {
                const { groupId, newName } = action.payload;
                const group = state.userGroups.find(g => g.id === groupId);
                if (group) { group.name = newName; stateChanged = true; actionResult = { success: true, actionType: action.type }; }
                break;
            }
            case 'TAG_TILE': {
                const { tileId, groupId, newGroupId } = action.payload;
                const tile = state.tiles.find(t => t.id === tileId);
                if (tile) {
                    if (groupId === null) {
                        const currentGroupId = tile.userGroupId;
                        const groupCount = currentGroupId ? state.tiles.reduce((acc, t) => (t.userGroupId === currentGroupId && !t.hidden && !t.locked) ? acc + t.itemCount : acc, 0) : 0;
                        if (tile.itemCount === 1 && groupCount === 1) {
                            tile.userGroupId = null; stateChanged = true; actionResult = { success: true, actionType: action.type };
                        } else { actionResult = { success: false, actionType: action.type }; }
                    } else {
                        const primary = state.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
                        if (primary) {
                            const success = performMerge(state, primary.id, tileId, '#fff', newGroupId);
                            actionResult = { success, actionType: action.type, involvedTileIds: [primary.id, tileId] };
                            stateChanged = true;
                        } else { 
                            tile.userGroupId = groupId; stateChanged = true; 
                            actionResult = { success: true, actionType: action.type };
                        }
                    }
                }
                break;
            }
            case 'CREATE_GROUP': {
                const { tileId, group } = action.payload;
                if (!state.userGroups.find(g => g.id === group.id)) state.userGroups.push(group);
                if (tileId) { const t = state.tiles.find(tile => tile.id === tileId); if (t) t.userGroupId = group.id; }
                stateChanged = true;
                actionResult = { success: true, actionType: action.type };
                break;
            }
            case 'REFILL_BOARD': {
                const unlocked = state.tiles.filter(t => !t.locked && !t.hidden);
                const locked = state.tiles.filter(t => t.locked);
                state.tiles = [...unlocked, ...locked];
                stateChanged = true;
                actionResult = { success: true, actionType: action.type };
                break;
            }
            case 'UPDATE_SETTINGS': {
                if (action.payload.tilesPerRow !== undefined) state.tilesPerRow = action.payload.tilesPerRow;
                if (action.payload.autoRefill !== undefined) state.autoRefill = action.payload.autoRefill;
                stateChanged = true;
                actionResult = { success: true, actionType: action.type };
                break;
            }
            case 'SET_PLAYER_NAME': {
                if (state.playerStats && state.playerStats[userId]) {
                    state.playerStats[userId].name = action.payload.name;
                    stateChanged = true;
                    actionResult = { success: true, actionType: action.type };
                }
                break;
            }
            case 'REORDER_TILE': {
                const { tileId, direction } = action.payload;
                const tile = state.tiles.find(t => t.id === tileId);
                if (tile && !tile.locked && !tile.hidden) {
                    if (direction === 'top') {
                        state.tiles = applyGridPhysics(state.tiles, state.settings, state.tilesPerRow, tileId);
                    } else {
                        // Sink to bottom: Temporarily mark as hidden to force physics to push it down
                        const wasHidden = tile.hidden;
                        tile.hidden = true;
                        state.tiles = applyGridPhysics(state.tiles, state.settings, state.tilesPerRow);
                        tile.hidden = wasHidden;
                    }
                    stateChanged = true;
                    actionResult = { success: true, actionType: action.type };
                }
                break;
            }
        }

        socket.emit('action_result', actionResult);

        if (state.playerStats && state.playerStats[userId]) {
            state.playerStats[userId].lastActive = Date.now();
            if (action.type === 'MERGE_TILES' || (action.type === 'TAG_TILE' && action.payload.groupId)) {
                if (actionResult.success) state.playerStats[userId].score += 1;
                else state.playerStats[userId].mistakes += 1;
            }
        }

        // Handle auto-completion
        const groupCounts = state.tiles.reduce((acc, tile) => {
            if (tile.userGroupId && !tile.locked && !tile.hidden) acc[tile.userGroupId] = (acc[tile.userGroupId] || 0) + tile.itemCount;
            return acc;
        }, {});

        const finishedGids = Object.entries(groupCounts).filter(([gid, count]) => count === state.gridSize).map(([gid]) => gid);
        finishedGids.forEach(gid => {
            const groupTiles = state.tiles.filter(t => t.userGroupId === gid && !t.locked);
            if (groupTiles.length > 0) {
                const firstCategory = groupTiles[0].realCategory;
                if (groupTiles.every(t => t.realCategory === firstCategory) && !state.completedCategories.includes(firstCategory)) {
                    state.completedCategories.push(firstCategory);
                    state.tiles.forEach(t => { if (t.userGroupId === gid) { t.locked = true; t.userGroupId = null; } });
                }
            }
        });

        // Always broadcast state to keep definitive tile order in sync
        room.version = Date.now();
        io.to(roomCode).emit('state_update', state);
        if (stateChanged && actionResult.success) {
            socket.to(roomCode).emit('remote_action', action);
        }
    });

    socket.on('disconnect', () => {
        Object.keys(rooms).forEach(roomCode => {
            const room = io.sockets.adapter.rooms.get(roomCode);
            if (!room || room.size === 0) {
                if (rooms[roomCode] && !rooms[roomCode].cleanupTimer) {
                    rooms[roomCode].cleanupTimer = setTimeout(() => {
                        delete rooms[roomCode];
                        console.log(`Room ${roomCode} cleaned up from memory.`);
                    }, 1800000);
                }
            }
        });
    });
  });

  httpServer.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port} (listening on ${hostname}:${port})`);
  });
});
