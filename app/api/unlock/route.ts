import { ErrorCode, KpxError } from '@/server/keepassxc';
import { route } from '@/server/http';
import { kpx } from '@/server/kpx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// KeePassXC muestra su diálogo de desbloqueo; el tablero nunca ve la contraseña maestra.
export const POST = route(async () => {
  try {
    await kpx.call('get-databasehash', {}, { triggerUnlock: true });
  } catch (e) {
    if (!(e instanceof KpxError && e.code === ErrorCode.DATABASE_NOT_OPENED)) throw e;
  }
  return { ok: true };
});
