import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  alignWordsWithWhisperX,
  extractAudioWithFfmpeg,
  nodeCommandRunner,
  transcribeWithElevenLabsScribe,
  transcribeWithFasterWhisper,
  type CommandRunner,
} from '../../packages/local-transcription/src/index';

const execFileAsync = promisify(execFile);

describe('local transcription pipeline', () => {
  it('reports process launch failures as nonzero command results', async () => {
    const result = await nodeCommandRunner('__lingotorte_missing_command_for_test__', [], {});

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/__lingotorte_missing_command_for_test__|ENOENT|spawn/i);
  });

  it('extracts mono 16 kHz WAV audio with ffmpeg through an injected runner', async () => {
    const calls: Parameters<CommandRunner>[] = [];
    const runner: CommandRunner = async (...args) => {
      calls.push(args);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = await extractAudioWithFfmpeg({
      ffmpegPath: 'ffmpeg',
      inputPath: '/media/input video.mp4',
      outputPath: '/tmp/lingotorte/audio.wav',
    }, runner);

    expect(calls).toEqual([[
      'ffmpeg',
      [
        '-hide_banner',
        '-y',
        '-i',
        '/media/input video.mp4',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        '/tmp/lingotorte/audio.wav',
      ],
      { cwd: '/tmp/lingotorte' },
    ]]);
    expect(result).toEqual({
      effect: 'audio-extracted',
      audioPath: '/tmp/lingotorte/audio.wav',
      sampleRateHz: 16000,
      channels: 1,
      codec: 'pcm_s16le',
    });
  });

  it('runs faster-whisper locally and normalizes segment and word timestamp JSON', async () => {
    const calls: Parameters<CommandRunner>[] = [];
    const runner: CommandRunner = async (...args) => {
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          engine: 'faster-whisper',
          model_name: 'small',
          model_version: '1.1.1-test',
          language: 'pl',
          segments: [{
            start: 0,
            end: 1.5,
            text: 'Cześć świecie.',
            avg_logprob: -0.2,
            words: [
              { word: 'Cześć', start: 0, end: 0.62, probability: 0.96, speaker: 'speaker_0' },
              { word: 'świecie', start: 0.7, end: 1.4, probability: 0.91, speaker: 'speaker_0' },
            ],
          }],
        }),
      };
    };

    const result = await transcribeWithFasterWhisper({
      pythonPath: 'python3',
      scriptPath: '/repo/scripts/faster_whisper_transcribe.py',
      audioPath: '/tmp/lingotorte/audio.wav',
      language: 'pl',
      modelName: 'small',
      device: 'cpu',
      computeType: 'int8',
    }, runner);

    expect(calls).toEqual([[
      'python3',
      [
        '/repo/scripts/faster_whisper_transcribe.py',
        '--audio',
        '/tmp/lingotorte/audio.wav',
        '--language',
        'pl',
        '--model',
        'small',
        '--device',
        'cpu',
        '--compute-type',
        'int8',
        '--word-timestamps',
      ],
      { cwd: '/repo/scripts' },
    ]]);
    expect(result).toEqual({
      engine: 'faster-whisper',
      modelName: 'small',
      modelVersion: '1.1.1-test',
      language: 'pl',
      segments: [{
        startMs: 0,
        endMs: 1500,
        text: 'Cześć świecie.',
        confidence: 0.82,
        words: [
          { wordIndex: 0, text: 'Cześć', charStart: 0, charEnd: 5, startMs: 0, endMs: 620, confidence: 0.96, speakerId: 'speaker_0' },
          { wordIndex: 1, text: 'świecie', charStart: 6, charEnd: 13, startMs: 700, endMs: 1400, confidence: 0.91, speakerId: 'speaker_0' },
        ],
      }],
    });
  });

  it('refuses ElevenLabs Scribe transcription without explicit online-provider consent before HTTP execution', async () => {
    let httpCalls = 0;
    const httpClient = async () => {
      httpCalls += 1;
      return { status: 200, json: {} };
    };

    await expect(transcribeWithElevenLabsScribe({
      allowOnlineProvider: false,
      apiKey: 'test-api-key',
      audioPath: '/tmp/lingotorte/audio.wav',
      audioBytes: new Uint8Array([1, 2, 3]),
      language: 'pl',
    }, httpClient)).rejects.toThrow(/ElevenLabs|provider consent|disabled/i);
    expect(httpCalls).toBe(0);
  });

  it('posts an explicit ElevenLabs Scribe v2 request and normalizes word timestamp response JSON', async () => {
    const requests: unknown[] = [];
    const httpClient = async (request: unknown) => {
      requests.push(request);
      return {
        status: 200,
        json: {
          language_code: 'pl',
          language_probability: 0.98,
          text: 'Cześć świecie.',
          words: [
            { text: 'Cześć', start: 0, end: 0.62, type: 'word', speaker_id: 'speaker_0', logprob: -0.04 },
            { text: ' ', start: 0.62, end: 0.7, type: 'spacing', speaker_id: 'speaker_0' },
            { text: 'świecie', start: 0.7, end: 1.4, type: 'word', speaker_id: 'speaker_0', logprob: -0.09 },
          ],
        },
      };
    };

    const result = await transcribeWithElevenLabsScribe({
      allowOnlineProvider: true,
      apiKey: 'test-api-key',
      audioPath: '/tmp/lingotorte/audio.wav',
      audioBytes: new Uint8Array([1, 2, 3]),
      language: 'pl',
    }, httpClient);

    expect(requests).toEqual([{
      url: 'https://api.elevenlabs.io/v1/speech-to-text',
      method: 'POST',
      headers: { 'xi-api-key': 'test-api-key' },
      form: [
        { name: 'file', value: new Uint8Array([1, 2, 3]), filename: 'audio.wav', contentType: 'audio/wav' },
        { name: 'model_id', value: 'scribe_v2' },
        { name: 'timestamps_granularity', value: 'word' },
        { name: 'diarize', value: 'true' },
        { name: 'language_code', value: 'pl' },
      ],
    }]);
    expect(result).toEqual({
      engine: 'elevenlabs',
      modelName: 'scribe_v2',
      language: 'pl',
      segments: [{
        startMs: 0,
        endMs: 1400,
        text: 'Cześć świecie.',
        confidence: 0.98,
        words: [
          { wordIndex: 0, text: 'Cześć', charStart: 0, charEnd: 5, startMs: 0, endMs: 620, confidence: 0.96, speakerId: 'speaker_0', sourceKind: 'provider-word-timing' },
          { wordIndex: 1, text: 'świecie', charStart: 6, charEnd: 13, startMs: 700, endMs: 1400, confidence: 0.91, speakerId: 'speaker_0', sourceKind: 'provider-word-timing' },
        ],
      }],
    });
  });

  it('runs WhisperX-style forced alignment and normalizes aligned word timings', async () => {
    const calls: Parameters<CommandRunner>[] = [];
    const runner: CommandRunner = async (...args) => {
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          engine: 'whisperx',
          model_name: 'whisperx-align-pl',
          model_version: '3.4.2-test',
          language: 'pl',
          segments: [{
            start: 0,
            end: 1.5,
            text: 'Cześć świecie.',
            words: [
              { word: 'Cześć', start: 0.02, end: 0.6, score: 0.97, speaker: 'speaker_0' },
              { word: 'świecie', start: 0.72, end: 1.42, score: 0.92, speaker: 'speaker_0' },
            ],
          }],
        }),
      };
    };

    const result = await alignWordsWithWhisperX({
      pythonPath: 'python3',
      scriptPath: '/repo/scripts/whisperx_align.py',
      audioPath: '/tmp/lingotorte/audio.wav',
      transcriptJsonPath: '/tmp/lingotorte/transcript-segments.json',
      language: 'pl',
      device: 'cpu',
    }, runner);

    expect(calls).toEqual([[
      'python3',
      [
        '/repo/scripts/whisperx_align.py',
        '--audio',
        '/tmp/lingotorte/audio.wav',
        '--transcript-json',
        '/tmp/lingotorte/transcript-segments.json',
        '--language',
        'pl',
        '--device',
        'cpu',
      ],
      { cwd: '/repo/scripts' },
    ]]);
    expect(result).toEqual({
      engine: 'whisperx',
      modelName: 'whisperx-align-pl',
      modelVersion: '3.4.2-test',
      language: 'pl',
      segments: [{
        startMs: 0,
        endMs: 1500,
        text: 'Cześć świecie.',
        words: [
          { wordIndex: 0, text: 'Cześć', charStart: 0, charEnd: 5, startMs: 20, endMs: 600, confidence: 0.97, speakerId: 'speaker_0', sourceKind: 'forced-alignment' },
          { wordIndex: 1, text: 'świecie', charStart: 6, charEnd: 13, startMs: 720, endMs: 1420, confidence: 0.92, speakerId: 'speaker_0', sourceKind: 'forced-alignment' },
        ],
      }],
    });
  });

  it('ships a dependency-lazy WhisperX Python alignment entrypoint with the expected CLI flags', async () => {
    const scriptPath = resolve('scripts/whisperx_align.py');

    const { stdout } = await execFileAsync('python3', [scriptPath, '--help']);

    expect(stdout).toContain('--audio');
    expect(stdout).toContain('--transcript-json');
    expect(stdout).toContain('--language');
    expect(stdout).toContain('--device');
  });

  it('ships a dependency-lazy faster-whisper Python entrypoint with the expected CLI flags', async () => {
    const scriptPath = resolve('scripts/faster_whisper_transcribe.py');

    const { stdout } = await execFileAsync('python3', [scriptPath, '--help']);

    expect(stdout).toContain('--audio');
    expect(stdout).toContain('--language');
    expect(stdout).toContain('--model');
    expect(stdout).toContain('--word-timestamps');
  });

  it('executes the faster-whisper Python entrypoint against a fake local module', async () => {
    const scriptPath = resolve('scripts/faster_whisper_transcribe.py');
    const fakeModuleDir = await mkdtemp(join(tmpdir(), 'lingotorte-fast-whisper-'));
    await writeFile(join(fakeModuleDir, 'faster_whisper.py'), `
class Word:
    word = 'Cześć'
    start = 0.0
    end = 0.62
    probability = 0.96

class Segment:
    start = 0.0
    end = 0.62
    text = 'Cześć'
    avg_logprob = -0.2
    words = [Word()]

class Info:
    language = 'pl'

class WhisperModel:
    def __init__(self, model, device, compute_type):
        self.model = model
        self.device = device
        self.compute_type = compute_type

    def transcribe(self, audio, language, beam_size, vad_filter, word_timestamps):
        return [Segment()], Info()
`, 'utf-8');

    const { stdout } = await execFileAsync('python3', [
      scriptPath,
      '--audio',
      '/tmp/lingotorte/audio.wav',
      '--language',
      'pl',
      '--model',
      'small',
      '--word-timestamps',
    ], { env: { ...process.env, PYTHONPATH: fakeModuleDir } });

    expect(JSON.parse(stdout)).toMatchObject({
      engine: 'faster-whisper',
      model_name: 'small',
      language: 'pl',
      segments: [{
        start: 0,
        end: 0.62,
        text: 'Cześć',
        avg_logprob: -0.2,
        words: [{ word: 'Cześć', start: 0, end: 0.62, probability: 0.96 }],
      }],
    });
  });

  it('executes the WhisperX Python alignment entrypoint against a fake local module', async () => {
    const scriptPath = resolve('scripts/whisperx_align.py');
    const fakeModuleDir = await mkdtemp(join(tmpdir(), 'lingotorte-whisperx-'));
    const transcriptJsonPath = join(fakeModuleDir, 'segments.json');
    await writeFile(transcriptJsonPath, JSON.stringify([
      { startMs: 0, endMs: 1500, text: 'Cześć świecie.' },
    ]), 'utf-8');
    await writeFile(join(fakeModuleDir, 'whisperx.py'), `
def load_audio(path):
    return {'path': path}

def load_align_model(language_code, device):
    return 'align-model', {'language': language_code, 'device': device}

def align(segments, align_model, metadata, audio, device, return_char_alignments=False):
    if audio != {'path': '/tmp/lingotorte/audio.wav'}:
        raise AssertionError(f'expected loaded audio object, got {audio!r}')
    return {'segments': [{
        'start': segments[0]['start'],
        'end': segments[0]['end'],
        'text': segments[0]['text'],
        'words': [{'word': 'Cześć', 'start': 0.02, 'end': 0.6, 'score': 0.97, 'speaker': 'speaker_0'}],
    }]}
`, 'utf-8');

    const { stdout } = await execFileAsync('python3', [
      scriptPath,
      '--audio',
      '/tmp/lingotorte/audio.wav',
      '--transcript-json',
      transcriptJsonPath,
      '--language',
      'pl',
      '--device',
      'cpu',
    ], { env: { ...process.env, PYTHONPATH: fakeModuleDir } });

    expect(JSON.parse(stdout)).toMatchObject({
      engine: 'whisperx',
      model_name: 'whisperx-align-pl',
      language: 'pl',
      segments: [{
        start: 0,
        end: 1.5,
        text: 'Cześć świecie.',
        words: [{ word: 'Cześć', start: 0.02, end: 0.6, score: 0.97, speaker: 'speaker_0' }],
      }],
    });
  });
});
