import { route } from '@/server/http';
import { getLogins, normalizeUrl } from '@/server/kpx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const url = normalizeUrl(req.nextUrl.searchParams.get('url') ?? '');
  const entries = await getLogins(url);
  // Las contraseñas nunca salen en el listado; se piden una a una con /api/reveal.
  return {
    url,
    entries: entries.map((e) => ({
      uuid: e.uuid,
      name: e.name,
      login: e.login,
      group: e.group,
      hasTotp: Boolean(e.totp),
      expired: e.expired === 'true',
    })),
  };
});
