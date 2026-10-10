import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeFixture } from '../helpers/nativeFixtures.ts';
import { selectPythonExecutable } from '../../packages/local-transcription/src/pythonExecutable.ts';
import { normalize } from 'node:path';
import { alignWordsWithWhisperX, transcribeWithFasterWhisper, type CommandRunner } from '../../packages/local-transcription/src/index.ts';

const payload = JSON.stringify({ engine: 'fake', model_name: 'fake', language: 'pl', segments: [] });
const adapters = [
  ['transcription', (pythonPath: string | undefined, runner?: CommandRunner) => transcribeWithFasterWhisper({
    ...(pythonPath !== undefined ? { pythonPath } : {}),
    scriptPath: nativeFixture('scripts/fake.py'), audioPath: nativeFixture('audio.wav'), language: 'pl', modelName: 'small',
  }, runner)],
  ['alignment', (pythonPath: string | undefined, runner?: CommandRunner) => alignWordsWithWhisperX({
    ...(pythonPath !== undefined ? { pythonPath } : {}),
    scriptPath: nativeFixture('scripts/fake.py'), audioPath: nativeFixture('audio.wav'),
    transcriptJsonPath: nativeFixture('segments.json'), language: 'pl',
  }, runner)],
] as const;

afterEach(() => vi.unstubAllEnvs());

describe('Python selection policy', () => {
  it.each([['win32', 'python'], ['linux', 'python3']] as const)('keeps the explicit %s default', (platform, command) => {
    expect(selectPythonExecutable(undefined, {}, platform)).toBe(command);
    expect(selectPythonExecutable(undefined, { LINGOTORTE_PYTHON_PATH: 'operator' }, platform)).toBe('operator');
    expect(selectPythonExecutable('injected', { LINGOTORTE_PYTHON_PATH: '' }, platform)).toBe('injected');
  });
  it('preserves an unquoted native path with spaces and Unicode as one token', () => {
    const command = nativeFixture('Python żółć/python.exe');
    expect(selectPythonExecutable(command, {})).toBe(normalize(command));
    expect(selectPythonExecutable(undefined, { LINGOTORTE_PYTHON_PATH: command })).toBe(normalize(command));
  });
});

describe.each(adapters)('Python executable %s', (_name, run) => {
  it('uses the host default without an operator setting', async () => {
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', undefined);
    const runner = vi.fn<CommandRunner>().mockResolvedValue({ exitCode: 0, stdout: payload, stderr: '' });
    await run(undefined, runner);
    expect(runner.mock.calls[0]?.[0]).toBe(process.platform === 'win32' ? 'python' : 'python3');
  });

  it('uses the operator setting and gives explicit injection precedence', async () => {
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', 'operator-python');
    const runner = vi.fn<CommandRunner>().mockResolvedValue({ exitCode: 0, stdout: payload, stderr: '' });
    await run(undefined, runner);
    await run('injected-python', runner);
    expect(runner.mock.calls.map(([command]) => command)).toEqual(['operator-python', 'injected-python']);
  });

  it.each(['', ' ', 'py -3', 'python --version', './python', '"python"', '//server/private/python'])('rejects malformed operator setting %j before runner execution', async (value) => {
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', value);
    const runner = vi.fn<CommandRunner>();
    await expect(run(undefined, runner)).rejects.toThrow(/Python executable configuration/);
    expect(runner).not.toHaveBeenCalled();
  });

  it('does not retry after either an unavailable launch or a Python exit failure', async () => {
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', 'operator-python');
    for (const result of [
      { exitCode: 1, stdout: '', stderr: 'private-path', launchError: 'unavailable' as const },
      { exitCode: 7, stdout: '', stderr: 'private-path' },
    ]) {
      const runner = vi.fn<CommandRunner>().mockResolvedValue(result);
      await expect(run(undefined, runner)).rejects.toThrow(result.launchError ? /Python executable is unavailable/ : /failed with exit code 7/);
      expect(runner).toHaveBeenCalledTimes(1);
      expect(runner.mock.calls[0]?.[0]).toBe('operator-python');
    }
  });

  it('reports a real missing explicit interpreter without fallback or path disclosure', async () => {
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', 'python');
    await expect(run('__lingotorte_missing_python__')).rejects.toThrow(
      'Python executable is unavailable. Configure LINGOTORTE_PYTHON_PATH with one installed executable.',
    );
  });
});
