'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import type { ClockEvent, JobEvent } from '@fieldconnect/shared';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UseSocketReturn {
  isConnected: boolean;
  lastEvent: ClockEvent | null;
  events: ClockEvent[];
  lastJobEvent: JobEvent | null;
  jobEvents: JobEvent[];
}

/**
 * Hook for subscribing to real-time technician status events via Socket.io.
 * Auto-connects when the session is available and provides the event stream.
 */
export function useSocket(): UseSocketReturn {
  const { data: session } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ClockEvent | null>(null);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [lastJobEvent, setLastJobEvent] = useState<JobEvent | null>(null);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);

  useEffect(() => {
    // Don't connect unless we have a session
    if (!session?.user) return;

    // Create socket connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        // For the BFF approach, the frontend doesn't have the raw JWT,
        // so Socket.io auth happens through the Next.js proxy.
        // We pass user info so the server can authenticate.
        userId: session.user.id,
        role: session.user.role,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('tech:status', (event: ClockEvent) => {
      setLastEvent(event);
      setEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50 events
    });

    socket.on('job:update', (event: JobEvent) => {
      setLastJobEvent(event);
      setJobEvents((prev) => [event, ...prev].slice(0, 30)); // Keep last 30 job events
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.user?.id, session?.user?.role]);

  return { isConnected, lastEvent, events, lastJobEvent, jobEvents };
}
