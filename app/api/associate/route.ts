import nacl from 'tweetnacl';
import { ErrorCode, KpxError } from '@/server/keepassxc';
import { route } from '@/server/http';
import { currentDbHash, kpx } from '@/server/kpx';
import { removeAssociation, saveAssociation } from '@/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  const idKey = nacl.box.keyPair();
  const idPub = Buffer.from(idKey.publicKey).toString('base64');
  // Igual que keepassxc-browser: "key" = clave de la sesión, "idKey" = identificador persistente.
  await kpx.ensureReady();
  const r = await kpx.call(
    'associate',
    { key: kpx.sessionPublicKey, idKey: idPub },
    { timeoutMs: 180_000 }, // el usuario debe aprobar y poner nombre en KeePassXC
  );
  if (r.success !== 'true' || !r.id || !r.hash) throw new KpxError('Asociación rechazada', ErrorCode.ASSOCIATION_FAILED);
  await saveAssociation(r.hash, { id: r.id, key: idPub, createdAt: new Date().toISOString() });
  return { ok: true, id: r.id };
});

export const DELETE = route(async () => {
  const hash = await currentDbHash();
  if (hash) await removeAssociation(hash);
  return { ok: true };
});
