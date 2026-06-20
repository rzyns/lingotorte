import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { asRecord, requireArray, requireNumber, requireSha256, requireString } from './guards';
import type { FixtureCatalog, FixtureMediaRecord, FixtureSubtitleTrack, FixtureTranscript, NegativeFixtureRecord, Sha256Digest, SourceKind, SubtitleFormat, SubtitleRole } from './types';

function pathFromRoot(repoRoot: URL | string, relativePath: string): string {
  const normalizedRoot = typeof repoRoot === 'string' ? new URL(`file://${repoRoot.endsWith('/') ? repoRoot : `${repoRoot}/`}`) : repoRoot;
  return fileURLToPath(new URL(relativePath, normalizedRoot));
}

function parseJsonFile(repoRoot: URL | string, relativePath: string): unknown {
  return JSON.parse(readFileSync(pathFromRoot(repoRoot, relativePath), 'utf8')) as unknown;
}

function sha256File(repoRoot: URL | string, relativePath: string): Sha256Digest {
  const digest = createHash('sha256').update(readFileSync(pathFromRoot(repoRoot, relativePath))).digest('hex');
  return `sha256:${digest}` as Sha256Digest;
}

function requireOneOf<T extends string>(value: string, key: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    throw new TypeError(`${key} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function validateMedia(input: unknown, repoRoot: URL | string): FixtureMediaRecord {
  const record = asRecord(input, 'fixture media');
  const path = requireString(record, 'path');
  const sha256 = requireSha256(record, 'sha256');
  const actualSha = sha256File(repoRoot, path);
  if (actualSha !== sha256) {
    throw new TypeError(`fixture media hash mismatch for ${path}`);
  }
  return {
    id: requireString(record, 'id'),
    path,
    sourceKind: requireOneOf(requireString(record, 'sourceKind'), 'sourceKind', ['synthetic', 'owned', 'licensed'] satisfies SourceKind[]),
    container: requireString(record, 'container'),
    durationMs: requireNumber(record, 'durationMs'),
    sha256,
    generation: requireString(record, 'generation'),
  };
}

function validateSubtitleTrack(input: unknown, repoRoot: URL | string): FixtureSubtitleTrack {
  const record = asRecord(input, 'fixture subtitle track');
  const path = requireString(record, 'path');
  const sha256 = requireSha256(record, 'sha256');
  if (sha256File(repoRoot, path) !== sha256) {
    throw new TypeError(`fixture subtitle hash mismatch for ${path}`);
  }
  return {
    id: requireString(record, 'id'),
    role: requireOneOf(requireString(record, 'role'), 'role', ['target', 'native', 'other'] satisfies SubtitleRole[]),
    language: requireString(record, 'language'),
    format: requireOneOf(requireString(record, 'format'), 'format', ['srt', 'vtt', 'ass', 'json'] satisfies SubtitleFormat[]),
    path,
    sha256,
  };
}

function validateNegativeFixture(input: unknown, repoRoot: URL | string): NegativeFixtureRecord {
  const record = asRecord(input, 'negative fixture');
  const path = requireString(record, 'path');
  const sha256 = requireSha256(record, 'sha256');
  if (sha256File(repoRoot, path) !== sha256) {
    throw new TypeError(`negative fixture hash mismatch for ${path}`);
  }
  return {
    id: requireString(record, 'id'),
    purpose: requireString(record, 'purpose'),
    path,
    sha256,
  };
}

function validateTranscriptFile(repoRoot: URL | string, path: string): FixtureTranscript {
  const transcript = asRecord(parseJsonFile(repoRoot, path), 'fixture transcript');
  if (requireString(transcript, 'schemaVersion') !== 'lingotorte.fixture-transcript.v1') {
    throw new TypeError('fixture transcript schemaVersion is unsupported');
  }
  const cues = requireArray(transcript, 'cues').map((cue) => {
    const cueRecord = asRecord(cue, 'fixture transcript cue');
    const nativeText = cueRecord.nativeText;
    return {
      cueId: requireString(cueRecord, 'cueId'),
      startMs: requireNumber(cueRecord, 'startMs'),
      endMs: requireNumber(cueRecord, 'endMs'),
      targetText: requireString(cueRecord, 'targetText'),
      ...(typeof nativeText === 'string' ? { nativeText } : {}),
    };
  });
  return {
    schemaVersion: 'lingotorte.fixture-transcript.v1',
    mediaId: requireString(transcript, 'mediaId'),
    targetTrackId: requireString(transcript, 'targetTrackId'),
    ...(typeof transcript.nativeTrackId === 'string' ? { nativeTrackId: transcript.nativeTrackId } : {}),
    cues,
  };
}

export function loadSyntheticFixtureCatalog(repoRoot: URL | string): FixtureCatalog {
  const manifest = asRecord(parseJsonFile(repoRoot, 'fixtures/manifest.json'), 'fixture manifest');
  if (requireString(manifest, 'schemaVersion') !== 'lingotorte.fixture-catalog.v1') {
    throw new TypeError('fixture manifest schemaVersion is unsupported');
  }
  const transcriptMeta = asRecord(manifest.transcript, 'fixture transcript metadata');
  const transcriptPath = requireString(transcriptMeta, 'path');
  const transcriptSha = requireSha256(transcriptMeta, 'sha256');
  if (sha256File(repoRoot, transcriptPath) !== transcriptSha) {
    throw new TypeError(`fixture transcript hash mismatch for ${transcriptPath}`);
  }
  const markers = requireArray(manifest, 'prohibitedSourceMarkers').map((marker) => {
    if (typeof marker !== 'string') {
      throw new TypeError('prohibitedSourceMarkers must contain strings');
    }
    return marker;
  });
  return {
    schemaVersion: 'lingotorte.fixture-catalog.v1',
    generatedUtc: requireString(manifest, 'generatedUtc'),
    provenance: requireString(manifest, 'provenance'),
    prohibitedSourceMarkers: markers,
    media: validateMedia(manifest.media, repoRoot),
    subtitleTracks: requireArray(manifest, 'subtitleTracks').map((track) => validateSubtitleTrack(track, repoRoot)),
    negativeFixtures: requireArray(manifest, 'negativeFixtures').map((fixture) => validateNegativeFixture(fixture, repoRoot)),
    transcript: {
      ...validateTranscriptFile(repoRoot, transcriptPath),
      path: transcriptPath,
      sha256: transcriptSha,
    },
  };
}
