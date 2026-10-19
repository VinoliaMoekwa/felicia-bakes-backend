#!/usr/bin/env python3
"""Choose dashboard sign-in passwords privately. No network requests."""
import argparse, base64, getpass, os, pathlib, sys, tempfile


def developer_only_settings(existing, password):
    values={}
    for line in existing.splitlines():
        key, separator, value=line.partition('=')
        if separator and not key.startswith('#'):
            values[key]=value
    encoded_owner=values.get('STAFF_OWNER_PASSWORD_B64')
    owner=base64.b64decode(encoded_owner,validate=True).decode() if encoded_owner else values.get('STAFF_OWNER_PASSWORD')
    if not owner:
        raise ValueError('No owner password has been saved yet. Run initial setup first.')
    if len(password)<16 or password==owner:
        raise ValueError('Developer password must have at least 16 characters and differ from the owner password.')
    replacement='STAFF_DEVELOPER_PASSWORD_B64='+base64.b64encode(password.encode()).decode()+'\n'
    result=[]
    for line in existing.splitlines(keepends=True):
        if line.partition('=')[0].strip() not in ('STAFF_DEVELOPER_PASSWORD','STAFF_DEVELOPER_PASSWORD_B64'):
            result.append(line)
    if result and not result[-1].endswith('\n'):
        result[-1]+='\n'
    return ''.join(result)+replacement


def replace_private(path, settings):
    fd,temporary=tempfile.mkstemp(prefix='.staff-setup-',dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as file:
            file.write(settings)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--developer-only',action='store_true',help='Update only developer credentials, preserving the saved owner password.')
    args=parser.parse_args()
    if not sys.stdin.isatty():
        raise SystemExit('Run personally in a local terminal for hidden input.')
    path=pathlib.Path(__file__).resolve().parent/'.env.staff.local'
    if path.is_symlink():
        raise SystemExit('Nothing saved: private settings must not be a symbolic link.')
    if args.developer_only:
        if not path.is_file():
            raise SystemExit('No owner password was saved by the earlier attempt. Run this command without --developer-only first; you can re-enter the same owner password.')
        existing=path.read_text()
    else:
        if path.exists():
            raise SystemExit('Owner settings already exist. Use --developer-only to finish or update the developer password.')
        owner=getpass.getpass('Enter OWNER dashboard password, at least 16 characters (hidden): ')
        if len(owner)<16 or owner!=getpass.getpass('Confirm OWNER dashboard password (hidden): '):
            raise SystemExit('Nothing saved: owner password was short or did not match.')
        existing='STAFF_OWNER_PASSWORD_B64='+base64.b64encode(owner.encode()).decode()+'\n'
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as file:
            file.write(existing)
        print('Owner password saved privately. A developer entry error will not discard it.')
    dev=getpass.getpass('Enter DEVELOPER dashboard password, at least 16 characters (hidden): ')
    if dev!=getpass.getpass('Confirm DEVELOPER dashboard password (hidden): '):
        raise SystemExit('Developer confirmation did not match. Owner settings preserved. Re-run with --developer-only.')
    try:
        updated=developer_only_settings(existing,dev)
    except ValueError as error:
        raise SystemExit(str(error)+' Owner settings preserved; re-run with --developer-only.')
    replace_private(path,updated)
    print('Developer password saved privately. Owner password and all other settings preserved. No account activated or deployed.')


if __name__=='__main__':
    main()
