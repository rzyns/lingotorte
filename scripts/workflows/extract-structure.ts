// lt-5lb.5: pass 1 of the as-is workflow catalog. Mechanical, deterministic extraction of the app's
// structure from source text: views and nav, interactive controls (with labels, ids, guards, events),
// keyboard handlers, declared shortcuts, service API routes and their browser callers, and the
// mutations that persist to the local service. Every entry carries path:line provenance plus the
// trimmed source line, so the validator can detect a stale catalog without re-running this extractor.
//
// This is text analysis, not a type-checked program model: it follows the codebase's own convention
// (`const x = document.createElement('button'); x.textContent = '...'`). Anything it cannot read as a
// literal is recorded as dynamic with the raw expression, never guessed. No timestamps or revision
// fields are written, so the output is byte-stable for an unchanged tree.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SHORTCUT_HELP } from '../../apps/web/src/ui/shortcutHelp.ts';

export const STRUCTURE_SCHEMA_ID = 'lingotorte.workflow-structure.v1';

export type SourceRef = Readonly<{ path: string; line: number; snippet: string }>;
export type ViewEntry = Readonly<{ id: string; label: string; navOrder: number; renderer: Readonly<{ path: string; symbol: string }> }>;
export type ControlEntry = Readonly<{
  id: string;
  scope: string;
  tag: string;
  variable: string;
  labels: readonly string[];
  labelExpr?: string;
  ariaLabel?: string;
  elementId?: string;
  type?: string;
  className?: string;
  dataset?: Readonly<Record<string, string>>;
  guarded?: string;
  title?: string;
  placeholder?: string;
  events: readonly string[];
  source: SourceRef;
}>;
export type KeyHandlerEntry = Readonly<{ key: string; scope: string; source: SourceRef }>;
export type DeclaredShortcut = Readonly<{ section: string; key: string; action: string }>;
export type RouteEntry = Readonly<{ path: string; methods: readonly string[]; bodyLimitBytes?: number; source: SourceRef }>;
export type RouteCaller = Readonly<{ route: string; source: SourceRef }>;
export type PersistCaller = Readonly<{ symbol: string; source: SourceRef }>;
export type Structure = Readonly<{
  schema: typeof STRUCTURE_SCHEMA_ID;
  generatedBy: string;
  sourceRoots: readonly string[];
  views: readonly ViewEntry[];
  controls: readonly ControlEntry[];
  keyboard: Readonly<{ declared: readonly DeclaredShortcut[]; handlers: readonly KeyHandlerEntry[] }>;
  api: Readonly<{ routes: readonly RouteEntry[]; callers: readonly RouteCaller[] }>;
  persistence: Readonly<{ autosaveCallers: readonly PersistCaller[]; unsavedMarkers: readonly PersistCaller[] }>;
}>;

const WEB_SRC = 'apps/web/src';
const SERVICE_SRC = 'apps/local-service/src';
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea', 'dialog', 'details', 'a']);
const EVENTS = new Set(['click', 'change', 'input', 'submit', 'keydown', 'toggle', 'cancel', 'mouseup']);
const SNIPPET_MAX = 80;

function posix(p: string): string {
  return p.split(sep).join('/');
}

function listTsFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listTsFiles(root, full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(posix(relative(root, full)));
  }
  return out;
}

function snippet(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > SNIPPET_MAX ? `${trimmed.slice(0, SNIPPET_MAX - 1)}…` : trimmed;
}

function ref(path: string, lineIndex: number, lines: readonly string[]): SourceRef {
  return { path, line: lineIndex + 1, snippet: snippet(lines[lineIndex] ?? '') };
}

/** Scope = the view a file renders for, or `shell` / `shared`. */
export function scopeForFile(path: string): string {
  if (path.startsWith(`${WEB_SRC}/views/player/`)) return 'player';
  if (path === `${WEB_SRC}/morphologyPanel.ts`) return 'player';
  const view = /^apps\/web\/src\/views\/([a-zA-Z]+)\.ts$/.exec(path)?.[1];
  if (view) return view === 'exportImport' ? 'export-import' : view;
  if (path === `${WEB_SRC}/appShell.ts`) return 'shell';
  return 'shared';
}

function literals(expr: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) out.push((m[1] ?? '').replace(/\\'/g, "'").replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  return out;
}

export function slug(text: string): string {
  const s = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 48).replace(/-+$/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Draft = {
  variable: string; tag: string; lineIndex: number; labels: string[]; labelExpr?: string; ariaLabel?: string; elementId?: string;
  type?: string; className?: string; dataset: Record<string, string>; guarded?: string; title?: string; placeholder?: string; events: Set<string>;
};

/** `export const NAME = '...'` constants in the web sources, so labels assigned from a constant resolve to text. */
function collectStringConstants(root: string, files: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^export const ([A-Z][A-Z0-9_]+)\s*=\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2;/;
  for (const path of files) {
    for (const line of readFileSync(join(root, path), 'utf8').split(/\r?\n/)) {
      const m = re.exec(line);
      if (m && m[1] && m[3] !== undefined) out.set(m[1], m[3].replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\(['"])/g, '$1'));
    }
  }
  return out;
}

function extractControls(root: string, files: readonly string[]): ControlEntry[] {
  const drafts: Array<Draft & { path: string }> = [];
  const constants = collectStringConstants(root, files);
  for (const path of files) {
    const lines = readFileSync(join(root, path), 'utf8').split(/\r?\n/);
    const live = new Map<string, Draft>();
    const declRe = /\b(?:const|let)\s+(\w+)\s*=\s*document\.createElement\('(\w+)'\)/;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const decl = declRe.exec(line);
      if (decl) {
        const [, variable, tag] = decl;
        // A <span> (or other element) becomes a control only when the next line gives it role="button".
        const roleNext = /\.setAttribute\('role', '(button|tab|link|switch)'\)/.exec(lines[i + 1] ?? '')?.[1];
        const roleTag = tag && !CONTROL_TAGS.has(tag) && roleNext && (lines[i + 1] ?? '').includes(`${variable}.setAttribute`) ? `${tag}[role=${roleNext}]` : null;
        if (variable && tag && (CONTROL_TAGS.has(tag) || roleTag)) {
          const draft: Draft = { variable, tag: roleTag ?? tag, lineIndex: i, labels: [], dataset: {}, events: new Set() };
          live.set(variable, draft);
          drafts.push(Object.assign(draft, { path }));
        } else if (variable) {
          live.delete(variable);
        }
        // One-liners (`const b = document.createElement('button'); b.textContent = '…'; …`) keep their
        // attribute statements on the declaration line; scan them below instead of skipping the line.
        if (!line.includes(';', decl.index + decl[0].length)) continue;
      }
      // Statements are matched one at a time so a line with several `x.attr = …;` statements is read fully.
      const statements = line.split(/;(?=\s*(?:\w+\.|$))/).map((s) => `${s.trimStart()};`);
      for (const stmtRaw of statements) for (const [variable, draft] of live) {
        const line = stmtRaw;
        const v = escapeRegExp(variable);
        let m: RegExpExecArray | null;
        if ((m = new RegExp(`^\\s*${v}\\.textContent\\s*=\\s*(.+?);?\\s*$`).exec(line))) {
          const expr = m[1] ?? '';
          const found = literals(expr);
          const constant = /^[A-Z][A-Z0-9_]+$/.test(expr.trim()) ? constants.get(expr.trim()) : undefined;
          if (constant !== undefined) draft.labels.push(constant);
          else if (found.length && !/\$\{/.test(expr) && !/\bview\.label\b/.test(expr)) draft.labels.push(...found.filter((l) => !draft.labels.includes(l)));
          else draft.labelExpr = snippet(expr);
        } else if ((m = new RegExp(`^\\s*apply(\\w+)State\\(${v},`).exec(line))) {
          // Player transport buttons get their label from a state helper (applyPlayState etc.).
          draft.labelExpr = snippet(line);
        } else if ((m = new RegExp(`${v}\\.setAttribute\\('aria-label',\\s*(.+?)\\)`).exec(line))) {
          const lit = literals(m[1] ?? '');
          draft.ariaLabel = lit.length === 1 && !/\$\{/.test(m[1] ?? '') ? (lit[0] ?? '') : `dynamic: ${snippet(m[1] ?? '')}`;
        } else if ((m = new RegExp(`^\\s*${v}\\.id\\s*=\\s*(.+?);`).exec(line))) {
          const lit = literals(m[1] ?? '');
          draft.elementId = lit.length === 1 ? (lit[0] ?? '') : `dynamic: ${snippet(m[1] ?? '')}`;
        } else if ((m = new RegExp(`^\\s*${v}\\.type\\s*=\\s*'([^']+)'`).exec(line))) {
          draft.type = m[1] ?? '';
        } else if ((m = new RegExp(`^\\s*${v}\\.className\\s*=\\s*(.+?);`).exec(line))) {
          const lit = literals(m[1] ?? '');
          draft.className = lit.length === 1 && !/\$\{/.test(m[1] ?? '') ? (lit[0] ?? '') : `dynamic: ${snippet(m[1] ?? '')}`;
        } else if ((m = new RegExp(`^\\s*${v}\\.dataset\\.(\\w+)\\s*=\\s*(.+?);`).exec(line))) {
          const lit = literals(m[2] ?? '');
          draft.dataset[m[1] ?? ''] = lit.length === 1 ? (lit[0] ?? '') : `dynamic: ${snippet(m[2] ?? '')}`;
        } else if ((m = new RegExp(`^\\s*${v}\\.disabled\\s*=\\s*(.+?);`).exec(line))) {
          if (!draft.guarded) draft.guarded = snippet(m[1] ?? '');
        } else if ((m = new RegExp(`^\\s*${v}\\.title\\s*=\\s*(.+?);`).exec(line))) {
          const lit = literals(m[1] ?? '');
          if (lit.length === 1) draft.title = lit[0] ?? '';
        } else if ((m = new RegExp(`^\\s*${v}\\.placeholder\\s*=\\s*(.+?);`).exec(line))) {
          const lit = literals(m[1] ?? '');
          if (lit.length === 1) draft.placeholder = lit[0] ?? '';
        } else if ((m = new RegExp(`${v}\\.addEventListener\\('(\\w+)'`).exec(line))) {
          if (m[1] && EVENTS.has(m[1])) draft.events.add(m[1]);
        }
      }
    }
  }

  // Stable ids: `<scope>.<slug of first label | elementId | variable>`, deduplicated in source order.
  const used = new Map<string, number>();
  const controls: ControlEntry[] = [];
  for (const d of drafts) {
    const scope = scopeForFile(d.path);
    const base = (d.labels[0] && slug(d.labels[0])) || (d.elementId && !d.elementId.startsWith('dynamic') && slug(d.elementId)) || slug(d.variable) || 'control';
    const key = `${scope}.${base}`;
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    const lines = readFileSync(join(root, d.path), 'utf8').split(/\r?\n/);
    const entry: ControlEntry = {
      id: n === 1 ? key : `${key}-${n}`,
      scope,
      tag: d.tag,
      variable: d.variable,
      labels: d.labels,
      ...(d.labelExpr !== undefined && d.labels.length === 0 ? { labelExpr: d.labelExpr } : {}),
      ...(d.ariaLabel !== undefined ? { ariaLabel: d.ariaLabel } : {}),
      ...(d.elementId !== undefined ? { elementId: d.elementId } : {}),
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.className !== undefined ? { className: d.className } : {}),
      ...(Object.keys(d.dataset).length ? { dataset: d.dataset } : {}),
      ...(d.guarded !== undefined ? { guarded: d.guarded } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.placeholder !== undefined ? { placeholder: d.placeholder } : {}),
      events: [...d.events].sort(),
      source: ref(d.path, d.lineIndex, lines),
    };
    controls.push(entry);
  }
  return controls;
}

function extractViews(root: string): ViewEntry[] {
  const shellPath = `${WEB_SRC}/appShell.ts`;
  const shell = readFileSync(join(root, shellPath), 'utf8');
  const navBlock = /const views: \{ id: ViewName; label: string \}\[\] = \[([\s\S]*?)\];/.exec(shell)?.[1] ?? '';
  const nav: Array<{ id: string; label: string }> = [];
  const navRe = /\{ id: '([a-z-]+)', label: '([^']+)' \}/g;
  let m: RegExpExecArray | null;
  while ((m = navRe.exec(navBlock)) !== null) nav.push({ id: m[1] ?? '', label: m[2] ?? '' });
  const renderers = new Map<string, string>();
  const caseRe = /case '([a-z-]+)':\s*\n\s*main\.appendChild\((\w+)\(model\)\)/g;
  while ((m = caseRe.exec(shell)) !== null) renderers.set(m[1] ?? '', m[2] ?? '');
  const viewFiles = listTsFiles(root, join(root, WEB_SRC, 'views'));
  const out: ViewEntry[] = [];
  nav.forEach((entry, index) => {
    const symbol = renderers.get(entry.id) ?? '';
    const path = viewFiles.find((f) => new RegExp(`export function ${escapeRegExp(symbol)}\\(`).test(readFileSync(join(root, f), 'utf8'))) ?? shellPath;
    out.push({ id: entry.id, label: entry.label, navOrder: index + 1, renderer: { path, symbol } });
  });
  return out;
}

function extractKeyHandlers(root: string, files: readonly string[]): KeyHandlerEntry[] {
  const out: KeyHandlerEntry[] = [];
  const re = /\b(?:event|e|ev)\.key\s*===\s*'((?:[^'\\]|\\.)*)'/g;
  for (const path of files) {
    const lines = readFileSync(join(root, path), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(line)) !== null) {
        const key = m[1] ?? '';
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, scope: scopeForFile(path), source: ref(path, i, lines) });
      }
    });
  }
  return out;
}

function extractDeclaredShortcuts(): DeclaredShortcut[] {
  return SHORTCUT_HELP.flatMap((group) => group.items.map(([key, action]) => ({ section: group.section, key, action })));
}

function extractRoutes(root: string): RouteEntry[] {
  const path = `${SERVICE_SRC}/requestAdmission.ts`;
  const lines = readFileSync(join(root, path), 'utf8').split(/\r?\n/);
  const limits = new Map<string, number>();
  const limitLine = lines.findIndex((l) => l.includes('ROUTE_BODY_LIMITS'));
  if (limitLine >= 0) {
    const re = /'(\/api\/[^']+)':\s*(\d+)\s*\*\s*1024(\s*\*\s*1024)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lines[limitLine] ?? '')) !== null) limits.set(m[1] ?? '', Number(m[2]) * 1024 * (m[3] ? 1024 : 1));
  }
  const start = lines.findIndex((l) => l.startsWith('export function routeMethods('));
  const out: RouteEntry[] = [];
  for (let i = start + 1; i < lines.length && !lines[i]?.startsWith('}'); i += 1) {
    const line = lines[i] ?? '';
    const methods = /return \[([^\]]+)\]/.exec(line)?.[1]?.split(',').map((s) => s.trim().replace(/'/g, '')) ?? [];
    if (!methods.length) continue;
    const exact = [...line.matchAll(/path === '(\/api\/[^']+)'/g)].map((x) => x[1] ?? '');
    const pattern = /new RegExp\(`\^(\/api\/[^`]+)\$`\)/.exec(line)?.[1]?.replace(/\$\{uuid\}/g, '{uuid}').replace(/\\\//g, '/');
    for (const p of exact.length ? exact : pattern ? [pattern] : []) {
      const limit = limits.get(p);
      out.push({ path: p, methods, ...(limit !== undefined ? { bodyLimitBytes: limit } : {}), source: ref(path, i, lines) });
    }
  }
  return out;
}

function extractRouteCallers(root: string, files: readonly string[]): RouteCaller[] {
  const out: RouteCaller[] = [];
  const re = /['`](\/api\/[a-z/{}:-]+)['`]/g;
  for (const path of files) {
    const lines = readFileSync(join(root, path), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(line)) !== null) {
        const route = m[1] ?? '';
        if (seen.has(route)) continue;
        seen.add(route);
        out.push({ route, source: ref(path, i, lines) });
      }
    });
  }
  return out;
}

function enclosingFunction(lines: readonly string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const m = /^export (?:async )?function (\w+)\(/.exec(lines[i] ?? '') ?? /^(?:async )?function (\w+)\(/.exec(lines[i] ?? '');
    if (m) return m[1] ?? '';
  }
  return '';
}

function extractCallers(root: string, path: string, callee: string): PersistCaller[] {
  const lines = readFileSync(join(root, path), 'utf8').split(/\r?\n/);
  const out: PersistCaller[] = [];
  lines.forEach((line, i) => {
    if (new RegExp(`(?<![\\w.])${escapeRegExp(callee)}\\(`).test(line) && !new RegExp(`function ${escapeRegExp(callee)}\\(`).test(line)) {
      out.push({ symbol: enclosingFunction(lines, i), source: ref(path, i, lines) });
    }
  });
  return out;
}

export function extractStructure(root: string): Structure {
  const webFiles = listTsFiles(root, join(root, WEB_SRC));
  return {
    schema: STRUCTURE_SCHEMA_ID,
    generatedBy: 'scripts/workflows/extract-structure.ts',
    sourceRoots: [WEB_SRC, SERVICE_SRC],
    views: extractViews(root),
    controls: extractControls(root, webFiles),
    keyboard: { declared: extractDeclaredShortcuts(), handlers: extractKeyHandlers(root, webFiles) },
    api: { routes: extractRoutes(root), callers: extractRouteCallers(root, webFiles) },
    persistence: {
      autosaveCallers: extractCallers(root, `${WEB_SRC}/model.ts`, 'persistIfLocalServiceAutosaveEnabled'),
      unsavedMarkers: extractCallers(root, `${WEB_SRC}/model.ts`, 'markUnsavedBrowserEdits'),
    },
  };
}
