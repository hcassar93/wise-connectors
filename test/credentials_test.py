import contextlib
import importlib.util
import io
import json
import os
import pathlib
import pty
import select
import subprocess
import sys
import tempfile
import termios
import time
import unittest
from unittest.mock import patch

HELPER = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'credentials.py'
spec = importlib.util.spec_from_file_location('credentials', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
TOKEN = 'synthetic-test-only-wise-value'


class CredentialTests(unittest.TestCase):
    def test_noninteractive_refusal_without_files_or_leak(self):
        with tempfile.TemporaryDirectory() as home:
            r = subprocess.run([sys.executable, str(HELPER)], input=TOKEN, text=True,
                               capture_output=True, env={**os.environ, 'HOME': home})
            self.assertEqual(r.returncode, 1)
            self.assertNotIn(TOKEN, r.stdout + r.stderr)
            self.assertFalse((pathlib.Path(home) / '.config').exists())

    def test_echo_disable_failure_has_no_prompt_or_read(self):
        with patch.object(helper.termios, 'tcgetattr', return_value=[0, 0, 0, termios.ECHO, 0, 0, []]), \
             patch.object(helper.termios, 'tcsetattr', side_effect=termios.error('synthetic failure')), \
             patch.object(helper.os, 'write') as write, patch.object(helper.os, 'fdopen') as read:
            with self.assertRaises(termios.error):
                helper.hidden_token(123)
            read.assert_not_called()
            write.assert_not_called()

    def test_echo_still_enabled_refuses_read(self):
        with patch.object(helper.termios, 'tcgetattr', side_effect=lambda _: [0, 0, 0, termios.ECHO, 0, 0, []]), \
             patch.object(helper.termios, 'tcsetattr'), patch.object(helper.os, 'write') as write, \
             patch.object(helper.os, 'fdopen') as read:
            with self.assertRaises(helper.EntryError):
                helper.hidden_token(123)
            read.assert_not_called()
            self.assertEqual(write.call_args_list[0].args[1], b'\n')

    def test_existing_config_refused_before_entry(self):
        with tempfile.TemporaryDirectory() as home:
            root = pathlib.Path(home) / '.config' / 'wise-connectors'
            root.mkdir(parents=True)
            path = root / 'credentials.json'
            path.write_text('synthetic-existing')
            with patch.object(helper, 'hidden_token') as read:
                with self.assertRaises(helper.EntryError):
                    helper.create_credentials(home, 123)
                read.assert_not_called()
            self.assertEqual(path.read_text(), 'synthetic-existing')

    def test_symlink_directory_and_credential_refused(self):
        for component in ['.config', 'wise-connectors', 'credentials.json']:
            with self.subTest(component=component), tempfile.TemporaryDirectory() as home:
                base = pathlib.Path(home)
                target = base / 'target'
                target.mkdir()
                if component == '.config':
                    (base / '.config').symlink_to(target)
                else:
                    root = base / '.config'
                    root.mkdir()
                    if component == 'wise-connectors':
                        (root / component).symlink_to(target)
                    else:
                        root = root / 'wise-connectors'
                        root.mkdir()
                        (root / component).symlink_to(target / 'missing')
                with patch.object(helper, 'hidden_token') as read:
                    with self.assertRaises((OSError, helper.EntryError)):
                        helper.create_credentials(home, 123)
                    read.assert_not_called()
                self.assertEqual(list(target.iterdir()), [])

    def test_exclusive_creation_preserves_file_created_during_entry(self):
        with tempfile.TemporaryDirectory() as home:
            path = pathlib.Path(home) / '.config' / 'wise-connectors' / 'credentials.json'
            def racing_entry(_):
                path.write_text('synthetic-racing-file')
                return TOKEN
            with patch.object(helper, 'hidden_token', side_effect=racing_entry), patch('builtins.input', return_value='y'):
                with self.assertRaises(FileExistsError):
                    helper.create_credentials(home, 123)
            self.assertEqual(path.read_text(), 'synthetic-racing-file')

    def test_terminal_error_output_never_exposes_exception_payload(self):
        output = io.StringIO()
        with patch.object(helper, 'open_terminal', return_value=123), \
             patch.object(helper, 'create_credentials', side_effect=termios.error(TOKEN)), \
             patch.object(helper.os, 'close'), contextlib.redirect_stderr(output):
            self.assertEqual(helper.main(), 1)
        self.assertNotIn(TOKEN, output.getvalue())

    def test_real_pty_hides_synthetic_input_and_creates_private_file(self):
        with tempfile.TemporaryDirectory() as home:
            pid, fd = pty.fork()
            if pid == 0:
                os.environ['HOME'] = home
                os.execv(sys.executable, [sys.executable, str(HELPER)])
            output = b''
            def until(marker):
                nonlocal output
                deadline = time.monotonic() + 5
                while marker not in output:
                    if time.monotonic() > deadline:
                        self.fail('TTY prompt timeout')
                    if select.select([fd], [], [], .1)[0]:
                        output += os.read(fd, 4096)
            try:
                until(b'(hidden): ')
                self.assertFalse(termios.tcgetattr(fd)[3] & (termios.ECHO | termios.ECHONL))
                os.write(fd, (TOKEN + '\n').encode())
                until(b'[y/N]: ')
                os.write(fd, b'y\n')
                until(b'Protected configuration saved:')
                _, status = os.waitpid(pid, 0)
                self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                self.assertNotIn(TOKEN.encode(), output)
                root = pathlib.Path(home) / '.config' / 'wise-connectors'
                path = root / 'credentials.json'
                data = json.loads(path.read_text())
                self.assertEqual(data['wiseToken'], TOKEN)
                self.assertEqual(len(data['bearerToken']), 64)
                self.assertNotIn(data['bearerToken'].encode(), output)
                self.assertEqual(root.stat().st_mode & 0o777, 0o700)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            finally:
                os.close(fd)
                try:
                    os.kill(pid, 9)
                    os.waitpid(pid, 0)
                except ProcessLookupError:
                    pass


if __name__ == '__main__':
    unittest.main()
