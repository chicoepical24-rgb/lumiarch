const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*" }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from htdocs/Game_Client
app.use(express.static(path.join(__dirname, 'htdocs', 'Game_Client')));

// Fallback to index.html for client-side routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'htdocs', 'Game_Client', 'index.html'));
});

// Store connected players
const players = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`[Player Connected] ID: ${socket.id}`);

  // Send existing players to new player
  const existingPlayers = Array.from(players.values());
  socket.emit('existing_players', existingPlayers);

  // Broadcast new player to all others
  socket.broadcast.emit('player_joined', {
    id: socket.id,
    username: `Player_${socket.id.substring(0, 5)}`
  });

  // Store player data
  players.set(socket.id, {
    id: socket.id,
    position: { x: 0, y: 100, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    username: `Player_${socket.id.substring(0, 5)}`,
    health: 100
  });

  // Handle player movement
  socket.on('player_move', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.position = data.position;
      player.rotation = data.rotation;
      player.velocity = data.velocity;
      
      // Broadcast to all other players
      socket.broadcast.emit('player_moved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation,
        velocity: data.velocity
      });
    }
  });

  // Handle player animations
  socket.on('player_animate', (data) => {
    socket.broadcast.emit('player_animated', {
      id: socket.id,
      animation: data.animation,
      speed: data.speed
    });
  });

  // Handle damage/health
  socket.on('player_damage', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.health = Math.max(0, player.health - data.damage);
      
      io.emit('player_health_changed', {
        id: socket.id,
        health: player.health
      });

      if (player.health <= 0) {
        io.emit('player_died', { id: socket.id });
        setTimeout(() => {
          player.health = 100;
          player.position = { x: 0, y: 100, z: 0 };
        }, 5000);
      }
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`[Player Disconnected] ID: ${socket.id}`);
    players.delete(socket.id);
    
    io.emit('player_left', { id: socket.id });
  });

  // Heartbeat to keep connection alive
  socket.on('heartbeat', () => {
    socket.emit('heartbeat_ack');
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', players: players.size });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Lumiarch Server Running               ║
║   Port: ${PORT}                               ║
║   Players Connected: 0                 ║
╚════════════════════════════════════════╝
  `);
});