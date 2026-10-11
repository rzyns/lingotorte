"""Private cooperative local ledger; no reset, recovery or native execution.

File fsync is used, not a claim of Windows directory/power-loss durability.
All owned IO and persisted validation share one irreversible abort boundary.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import threading


def _encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _binding(packet, expected):
    if type(packet) is not bytes or type(expected) is not str or len(expected) != 64:
        raise ValueError('packet bytes and exact SHA-256 required')
    if any(c not in '0123456789abcdef' for c in expected) or hashlib.sha256(packet).hexdigest() != expected:
        raise ValueError('source packet checksum mismatch')
    return expected


class LocalLedgerStore:
    """Lifetime exclusive lease; direct calls and wrappers share terminal state.

    io optionally delegates actual os operations for occurrence fault testing.
    No hostile writers, symlink replacement, distributed or power-loss guarantee.
    An ambiguous fd close is attempted once, never retried on a recycled fd.
    """
    def __init__(self, root, packet, packet_sha256, maximum=3, *, fresh=False,
                 fault=None, io=None):
        self.binding = _binding(packet, packet_sha256)
        if type(maximum) is not int or not 1 <= maximum <= 3 or type(fresh) is not bool:
            raise ValueError('invalid ledger configuration')
        self.root = Path(root)
        if not self.root.is_absolute():
            raise ValueError('absolute disposable ledger root required')
        self.maximum = maximum
        self.fresh = fresh
        self.fault = fault or (lambda stage: None)
        self.io = io or (lambda operation, *args: getattr(os, operation)(*args))
        self.mutex = threading.RLock()
        self.uncertain = False
        self.closed = False
        self.lock_fd = None
        self.cleanup_errors = []
        self.lock = self.root / 'writer.lock'
        self.state = self.root / 'ledger.json'
        self.marker = self.root / 'status'
        # Preacquisition errors cannot touch any foreign lease or status.
        if fresh:
            self.io('mkdir', self.root, 0o700)
        self.lock_fd = self.io('open', self.lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with self._checked():
            lease = b'exclusive batch lease; no automatic recovery\n'
            self._write(self.lock_fd, lease)
            self.io('fsync', self.lock_fd)
            if fresh:
                self._put(self.marker, b'P', exclusive=True)
                self._put(self.state, self._document([]), exclusive=True)
                self._mark(b'R')
            self._read()

    @contextmanager
    def _checked(self):
        """The sole owned-operation failure edge; callers hold the RLock."""
        if self.closed or self.uncertain:
            raise RuntimeError('closed or uncertain ledger store')
        try:
            yield
        except BaseException:
            self._abort()
            raise

    def _abort(self):
        # Latch before poison or cleanup. Neither failure can restore authority.
        self.uncertain = True
        self.closed = True
        try:
            self._mark(b'P')
        except BaseException as error:
            self.cleanup_errors.append(('poison', repr(error)))
        try:
            self._retire_lease()
        except BaseException as error:
            self.cleanup_errors.append(('lease-close', repr(error)))
        # Never unlink an aborted lease, even if durable poison failed.

    def _retire_lease(self):
        fd, self.lock_fd = self.lock_fd, None
        if fd is not None:
            self.io('close', fd)

    @contextmanager
    def _file(self, path, flags):
        fd = self.io('open', path, flags | getattr(os, 'O_BINARY', 0), 0o600)
        try:
            yield fd
        except BaseException:
            try:
                self.io('close', fd)
            except BaseException as error:
                self.cleanup_errors.append(('file-close', repr(error)))
            raise
        else:
            self.io('close', fd)

    def _write(self, fd, raw):
        if self.io('write', fd, raw) != len(raw):
            raise OSError('short ledger write')

    def _put(self, path, raw, *, exclusive=False):
        flags = os.O_WRONLY | (os.O_CREAT | os.O_EXCL if exclusive else 0)
        with self._file(path, flags) as fd:
            self._write(fd, raw)
            self.io('fsync', fd)

    def _bytes(self, path):
        with self._file(path, os.O_RDONLY) as fd:
            chunks = []
            while True:
                chunk = self.io('read', fd, 65536)
                if not chunk:
                    return b''.join(chunks)
                chunks.append(chunk)

    def _document(self, rows):
        body = {'version': 1, 'packet_sha256': self.binding, 'maximum': self.maximum, 'rows': rows}
        return _encode({'body': body, 'sha256': hashlib.sha256(_encode(body)).hexdigest()})

    def _mark(self, value):
        self._put(self.marker, value)

    def _read(self):
        status = self._bytes(self.marker)
        if status not in (b'R', b'C'):
            raise RuntimeError('durable ledger poison or corrupt status')
        doc = json.loads(self._bytes(self.state))
        if type(doc) is not dict or set(doc) != {'body', 'sha256'}:
            raise RuntimeError('corrupt ledger envelope')
        body = doc['body']
        if type(body) is not dict or set(body) != {'version', 'packet_sha256', 'maximum', 'rows'}:
            raise RuntimeError('corrupt ledger body')
        if (type(body['version']) is not int or body['version'] != 1
                or type(body['maximum']) is not int or body['maximum'] != self.maximum
                or type(body['packet_sha256']) is not str or body['packet_sha256'] != self.binding
                or type(doc['sha256']) is not str or doc['sha256'] != hashlib.sha256(_encode(body)).hexdigest()):
            raise RuntimeError('ledger binding or checksum mismatch')
        rows = body['rows']
        if (type(rows) is not list or any(type(x) is not int for x in rows)
                or len(rows) > self.maximum or rows != list(range(1, len(rows) + 1))):
            raise RuntimeError('corrupt ledger sequence')
        return rows, status

    def read(self):
        with self.mutex, self._checked():
            return self._read()[0]

    def append(self, case):
        with self.mutex:
            if self.closed or self.uncertain:
                raise RuntimeError('closed or uncertain ledger store')
            # Pure bad arguments/no-resume do not own a fallible IO operation.
            if not self.fresh or type(case) is not int or not 1 <= case <= self.maximum:
                raise RuntimeError('ledger cannot resume, reset, skip or exceed budget')
            with self._checked():
                rows, status = self._read()
            if case != len(rows) + 1:
                raise RuntimeError('ledger cannot resume, reset, skip or exceed budget')
            with self._checked():
                if status != b'R':
                    raise RuntimeError('fresh ledger unexpectedly sealed')
                self._mark(b'P')
                self.fault('poisoned')
                raw = self._document(rows + [case])
                temp = self.root / 'pending.json'
                with self._file(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL) as fd:
                    self._write(fd, raw)
                    self.fault('before_fsync')
                    self.io('fsync', fd)
                self.fault('before_replace')
                self.io('replace', temp, self.state)
                self.fault('after_replace')
                if self._bytes(self.state) != raw:
                    raise OSError('committed ledger readback mismatch')
                self.fault('before_ack')
                self._mark(b'R')

    def close(self):
        with self.mutex:
            if self.closed:
                return
            with self._checked():
                self._read()  # A corrupt persisted store must not be sealed healthy.
                self._mark(b'C')
                self.fault('before_unlock')
                # Close once before unlink: Windows CRT leases cannot be unlinked open.
                self._retire_lease()
                self.io('unlink', self.lock)
                self.closed = True
