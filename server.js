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

    socket.on('game_action', ({ code, action }) => {
        if (!code) return;
        const roomCode = code.toUpperCase();
        const room = rooms[roomCode];
        if (!room || !room.state) return;

        const state = room.state;
        let stateChanged = false;

        switch (action.type) {
            case 'MERGE_TILES': {
                const { tile1Id, tile2Id } = action.payload;
                const t1 = state.tiles.find(t => t.id === tile1Id);
                const t2 = state.tiles.find(t => t.id === tile2Id);
                
                if (t1 && t2 && t1.id !== t2.id && t1.realCategory === t2.realCategory) {
                    state.score += 1;
                    let targetGroupId = t1.userGroupId || t2.userGroupId;
                    
                    if (!targetGroupId) {
                        targetGroupId = Math.random().toString(36).substring(2, 9);
                        state.userGroups.push({
                            id: targetGroupId,
                            name: `Group ${state.userGroups.length + 1}`,
                            color: action.payload.newGroupColor,
                            lastUpdated: Date.now()
                        });
                    } else {
                        const group = state.userGroups.find(g => g.id === targetGroupId);
                        if (group) group.lastUpdated = Date.now();
                    }

                    const t1OldGroupId = t1.userGroupId;
                    const t2OldGroupId = t2.userGroupId;

                    state.tiles = state.tiles.map(t => {
                        if (t.id === tile2Id) return { ...t, hidden: true, userGroupId: targetGroupId };
                        if (t.id === tile1Id) {
                            return { 
                                ...t, 
                                text: t.text + ', ' + t2.text,
                                userGroupId: targetGroupId,
                                itemCount: t1.itemCount + t2.itemCount
                            };
                        }
                        if ((t1OldGroupId && t.userGroupId === t1OldGroupId) || 
                            (t2OldGroupId && t.userGroupId === t2OldGroupId)) {
                            return { ...t, userGroupId: targetGroupId };
                        }
                        return t;
                    });
                    stateChanged = true;
                } else if (t1 && t2) {
                    state.mistakes += 1;
                    stateChanged = true;
                    // We broadcast the mistake update so everyone sees the counter increment
                }
                break;
            }

            case 'RENAME_GROUP': {
                const { groupId, newName } = action.payload;
                const group = state.userGroups.find(g => g.id === groupId);
                if (group) {
                    group.name = newName;
                    stateChanged = true;
                }
                break;
            }

            case 'TAG_TILE': {
                const { tileId, groupId } = action.payload;
                const tile = state.tiles.find(t => t.id === tileId);
                if (tile) {
                    // Logic handled similar to merge if group already has tiles
                    const existingTileInGroup = state.tiles.find(t => t.userGroupId === groupId && t.id !== tileId && !t.hidden);
                    if (existingTileInGroup) {
                        // Reuse merge logic if it's an existing group with tiles
                        if (tile.realCategory === existingTileInGroup.realCategory) {
                            state.score += 1;
                            tile.userGroupId = groupId;
                            // For simplicity in this action, we just group them. 
                            // Real "merging" (absorbing text) is usually done via Drag & Drop.
                            stateChanged = true;
                        } else {
                            state.mistakes += 1;
                            stateChanged = true;
                        }
                    } else {
                        tile.userGroupId = groupId;
                        stateChanged = true;
                    }
                }
                break;
            }

            case 'CREATE_GROUP': {
                const { tileId, group } = action.payload;
                state.userGroups.push(group);
                const tile = state.tiles.find(t => t.id === tileId);
                if (tile) tile.userGroupId = group.id;
                stateChanged = true;
                break;
            }

            case 'REFILL_BOARD': {
                const unlocked = state.tiles.filter(t => !t.locked && !t.hidden);
                const locked = state.tiles.filter(t => t.locked);
                state.tiles = [...unlocked, ...locked];
                stateChanged = true;
                break;
            }

            case 'UPDATE_SETTINGS': {
                if (action.payload.tilesPerRow !== undefined) state.tilesPerRow = action.payload.tilesPerRow;
                if (action.payload.autoRefill !== undefined) state.autoRefill = action.payload.autoRefill;
                stateChanged = true;
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

            for (const [groupId, count] of Object.entries(groupCounts)) {
                if (count === state.gridSize) {
                    const groupTiles = state.tiles.filter(t => t.userGroupId === groupId && !t.locked);
                    const firstCategory = groupTiles[0].realCategory;
                    if (groupTiles.every(t => t.realCategory === firstCategory)) {
                        state.completedCategories.push(firstCategory);
                        state.tiles = state.tiles.map(t => 
                            t.userGroupId === groupId ? { ...t, locked: true, userGroupId: null } : t
                        );
                    }
                }
            }

            room.version = Date.now();
            // Broadcast the ACTION instead of the whole state to others
            socket.to(roomCode).emit('remote_action', action);
            // We can still occasionally emit full state if needed, but for now actions are faster
        }
    });
  });

  httpServer.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port} (listening on ${hostname}:${port})`);
  });
});
