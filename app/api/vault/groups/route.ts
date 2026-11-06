import { readJson, route } from '@/server/http';
import { createGroup, deleteGroup, VaultError } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const b = await readJson<{ parent: string; name: string }>(req);
  return createGroup(b.parent ?? '', b.name ?? '');
});

export const DELETE = route(async (req) => {
  const b = await readJson<{ group: string }>(req);
  if (!b.group) throw new VaultError('Falta la carpeta');
  return deleteGroup(b.group);
});
