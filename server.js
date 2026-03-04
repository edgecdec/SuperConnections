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
               version: initialGameState ? Date.now() : 0
           };
           console.log(`Room ${roomCode} created by host ${userId}`);
       }

       // Inform the user if they are the host
       socket.emit('init_session', { 
           isHost: rooms[roomCode].hostId === userId,
           userId: userId
       });

       // Send current master state to the joining user
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

            // Update survivor
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

        const state = room.state;
        let stateChanged = false;

        switch (action.type) {
            case 'MERGE_TILES': {
                const result = performMerge(state, action.payload.tile1Id, action.payload.tile2Id, action.payload.newGroupColor, action.payload.newGroupId);
                socket.emit('action_result', { 
                    success: result, 
                    actionType: action.type, 
                    message: result ? 'Merged!' : 'Incorrect match!' 
                });
                stateChanged = true; // Mistakes also count as state change
                break;
            }

            case 'RENAME_GROUP': {
                const { groupId, newName } = action.payload;
                const group = state.userGroups.find(g => g.id === groupId);
                if (group) {
                    group.name = newName;
                    stateChanged = true;
                    socket.emit('action_result', { success: true, actionType: action.type });
                } else {
                    socket.emit('action_result', { success: false, actionType: action.type, message: 'Group not found' });
                }
                break;
            }

            case 'TAG_TILE': {
                const { tileId, groupId, newGroupId } = action.payload;
                const tile = state.tiles.find(t => t.id === tileId);
                if (tile) {
                    if (groupId === null) {
                        tile.userGroupId = null;
                        stateChanged = true;
                        socket.emit('action_result', { success: true, actionType: action.type });
                    } else {
                        const primary = state.tiles.find(t => t.userGroupId === groupId && !t.hidden && !t.locked && t.id !== tileId);
                        if (primary) {
                            const result = performMerge(state, primary.id, tileId, '#fff', newGroupId);
                            socket.emit('action_result', { 
                                success: result, 
                                actionType: action.type,
                                message: result ? 'Tagged and Merged!' : 'Incorrect match!'
                            });
                            stateChanged = true;
                        } else {
                            tile.userGroupId = groupId;
                            stateChanged = true;
                            socket.emit('action_result', { success: true, actionType: action.type });
                        }
                    }
                }
                break;
            }

            case 'CREATE_GROUP': {
                const { tileId, group } = action.payload;
                const existing = state.userGroups.find(g => g.id === group.id);
                if (!existing) {
                    state.userGroups.push(group);
                }
                const tile = state.tiles.find(t => t.id === tileId);
                if (tile) tile.userGroupId = group.id;
                stateChanged = true;
                socket.emit('action_result', { success: true, actionType: action.type });
                break;
            }

            case 'REFILL_BOARD': {
                const unlocked = state.tiles.filter(t => !t.locked && !t.hidden);
                const locked = state.tiles.filter(t => t.locked);
                state.tiles = [...unlocked, ...locked];
                stateChanged = true;
                socket.emit('action_result', { success: true, actionType: action.type });
                break;
            }

            case 'UPDATE_SETTINGS': {
                if (action.payload.tilesPerRow !== undefined) state.tilesPerRow = action.payload.tilesPerRow;
                if (action.payload.autoRefill !== undefined) state.autoRefill = action.payload.autoRefill;
                stateChanged = true;
                socket.emit('action_result', { success: true, actionType: action.type });
                break;
            }
        }

        if (stateChanged) {
            // Check for completed categories after any state change
            const groupCounts = state.tiles.reduce((acc, tile) => {
                if (tile.userGroupId && !tile.locked && !tile.hidden) {
                    acc[tile.userGroupId] = (acc[tile.userGroupId] || 0) + tile.itemCount;
                }
                return acc;
            }, {});

            let completedCat = null;
            let completedGroupId = null;

            for (const [groupId, count] of Object.entries(groupCounts)) {
                if (count === state.gridSize) {
                    const groupTiles = state.tiles.filter(t => t.userGroupId === groupId && !t.locked);
                    if (groupTiles.length > 0) {
                        const firstCategory = groupTiles[0].realCategory;
                        if (groupTiles.every(t => t.realCategory === firstCategory)) {
                            if (!state.completedCategories.includes(firstCategory)) {
                                completedCat = firstCategory;
                                completedGroupId = groupId;
                                break;
                            }
                        }
                    }
                }
            }

            if (completedCat && completedGroupId) {
                state.completedCategories.push(completedCat);
                state.tiles.forEach(t => {
                    if (t.userGroupId === completedGroupId) {
                        t.locked = true;
                        t.userGroupId = null;
                    }
                });
            }

            room.version = Date.now();
            socket.to(roomCode).emit('remote_action', action);
        }
    });
  });

  httpServer.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port} (listening on ${hostname}:${port})`);
  });
});
