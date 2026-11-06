import { route } from '@/server/http';
import { lockVault } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(() => {
  lockVault();
  return { ok: true };
});
