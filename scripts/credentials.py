#!/usr/bin/env python3
"""Run interactively only after approving local persistent credential storage."""
import getpass, json, os, pathlib, secrets
root = pathlib.Path.home() / '.config' / 'wise-connectors'
root.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(root, 0o700)
path = root / 'credentials.json'
if path.exists():
    raise SystemExit('Configuration already exists; refusing to overwrite or rotate credentials.')
token = getpass.getpass('Wise read-only API token (hidden): ').strip()
if not token or any(c.isspace() for c in token):
    raise SystemExit('Invalid token')
sandbox = input('Sandbox token? [y/N]: ').lower() == 'y'
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump({'wiseToken': token, 'bearerToken': secrets.token_urlsafe(48), 'sandbox': sandbox}, f)
print('Protected configuration saved:', path)
