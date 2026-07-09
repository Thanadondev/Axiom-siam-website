/**
 * Minimal RFC 4180 CSV writer, hardened against spreadsheet formula injection.
 *
 * Excel/Sheets execute a cell that begins with = + - @ (or tab/CR). A hostile
 * user can put `=HYPERLINK(...)` in their company name and attack whoever
 * opens the export. We prefix those cells with a single quote.
 */

const DANGEROUS = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (DANGEROUS.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  // BOM so Excel opens Thai text as UTF-8 instead of mojibake
  return "﻿" + lines.join("\r\n") + "\r\n";
}
