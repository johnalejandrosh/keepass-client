import { HttpError, readJson, route } from '@/server/http';
import { getLogins, normalizeUrl } from '@/server/kpx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const { url, uuid } = await readJson<{ url: string; uuid: string }>(req);
  if (!uuid) throw new HttpError('Falta uuid', 400);
  const entry = (await getLogins(normalizeUrl(url ?? ''))).find((e) => e.uuid === uuid);
  if (!entry) throw new HttpError('Entrada no encontrada', 404);
  return { password: entry.password, totp: entry.totp ?? null };
});
