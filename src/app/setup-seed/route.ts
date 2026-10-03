import { timingSafeEqual } from 'node:crypto';
import { connectToDatabase } from '@/lib/mongo';
import { seedDatabase } from '../../../scripts/seed-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ONE-TIME demo-data loader for a deployment that cannot run `npm run seed` locally.
 *
 * DESTRUCTIVE: wipes users, roles, projects, lots, items, activity and attachments in
 * the configured database, then loads the demo archive and the main admin account.
 * Dropdown lists and settings survive. Disabled unless the `SEED_TOKEN` environment
 * variable is set (12+ characters); a request must present it AND type WIPE.
 * DELETE THIS FILE (and its entry in src/proxy.ts) once the data is loaded.
 */

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Load demo data</title><style>body{font:16px system-ui;margin:0;padding:20px;max-width:560px}` +
      `input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:6px 0}button{background:#b3261e;color:#fff;border:0;border-radius:6px}` +
      `pre{white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:6px}</style>${body}`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

function tokenOk(given: string): boolean {
  const expected = process.env.SEED_TOKEN ?? '';
  if (expected.length < 12) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET() {
  if ((process.env.SEED_TOKEN ?? '').length < 12) {
    return page('<h2>Disabled</h2><p>Set a <code>SEED_TOKEN</code> environment variable (12+ characters) and redeploy.</p>', 404);
  }
  return page(
    `<h2>Load demo data</h2>
     <p><b>This deletes all users, roles, lots, items and activity</b> in this database, then loads 10 projects / 35 lots and the admin account <code>admin@gmail.com</code>.</p>
     <form method="post">
       <input name="token" type="password" placeholder="SEED_TOKEN" autocomplete="off" required>
       <input name="confirm" placeholder="Type WIPE to confirm" autocomplete="off" required>
       <button>Wipe and load demo data</button>
     </form>`,
  );
}

export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  const confirm = String(form.get('confirm') ?? '').trim();
  if (!tokenOk(token) || confirm !== 'WIPE') {
    return page('<h2>Refused</h2><p>Wrong token, or you did not type WIPE.</p>', 403);
  }
  const lines: string[] = [];
  try {
    await connectToDatabase();
    const r = await seedDatabase((m) => lines.push(m));
    lines.push(
      '',
      'Seed complete.',
      `  users ${r.users} · projects ${r.projects} · lots ${r.lots} · items ${r.items}`,
      "  Sign in: admin@gmail.com (or username 'admin'). Other seed users: password per SEED_DEV_PASSWORD.",
      '',
      'Now delete src/app/setup-seed and remove SEED_TOKEN.',
    );
    return page(`<h2>Done</h2><pre>${lines.join('\n')}</pre>`);
  } catch (e) {
    lines.push('', `FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return page(`<h2>Failed</h2><pre>${lines.join('\n')}</pre>`, 500);
  }
}
