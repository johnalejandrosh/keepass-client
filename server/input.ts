import 'server-only';
import type { EntryInput } from './vault';

// Edición (keepassxc-cli): solo se aceptan cadenas
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export const entryInput = (b: any): EntryInput => ({
  title: str(b?.title),
  username: str(b?.username),
  url: str(b?.url),
  notes: str(b?.notes),
  password: str(b?.password),
  group: str(b?.group),
});
