'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import type {
  ClockEvent,
  JobEvent,
  NoteEvent,
  AttachmentEvent,
  SignatureEvent,
  AuthAuditEvent,
} from '@fieldconnect/shared';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UseSocketReturn {
  isConnected: boolean;
  lastEvent: ClockEvent | null;
  events: ClockEvent[];
  lastJobEvent: JobEvent | null;
  jobEvents: JobEvent[];
  lastNoteEvent: NoteEvent | null;
  lastAttachmentEvent: AttachmentEvent | null;
  lastSignatureEvent: SignatureEvent | null;
  lastAuthAuditEvent: AuthAuditEvent | null;
  onJobUpdate: (callback: (event: JobEvent) => void) => () => void;
  onNoteAdded: (callback: (event: NoteEvent) => void) => () => void;
  onAttachmentUpdate: (callback: (event: AttachmentEvent) => void) => () => void;
  onSignatureCaptured: (callback: (event: SignatureEvent) => void) => () => void;
  onAuthAudit: (callback: (event: AuthAuditEvent) => void) => () => void;
}

/**
 * Hook for subscribing to real-time events via Socket.io.
 * Auto-connects when the session is available and provides typed event streams.
 * Uses the BFF proxy to obtain a short-lived JWT for socket authentication.
 */
export function useSocket(): UseSocketReturn {
  const { data: session } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ClockEvent | null>(null);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [lastJobEvent, setLastJobEvent] = useState<JobEvent | null>(null);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [lastNoteEvent, setLastNoteEvent] = useState<NoteEvent | null>(null);
  const [lastAttachmentEvent, setLastAttachmentEvent] = useState<AttachmentEvent | null>(null);
  const [lastSignatureEvent, setLastSignatureEvent] = useState<SignatureEvent | null>(null);
  const [lastAuthAuditEvent, setLastAuthAuditEvent] = useState<AuthAuditEvent | null>(null);

  // Store callbacks for external listeners (used by components that want to refetch on events)
  const jobUpdateListeners = useRef<Set<(event: JobEvent) => void>>(new Set());
  const noteAddedListeners = useRef<Set<(event: NoteEvent) => void>>(new Set());
  const attachmentUpdateListeners = useRef<Set<(event: AttachmentEvent) => void>>(new Set());
  const signatureCapturedListeners = useRef<Set<(event: SignatureEvent) => void>>(new Set());
  const authAuditListeners = useRef<Set<(event: AuthAuditEvent) => void>>(new Set());

  const onJobUpdate = useCallback((cb: (event: JobEvent) => void) => {
    jobUpdateListeners.current.add(cb);
    return () => { jobUpdateListeners.current.delete(cb); };
  }, []);

  const onNoteAdded = useCallback((cb: (event: NoteEvent) => void) => {
    noteAddedListeners.current.add(cb);
    return () => { noteAddedListeners.current.delete(cb); };
  }, []);

  const onAttachmentUpdate = useCallback((cb: (event: AttachmentEvent) => void) => {
    attachmentUpdateListeners.current.add(cb);
    return () => { attachmentUpdateListeners.current.delete(cb); };
  }, []);

  const onSignatureCaptured = useCallback((cb: (event: SignatureEvent) => void) => {
    signatureCapturedListeners.current.add(cb);
    return () => { signatureCapturedListeners.current.delete(cb); };
  }, []);

  const onAuthAudit = useCallback((cb: (event: AuthAuditEvent) => void) => {
    authAuditListeners.current.add(cb);
    return () => { authAuditListeners.current.delete(cb); };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    let disconnected = false;
    let socket: Socket;

    async function connect() {
      let jwtToken: string | undefined;

      // Fetch a short-lived JWT for socket.io auth via the BFF proxy
      try {
        const res = await fetch('/api/proxy/api/v1/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          jwtToken = data.token;
        }
      } catch {
        // Token fetch failed — socket will be rejected; reconnect will retry
      }

      if (disconnected) return;

      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: {
          token: jwtToken,
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
        setEvents((prev) => [event, ...prev].slice(0, 50));
      });

      socket.on('job:update', (event: JobEvent) => {
        setLastJobEvent(event);
        setJobEvents((prev) => [event, ...prev].slice(0, 30));
        jobUpdateListeners.current.forEach((cb) => cb(event));
      });

      socket.on('note:added', (event: NoteEvent) => {
        setLastNoteEvent(event);
        noteAddedListeners.current.forEach((cb) => cb(event));
      });

      socket.on('attachment:update', (event: AttachmentEvent) => {
        setLastAttachmentEvent(event);
        attachmentUpdateListeners.current.forEach((cb) => cb(event));
      });

      socket.on('signature:captured', (event: SignatureEvent) => {
        setLastSignatureEvent(event);
        signatureCapturedListeners.current.forEach((cb) => cb(event));
      });

      socket.on('auth:audit', (event: AuthAuditEvent) => {
        setLastAuthAuditEvent(event);
        authAuditListeners.current.forEach((cb) => cb(event));
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
        // If auth failed, try to get a fresh token and reconnect
        if (error.message === 'Authentication required' || error.message === 'Invalid token') {
          setTimeout(() => {
            if (socket) {
              socket.disconnect();
              connect();
            }
          }, 3000);
        }
      });
    }

    connect();

    return () => {
      disconnected = true;
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [session?.user?.id, session?.user?.role]);

  return {
    isConnected,
    lastEvent,
    events,
    lastJobEvent,
    jobEvents,
    lastNoteEvent,
    lastAttachmentEvent,
    lastSignatureEvent,
    lastAuthAuditEvent,
    onJobUpdate,
    onNoteAdded,
    onAttachmentUpdate,
    onSignatureCaptured,
    onAuthAudit,
  };
}
