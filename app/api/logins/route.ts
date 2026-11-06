import { KpxError } from '@/server/keepassxc';
import { HttpError, readJson, route } from '@/server/http';
import { kpx, normalizeUrl, requireAssociation } from '@/server/kpx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { url: string; login: string; password: string; group: string; groupUuid: string; uuid: string };

export const POST = route(async (req) => {
  const b = await readJson<Body>(req);
  if (!b.password) throw new HttpError('Falta contraseña', 400);
  const { assoc } = await requireAssociation();
  const url = normalizeUrl(b.url ?? '');
  const r = await kpx.call(
    'set-login',
    {
      url,
      submitUrl: url,
      id: assoc.id,
      login: b.login ?? '',
      password: b.password,
      group: b.group ?? '',
      groupUuid: b.groupUuid ?? '',
      ...(b.uuid ? { uuid: b.uuid } : {}),
      downloadFavicon: 'false',
    },
    { timeoutMs: 120_000 }, // al actualizar, KeePassXC puede pedir confirmación
  );
  if (r.success !== 'true') throw new KpxError('KeePassXC no guardó la entrada');
  return { ok: true };
});
