/**
 * Turns the ticket + attachments into the initial user message content blocks.
 *
 * - Images are inlined as native multimodal image blocks so the worker sees them
 *   immediately (the spec wants pasted images read natively by Claude).
 * - Spreadsheets are parsed to text (sheet → CSV) and included, since the model
 *   can't read raw .xlsx bytes — the worker still has to interpret the data and
 *   drive the UI itself.
 * - Every attachment's path is listed so the worker can re-read it with Read/Bash.
 */
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import type { Attachment } from './contract.js';

/** Anthropic content-block shapes we emit (kept loose to avoid SDK type coupling). */
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const SHEET_EXT = /\.(xlsx|xls|xlsm|csv)$/i;

function isSpreadsheet(a: Attachment): boolean {
  return (
    SHEET_EXT.test(a.name) ||
    a.mediaType.includes('spreadsheet') ||
    a.mediaType === 'application/vnd.ms-excel' ||
    a.mediaType === 'text/csv'
  );
}

async function spreadsheetToText(a: Attachment): Promise<string> {
  const buf = await readFile(a.path);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    parts.push(`# Sheet: ${name}\n${csv.trim()}`);
  }
  return parts.join('\n\n') || '(empty workbook)';
}

export async function buildInitialContent(
  ticket: string,
  attachments: Attachment[],
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  const ticketText =
    `# Ticket\n\n${ticket.trim()}\n\n` +
    (attachments.length
      ? `# Attachments\n${attachments
          .map((a) => `- ${a.name} (${a.mediaType}) — path: ${a.path}`)
          .join('\n')}\n`
      : '');
  blocks.push({ type: 'text', text: ticketText });

  for (const a of attachments) {
    if (IMAGE_TYPES.has(a.mediaType)) {
      const data = (await readFile(a.path)).toString('base64');
      blocks.push({ type: 'text', text: `Image attachment "${a.name}":` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data } });
    } else if (isSpreadsheet(a)) {
      let text: string;
      try {
        text = await spreadsheetToText(a);
      } catch (err) {
        text = `(failed to parse spreadsheet: ${(err as Error).message}; read it yourself at ${a.path})`;
      }
      blocks.push({
        type: 'text',
        text: `Spreadsheet attachment "${a.name}" parsed to CSV (original at ${a.path}):\n\n${text}`,
      });
    }
    // Other types (PDF, etc.): the path is listed above; the worker can Read it.
  }

  return blocks;
}
