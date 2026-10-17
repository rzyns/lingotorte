// lt-5lb.5: load + validate the as-is workflow catalog (pass-1 structure and pass-2 journeys).
// Validation layers: JSON Schema (ajv), cross-references (journey -> structure ids and routes),
// provenance (every path:line points into the current tree; structure snippets must still match),
// and freshness (structure.yaml equals a fresh extraction). Pure functions; the CLI and the vitest
// guard both call `validateCatalog`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { extractStructure, type Structure } from './extract-structure.ts';

export const CATALOG_DIR = 'docs/workflows';
export const STRUCTURE_FILE = `${CATALOG_DIR}/as-is/structure.yaml`;
export const JOURNEYS_DIR = `${CATALOG_DIR}/as-is/journeys`;
export const SCHEMA_DIR = `${CATALOG_DIR}/schema`;

export type Evidence = Readonly<{ kind: 'observed-live' | 'source-reading' | 'jsdom-test' | 'inference'; ref?: string; note?: string }>;
export type Interaction = Readonly<{ kind: string; target?: string; key?: string; count?: number; note?: string }>;
export type Failure = Readonly<{ condition: string; appResponse: string; recovery?: string; source?: string }>;
export type Step = Readonly<{
  id: string; view: string; title?: string; userSees: string; userDoes: readonly Interaction[]; decision?: string; feedback: string;
  persists?: readonly string[]; api?: readonly string[]; canFail?: readonly Failure[]; focusAfter?: string; modal?: boolean; navigatesTo?: string;
  source?: readonly string[]; evidence?: Evidence;
}>;
export type Journey = Readonly<{
  schema: string; id: string; title: string; goal: string; actor: string; evidence: Evidence; preconditions: readonly string[];
  variants?: readonly Readonly<{ id: string; divergesAt: string; summary: string; evidence?: Evidence }>[];
  steps: readonly Step[]; outcome: Readonly<{ summary: string; persisted?: readonly string[] }>;
  observations?: readonly Readonly<{ id: string; text: string; atStep?: string; evidence: Evidence }>[];
}>;
export type Catalog = Readonly<{ structure: Structure; journeys: readonly Readonly<{ file: string; journey: Journey }>[] }>;
export type Finding = Readonly<{ file: string; message: string }>;

const TARGETED = new Set(['click', 'key', 'type', 'file-input', 'paste', 'select-text', 'drag']);

export function loadCatalog(root: string): Catalog {
  const structure = parse(readFileSync(join(root, STRUCTURE_FILE), 'utf8')) as Structure;
  const dir = join(root, JOURNEYS_DIR);
  const journeys = (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort() : [])
    .map((f) => ({ file: `${JOURNEYS_DIR}/${f}`, journey: parse(readFileSync(join(dir, f), 'utf8')) as Journey }));
  return { structure, journeys };
}

function schemaFindings(root: string, file: string, schemaName: string, data: unknown): Finding[] {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = JSON.parse(readFileSync(join(root, SCHEMA_DIR, schemaName), 'utf8')) as object;
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  return (validate.errors ?? []).map((e) => ({ file, message: `schema ${e.instancePath || '/'} ${e.message ?? ''}${e.params && 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : ''}` }));
}

function lineCount(root: string, path: string): number | null {
  const full = join(root, path);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8').split(/\r?\n/).length;
}

function checkSourceRef(root: string, file: string, ref: string, where: string): Finding[] {
  const m = /^(.+):(\d+)$/.exec(ref);
  if (!m) return [{ file, message: `${where}: malformed source ref ${ref}` }];
  const count = lineCount(root, m[1] ?? '');
  if (count === null) return [{ file, message: `${where}: source file missing ${m[1]}` }];
  if (Number(m[2]) > count) return [{ file, message: `${where}: ${ref} is past the end of the file (${count} lines)` }];
  return [];
}

export function validateCatalog(root: string, catalog: Catalog = loadCatalog(root)): Finding[] {
  const findings: Finding[] = [];
  const { structure } = catalog;

  // 1. Structure: schema, freshness, provenance snippets.
  findings.push(...schemaFindings(root, STRUCTURE_FILE, 'structure.schema.json', structure));
  const fresh = extractStructure(root);
  if (JSON.stringify(fresh) !== JSON.stringify(structure)) {
    findings.push({ file: STRUCTURE_FILE, message: 'stale: differs from a fresh extraction; run node scripts/workflows/extract-structure.cli.ts' });
  }
  const snippetRefs = [
    ...structure.controls.map((c) => c.source),
    ...structure.keyboard.handlers.map((h) => h.source),
    ...structure.api.routes.map((r) => r.source),
    ...structure.api.callers.map((c) => c.source),
    ...structure.persistence.autosaveCallers.map((c) => c.source),
    ...structure.persistence.unsavedMarkers.map((c) => c.source),
  ];
  const fileCache = new Map<string, string[]>();
  for (const ref of snippetRefs) {
    let lines = fileCache.get(ref.path);
    if (!lines) {
      const full = join(root, ref.path);
      lines = existsSync(full) ? readFileSync(full, 'utf8').split(/\r?\n/) : [];
      fileCache.set(ref.path, lines);
    }
    const actual = (lines[ref.line - 1] ?? '').trim();
    const expected = ref.snippet.endsWith('…') ? ref.snippet.slice(0, -1) : ref.snippet;
    if (!actual.startsWith(expected)) findings.push({ file: STRUCTURE_FILE, message: `provenance drift at ${ref.path}:${ref.line}: expected "${ref.snippet}"` });
  }
  const controlIds = new Set(structure.controls.map((c) => c.id));
  if (controlIds.size !== structure.controls.length) findings.push({ file: STRUCTURE_FILE, message: 'duplicate control ids' });
  const viewIds = new Set(structure.views.map((v) => v.id));
  const routeKeys = new Set(structure.api.routes.flatMap((r) => r.methods.map((m) => `${m} ${r.path}`)));

  // 2. Journeys: schema, cross-refs, provenance, internal consistency.
  const journeyIds = new Set<string>();
  for (const { file, journey } of catalog.journeys) {
    findings.push(...schemaFindings(root, file, 'journey.schema.json', journey));
    if (journeyIds.has(journey.id)) findings.push({ file, message: `duplicate journey id ${journey.id}` });
    journeyIds.add(journey.id);
    if (!file.endsWith(`/${journey.id}.yaml`)) findings.push({ file, message: `file name must equal journey id (${journey.id})` });
    const stepIds = new Set<string>();
    let previous = '';
    for (const step of journey.steps ?? []) {
      const where = `step ${step.id}`;
      if (stepIds.has(step.id)) findings.push({ file, message: `${where}: duplicate step id` });
      stepIds.add(step.id);
      if (previous && step.id <= previous) findings.push({ file, message: `${where}: steps must be in ascending id order (after ${previous})` });
      previous = step.id;
      if (!viewIds.has(step.view)) findings.push({ file, message: `${where}: unknown view ${step.view}` });
      if (step.navigatesTo && !viewIds.has(step.navigatesTo)) findings.push({ file, message: `${where}: unknown navigatesTo ${step.navigatesTo}` });
      for (const action of step.userDoes ?? []) {
        if (TARGETED.has(action.kind) && !action.target) findings.push({ file, message: `${where}: ${action.kind} needs a target control id` });
        if (action.target && !controlIds.has(action.target)) findings.push({ file, message: `${where}: unknown control ${action.target}` });
        if (action.kind === 'key' && !action.key) findings.push({ file, message: `${where}: key interaction needs key` });
      }
      for (const api of step.api ?? []) if (!routeKeys.has(api.replace(/\/[0-9a-f-]{36}(\b|$)/, '/{uuid}'))) findings.push({ file, message: `${where}: unknown route ${api}` });
      for (const ref of step.source ?? []) findings.push(...checkSourceRef(root, file, ref, where));
      for (const failure of step.canFail ?? []) if (failure.source) findings.push(...checkSourceRef(root, file, failure.source, where));
      if (step.focusAfter && step.focusAfter !== 'body' && !controlIds.has(step.focusAfter) && !/\s/.test(step.focusAfter)) {
        findings.push({ file, message: `${where}: focusAfter ${step.focusAfter} is neither a control id, 'body', nor a description` });
      }
    }
    for (const variant of journey.variants ?? []) if (!stepIds.has(variant.divergesAt)) findings.push({ file, message: `variant ${variant.id}: divergesAt ${variant.divergesAt} is not a step` });
    for (const obs of journey.observations ?? []) if (obs.atStep && !stepIds.has(obs.atStep)) findings.push({ file, message: `observation ${obs.id}: atStep ${obs.atStep} is not a step` });
  }
  return findings;
}
