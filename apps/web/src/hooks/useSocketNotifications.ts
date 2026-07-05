'use client';

import { useEffect } from 'react';
import { useSocket } from './useSocket';
import { useToast } from '@/components/Toast';

/**
 * Hook that listens for socket events and shows toast notifications.
 * Should be used once at the app level (e.g., in the office layout).
 */
export function useSocketNotifications() {
  const { addToast } = useToast();
  const {
    isConnected,
    lastJobEvent,
    lastNoteEvent,
    lastAttachmentEvent,
    lastSignatureEvent,
  } = useSocket();

  // Connection status
  useEffect(() => {
    if (!isConnected) return;
    // Don't toast on connect — too noisy
  }, [isConnected]);

  // Job status change notifications
  useEffect(() => {
    if (!lastJobEvent) return;

    const event = lastJobEvent;
    switch (event.type) {
      case 'status_change':
        addToast({
          message: `${event.project_name}: ${event.old_status || 'scheduled'} → ${event.new_status} (by ${event.changed_by})`,
          type: 'info',
          duration: 5000,
        });
        break;
      case 'assignment':
        addToast({
          message: `New assignment: ${event.project_name} → ${event.technician_name}`,
          type: 'success',
          duration: 5000,
        });
        break;
      case 'reassigned':
        addToast({
          message: `Reassigned: ${event.project_name} now assigned to ${event.technician_name}`,
          type: 'warning',
          duration: 5000,
        });
        break;
    }
  }, [lastJobEvent, addToast]);

  // Note added notifications
  useEffect(() => {
    if (!lastNoteEvent) return;

    addToast({
      message: `Note added to ${lastNoteEvent.project_name} by ${lastNoteEvent.user_name}`,
      type: 'info',
      duration: 4000,
    });
  }, [lastNoteEvent, addToast]);

  // Attachment notifications
  useEffect(() => {
    if (!lastAttachmentEvent) return;

    if (lastAttachmentEvent.type === 'attachment_uploaded') {
      addToast({
        message: `Photo added to ${lastAttachmentEvent.project_name} by ${lastAttachmentEvent.user_name}`,
        type: 'success',
        duration: 4000,
      });
    } else {
      addToast({
        message: `Photo removed from ${lastAttachmentEvent.project_name}`,
        type: 'info',
        duration: 4000,
      });
    }
  }, [lastAttachmentEvent, addToast]);

  // Signature notifications
  useEffect(() => {
    if (!lastSignatureEvent) return;

    addToast({
      message: `Signature captured on ${lastSignatureEvent.project_name} by ${lastSignatureEvent.user_name}`,
      type: 'success',
      duration: 5000,
    });
  }, [lastSignatureEvent, addToast]);
}
