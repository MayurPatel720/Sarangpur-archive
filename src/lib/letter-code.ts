import { PENDING_CODE_PREFIX } from '@/lib/domain';

/**
 * A letter's code is the name of its scanned file: the file name without its extension
 * ("Letter 1998-04-12 Mumbai.pdf" -> "Letter 1998-04-12 Mumbai"). Pure: shared by the window and the server.
 */
export const MAX_LETTER_CODE = 120;
const FORBIDDEN = /[\\/:*?"<>|]/;

/** The code a file name stands for ('' when nothing usable is left). */
export function letterCodeOfFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return base.replace(/\s+/g, ' ').trim();
}

/** Why a code cannot be used, or null. */
export function letterCodeError(code: string): string | null {
  if (!code) return 'The file name is empty.';
  if (code.length > MAX_LETTER_CODE) return `The code is longer than ${MAX_LETTER_CODE} characters.`;
  if (FORBIDDEN.test(code)) return 'A code cannot contain / \\ : * ? " < > |';
  if (code.startsWith(PENDING_CODE_PREFIX)) return `A code cannot start with ${PENDING_CODE_PREFIX}`;
  return null;
}
