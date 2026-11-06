import { route } from '@/server/http';
import { getAttachment, removeAttachment } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { uuid: string; name: string };

// Adjuntos: se descargan en binario
export const GET = route<P>(async (_req, { uuid, name }) => {
  const data = await getAttachment(uuid, name);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

export const DELETE = route<P>((_req, { uuid, name }) => removeAttachment(uuid, name));
