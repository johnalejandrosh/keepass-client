import { readJson, route } from '@/server/http';
import { entryInput } from '@/server/input';
import { deleteEntry, updateEntry } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { uuid: string };

export const PATCH = route<P>(async (req, { uuid }) => updateEntry(uuid, entryInput(await readJson(req))));

export const DELETE = route<P>((_req, { uuid }) => deleteEntry(uuid));
