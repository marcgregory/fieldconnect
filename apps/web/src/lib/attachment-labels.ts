export function getAttachmentLabel(type?: string): string {
  switch (type) {
    case 'before':
      return 'Before photo';
    case 'during':
      return 'During photo';
    case 'after':
      return 'After photo';
    case 'document':
      return 'Document';
    default:
      return 'Attachment';
  }
}
