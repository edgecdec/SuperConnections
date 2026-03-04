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

       if (rooms[roomCode].state) {
           if (!rooms[roomCode].state.playerStats) rooms[roomCode].state.playerStats = {};
           if (!rooms[roomCode].state.playerStats[userId]) {
               rooms[roomCode].state.playerStats[userId] = {
                   name: `Player ${userId.substring(0, 4)}`,
                   score: 0,
                   mistakes: 0,
                   lastActive: Date.now()
               };
           }
       }

       socket.emit('init_session', { 
           isHost: rooms[roomCode].hostId === userId,
           userId: userId
       });

       if (rooms[roomCode].state) {
           socket.emit('state_update', rooms[roomCode].state);
       }
    });

    const performMerge = (state, survivorId, mergedId, newGroupColor, forceGroupId) => {
        const survivor = state.tiles.find(t => t.id === survivorId);
        const merged = state.tiles.find(t => t.id === mergedId);

        if (!survivor || !merged || survivor.id === mergedId || survivor.hidden || merged.hidden) return false;

        if (survivor.realCategory === merged.realCategory) {
            state.score += 1;
            let targetId = survivor.userGroupId || merged.userGroupId || forceGroupId;
            
            if (!targetId) {
                targetId = Math.random().toString(36).substring(2, 9);
            }

            const existingGroup = state.userGroups.find(g => g.id === targetId);
            if (!existingGroup) {
                state.userGroups.push({ 
                    id: targetId, 
                    name: `Group ${state.userGroups.length + 1}`, 
                    color: newGroupColor, 
                    lastUpdated: Date.now() 
                });
            } else {
                existingGroup.lastUpdated = Date.now();
            }

            const sOldId = survivor.userGroupId;
            const mOldId = merged.userGroupId;

            const survivorItems = survivor.text.split(', ').map(s => s.trim());
            const mergedItems = merged.text.split(', ').map(s => s.trim());
            survivor.text = Array.from(new Set([...survivorItems, ...mergedItems])).join(', ');

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

            // Feature: Pop to Top
            if (state.settings && state.settings.popToTop) {
                const survivorTile = state.tiles.find(t => t.id === survivorId);
                if (survivorTile) {
                    state.tiles = [survivorTile, ...state.tiles.filter(t => t.id !== survivorId)];
                }
            }

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
                actionResult = { 
                    success, 
                    actionType: action.type, 
                    message: success ? 'Merged!' : 'Incorrect match!',
                    involvedTileIds: [action.payload.tile1Id, action.payload.tile2Id]
                };
                stateChanged = true;
                break;
            }
            case 'RENAME_GROUP': {
                const { groupId, newName } = action.payload;
                const group = state.userGroups.find(g => g.id === groupId);
                if (group) { group.name = newName; stateChanged = true; actionResult = { success: true, actionType: action.type }; }
                else { actionResult = { success: false, actionType: action.type, message: 'Group not found' }; }
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
                            tile.userGroupId = null;
                            stateChanged = true;
                            actionResult = { success: true, actionType: action.type };
                        } else {
                            actionResult = { success: false, actionType: action.type, message: 'Cannot remove group with multiple items' };
                        }
                    } else {
                        const primary = state.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
                        if (primary) {
                            const success = performMerge(state, primary.id, tileId, '#fff', newGroupId);
                            actionResult = { 
                                success, 
                                actionType: action.type, 
                                message: success ? 'Tagged!' : 'Incorrect match!',
                                involvedTileIds: [primary.id, tileId]
                            };
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
        }

        socket.emit('action_result', actionResult);

        if (stateChanged) {
            // Update contributor stats
            if (state.playerStats && state.playerStats[userId]) {
                state.playerStats[userId].lastActive = Date.now();
                if (action.type === 'MERGE_TILES' || (action.type === 'TAG_TILE' && action.payload.groupId)) {
                    if (actionResult.success) {
                        state.playerStats[userId].score += 1;
                    } else {
                        state.playerStats[userId].mistakes += 1;
                    }
                }
            }

            if (!actionResult.success) socket.emit('state_update', state);

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

            room.version = Date.now();
            io.to(roomCode).emit('state_update', state);
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
