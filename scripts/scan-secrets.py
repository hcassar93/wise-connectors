#!/usr/bin/env python3
"""Scan every staged text blob without printing matching secret values."""
import re, subprocess, sys
paths=subprocess.check_output(['git','diff','--cached','--name-only','--diff-filter=ACMR','-z']).decode().split('\0')
patterns=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{50,}',r'AIza[0-9A-Za-z_-]{35}',r'(?i)(?:wiseToken|bearerToken|api_key|access_token)\s*["\x27]?\s*:\s*["\x27](?!synthetic|Bearer)[A-Za-z0-9_./+-]{20,}["\x27]']
failed=[]
for p in filter(None,paths):
 data=subprocess.check_output(['git','show',':'+p]).decode(errors='replace')
 if any(re.search(x,data) for x in patterns):failed.append(p)
if failed: print('Secret scan failed; inspect files privately:', ', '.join(failed));sys.exit(1)
print(f'PASS staged secret scan: {len(list(filter(None,paths)))} files; no matching credential patterns')
