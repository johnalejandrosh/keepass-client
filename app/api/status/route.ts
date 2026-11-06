import { KpxConnectionError } from '@/server/keepassxc';
import { route } from '@/server/http';
import { currentDbHash, kpx } from '@/server/kpx';
import { loadAssociations } from '@/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  try {
    await kpx.ensureReady();
  } catch (e) {
    if (e instanceof KpxConnectionError) {
      return { connected: false, socketPath: kpx.socketPath, error: e.message };
    }
    throw e;
  }
  const hash = await currentDbHash();
  if (!hash) return { connected: true, unlocked: false, associated: false, version: kpx.serverVersion };

  const assoc = (await loadAssociations())[hash];
  let associated = false;
  if (assoc) {
    try {
      const r = await kpx.call('test-associate', { id: assoc.id, key: assoc.key });
      associated = r.success === 'true';
    } catch {
      associated = false; // la asociación fue borrada en KeePassXC
    }
  }
  return { connected: true, unlocked: true, associated, associationId: assoc?.id, version: kpx.serverVersion };
});
