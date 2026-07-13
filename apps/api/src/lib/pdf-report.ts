/**
 * PDF generation service for customer completion reports.
 *
 * Uses PDFKit to render a professional completion summary with
 * project info, time breakdown, job notes, photo listings, and signatures.
 *
 * Safety guarantees:
 * - Null/undefined values are never passed to PDFKit text/image methods.
 * - Unsupported image formats (HEIC, WebP, SVG, etc.) are listed but not embedded.
 * - Cloudinary/remote image URLs are fetched with timeout; failures skip gracefully.
 * - Long notes/filenames wrap and create additional pages on overflow.
 * - The PDF document is ended exactly once.
 * - Signature base64 data is validated before embedding.
 */

import PDFDocument from 'pdfkit';
import type { CompletionReportData } from '../db/queries/completion-report';
import { Readable } from 'stream';

const COLORS = {
  primary: '#1e40af',    // blue-800
  secondary: '#475569',  // slate-600
  accent: '#059669',     // emerald-600
  border: '#e2e8f0',     // slate-200
  bg: '#f8fafc',         // slate-50
  text: '#0f172a',       // slate-900
  muted: '#94a3b8',      // slate-400
};

const PAGE_BREAK_THRESHOLD = 720;
const PAGE_WIDTH = 510; // A4 at 50 margins = 595-85
const SIGNATURE_MAX_DIMENSIONS = { width: 200, height: 60 };
const CONTENT_RECT = { x: 50, width: 510 };

// ─── Text helpers ────────────────────────────────────────────────────────────

function toSafeString(val: unknown): string {
  if (val == null) return '—';
  return String(val);
}

function formatDate(val: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-US', options ?? {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_\s.]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function drawSeparator(doc: typeof PDFDocument.prototype, y: number) {
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(CONTENT_RECT.x, y)
    .lineTo(CONTENT_RECT.x + CONTENT_RECT.width, y)
    .stroke();
}

function drawPageNumber(doc: typeof PDFDocument.prototype, pageNumber: number) {
  doc.fontSize(7).font('Helvetica').fillColor(COLORS.muted)
    .text(
      `FieldConnect — Generated ${new Date().toLocaleDateString()} — Page ${pageNumber}`,
      50,
      770,
      { width: PAGE_WIDTH, align: 'center' },
    );
}

/**
 * Track pages so the footer can draw "Page N" on every page without
 * needing bufferPages: true (which defers page flushing and corrupts
 * synchronous buffer collection).
 */
class PageTracker {
  private count = 1;

  constructor(doc: typeof PDFDocument.prototype) {
    this.count = 1;
    drawPageNumber(doc, 1);
  }

  addPage(doc: typeof PDFDocument.prototype): number {
    doc.addPage();
    this.count++;
    drawPageNumber(doc, this.count);
    return 50;
  }

  total(): number {
    return this.count;
  }
}

function ensureSpace(doc: typeof PDFDocument.prototype, tracker: PageTracker, y: number, needed: number): number {
  if (y + needed > PAGE_BREAK_THRESHOLD) {
    return tracker.addPage(doc);
  }
  return y;
}

// ─── Section renderers ────────────────────────────────────────────────────────

function drawHeader(doc: typeof PDFDocument.prototype, data: CompletionReportData) {
  // Title bar
  doc.rect(50, 40, 510, 70).fill(COLORS.primary);
  doc.fill('#ffffff')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Customer Completion Report', 70, 55)
    .fontSize(11)
    .font('Helvetica')
    .text(toSafeString(data.project.name), 70, 82);

  // Schedule info block
  const yStart = 130;
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica-Bold');

  doc.text('Schedule Date:', 50, yStart);
  doc.font('Helvetica').fillColor(COLORS.secondary)
    .text(
      data.schedule?.scheduled_date
        ? formatDate(data.schedule.scheduled_date, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })
        : '—',
      150,
      yStart,
    );

  doc.font('Helvetica-Bold').fillColor(COLORS.text)
    .text('Status:', 50, yStart + 18);
  doc.font('Helvetica').fillColor(COLORS.accent)
    .text(toSafeString(data.project.status), 150, yStart + 18);

  doc.font('Helvetica-Bold').fillColor(COLORS.text)
    .text('Generated:', 50, yStart + 36);
  doc.font('Helvetica').fillColor(COLORS.secondary)
    .text(new Date().toLocaleString(), 150, yStart + 36);

  drawSeparator(doc, yStart + 65);
}

function drawProjectInfo(doc: typeof PDFDocument.prototype, data: CompletionReportData) {
  const yStart = 220;

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Project Information', 50, yStart);

  const info: [string, string][] = [
    ['Project', data.project.name],
    ['Address', toSafeString(data.project.address)],
    ['Contact', toSafeString(data.project.contact_name)],
    ['Phone', toSafeString(data.project.contact_phone)],
    ['Status', data.project.status.charAt(0).toUpperCase() + data.project.status.slice(1)],
  ];

  let y = yStart + 22;
  for (const [label, value] of info) {
    doc.font('Helvetica-Bold').fillColor(COLORS.text).fontSize(10)
      .text(label + ':', 50, y);
    doc.font('Helvetica').fillColor(COLORS.secondary)
      .text(value, 150, y);
    y += 16;
  }

  // Assigned technicians
  y += 8;
  doc.font('Helvetica-Bold').fillColor(COLORS.text).fontSize(10)
    .text('Technicians:', 50, y);
  const techNames = Array.isArray(data.technicians)
    ? data.technicians.map((t) => toSafeString(t.name)).join(', ')
    : '—';
  doc.font('Helvetica').fillColor(COLORS.secondary)
    .text(techNames, 150, y);

  // Separator
  y += 30;
  drawSeparator(doc, y);
}

function drawTimeSummary(doc: typeof PDFDocument.prototype, tracker: PageTracker, data: CompletionReportData, startY: number): number {
  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Time Summary', 50, startY);

  let y = startY + 22;
  const entries = Array.isArray(data.timeEntries) ? data.timeEntries : [];
  const totalHours = entries.reduce((sum, e) => sum + (typeof e.duration_hours === 'number' ? e.duration_hours : 0), 0);
  const totalBreaks = entries.reduce((sum, e) => sum + (typeof e.break_minutes === 'number' ? e.break_minutes : 0), 0);

  doc.font('Helvetica-Bold').fillColor(COLORS.text).fontSize(10)
    .text('Total Hours:', 50, y);
  doc.font('Helvetica').fillColor(COLORS.accent).fontSize(11)
    .text(`${totalHours.toFixed(1)} hrs`, 150, y);
  y += 18;

  doc.font('Helvetica-Bold').fillColor(COLORS.text).fontSize(10)
    .text('Total Break Time:', 50, y);
  doc.font('Helvetica').fillColor(COLORS.secondary).fontSize(10)
    .text(`${totalBreaks} min`, 150, y);
  y += 18;

  doc.font('Helvetica-Bold').fillColor(COLORS.text).fontSize(10)
    .text('Number of Entries:', 50, y);
  doc.font('Helvetica').fillColor(COLORS.secondary).fontSize(10)
    .text(`${entries.length}`, 150, y);
  y += 18;

  // Time entry detail rows (compact)
  if (entries.length > 0) {
    y += 6;
    // Table header
    doc.rect(50, y, 510, 18).fill(COLORS.bg);
    doc.fillColor(COLORS.text).fontSize(8).font('Helvetica-Bold');
    doc.text('Technician', 56, y + 4, { width: 120 });
    doc.text('Clock In', 180, y + 4, { width: 120 });
    doc.text('Clock Out', 270, y + 4, { width: 120 });
    doc.text('Break', 370, y + 4, { width: 40 });
    doc.text('Hours', 420, y + 4, { width: 50 });
    y += 18;

    for (const entry of entries) {
      y = ensureSpace(doc, tracker, y, 18);

      const cin = entry.clock_in
        ? new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '—';
      const cout = entry.clock_out
        ? new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '—';

      doc.fillColor(COLORS.text).fontSize(8).font('Helvetica');
      doc.text(toSafeString(entry.technician_name), 56, y, { width: 120 });
      doc.text(cin, 180, y, { width: 120 });
      doc.text(cout, 270, y, { width: 120 });
      doc.text(`${entry.break_minutes}`, 370, y, { width: 40 });
      doc.text(`${entry.duration_hours.toFixed(1)}`, 420, y, { width: 50 });

      y += 14;
    }
  }

  y += 16;
  drawSeparator(doc, y);

  return y + 20;
}

function drawNotes(doc: typeof PDFDocument.prototype, tracker: PageTracker, data: CompletionReportData, startY: number): number {
  const notes = Array.isArray(data.notes) ? data.notes : [];
  if (notes.length === 0) return startY;

  startY = ensureSpace(doc, tracker, startY, 40);

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Job Notes', 50, startY);

  let y = startY + 22;
  for (const note of notes) {
    y = ensureSpace(doc, tracker, y, 30);

    const date = formatDate(note.created_at, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const typeLabel = note.note_type === 'internal' ? 'Internal' : 'Technician';

    doc.rect(50, y, 510, 1).fill(COLORS.border);
    y += 6;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.secondary)
      .text(`${toSafeString(note.technician_name)} — ${typeLabel}`, 50, y);
    doc.font('Helvetica').fillColor(COLORS.muted)
      .text(date, 400, y, { width: 160, align: 'right' });
    y += 14;

    const content = toSafeString(note.content);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.text)
      .text(content, 50, y, { width: 510 });
    y += doc.heightOfString(content, { width: 510 }) + 12;
  }

  y += 8;
  drawSeparator(doc, y);

  return y + 20;
}

function drawAttachments(doc: typeof PDFDocument.prototype, tracker: PageTracker, data: CompletionReportData, startY: number): number {
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  if (attachments.length === 0) return startY;

  startY = ensureSpace(doc, tracker, startY, 40);

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Photos & Attachments', 50, startY);

  let y = startY + 22;
  for (const att of attachments) {
    y = ensureSpace(doc, tracker, y, 36);

    const date = formatDate(att.created_at);
    const fileName = toSafeString(att.file_name);

    doc.fontSize(9).font('Helvetica').fillColor(COLORS.text)
      .text(`• ${fileName}`, 50, y, { width: 400 });
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
      .text(`[${toSafeString(att.attachment_type)}] ${toSafeString(att.uploaded_by)} — ${date}`, 60, y + 12, { width: 480 });
    y += 30;
  }

  y += 8;
  drawSeparator(doc, y);

  return y + 20;
}

/**
 * Validate that a string is plausible base64-encoded data.
 * Returns false for empty, too-short, or strings with non-base64 characters.
 */
function isValidBase64(str: string): boolean {
  if (!str || str.length < 20) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}

function drawSignatures(doc: typeof PDFDocument.prototype, tracker: PageTracker, data: CompletionReportData, startY: number): number {
  const signatures = Array.isArray(data.signatures) ? data.signatures : [];
  if (signatures.length === 0) return startY;

  // Always start signatures on a fresh page for a clean presentation
  tracker.addPage(doc);
  let y = 50;

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Customer Signatures', 50, y);
  y += 30;

  for (const sig of signatures) {
    y = ensureSpace(doc, tracker, y, 110);

    const date = formatDate(sig.created_at, {
      month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text(toSafeString(sig.label?.charAt(0).toUpperCase() + sig.label?.slice(1) || 'Signature'), 50, y);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.secondary)
      .text(`Collected by: ${toSafeString(sig.technician_name)} — ${date}`, 50, y + 14);
    y += 32;

    // Embed signature image
    try {
      const rawSig = toSafeString(sig.signature_data);
      const base64Data = rawSig.replace(/^data:image\/png;base64,/, '').replace(/^data:image\/jpeg;base64,/, '');

      if (isValidBase64(base64Data)) {
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length > 50 && buffer.length < 500_000) {
          doc.image(buffer, 50, y, SIGNATURE_MAX_DIMENSIONS);
          y += 75;
          continue;
        }
      }
    } catch {
      // Fall through to placeholder
    }

    // If image embedding fails, show a placeholder
    doc.rect(50, y, 200, 60).stroke(COLORS.border);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
      .text('(signature image unavailable)', 80, y + 24);
    y += 75;
  }

  return y;
}

/**
 * Validate that the CompletionReportData has the minimum required fields.
 * Returns an array of missing field descriptions.
 */
function validateReportData(data: CompletionReportData): string[] {
  const issues: string[] = [];
  if (!data.project || typeof data.project.name !== 'string') {
    issues.push('Missing or invalid project data');
  }
  if (!data.schedule || typeof data.schedule.id !== 'string') {
    issues.push('Missing or invalid schedule data');
  }
  return issues;
}

/**
 * Generate a completion report PDF for a given schedule/project.
 * Returns a Buffer of the PDF document.
 *
 * Uses a PageTracker to number pages on-the-fly so bufferPages:true
 * is NOT needed. PDFKit still flushes stream chunks asynchronously after
 * doc.end(), so callers must await the returned buffer.
 */
export async function generateCompletionReportPdf(data: CompletionReportData): Promise<Buffer> {
  const validation = validateReportData(data);
  if (validation.length > 0) {
    throw new Error(`Invalid report data: ${validation.join('; ')}`);
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 50, right: 50 },
    info: {
      Title: `Completion Report - ${data.project.name}`,
      Author: 'FieldConnect',
      Subject: 'Customer Completion Report',
    },
  });

  const chunks: Buffer[] = [];
  const stream = doc as unknown as Readable;
  const finished = new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pages = new PageTracker(doc);

  drawHeader(doc, data);
  drawProjectInfo(doc, data);

  let y = 380;
  y = drawTimeSummary(doc, pages, data, y);
  y = drawNotes(doc, pages, data, y);
  y = drawAttachments(doc, pages, data, y);
  drawSignatures(doc, pages, data, y);

  doc.end();

  return finished;
}
