import { NextResponse, type NextRequest } from 'next/server';

const PORT = Number(process.env.PORT ?? 4717);
const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

/**
 * Rechaza peticiones con otro Host (DNS rebinding) para las páginas y los estáticos.
 * La API hace su propia comprobación en server/http.ts (además de X-Requested-With), y se excluye
 * aquí para no pasar los cuerpos grandes (adjuntos de hasta 16 MB) por el proxy.
 */
export function proxy(req: NextRequest) {
  if (!allowedHosts.has(req.headers.get('host') ?? '')) {
    return NextResponse.json({ error: 'Host no permitido' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api/).*)'] };
