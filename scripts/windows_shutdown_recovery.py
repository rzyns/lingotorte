"""Injected diagnostic contracts only; no native adapter or process creation.

Capabilities must be independently owned outside the disposable controller.
Every adapter operation accepts the same absolute deadline and must honor it.
PID snapshots are hints, never authority. Native qualification remains blocked.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Identity:
    pid: int
    created: int


@dataclass(frozen=True)
class Held:
    identity: Identity
    handle: object


class Ownership:
    def __init__(self, adapter, launcher):
        self.adapter = adapter
        self.held = {}
        self.errors = []
        self.coverage = False
        # Launcher must be the original held creation handle, not OpenProcess(pid).
        if launcher is None:
            self.errors.append('missing original launcher handle')
        else:
            self.held[launcher.identity] = launcher

    def track(self, hints, deadline):
        complete = bool(self.held) and not self.errors
        for identity, parent in hints:
            if identity in self.held:
                continue
            if parent not in self.held:
                complete = False
                self.errors.append('unproven parent identity')
                continue
            held = None
            try:
                if self.adapter.now() >= deadline:
                    raise RuntimeError('ownership deadline exhausted')
                # Adapter must prove exact creation identity AND parent ownership
                # through an authoritative creation/job capability, not snapshot.
                held = self.adapter.acquire(identity, self.held[parent], deadline)
                if held is None:
                    raise RuntimeError('ownership acquisition failed')
                if held.identity != identity:
                    raise RuntimeError('reused PID identity')
                if not self.adapter.proven(held, self.held[parent], deadline):
                    raise RuntimeError('ownership relation unproven')
                self.held[identity] = held
                held = None
            except Exception as error:
                complete = False
                self.errors.append(str(error))
            finally:
                if held is not None:
                    try:
                        self.adapter.close(held, deadline)
                    except Exception as error:
                        self.errors.append('rejected handle close: ' + str(error))
        try:
            # Positive authoritative closure/fixture coverage is required even
            # when a snapshot contains no additional descendants.
            if self.adapter.now() >= deadline or self.adapter.coverage(tuple(self.held.values()), deadline) is not True:
                raise RuntimeError('authoritative ownership coverage incomplete')
        except Exception as error:
            complete = False
            self.errors.append(str(error))
        self.coverage = complete and not self.errors
        return self.coverage

    def cleanup(self, deadline, emit):
        receipt = {'coverage': self.coverage, 'operations': [],
                   'errors': list(self.errors), 'cleanup_safe': False}
        def operation(name, held, call):
            try:
                if name != 'close' and self.adapter.now() >= deadline:
                    raise RuntimeError('recovery deadline exhausted')
                value = call()
                receipt['operations'].append({'pid': held.identity.pid,
                    'created': held.identity.created, 'operation': name, 'value': value})
                return value
            except Exception as error:
                receipt['errors'].append(name + ': ' + str(error))
                return None
        # A query failure does not skip termination of this already-owned handle.
        # Unknown / rejected handles are never included in this set.
        for held in self.held.values():
            alive = operation('query', held, lambda: self.adapter.active(held, deadline))
            if alive is not False:
                terminated = operation('terminate', held, lambda: self.adapter.terminate(held, deadline))
                if terminated is not True:
                    receipt['errors'].append('termination not acknowledged')
        gone = True
        for held in self.held.values():
            observed = operation('wait', held, lambda: self.adapter.wait_gone(held, deadline))
            if observed is not True:
                gone = False
            closed = operation('close', held, lambda: self.adapter.close(held, deadline))
            if closed is not True:
                receipt['errors'].append('close not acknowledged')
        receipt['cleanup_safe'] = self.coverage and gone and not receipt['errors']
        # Emit attempted even after any individual observation/close failure.
        emit(receipt)
        return receipt


def controller_core(driver, ownership, emit):
    """Controller seam: fixed original 20-second poll + 1-second wait."""
    result = {'case': getattr(driver, 'case', None), 'lifecycle': 'FAIL',
              'stop_reason': 'controller failure', 'cleanup_safe': False}
    try:
        hints = driver.ready(35)
        if not ownership.track(hints, driver.deadline):
            raise RuntimeError('incomplete ownership coverage')
        driver.request_stop()
        driver.poll_stop(20)
        driver.wait_stop(1)
        result['lifecycle'] = 'PASS injected contract only'
        result['stop_reason'] = 'fixed stop window completed'
    except Exception as error:
        result['error'] = str(error)
    finally:
        try:
            # Do not expose an intermediate cleanup-only green controller receipt.
            result.update(ownership.cleanup(driver.deadline, lambda receipt: None))
        except Exception as error:
            result['cleanup_safe'] = False
            result['cleanup_error'] = str(error)
        emit(result)
    return result


class AttemptLedger:
    """Durable injected store. Any IO uncertainty permanently poisons this ledger.

    No reset/retry API exists. Native/cross-instance durable poison and concurrent
    writer exclusion require a separately reviewed adapter, not this seam.
    """
    def __init__(self, store, maximum=3):
        self.store = store
        self.maximum = maximum
        self.uncertain = False
        self.known_count = None
        self.minimum = 0
        self.possibly_consumed = None

    def validate(self, rows):
        if type(self.maximum) is not int or not 1 <= self.maximum <= 3:
            raise RuntimeError('invalid attempt maximum')
        if type(rows) is not list or any(type(r) is not int for r in rows):
            raise RuntimeError('corrupt attempt ledger')
        if len(rows) > self.maximum or rows != list(range(1, len(rows) + 1)):
            raise RuntimeError('corrupt attempt ledger sequence or count')
        return rows

    def read(self):
        if self.uncertain:
            raise RuntimeError('ledger uncertainty; retry forbidden')
        try:
            rows = self.validate(self.store.read())
        except Exception:
            self.uncertain = True
            self.known_count = None
            raise
        self.known_count = len(rows)
        self.minimum = len(rows)
        return rows

    def state(self):
        return {'consumed_attempts': self.known_count,
                'consumed_attempts_min': self.minimum,
                'possibly_consumed_attempt': self.possibly_consumed,
                'ledger_uncertain': self.uncertain}

    def consume(self, case):
        rows = self.read()
        if type(case) is not int or case != len(rows) + 1:
            raise RuntimeError('attempt ledger cannot reset or skip')
        if len(rows) >= self.maximum:
            raise RuntimeError('attempt budget exhausted')
        # Before calling append its commit status is potentially unknown.
        self.possibly_consumed = case
        self.known_count = None
        try:
            self.store.append(case)
        except Exception:
            self.uncertain = True
            # One observation may recover the exact count, but never permission
            # to retry/dispatch after a failed write acknowledgement.
            try:
                observed = self.validate(self.store.read())
                if observed in (rows, rows + [case]):
                    self.known_count = len(observed)
            except Exception:
                pass
            raise
        try:
            observed = self.validate(self.store.read())
            if observed != rows + [case]:
                raise RuntimeError('attempt append not durable')
        except Exception:
            self.uncertain = True
            raise
        self.known_count = len(observed)
        self.minimum = len(observed)
        self.possibly_consumed = None
        return self.known_count


def execute_core(driver, ledger, recoveries, emit):
    """Injected finite batch; final emission attempted even on ledger failure.

    Lifecycle FAIL may continue only with controller and external cleanup safe,
    but can never qualify. dispatch remains timeout=100, independent recovery
    deadline, no native adapter or fresh attempt authority.
    """
    result = {'receipts': [], 'recovery': [], 'qualified': False}
    try:
        rows = ledger.read()
        if rows:
            raise RuntimeError('existing consumed ledger; batch cannot restart or resume')
        for case in range(1, ledger.maximum + 1):
            capability = recoveries.get(case)
            if capability is None:
                raise RuntimeError('outside-controller recovery unavailable; unqualified')
            # Any consume uncertainty exits before dispatch: no process recovery
            # needed for an attempt that never crossed the dispatch boundary.
            ledger.consume(case)
            failed = True
            try:
                driver.dispatch(case, timeout=100)
                receipt = driver.receipt(case)
                if (not isinstance(receipt, dict) or type(receipt.get('case')) is not int
                        or receipt.get('case') != case
                        or type(receipt.get('cleanup_safe')) is not bool
                        or receipt.get('lifecycle') not in ('FAIL', 'PASS injected contract only')
                        or type(receipt.get('lifecycle')) is not str):
                    raise RuntimeError('missing, corrupt or partial receipt')
                result['receipts'].append(receipt)
                failed = not receipt['cleanup_safe']
            except Exception as error:
                result['error'] = str(error)
            finally:
                try:
                    recovery = capability.cleanup(driver.recovery_deadline, emit)
                    if not isinstance(recovery, dict):
                        raise RuntimeError('corrupt external cleanup receipt')
                except Exception as error:
                    recovery = {'cleanup_safe': False, 'error': str(error)}
                result['recovery'].append(recovery)
            if failed or recovery.get('cleanup_safe') is not True:
                break
        result['qualified'] = (not ledger.uncertain
            and ledger.known_count == ledger.maximum
            and len(result['receipts']) == ledger.maximum
            and len(result['recovery']) == ledger.maximum
            and all(r['cleanup_safe'] is True and r['lifecycle'] == 'PASS injected contract only'
                    for r in result['receipts'])
            and all(r.get('cleanup_safe') is True for r in result['recovery']))
    except Exception as error:
        result['error'] = str(error)
    finally:
        result.update(ledger.state())
        emit(result)
    return result
