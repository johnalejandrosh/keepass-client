import { readJson, route } from '@/server/http';
import { entryInput } from '@/server/input';
import { createEntry, listEntries } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(() => listEntries());

// Cada operación de edición guarda el .kdbx y lo relee.
export const POST = route(async (req) => createEntry(entryInput(await readJson(req))));
