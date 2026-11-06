import { ErrorCode, KpxError } from '@/server/keepassxc';
import { route } from '@/server/http';
import { allKeys, kpx, requireAssociation } from '@/server/kpx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAssociation();
  try {
    const r = await kpx.call('get-database-groups', { keys: await allKeys() });
    return { groups: r.groups?.groups ?? r.groups ?? [], defaultGroup: r.defaultGroup ?? null };
  } catch (e) {
    if (e instanceof KpxError && e.code === ErrorCode.NO_GROUPS_FOUND) return { groups: [] };
    throw e;
  }
});
