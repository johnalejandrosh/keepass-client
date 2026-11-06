import { readJson, route } from '@/server/http';
import { addAttachment, MAX_ATTACHMENT, VaultError } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Adjuntos: se suben en JSON (base64)
export const POST = route<{ uuid: string }>(async (req, { uuid }) => {
  const { name, data, overwrite } = await readJson<{ name: string; data: string; overwrite: boolean }>(
    req,
    Math.ceil((MAX_ATTACHMENT * 4) / 3) + 64 * 1024,
  );
  if (!name || typeof data !== 'string') throw new VaultError('Faltan el nombre o el contenido');
  return addAttachment(uuid, name, Buffer.from(data, 'base64'), Boolean(overwrite));
});
