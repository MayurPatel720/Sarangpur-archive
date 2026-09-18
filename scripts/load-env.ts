/**
 * Loads environment variables for standalone scripts the same way Next.js does.
 *
 * This exists because of a trap that costs everyone an hour exactly once:
 * `import 'dotenv/config'` reads `.env` and nothing else. It does NOT read
 * `.env.local`. Next.js loads the full cascade itself when the app boots, so the app
 * works while `npm run seed` reports that MONGODB_URI is unset — with the file sitting
 * right there.
 *
 * `@next/env` is the loader Next uses internally (it ships with next, so this adds no
 * dependency). It applies the real precedence:
 *
 *   .env.development.local  →  .env.local  →  .env.development  →  .env
 *
 * Import this module first, before anything that reads process.env.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

/** Read a required variable, failing with a message that says what to actually do. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value;

  throw new Error(
    [
      `${name} is not set.`,
      '',
      `  Looked in .env.local, .env.development.local, .env.development and .env`,
      `  under ${process.cwd()}`,
      '',
      '  If .env.local exists, check that:',
      '    • the file is named exactly ".env.local" — Notepad likes to add a hidden',
      '      ".txt", so run `dir .env*` and confirm there is no .env.local.txt',
      `    • it contains a line starting with ${name}=`,
      '    • there are no quotes around the value and no spaces around the =',
    ].join('\n'),
  );
}
