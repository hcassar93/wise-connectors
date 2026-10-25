import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export const configPath = join(homedir(), '.config', 'wise-connectors', 'credentials.json');
export function config(): {wiseToken:string; bearerToken:string; sandbox?:boolean} {
  const s = statSync(configPath);
  if ((s.mode & 0o077) !== 0 || s.uid !== process.getuid?.()) throw new Error('Credential file must be owned by current user with mode 0600');
  return JSON.parse(readFileSync(configPath,'utf8'));
}
