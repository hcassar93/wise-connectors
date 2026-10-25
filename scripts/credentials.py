#!/usr/bin/env python3
"""Interactive, fail-closed entry; run only after persistent-access approval."""
import json
import os
import pathlib
import secrets
import stat
import sys
import termios


class EntryError(Exception):
    pass


def open_terminal():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise EntryError('Interactive terminal required; redirected input/output is refused.')
    try:
        fd = os.open('/dev/tty', os.O_RDWR | os.O_NOCTTY)
        if not os.isatty(fd):
            os.close(fd)
            raise EntryError('Interactive terminal required.')
        return fd
    except OSError:
        raise EntryError('A controlling terminal is required.') from None


def hidden_token(fd):
    # Do not use getpass: its fallback can echo secrets on unsupported terminals.
    original = termios.tcgetattr(fd)
    hidden = termios.tcgetattr(fd)
    hidden[3] &= ~(termios.ECHO | termios.ECHONL)
    try:
        termios.tcsetattr(fd, termios.TCSAFLUSH, hidden)
        if termios.tcgetattr(fd)[3] & (termios.ECHO | termios.ECHONL):
            raise EntryError('Cannot disable terminal echo; credential entry refused.')
        os.write(fd, b'Wise read-only API token (hidden): ')
        with os.fdopen(os.dup(fd), 'r') as stream:
            value = stream.readline()
        if not value:
            raise EntryError('Credential entry cancelled.')
        return value.strip()
    finally:
        termios.tcsetattr(fd, termios.TCSAFLUSH, original)
        os.write(fd, b'\n')


def directory(parent, name, private=False):
    try:
        os.mkdir(name, 0o700, dir_fd=parent)
    except FileExistsError:
        pass
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    info = os.fstat(fd)
    if info.st_uid != os.getuid() or info.st_mode & 0o022:
        os.close(fd)
        raise EntryError('Configuration directory must be owned by you and not writable by others.')
    if private:
        os.fchmod(fd, 0o700)
    return fd


def create_credentials(home, tty):
    with_fds = []
    try:
        parent = os.open(home, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        with_fds.append(parent)
        config = directory(parent, '.config')
        with_fds.append(config)
        root = directory(config, 'wise-connectors', private=True)
        with_fds.append(root)
        try:
            os.stat('credentials.json', dir_fd=root, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise EntryError('Configuration already exists; refusing to overwrite or rotate credentials.')
        token = hidden_token(tty)
        if not token or any(c.isspace() for c in token):
            raise EntryError('Invalid token.')
        sandbox = input('Sandbox token? [y/N]: ').strip().lower() == 'y'
        payload = {'wiseToken': token, 'bearerToken': secrets.token_urlsafe(48), 'sandbox': sandbox}
        # O_EXCL also refuses a symlink installed after the existence check.
        fd = os.open('credentials.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump(payload, stream)
                stream.flush()
                os.fsync(stream.fileno())
        except BaseException:
            os.unlink('credentials.json', dir_fd=root)
            raise
    finally:
        for fd in reversed(with_fds):
            os.close(fd)


def main():
    tty = None
    try:
        tty = open_terminal()  # Before any filesystem mutation or token generation.
        create_credentials(pathlib.Path.home(), tty)
        print('Protected configuration saved: ~/.config/wise-connectors/credentials.json')
        return 0
    except EntryError as error:
        print(str(error), file=sys.stderr)
    except (OSError, termios.error, EOFError, KeyboardInterrupt):
        # Never print raw exception values or a traceback containing input.
        print('Secure credential entry failed or was cancelled; no fallback input is permitted.', file=sys.stderr)
    finally:
        if tty is not None:
            os.close(tty)
    return 1


if __name__ == '__main__':
    sys.exit(main())
