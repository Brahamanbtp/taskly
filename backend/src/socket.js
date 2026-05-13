const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');

let io;

async function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
  });

  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ 
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) return new Error('Redis connection failed after 3 attempts');
            return Math.min(retries * 50, 500);
          }
        }
      });
      pubClient.on('error', (err) => {
        // Only log once to avoid spam
        if (!pubClient._loggedError) {
          console.warn('⚠️ Socket.io Redis client error:', err.message);
          pubClient._loggedError = true;
        }
      });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.io Redis adapter initialized');
    } catch (err) {
      console.warn('⚠️ Redis connection failed, falling back to in-memory adapter:', err.message);
    }
  }

  io.use((socket, next) => {
    const { token, workspaceId } = socket.handshake.auth;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.user = decoded;
      socket.workspaceId = workspaceId;
      next();
    });
  });

  io.on('connection', (socket) => {
    // Join a room specifically for this workspace
    const room = socket.workspaceId || socket.user.id;
    socket.join(room);

    // Handle cursor tracking
    socket.on('cursor_move', (data) => {
      // Broadcast cursor coordinates to all OTHER sockets in this workspace room
      socket.to(room).emit('cursor_moved', {
        socketId: socket.id,
        email: socket.user.email,
        x: data.x,
        y: data.y
      });
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('cursor_left', { socketId: socket.id });
    });
  });

  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

module.exports = { initSocket, getIo };
