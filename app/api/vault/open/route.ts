import { readJson, route } from '@/server/http';
import { openVault } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) =>
  openVault(await readJson<{ dbPath: string; password: string; keyFile: string }>(req, 16 * 1024)),
);
