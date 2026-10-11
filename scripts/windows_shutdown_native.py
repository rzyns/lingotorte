"""Source-only Win32 ownership adapter for the existing recovery seams.

No DLL loads at import. real_api() is explicit, never called by offline tests.
Atomic JOB_LIST creation (Windows 10+) avoids suspended-create/assign owner-death
escape windows. No fallback, breakaway, shell, console-event or live CLI binding.
Synchronous native calls cannot be preempted by Python deadline checks.
"""
import ctypes as C
import math
import ntpath
import subprocess
import time
import importlib.util
from pathlib import Path
import sys

_core_path = Path(__file__).with_name('windows_shutdown_recovery.py').resolve()
_core = sys.modules.get('windows_shutdown_recovery')
if _core is not None and Path(_core.__file__).resolve() != _core_path:
    raise RuntimeError('recovery core source binding mismatch')
if _core is None:
    _spec = importlib.util.spec_from_file_location('windows_shutdown_recovery', _core_path)
    _core = importlib.util.module_from_spec(_spec)
    sys.modules[_spec.name] = _core
    _spec.loader.exec_module(_core)
Held, Identity, Ownership = _core.Held, _core.Identity, _core.Ownership

DWORD = C.c_uint32
BOOL = C.c_int32
WORD = C.c_uint16
HANDLE = C.c_void_p
SIZE = C.c_size_t
PTR = C.c_void_p
P = C.POINTER
INVALID = C.c_void_p(-1).value
QUERY_WAIT = 0x1000 | 0x100000 | 0x1  # QUERY_LIMITED | SYNCHRONIZE | TERMINATE
KILL_ON_CLOSE = 0x2000
CREATE_FLAGS = 0x4 | 0x10 | 0x400 | 0x80000  # suspended/new console/unicode/extended


class FILETIME(C.Structure):
    _fields_ = [('low', DWORD), ('high', DWORD)]


class STARTUPINFO(C.Structure):
    _fields_ = [('cb', DWORD), ('reserved', C.c_wchar_p), ('desktop', C.c_wchar_p),
                ('title', C.c_wchar_p), ('x', DWORD), ('y', DWORD), ('cx', DWORD),
                ('cy', DWORD), ('charsx', DWORD), ('charsy', DWORD), ('fill', DWORD),
                ('flags', DWORD), ('show', WORD), ('reserved_size', WORD),
                ('reserved_bytes', PTR), ('stdin', HANDLE), ('stdout', HANDLE), ('stderr', HANDLE)]


class STARTUPINFOEX(C.Structure):
    _fields_ = [('startup', STARTUPINFO), ('attributes', PTR)]


class PROCESS_INFORMATION(C.Structure):
    _fields_ = [('process', HANDLE), ('thread', HANDLE), ('pid', DWORD), ('tid', DWORD)]


class BASIC_LIMIT(C.Structure):
    _fields_ = [('per_process', C.c_int64), ('per_job', C.c_int64), ('flags', DWORD),
                ('min_working', SIZE), ('max_working', SIZE), ('active_limit', DWORD),
                ('affinity', SIZE), ('priority', DWORD), ('scheduling', DWORD)]


class EXTENDED_LIMIT(C.Structure):
    _fields_ = [('basic', BASIC_LIMIT), ('io', C.c_uint64 * 6),
                ('process_memory', SIZE), ('job_memory', SIZE), ('peak_process', SIZE), ('peak_job', SIZE)]


class ACCOUNTING(C.Structure):
    _fields_ = [('times', C.c_int64 * 4), ('faults', DWORD), ('total', DWORD),
                ('active', DWORD), ('terminated', DWORD)]


class PID_LIST(C.Structure):
    _fields_ = [('assigned', DWORD), ('count', DWORD), ('pids', SIZE * 64)]


SIGNATURES = {
    'GetLastError': ([], DWORD), 'GetCurrentProcess': ([], HANDLE),
    'GetProcessId': ([HANDLE], DWORD),
    'GetProcessTimes': ([HANDLE, P(FILETIME), P(FILETIME), P(FILETIME), P(FILETIME)], BOOL),
    'GetHandleInformation': ([HANDLE, P(DWORD)], BOOL),
    'DuplicateHandle': ([HANDLE, HANDLE, HANDLE, P(HANDLE), DWORD, BOOL, DWORD], BOOL),
    'OpenProcess': ([DWORD, BOOL, DWORD], HANDLE), 'CloseHandle': ([HANDLE], BOOL),
    'IsProcessInJob': ([HANDLE, HANDLE, P(BOOL)], BOOL),
    'CreateJobObjectW': ([PTR, C.c_wchar_p], HANDLE),
    'SetInformationJobObject': ([HANDLE, C.c_int32, PTR, DWORD], BOOL),
    'QueryInformationJobObject': ([HANDLE, C.c_int32, PTR, DWORD, P(DWORD)], BOOL),
    'TerminateJobObject': ([HANDLE, DWORD], BOOL),
    'TerminateProcess': ([HANDLE, DWORD], BOOL),
    'WaitForSingleObject': ([HANDLE, DWORD], DWORD),
    'InitializeProcThreadAttributeList': ([PTR, DWORD, DWORD, P(SIZE)], BOOL),
    'UpdateProcThreadAttribute': ([PTR, DWORD, SIZE, PTR, SIZE, PTR, P(SIZE)], BOOL),
    'DeleteProcThreadAttributeList': ([PTR], None),
    'CreateProcessW': ([C.c_wchar_p, P(C.c_wchar), PTR, PTR, BOOL, DWORD, PTR,
                       C.c_wchar_p, P(STARTUPINFO), P(PROCESS_INFORMATION)], BOOL),
    'ResumeThread': ([HANDLE], DWORD),
}


class API:
    """Both real DLL functions and injected ABI callables use these declarations."""
    def __init__(self, functions):
        for name, (args, result) in SIGNATURES.items():
            fn = getattr(functions, name)
            fn.argtypes = args
            fn.restype = result
            setattr(self, name, fn)
        self.functions = functions


def real_api():
    # Explicit factory only; not a permission grant and not invoked by harness.
    return API(C.WinDLL('kernel32', use_last_error=False))


class BootstrapError(RuntimeError):
    def __init__(self, message, recovery):
        super().__init__(message)
        self.recovery = recovery


def _handle(h):
    value = h.value if isinstance(h, HANDLE) else h
    if type(value) is not int or value <= 0 or value == INVALID:
        raise RuntimeError('invalid native handle')
    return value


def _identity(i):
    if not isinstance(i, Identity) or type(i.pid) is not int or not 0 < i.pid <= 0xffffffff or type(i.created) is not int or i.created <= 0:
        raise ValueError('exact PID and creation identity required')


ENV_KEYS = frozenset('SystemRoot WINDIR PATH USERPROFILE HOME APPDATA LOCALAPPDATA TEMP TMP TMPDIR LINGOTORTE_DATA_DIR LINGOTORTE_SCRATCH_DIR LINGOTORTE_MODEL_CACHE_DIR HF_HOME LINGOTORTE_ALLOW_ONLINE_PROVIDERS LINGOTORTE_HOST POWERSHELL_TELEMETRY_OPTOUT POWERSHELL_UPDATECHECK HF_HUB_OFFLINE TRANSFORMERS_OFFLINE DOTNET_CLI_TELEMETRY_OPTOUT DOTNET_NOLOGO NODE_DISABLE_COMPILE_CACHE'.split())
REQUIRED_ENV = {'LINGOTORTE_ALLOW_ONLINE_PROVIDERS': 'false', 'LINGOTORTE_HOST': '127.0.0.1',
                'POWERSHELL_TELEMETRY_OPTOUT': '1', 'POWERSHELL_UPDATECHECK': 'Off',
                'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'}


def launch_values(argv, cwd, env):
    if type(argv) not in (list, tuple) or not argv or any(type(a) is not str or '\0' in a for a in argv):
        raise ValueError('literal argv strings required')
    for path in (argv[0], cwd):
        if type(path) is not str or '\0' in path or not ntpath.isabs(path) or not ntpath.splitdrive(path)[0]:
            raise ValueError('fully qualified Windows executable and cwd required')
    if ntpath.splitext(argv[0])[1].lower() != '.exe':
        raise ValueError('executable .exe required; no shell scripts')
    if type(env) is not dict or any(type(k) is not str or k not in ENV_KEYS or type(v) is not str or '\0' in v for k, v in env.items()):
        raise ValueError('explicit allowlisted environment required')
    if any(env.get(k) != v for k, v in REQUIRED_ENV.items()):
        raise ValueError('offline environment protections missing')
    command = subprocess.list2cmdline(argv)
    if len(command.encode('utf-16-le')) // 2 >= 32767:
        raise ValueError('command line too long')
    block = '\0'.join(k + '=' + env[k] for k in sorted(env, key=str.upper)) + '\0\0'
    return C.create_unicode_buffer(command), C.create_unicode_buffer(block)


class NativeOwnershipAdapter:
    """Supervisor-local handles; never transfer this object into a controller.

    co-membership in our sealed job is authority, not snapshot parent genealogy.
    Registry holds exact returned capabilities and rejects forged Held objects.
    """
    def __init__(self, api, *, now=time.monotonic, sleep=time.sleep):
        self.api, self.now, self.sleep = api, now, sleep
        self.job = None
        self.root = None
        self.owned = {}
        self.auxiliary = []
        self.bootstrap_process = None
        self.bootstrap_errors = []

    def _check(self, deadline):
        if type(deadline) not in (int, float) or not math.isfinite(deadline) or self.now() >= deadline:
            raise RuntimeError('native operation deadline exhausted')

    def _bool(self, name, *args):
        if not getattr(self.api, name)(*args):
            raise OSError(int(self.api.GetLastError()), name)

    def _returned_handle(self, name, *args):
        value = getattr(self.api, name)(*args)
        try:
            return _handle(value)
        except RuntimeError as error:
            raise OSError(int(self.api.GetLastError()), name + ': invalid handle') from error

    def _member(self, handle, deadline):
        self._check(deadline)
        result = BOOL()
        self._bool('IsProcessInJob', handle, self.job, C.byref(result))
        return result.value != 0

    def _observe(self, handle, deadline):
        self._check(deadline)
        pid = int(self.api.GetProcessId(handle))
        if not pid:
            raise OSError(int(self.api.GetLastError()), 'GetProcessId')
        times = [FILETIME() for _ in range(4)]
        self._check(deadline)
        self._bool('GetProcessTimes', handle, *(C.byref(t) for t in times))
        identity = Identity(pid, (times[0].high << 32) | times[0].low)
        _identity(identity)
        return identity

    def _register(self, handle, deadline):
        h = _handle(handle)
        held = Held(self._observe(h, deadline), h)
        self.owned[h] = held
        return held

    def create(self, argv, cwd, env, stdio, deadline):
        """Create original suspended root atomically in job; resume after readback.

        stdio is exactly the three caller-owned inheritable handles. HANDLE_LIST
        prevents inheritance of other handles. Caller closes its own stdio copies.
        Failure returns BootstrapError.recovery, retaining all cleanup capability.
        """
        if self.job is not None or self.bootstrap_process is not None:
            raise RuntimeError('single root capability; no reuse')
        command, environment = launch_values(argv, cwd, env)
        if type(stdio) not in (tuple, list) or len(stdio) != 3:
            raise ValueError('unchanged three stdio handles required')
        stdio = tuple(_handle(h) for h in stdio)
        attributes = None
        initialized = False
        try:
            self._check(deadline)
            self.job = self._returned_handle('CreateJobObjectW', None, None)
            limits = EXTENDED_LIMIT(); limits.basic.flags = KILL_ON_CLOSE
            self._check(deadline)
            self._bool('SetInformationJobObject', self.job, 9, C.byref(limits), C.sizeof(limits))
            # Read back policy; no breakaway flags permitted.
            self._check(deadline)
            observed = EXTENDED_LIMIT()
            self._bool('QueryInformationJobObject', self.job, 9, C.byref(observed), C.sizeof(observed), None)
            if observed.basic.flags != KILL_ON_CLOSE:
                raise RuntimeError('job containment policy mismatch')
            self._check(deadline)
            current = self.api.GetCurrentProcess()
            if self._member(current, deadline):
                raise RuntimeError('supervisor must remain outside owned job')
            for h in stdio:
                self._check(deadline)
                flags = DWORD()
                self._bool('GetHandleInformation', h, C.byref(flags))
                if not flags.value & 1:
                    raise RuntimeError('stdio handle not inheritable')
            size = SIZE()
            self._check(deadline)
            ok = self.api.InitializeProcThreadAttributeList(None, 2, 0, C.byref(size))
            error = int(self.api.GetLastError())
            if ok or error != 122 or not 0 < size.value <= 1048576:
                raise RuntimeError('unexpected attribute size probe')
            attributes = C.create_string_buffer(size.value)
            self._check(deadline)
            self._bool('InitializeProcThreadAttributeList', attributes, 2, 0, C.byref(size))
            initialized = True
            jobs = (HANDLE * 1)(self.job)
            handles = (HANDLE * len(set(stdio)))(*dict.fromkeys(stdio))
            for key, value in ((0x2000D, jobs), (0x20002, handles)):
                self._check(deadline)
                self._bool('UpdateProcThreadAttribute', attributes, 0, key, value, C.sizeof(value), None, None)
            startup = STARTUPINFOEX()
            startup.startup.cb = C.sizeof(startup)
            startup.startup.flags = 0x100 | 1  # USESTDHANDLES | USESHOWWINDOW
            startup.startup.show = 0  # dedicated hidden console, no new group
            startup.startup.stdin, startup.startup.stdout, startup.startup.stderr = stdio
            startup.attributes = C.cast(attributes, PTR)
            process = PROCESS_INFORMATION()
            self._check(deadline)
            self._bool('CreateProcessW', argv[0], command, None, None, True, CREATE_FLAGS,
                       environment, cwd, C.cast(C.byref(startup), P(STARTUPINFO)), C.byref(process))
            self.bootstrap_process = _handle(process.process)
            self.auxiliary.append(_handle(process.thread))
            self.root = self._register(self.bootstrap_process, deadline)
            if self.root.identity.pid != process.pid or not self._member(self.root.handle, deadline):
                raise RuntimeError('creation identity/job readback mismatch')
            self._check(deadline)
            previous = int(self.api.ResumeThread(process.thread))
            if previous == 0xffffffff:
                raise OSError(int(self.api.GetLastError()), 'ResumeThread')
            if previous != 1:
                raise RuntimeError('unexpected suspend count')
            self._check(deadline)
            self._bool('CloseHandle', process.thread)
            self.auxiliary.remove(process.thread)
            return Ownership(self, self.root)
        except Exception as error:
            self.bootstrap_errors.append(str(error))
            raise BootstrapError(str(error), self) from error
        finally:
            if initialized:
                self.api.DeleteProcThreadAttributeList(attributes)

    def _known(self, held):
        if not isinstance(held, Held) or self.owned.get(held.handle) is not held:
            raise RuntimeError('unowned or closed process capability')

    def duplicate_root(self, deadline):
        self._known(self.root)
        self._check(deadline)
        current = self.api.GetCurrentProcess()
        result = HANDLE()
        self._check(deadline)
        self._bool('DuplicateHandle', current, self.root.handle, current, C.byref(result), 0, False, 2)
        handle = _handle(result)
        self.auxiliary.append(handle)
        try:
            held = self._register(handle, deadline)
            if held.identity != self.root.identity or not self._member(handle, deadline):
                raise RuntimeError('duplicate identity/job mismatch')
            self.auxiliary.remove(handle)
            return held
        except Exception:
            self.owned.pop(handle, None)
            self._bool('CloseHandle', handle)
            self.auxiliary.remove(handle)
            raise

    def acquire(self, identity, parent, deadline):
        _identity(identity); self._known(parent)
        if not self._member(parent.handle, deadline):
            raise RuntimeError('parent not in sealed job')
        self._check(deadline)
        handle = self._returned_handle('OpenProcess', QUERY_WAIT, False, identity.pid)
        try:
            observed = self._observe(handle, deadline)
            if observed != identity or not self._member(handle, deadline):
                raise RuntimeError('PID race or nonmember acquisition')
            held = Held(observed, handle)
            self.owned[handle] = held
            return held
        except Exception:
            # Retain even rejected observation handles if CloseHandle fails;
            # they may be closed later but are never termination authority.
            self.auxiliary.append(handle)
            self._bool('CloseHandle', handle)
            self.auxiliary.remove(handle)
            raise

    def proven(self, held, parent, deadline):
        self._known(held); self._known(parent)
        return (self._observe(held.handle, deadline) == held.identity
                and self._member(held.handle, deadline) and self._member(parent.handle, deadline))

    def _pids(self, deadline):
        self._check(deadline)
        data = PID_LIST()
        self._bool('QueryInformationJobObject', self.job, 3, C.byref(data), C.sizeof(data), None)
        if data.assigned != data.count or data.count > 64:
            raise RuntimeError('incomplete bounded job PID list')
        pids = tuple(int(x) for x in data.pids[:data.count])
        if len(set(pids)) != len(pids) or any(not 0 < x <= 0xffffffff for x in pids):
            raise RuntimeError('corrupt job PID list')
        return set(pids)

    def _count(self, deadline):
        self._check(deadline)
        data = ACCOUNTING()
        self._bool('QueryInformationJobObject', self.job, 1, C.byref(data), C.sizeof(data), None)
        return data.active

    def coverage(self, held, deadline):
        before = self._pids(deadline)
        live = set()
        for item in held:
            self._known(item)
            if self._observe(item.handle, deadline) != item.identity:
                raise RuntimeError('held identity mismatch')
            if self.active(item, deadline):
                if not self._member(item.handle, deadline):
                    return False
                live.add(item.identity.pid)
        return before == live == self._pids(deadline) and self._count(deadline) == len(live)

    def active(self, held, deadline):
        self._known(held); self._check(deadline)
        result = int(self.api.WaitForSingleObject(held.handle, 0))
        if result not in (0, 258):
            raise OSError(int(self.api.GetLastError()), 'WaitForSingleObject')
        return result == 258

    def terminate(self, held, deadline):
        self._known(held); self._check(deadline)
        # Job, never PID, is termination authority; includes unobserved descendants.
        self._bool('TerminateJobObject', self.job, 1)
        return True

    def wait_gone(self, held, deadline):
        self._known(held); self._check(deadline)
        millis = min(0xfffffffe, max(0, int((deadline - self.now()) * 1000)))
        result = int(self.api.WaitForSingleObject(held.handle, millis))
        if result not in (0, 258):
            raise OSError(int(self.api.GetLastError()), 'WaitForSingleObject')
        self._check(deadline)
        return result == 0

    def close(self, held, deadline):
        # Like core close, cleanup is still attempted after the deadline. Job is
        # NOT closed here: outside-controller capability persists until empty.
        self._known(held)
        self._bool('CloseHandle', held.handle)
        del self.owned[held.handle]
        if held.handle == self.bootstrap_process:
            self.bootstrap_process = None
        return True

    def cleanup(self, deadline, emit):
        """Independent outside-controller recovery; usable by execute_core."""
        errors = list(self.bootstrap_errors)
        empty = False
        try:
            self._check(deadline)
            if self.job is not None:
                self._bool('TerminateJobObject', self.job, 1)
        except Exception as error:
            errors.append(str(error))
        # Normal cleanup needs only job termination. A partially bootstrapped
        # creation may additionally need its ORIGINAL handle recovered, never a
        # PID reopen. Do not call TerminateProcess on an already-signaled root:
        # Windows can report access denied after exit, which is not a live root.
        if self.bootstrap_errors and self.bootstrap_process is not None:
            try:
                self._check(deadline)
                state = int(self.api.WaitForSingleObject(self.bootstrap_process, 0))
                if state == 258:
                    self._check(deadline)
                    self._bool('TerminateProcess', self.bootstrap_process, 1)
                elif state != 0:
                    raise OSError(int(self.api.GetLastError()), 'bootstrap process observation')
            except Exception as error:
                errors.append(str(error))
        for held in tuple(self.owned.values()):
            try:
                if self.wait_gone(held, deadline) is not True:
                    raise RuntimeError('held process still active')
            except Exception as error:
                errors.append(str(error))
            try:
                self.close(held, deadline)
            except Exception as error:
                errors.append(str(error))
        # Handles from a partially bootstrapped original creation remain owned.
        for handle in tuple(self.auxiliary) + ((self.bootstrap_process,) if self.bootstrap_process is not None and self.bootstrap_process not in self.owned else ()):
            try:
                self._bool('CloseHandle', handle)
                if handle in self.auxiliary:
                    self.auxiliary.remove(handle)
                if handle == self.bootstrap_process:
                    self.bootstrap_process = None
            except Exception as error:
                errors.append(str(error))
        try:
            if self.job is not None:
                while self._count(deadline) != 0 or self._pids(deadline):
                    self._check(deadline)
                    self.sleep(min(0.01, max(0, deadline - self.now())))
                empty = True
                self._bool('CloseHandle', self.job)
                self.job = None
        except Exception as error:
            errors.append(str(error))
        receipt = {'cleanup_safe': empty and not errors, 'job_empty': empty,
                   'errors': errors, 'native_qualified': False}
        emit(receipt)
        return receipt

    def fixture_readiness(self):
        raise RuntimeError('exclusive console-host lifetime is unproved; native fixture readiness blocked')
