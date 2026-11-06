/**
 * Envoltorio común de los Route Handlers: seguridad, límites de cuerpo y mapeo de errores
 * (equivale al hook onRequest y al setErrorHandler que había en Fastify).
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ErrorCode, KpxConnectionError, KpxError } from './keepassxc';
import { VaultError } from './vault';

export const PORT = Number(process.env.PORT ?? 4717);

// Host permitido (evita DNS rebinding)
export const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

export class HttpError extends Error {
  constructor(message: string, public statusCode = 500) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function toResponse(err: unknown) {
  if (err instanceof VaultError) return json({ error: err.message }, err.statusCode);
  if (err instanceof HttpError) return json({ error: err.message }, err.statusCode);
  if (err instanceof KpxConnectionError) return json({ error: err.message }, 503);
  if (err instanceof KpxError) {
    const status = err.code === ErrorCode.DATABASE_NOT_OPENED ? 409 : 502;
    return json({ error: err.message, code: err.code }, status);
  }
  console.error(err);
  return json({ error: (err as Error)?.message ?? 'Error interno' }, 500);
}

type Ctx<P> = { params: Promise<P> };

/**
 * - Rechaza Host ajeno (DNS rebinding) y peticiones sin `X-Requested-With: kpx-dashboard`
 *   (CSRF: otras webs no pueden mandarla sin preflight CORS, y aquí no se habilita CORS).
 * - Si el handler devuelve un objeto plano, se serializa como JSON con `Cache-Control: no-store`.
 */
export function route<P = Record<string, string>>(
  handler: (req: NextRequest, params: P) => Promise<unknown> | unknown,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    if (!allowedHosts.has(req.headers.get('host') ?? '')) return json({ error: 'Host no permitido' }, 403);
    if (req.headers.get('x-requested-with') !== 'kpx-dashboard') {
      return json({ error: 'Falta cabecera X-Requested-With' }, 403);
    }
    try {
      const result = await handler(req, await ctx.params);
      if (result instanceof Response) {
        result.headers.set('Cache-Control', 'no-store');
        return result;
      }
      return json(result);
    } catch (err) {
      return toResponse(err);
    }
  };
}

/** Lee el cuerpo JSON con un tope de tamaño (Fastify tenía bodyLimit). Cuerpo vacío → {}. */
export async function readJson<T = Record<string, unknown>>(req: NextRequest, limit = 1024 * 1024): Promise<Partial<T>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > limit) throw new HttpError('Cuerpo demasiado grande', 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > limit) throw new HttpError('Cuerpo demasiado grande', 413);
  if (!text) return {};
  try {
    return JSON.parse(text) ?? {};
  } catch {
    throw new HttpError('JSON inválido', 400);
  }
}
