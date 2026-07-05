import { Server as HTTPServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { jwtVerify } from 'jose';
import type { ClockEvent } from '@fieldconnect/shared';

let io: SocketServer | null = null;

const getSecret = (): Uint8Array => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
};

/**
 * Initialize Socket.io server on the given HTTP server.
 * Called once during server startup.
 */
export function initWebSocket(httpServer: HTTPServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    },
    // Reduce to minimal transport for mobile
    transports: ['websocket', 'polling'],
  });

  // Auth middleware: verify JWT from auth.token in handshake
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
      });
      const userId = (payload.sub || payload.id) as string;
      const role = (payload.role as string) || '';

      // Store user info on the socket for later use
      (socket as any).user = {
        id: userId,
        role,
      };

      // Join a personal room for targeted messages
      socket.join(`user:${userId}`);

      // Office staff join the tech:status room for live feed
      if (role !== 'field_technician') {
        socket.join('tech:status');
      }

      next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`WebSocket connected: ${(socket as any).user?.id || 'unknown'}`);

    socket.on('disconnect', () => {
      console.log(`WebSocket disconnected: ${(socket as any).user?.id || 'unknown'}`);
    });
  });

  console.log('Socket.io initialized');
  return io;
}

/**
 * Get the current Socket.io server instance.
 * Returns null if not yet initialized.
 */
export function getIO(): SocketServer | null {
  return io;
}

/**
 * Broadcast a clock event to all users in the tech:status room (office dashboard).
 */
export function broadcastClockEvent(event: ClockEvent): void {
  if (!io) return;
  io.to('tech:status').emit('tech:status', event);
}
