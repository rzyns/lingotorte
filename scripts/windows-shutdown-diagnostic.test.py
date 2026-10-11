"""Offline-only checks: no console, fixture, archived packet or native calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('windows-shutdown-diagnostic.py')
spec = importlib.util.spec_from_file_location('shutdown_diagnostic', SOURCE)
diag = importlib.util.module_from_spec(spec)
with patch('subprocess.Popen', side_effect=AssertionError('import spawned a process')):
    spec.loader.exec_module(diag)


class DiagnosticOfflineTests(unittest.TestCase):
    def test_cli_guards_before_any_native_or_prepare_call(self):
        with patch.object(diag, 'native', side_effect=AssertionError('native forbidden')), \
             patch.object(diag, 'prepare', side_effect=AssertionError('prepare forbidden')), \
             patch.object(diag, 'load', side_effect=AssertionError('read forbidden')):
            for mode in ('execute', 'controller'):
                with self.assertRaisesRegex(RuntimeError, 'Diagnostic execution disabled'):
                    diag.main([mode, 'inert'])

    def test_retained_injected_call_paths_use_real_core(self):
        core = diag.recovery_core()
        self.assertEqual(Path(core.__file__).resolve(), SOURCE.with_name('windows_shutdown_recovery.py').resolve())
        with patch.object(core, 'controller_core', return_value='controller') as controller, \
             patch.object(core, 'execute_core', return_value='execute') as execute:
            self.assertEqual(diag.controller_injected(1, 2, 3), 'controller')
            self.assertEqual(diag.execute_injected(1, 2, 3, 4), 'execute')
            controller.assert_called_once_with(1, 2, 3)
            execute.assert_called_once_with(1, 2, 3, 4)

    def test_optimized_prepare_cli_is_explicitly_blocked(self):
        original_flags = diag.sys.flags
        class Flags:
            optimize = 1
            def __getattr__(self, name): return getattr(original_flags, name)
        with patch.object(diag.sys, 'flags', Flags()), \
             patch.object(diag, 'prepare', side_effect=AssertionError('prepare forbidden')):
            with self.assertRaisesRegex(RuntimeError, 'non-optimized'):
                diag.main(['prepare', 'inert'])

    def test_live_entry_points_block_before_io(self):
        with patch.object(diag, 'load', side_effect=AssertionError('read before guard')), \
             patch.object(diag, 'sha', side_effect=AssertionError('hash before guard')), \
             patch.object(diag, 'native', side_effect=AssertionError('native before guard')), \
             patch.object(diag.subprocess, 'Popen', side_effect=AssertionError('spawn before guard')):
            for call in (lambda: diag.execute(None, None), lambda: diag.controller(None, 1)):
                with self.assertRaisesRegex(RuntimeError, 'Diagnostic execution disabled'):
                    call()

    def test_query_only_observation(self):
        class Kernel:
            def __init__(self, code):
                self.code = code

            def GetExitCodeProcess(self, handle, result):
                result._obj.value = self.code
                return True

        self.assertTrue(diag.active(Kernel(259), 1))
        for code in (0, 1, 99):
            self.assertFalse(diag.active(Kernel(code), 1))

    def test_query_error_fails_closed(self):
        class Kernel:
            def GetExitCodeProcess(self, handle, result):
                return False

        with patch.object(diag.ctypes, 'get_last_error', return_value=5, create=True):
            with self.assertRaisesRegex(RuntimeError, 'held process query failed'):
                diag.active(Kernel(), 1)

    def test_windows_unicode_uri(self):
        uri = Path('C:/space żółć/control-bridge.mjs').as_uri()
        self.assertTrue(uri.startswith('file:///C:/space%20'))
        self.assertIn('%C5', uri)
        self.assertTrue(uri.endswith('/control-bridge.mjs'))

    def test_additive_instrumentation_is_reversible(self):
        sources = {
            'start-local.mjs': 'const require = createRequire(import.meta.url);\n',
            'start-local-processes.mjs': (
                '  function stop(code = 0) {\n'
                'function onSignal() { original(); }\n'
                "  signals.on('SIGTERM', onSignal);\n"
                '      child.stdin?.end();\n'
                '      const closed = new Promise(resolve);\n'
                '      try { await closed; } finally { clearTimeout(timer); }\n'
            ),
            'start-local-windows-job.cs': (
                '                stop.Set();\n'
                '            Check(TerminateJobObject(job, 1));\n'
                '            return unchecked((int)exitCode);\n'
                '            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);\n'
            ),
            'start-local.test.mjs': '// unchanged test fixture\n',
        }
        for name, text in sources.items():
            raw = text.encode()
            modified, edits = diag.instrument(raw, name)
            for edit in reversed(edits):
                replacement = (edit['anchor'] + edit['inserted'] if edit['after']
                               else edit['inserted'] + edit['anchor'])
                self.assertEqual(modified.count(replacement.encode()), 1)
                modified = modified.replace(replacement.encode(), edit['anchor'].encode())
            self.assertEqual(modified, raw, name)


if __name__ == '__main__':
    unittest.main()
