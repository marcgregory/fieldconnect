/**
 * PDF generation service for customer completion reports.
 *
 * Uses PDFKit to render a professional completion summary with
 * project info, time breakdown, job notes, photo listings, and signatures.
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

function drawHeader(doc: typeof PDFDocument.prototype, data: CompletionReportData) {
  // Title bar
  doc.rect(50, 40, 510, 70).fill(COLORS.primary);
  doc.fill('#ffffff')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Customer Completion Report', 70, 55)
    .fontSize(11)
    .font('Helvetica')
    .text(data.project.name, 70, 82);

  // Schedule info block
  const yStart = 130;
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica-Bold');

  doc.text('Schedule Date:', 50, yStart);
  doc.font('Helvetica').fillColor(COLORS.secondary)
    .text(new Date(data.schedule!.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }), 150, yStart);

  doc.font('Helvetica-Bold').fillColor(COLORS.text)
    .text('Status:', 50, yStart + 18);
  doc.font('Helvetica').fillColor(COLORS.accent)
    .text(data.project.status, 150, yStart + 18);

  doc.font('Helvetica-Bold').fillColor(COLORS.text)
    .text('Generated:', 50, yStart + 36);
  doc.font('Helvetica').fillColor(COLORS.secondary)
    .text(new Date().toLocaleString(), 150, yStart + 36);

  // Separator
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(50, yStart + 65)
    .lineTo(560, yStart + 65)
    .stroke();
}

function drawProjectInfo(doc: typeof PDFDocument.prototype, data: CompletionReportData) {
  const yStart = 220;

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Project Information', 50, yStart);

  const info: [string, string][] = [
    ['Project', data.project.name],
    ['Address', data.project.address || '—'],
    ['Contact', data.project.contact_name || '—'],
    ['Phone', data.project.contact_phone || '—'],
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
  const techNames = data.technicians.map((t) => t.name).join(', ');
  doc.font('Helvetica').fillColor(COLORS.secondary)
    .text(techNames, 150, y);

  // Separator
  y += 30;
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(50, y)
    .lineTo(560, y)
    .stroke();
}

function drawTimeSummary(doc: typeof PDFDocument.prototype, data: CompletionReportData, startY: number): number {
  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Time Summary', 50, startY);

  let y = startY + 22;
  const totalHours = data.timeEntries.reduce((sum, e) => sum + e.duration_hours, 0);
  const totalBreaks = data.timeEntries.reduce((sum, e) => sum + e.break_minutes, 0);

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
    .text(`${data.timeEntries.length}`, 150, y);
  y += 18;

  // Time entry detail rows (compact)
  if (data.timeEntries.length > 0) {
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

    for (const entry of data.timeEntries) {
      const cin = new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const cout = entry.clock_out
        ? new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '—';

      doc.fillColor(COLORS.text).fontSize(8).font('Helvetica');
      doc.text(entry.technician_name, 56, y, { width: 120 });
      doc.text(cin, 180, y, { width: 120 });
      doc.text(cout, 270, y, { width: 120 });
      doc.text(`${entry.break_minutes}`, 370, y, { width: 40 });
      doc.text(`${entry.duration_hours.toFixed(1)}`, 420, y, { width: 50 });

      y += 14;

      // Page break if needed
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
    }
  }

  y += 16;
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(50, y).lineTo(560, y).stroke();

  return y + 20;
}

function drawNotes(doc: typeof PDFDocument.prototype, data: CompletionReportData, startY: number): number {
  if (data.notes.length === 0) return startY;

  // Check if we need a new page
  if (startY > 650) {
    doc.addPage();
    startY = 50;
  }

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Job Notes', 50, startY);

  let y = startY + 22;
  for (const note of data.notes) {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }

    const date = new Date(note.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const typeLabel = note.note_type === 'internal' ? 'Internal' : 'Technician';

    doc.rect(50, y, 510, 1).fill(COLORS.border);
    y += 6;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.secondary)
      .text(`${note.technician_name} — ${typeLabel}`, 50, y);
    doc.font('Helvetica').fillColor(COLORS.muted)
      .text(date, 400, y, { width: 160, align: 'right' });
    y += 14;

    doc.fontSize(9).font('Helvetica').fillColor(COLORS.text)
      .text(note.content, 50, y, { width: 510 });
    y += doc.heightOfString(note.content, { width: 510 }) + 12;
  }

  y += 8;
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(50, y).lineTo(560, y).stroke();

  return y + 20;
}

function drawAttachments(doc: typeof PDFDocument.prototype, data: CompletionReportData, startY: number): number {
  if (data.attachments.length === 0) return startY;

  if (startY > 650) {
    doc.addPage();
    startY = 50;
  }

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Photos & Attachments', 50, startY);

  let y = startY + 22;
  for (const att of data.attachments) {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }

    const date = new Date(att.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    doc.fontSize(9).font('Helvetica').fillColor(COLORS.text)
      .text(`• ${att.file_name}`, 50, y, { width: 400 });
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
      .text(`[${att.attachment_type}] ${att.uploaded_by} — ${date}`, 60, y + 12, { width: 480 });
    y += 30;
  }

  y += 8;
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(50, y).lineTo(560, y).stroke();

  return y + 20;
}

function drawSignatures(doc: typeof PDFDocument.prototype, data: CompletionReportData, startY: number): number {
  if (data.signatures.length === 0) return startY;

  // Always start signatures on a fresh page for a clean presentation
  doc.addPage();
  let y = 50;

  doc.fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('Customer Signatures', 50, y);
  y += 30;

  for (const sig of data.signatures) {
    if (y > 600) {
      doc.addPage();
      y = 50;
    }

    const date = new Date(sig.created_at).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text(sig.label.charAt(0).toUpperCase() + sig.label.slice(1), 50, y);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.secondary)
      .text(`Collected by: ${sig.technician_name} — ${date}`, 50, y + 14);
    y += 32;

    // Embed signature image
    try {
      const base64Data = sig.signature_data.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      doc.image(buffer, 50, y, { width: 200, height: 60 });
      y += 75;
    } catch {
      // If image embedding fails, show a placeholder
      doc.rect(50, y, 200, 60).stroke(COLORS.border);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
        .text('(signature image unavailable)', 80, y + 24);
      y += 75;
    }
  }

  return y;
}

function drawFooter(doc: typeof PDFDocument.prototype) {
  for (let i = 1; i <= doc.bufferedPageRange().count; i++) {
    doc.switchToPage(i - 1);
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.muted)
      .text(
        `FieldConnect — Generated ${new Date().toLocaleDateString()} — Page ${i}`,
        50,
        770,
        { width: 510, align: 'center' },
      );
  }
}

/**
 * Generate a completion report PDF for a given schedule/project.
 * Returns a Buffer of the PDF document.
 */
export function generateCompletionReportPdf(data: CompletionReportData): Buffer {
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
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  drawHeader(doc, data);
  drawProjectInfo(doc, data);

  let y = 380;
  y = drawTimeSummary(doc, data, y);
  y = drawNotes(doc, data, y);
  y = drawAttachments(doc, data, y);
  drawSignatures(doc, data, y);

  drawFooter(doc);

  doc.end();

  return Buffer.concat(chunks);
}
