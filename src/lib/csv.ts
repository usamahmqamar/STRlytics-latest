/** Limits and helpers that keep CSV import/export safe. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_CSV_ROWS = 5000;
export const MAX_CELL_LENGTH = 500;

/** Returns an error message if the file should not be imported, otherwise null. */
export function csvFileProblem(file: File): string | null {
  if (!/\.csv$/i.test(file.name)) return 'Please choose a .csv file.';
  if (file.size > MAX_CSV_BYTES) return 'CSV file is too large (maximum 5 MB).';
  return null;
}

/** Papa.parse options shared by every import: cap rows and trim oversized cells. */
export const safeParseOptions = {
  header: true,
  skipEmptyLines: true,
  preview: MAX_CSV_ROWS,
  transform: (value: string) => (typeof value === 'string' ? value.slice(0, MAX_CELL_LENGTH) : value),
} as const;

/** Papa.unparse options: neutralise cells that spreadsheet apps would run as formulas (=, +, -, @). */
export const safeUnparseOptions = { escapeFormulae: true } as const;
