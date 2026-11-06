import { ErrorCode, KpxError } from '@/server/keepassxc';
import { route } from '@/server/http';
import { kpx } from '@/server/kpx';
import { lockVault } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  lockVault();
  try {
    await kpx.call('lock-database');
  } catch (e) {
    // KeePassXC responde "Database not opened" justo después de bloquear
    if (!(e instanceof KpxError && e.code === ErrorCode.DATABASE_NOT_OPENED)) throw e;
  }
  return { ok: true };
});
