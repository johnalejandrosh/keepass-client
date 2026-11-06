import { readJson, route } from '@/server/http';
import { entryTotp, VaultError } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const b = await readJson<{ uuid: string }>(req);
  if (!b.uuid) throw new VaultError('Falta uuid');
  return entryTotp(b.uuid);
});
