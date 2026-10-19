#!/usr/bin/env python3
"""Choose dashboard sign-in passwords privately. No network requests."""
import getpass, os, pathlib, sys
if not sys.stdin.isatty():
    raise SystemExit('Run personally in a local terminal for hidden input.')
path=pathlib.Path(__file__).resolve().parent/'.env.staff.local'
if path.exists():
    raise SystemExit('Existing dashboard settings were not overwritten.')
owner=getpass.getpass('Choose OWNER dashboard password, at least 16 characters (hidden): ')
if len(owner)<16 or owner!=getpass.getpass('Confirm OWNER dashboard password (hidden): '):
    raise SystemExit('Nothing saved: owner password was short or did not match.')
dev=getpass.getpass('Choose DEVELOPER dashboard password, at least 16 characters (hidden): ')
if len(dev)<16 or dev==owner or dev!=getpass.getpass('Confirm DEVELOPER dashboard password (hidden): '):
    raise SystemExit('Nothing saved: developer password must match, be distinct and at least 16 characters.')
import base64
encode=lambda value:base64.b64encode(value.encode()).decode()
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as file:
    file.write('STAFF_OWNER_PASSWORD_B64='+encode(owner)+'\nSTAFF_DEVELOPER_PASSWORD_B64='+encode(dev)+'\n')
print('Protected dashboard passwords saved locally. No account was activated or deployed by this helper.')
