import { HttpError, authorize } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { seedDatabase } from '../../../scripts/seed-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ONE-TIME demo-data loader for a deployment that cannot run `npm run seed` locally.
 *
 * DESTRUCTIVE: wipes users, roles, projects, lots, items, activity and attachments in
 * the configured database, then loads the demo archive and the main admin account.
 * Dropdown lists and settings survive. Requires a signed-in user holding
 * `user:manage` (admin) AND typing WIPE. After it runs, the signed-in account no
 * longer exists — sign in again as admin@gmail.com.
 * DELETE THIS FILE once the data is loaded.
 */

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Load demo data</title><style>body{font:16px system-ui;margin:0;padding:20px;max-width:560px}` +
      `input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:6px 0}button{background:#b3261e;color:#fff;border:0;border-radius:6px}` +
      `pre{white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:6px}</style>${body}`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

async function requireAdmin(): Promise<Response | null> {
  try {
    await authorize('user:manage');
    return null;
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return page(
      `<h2>${status === 401 ? 'Sign in first' : 'Admins only'}</h2><p>${
        status === 401
          ? 'Open the site, sign in as an admin, then come back to this page.'
          : 'Your role cannot load demo data. Sign in as an admin.'
      }</p>`,
      status,
    );
  }
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return page(
    `<h2>Load demo data</h2>
     <p><b>This deletes all users, roles, lots, items and activity</b> in this database, then loads 10 projects / 35 lots and the admin account <code>admin@gmail.com</code>. You will be signed out; sign in again as that account.</p>
     <form method="post">
       <input name="confirm" placeholder="Type WIPE to confirm" autocomplete="off" required>
       <button>Wipe and load demo data</button>
     </form>`,
  );
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const form = await req.formData();
  const confirm = String(form.get('confirm') ?? '').trim();
  if (confirm !== 'WIPE') {
    return page('<h2>Not confirmed</h2><p>You did not type WIPE. Nothing was changed.</p>', 400);
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
      'Now delete src/app/setup-seed.',
    );
    return page(`<h2>Done</h2><pre>${lines.join('\n')}</pre>`);
  } catch (e) {
    lines.push('', `FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return page(`<h2>Failed</h2><pre>${lines.join('\n')}</pre>`, 500);
  }
}
