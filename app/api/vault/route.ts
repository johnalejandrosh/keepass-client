import { route } from '@/server/http';
import { vaultStatus } from '@/server/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(() => vaultStatus());
