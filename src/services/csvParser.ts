// File: src/services/csvParser.ts
/**
 * Low-level CSV helpers for German bank exports (Volksbank).
 * Pure functions without app state, so they are easy to test.
 */

/**
 * Decode raw file bytes. Volksbank exports are UTF-8 in newer versions and
 * Windows-1252 (ANSI) in older ones. Reading ANSI as UTF-8 breaks umlauts
 * ("Tierärztin" -> "Tier�rztin"), so we try strict UTF-8 first.
 */
export function decodeCSVBuffer(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  // Strip byte order mark
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse semicolon separated CSV content into rows.
 * Handles quoted fields, escaped quotes ("") and line breaks inside quotes
 * (multi-line purpose texts used to break a booking into two invalid rows).
 */
export function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  const pushRow = () => {
    row.push(current.trim());
    // Skip completely empty lines
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    current = '';
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"'; // Escaped quote inside a quoted field
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && content[i + 1] === '\n') i++;
      pushRow();
    } else if ((char === '\n' || char === '\r') && inQuotes) {
      // Line break inside a field: keep the text readable on one line
      if (char === '\r' && content[i + 1] === '\n') i++;
      current += ' ';
    } else {
      current += char;
    }
  }
  if (current !== '' || row.length > 0) pushRow();

  return rows;
}

/**
 * Parse German date format (DD.MM.YYYY) to ISO string.
 * Returns null for missing or invalid dates (never silently "today").
 */
export function parseGermanDate(dateStr: string): string | null {
  const match = (dateStr || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!match) return null;

  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  if (isNaN(date.getTime())) return null;

  return date.toISOString();
}

/**
 * Parse German amount format (1.234,56 or -1.234,56) to number.
 * Returns null if the field cannot be read (never silently 0).
 */
export function parseGermanAmount(amountStr: string): number | null {
  const normalized = (amountStr || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;

  return parseFloat(normalized);
}
