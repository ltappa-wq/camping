// Minimal CSV builder. Quotes any cell containing comma, quote, or newline
// per RFC 4180; doubles embedded quotes. UTF-8 with a BOM so Excel treats
// non-ASCII characters correctly.

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const headerLine = headers.map(escapeCell).join(",");
  const rowLines = rows.map((r) => r.map(escapeCell).join(","));
  return "﻿" + [headerLine, ...rowLines].join("\r\n");
}

export function csvHeaders(filename: string): Headers {
  return new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
}
