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

    socket.on('join_room', ({ code, gameState }) => {
       if (!code) return;
       const roomCode = code.toUpperCase();
       socket.join(roomCode);

       if (!rooms[roomCode]) {
           rooms[roomCode] = {
               hostId: userId,
               state: gameState || null
           };
           console.log(`Room ${roomCode} created by ${userId}`);
       }

       // Inform the user if they are the host
       socket.emit('init_session', { 
           isHost: rooms[roomCode].hostId === userId,
           userId: userId
       });

       // If room exists, send current state to the joining user
       if (rooms[roomCode].state) {
           socket.emit('state_update', rooms[roomCode].state);
       }

       // If joining user is the host and provided a state, update it
       if (rooms[roomCode].hostId === userId && gameState) {
           rooms[roomCode].state = gameState;
           socket.to(roomCode).emit('state_update', gameState);
       }
    });

    socket.on('update_state', ({ code, gameState }) => {
        if (!code || !rooms[code.toUpperCase()]) return;
        const roomCode = code.toUpperCase();
        
        rooms[roomCode].state = gameState;
        // Broadcast to everyone else in the room
        socket.to(roomCode).emit('state_update', gameState);
    });
  });

  httpServer.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port} (listening on ${hostname}:${port})`);
  });
});
