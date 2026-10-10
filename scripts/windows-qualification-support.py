"""Pure packet checks; import does not inspect environment or spawn anything."""
import hashlib
import json
from pathlib import Path

if not __debug__:
    raise RuntimeError('optimized Python disables qualification assertions; blocked')

ALLOWED = frozenset('APPDATA COMSPEC GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM HF_HOME HF_HUB_OFFLINE HOME LINGOTORTE_ALLOW_ONLINE_PROVIDERS LINGOTORTE_DATA_DIR LINGOTORTE_DB_PATH LINGOTORTE_MODEL_CACHE_DIR LINGOTORTE_PYTHON_PATH LINGOTORTE_SCRATCH_DIR LOCALAPPDATA PATH PATHEXT POWERSHELL_TELEMETRY_OPTOUT POWERSHELL_UPDATECHECK ProgramFiles ProgramFiles(x86) ProgramW6432 SystemRoot TEMP TMP TMPDIR TRANSFORMERS_OFFLINE USERPROFILE WINDIR npm_config_audit npm_config_cache npm_config_fund npm_config_update_notifier'.split())
ROOT_KEYS = frozenset('GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM APPDATA HOME USERPROFILE LOCALAPPDATA HF_HOME LINGOTORTE_DATA_DIR LINGOTORTE_DB_PATH LINGOTORTE_MODEL_CACHE_DIR LINGOTORTE_SCRATCH_DIR TEMP TMP TMPDIR npm_config_cache'.split())
FILE_KEYS = frozenset(('LINGOTORTE_DB_PATH', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'))

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def validate_environment(env, packet, candidate):
    assert set(env) <= ALLOWED, 'non-allowlisted environment'
    assert ROOT_KEYS <= set(env), 'missing synthetic roots'
    for key in ROOT_KEYS:
        value = Path(env[key]).resolve()
        assert value.is_relative_to(packet.resolve()) and not value.is_relative_to(candidate.resolve()), key
    assert env['LINGOTORTE_ALLOW_ONLINE_PROVIDERS'] == 'false'
    assert env['POWERSHELL_TELEMETRY_OPTOUT'] == '1'
    assert env['POWERSHELL_UPDATECHECK'] == 'Off'
    assert env['HF_HUB_OFFLINE'] == env['TRANSFORMERS_OFFLINE'] == '1'
    assert env['GIT_CONFIG_NOSYSTEM'] == '1'
    for key in ('GIT_CONFIG_GLOBAL','GIT_CONFIG_SYSTEM'):
        assert Path(env[key]).read_bytes() == b'', 'isolated empty Git configuration required'
    assert Path(env['LINGOTORTE_DB_PATH']).parent == Path(env['LINGOTORTE_DATA_DIR'])
    assert Path(env['LINGOTORTE_SCRATCH_DIR']) != Path(env['LINGOTORTE_DATA_DIR'])
    return dict(env)

def verify_packet(packet, expected_manifest_sha=None):
    packet = Path(packet)
    manifest_path = packet / 'manifest.json'
    if expected_manifest_sha is not None:
        assert digest(manifest_path) == expected_manifest_sha, 'packet manifest identity'
    manifest = load(manifest_path)
    for row in manifest['files']:
        target = packet / row['path']
        assert target.resolve().is_relative_to(packet.resolve()), 'packet escape'
        assert target.stat().st_size == row['size'] and digest(target) == row['sha256'], row['path']
    binding = load(packet / 'binding.json')
    for row in binding['runtime_files']:
        assert digest(row['path']) == row['sha256'], 'runtime binary drift'
    counts = []
    for group in binding['groups']:
        assert digest(group['manifest']) == group['sha256'], 'bound manifest drift'
        rows = load(group['manifest'])['files']
        for row in rows:
            p = Path(group['root']) / row['path']
            assert '..' not in Path(row['path']).parts and not Path(row['path']).is_absolute(), 'manifest escape'
            if Path(group['manifest']).name != 'dependency-manifest.json':
                assert p.resolve().is_relative_to(Path(group['root']).resolve()), 'resolved source/receipt escape'
            assert p.stat().st_size == row['size'] and digest(p) == row['sha256'], row['path']
        counts.append(len(rows))
    for mapping in binding['mappings']:
        assert Path(mapping['candidate']).resolve() == Path(mapping['real']).resolve(), 'dependency target drift'
    assert Path(binding['parser']['entry']).resolve() == Path(binding['parser']['real']).resolve()
    assert digest(binding['parser']['entry']) == binding['parser']['sha256']
    validate_environment(load(packet / 'environment.json'), packet, Path(binding['snapshotRoot']))
    return {'files': counts, 'unchanged': True, 'probe_sha256': digest(packet / 'successor.py'), 'manifest_sha256': digest(manifest_path)}

def require_disposition(packet, disposition_path=None, expected_manifest_sha=None):
    # This is an operator scope gate, not cryptographic human authorization.
    # No token/disposition is issued by any preparation function.
    assert disposition_path and expected_manifest_sha, 'BLOCKED: new explicit bounded execution disposition and packet hash required'
    packet = Path(packet)
    assert digest(packet / 'manifest.json') == expected_manifest_sha, 'packet hash mismatch'
    disposition = load(disposition_path)
    assert disposition.get('authorization') == 'lt-c0r.2-new-bounded-live-disposition'
    assert disposition.get('allow_live') is True and disposition.get('attempts') == 1
    assert disposition.get('packet_manifest_sha256') == expected_manifest_sha
    assert disposition.get('binding_sha256') == digest(packet / 'binding.json')
    assert disposition.get('parent_approval_reference'), 'parent approval reference required'
    assert not (packet / 'execution-started.json').exists(), 'one execution only'
    return disposition
