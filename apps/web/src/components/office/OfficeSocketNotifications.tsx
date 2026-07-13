'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/components/Toast';
import { getAttachmentLabel } from '@/lib/attachment-labels';

/**
 * Client component that wires up real-time socket notifications for the office dashboard.
 * Only visible when mounted under ToastProvider.
 */
export function OfficeSocketNotifications() {
  const { data: session } = useSession();
  const { addToast } = useToast();
  const {
    isConnected,
    lastJobEvent,
    lastNoteEvent,
    lastAttachmentEvent,
    lastSignatureEvent,
  } = useSocket();

  // Job status change notifications (skip if I'm the actor)
  useEffect(() => {
    if (!lastJobEvent) return;
    if (lastJobEvent.changed_by === session?.user?.name) return;

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
  }, [lastJobEvent, addToast, session?.user?.name]);

  // Note added notifications (skip if I'm the actor)
  useEffect(() => {
    if (!lastNoteEvent) return;
    if (lastNoteEvent.user_name === session?.user?.name) return;

    addToast({
      message: `Note added to ${lastNoteEvent.project_name} by ${lastNoteEvent.user_name}`,
      type: 'info',
      duration: 4000,
    });
  }, [lastNoteEvent, addToast, session?.user?.name]);

  // Attachment notifications (skip if I'm the actor)
  useEffect(() => {
    if (!lastAttachmentEvent) return;
    if (lastAttachmentEvent.user_name === session?.user?.name) return;

    const attachmentLabel = getAttachmentLabel(lastAttachmentEvent.attachment_type);

    if (lastAttachmentEvent.type === 'attachment_uploaded') {
      addToast({
        message: `${attachmentLabel} added to ${lastAttachmentEvent.project_name} by ${lastAttachmentEvent.user_name}`,
        type: 'success',
        duration: 4000,
      });
    } else {
      addToast({
        message: `${attachmentLabel} removed from ${lastAttachmentEvent.project_name}`,
        type: 'info',
        duration: 4000,
      });
    }
  }, [lastAttachmentEvent, addToast, session?.user?.name]);

  // Signature notifications (skip if I'm the actor)
  useEffect(() => {
    if (!lastSignatureEvent) return;
    if (lastSignatureEvent.user_name === session?.user?.name) return;

    addToast({
      message: `Signature captured on ${lastSignatureEvent.project_name} by ${lastSignatureEvent.user_name}`,
      type: 'success',
      duration: 5000,
    });
  }, [lastSignatureEvent, addToast, session?.user?.name]);

  return null; // This component doesn't render anything
}
