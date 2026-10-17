// lt-5lb.5: projections of the as-is catalog for humans and LLMs. The YAML is the source of truth; these
// files are generated and checked for freshness by the validator/test. Two projections per journey:
// a Mermaid flowchart (steps grouped by view, failure branches dashed) and a friction table (per-step
// interaction counts, decisions, modal interruptions, API calls, persistence, failure branches, focus).
// Plus an index with the structure summary and per-journey totals.
import type { Catalog, Journey, Step } from './catalog.ts';

export const GENERATED_DIR = 'docs/workflows/generated';
const HEADER = (source: string) => `<!-- GENERATED from ${source} by scripts/workflows/generate-projections.cli.ts. Do not edit; edit the YAML and regenerate. -->\n`;

function mermaidLabel(text: string): string {
  // `|` delimits edge labels and `"` node labels; both are replaced so any catalog text renders.
  return text.replace(/"/g, '#quot;').replace(/\|/g, '#124;').replace(/[<>]/g, '');
}

/** Mermaid node ids: letters/digits/underscore only (hyphens are parsed as edge syntax in some renderers). */
function nodeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

/** The view a step's actions happen in (a leading nav click is part of the step; see journey.schema.json). */
export function effectiveView(step: Step): string {
  return step.view;
}

/** The view the learner is on when the step ends: the app may have navigated (`navigatesTo`). */
export function endView(step: Step): string {
  return step.navigatesTo ?? step.view;
}

function interactionSummary(step: Step): string {
  return step.userDoes.map((a) => {
    const n = a.count && a.count > 1 ? `×${a.count}` : '';
    if (a.kind === 'key') return `key ${a.key}${n}`;
    if (a.target) return `${a.kind} ${a.target}${n}`;
    return `${a.kind}${n}`;
  }).join('; ');
}

export function journeyMermaid(journey: Journey): string {
  const lines: string[] = ['flowchart TD'];
  const byView = new Map<string, Step[]>();
  for (const step of journey.steps) {
    const view = effectiveView(step);
    const list = byView.get(view) ?? [];
    list.push(step);
    byView.set(view, list);
  }
  for (const [view, steps] of byView) {
    lines.push(`  subgraph ${nodeId(view)}["${mermaidLabel(view)}"]`);
    for (const step of steps) {
      const shape = step.decision ? `{"${mermaidLabel(`${step.id}: ${step.title ?? step.userSees}`)}"}` : `["${mermaidLabel(`${step.id}: ${step.title ?? interactionSummary(step)}`)}"]`;
      lines.push(`    ${nodeId(step.id)}${shape}`);
    }
    lines.push('  end');
  }
  for (let i = 0; i < journey.steps.length; i += 1) {
    const step = journey.steps[i]!;
    const next = journey.steps[i + 1];
    if (next) {
      const appNav = step.navigatesTo && step.navigatesTo !== step.view ? `app → ${step.navigatesTo}` : '';
      const userNav = next.view !== endView(step) ? `nav → ${next.view}` : '';
      const label = [appNav, userNav].filter(Boolean).join('; ');
      lines.push(`  ${nodeId(step.id)} -->${label ? `|${label}|` : ''} ${nodeId(next.id)}`);
    }
    (step.canFail ?? []).forEach((failure, j) => {
      const id = `${nodeId(step.id)}_f${j + 1}`;
      lines.push(`  ${id}(["${mermaidLabel(failure.condition)}"])`);
      lines.push(`  ${nodeId(step.id)} -.->|fails| ${id}`);
      if (failure.recovery) lines.push(`  ${id} -.->|${mermaidLabel(failure.recovery).slice(0, 60)}| ${nodeId(step.id)}`);
    });
  }
  const last = journey.steps.at(-1);
  if (last) {
    lines.push(`  done(["${mermaidLabel(journey.outcome.summary)}"])`);
    lines.push(`  ${nodeId(last.id)} --> done`);
  }
  return lines.join('\n');
}

export type FrictionRow = Readonly<{
  step: string; view: string; clicks: number; keys: number; typing: number; other: number; decision: boolean; modal: boolean; api: number; persists: number; failures: number; focusLost: boolean; evidence: string;
}>;

export function frictionRows(journey: Journey): FrictionRow[] {
  return journey.steps.map((step) => {
    const count = (kinds: readonly string[]) => step.userDoes.filter((a) => kinds.includes(a.kind)).reduce((n, a) => n + (a.count ?? 1), 0);
    return {
      step: step.id,
      view: effectiveView(step),
      clicks: count(['click', 'select-text', 'drag', 'file-input']),
      keys: count(['key']),
      typing: count(['type', 'paste']),
      other: count(['read', 'wait', 'navigate']),
      decision: Boolean(step.decision),
      modal: Boolean(step.modal),
      api: step.api?.length ?? 0,
      persists: step.persists?.length ?? 0,
      failures: step.canFail?.length ?? 0,
      focusLost: step.focusAfter === 'body',
      evidence: step.evidence?.kind ?? journey.evidence.kind,
    };
  });
}

export type FrictionTotals = Readonly<{ steps: number; clicks: number; keys: number; typing: number; viewSwitches: number; decisions: number; modals: number; apiCalls: number; failureBranches: number; focusLost: number; evidence: Record<string, number> }>;

export function frictionTotals(journey: Journey): FrictionTotals {
  const rows = frictionRows(journey);
  // View switches: the learner navigating (step starts in a different view than the previous step ended in)
  // plus the app navigating on its own (navigatesTo differs from the step's view).
  let viewSwitches = 0;
  journey.steps.forEach((s, i) => {
    if (s.navigatesTo && s.navigatesTo !== s.view) viewSwitches += 1;
    const prev = journey.steps[i - 1];
    if (prev && s.view !== endView(prev)) viewSwitches += 1;
  });
  const evidence: Record<string, number> = {};
  for (const r of rows) evidence[r.evidence] = (evidence[r.evidence] ?? 0) + 1;
  const sum = (k: keyof FrictionRow) => rows.reduce((n, r) => n + Number(r[k]), 0);
  return { steps: rows.length, clicks: sum('clicks'), keys: sum('keys'), typing: sum('typing'), viewSwitches, decisions: sum('decision'), modals: sum('modal'), apiCalls: sum('api'), failureBranches: sum('failures'), focusLost: sum('focusLost'), evidence };
}

function md(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function journeyMarkdown(journey: Journey, sourceFile: string): string {
  const t = frictionTotals(journey);
  const out: string[] = [HEADER(sourceFile), `# ${journey.title}`, '', `**Goal (${journey.actor}):** ${journey.goal}`, '', `**Evidence:** ${journey.evidence.kind}${journey.evidence.ref ? ` — ${journey.evidence.ref}` : ''}${journey.evidence.note ? `. ${journey.evidence.note}` : ''}`, ''];
  if (journey.preconditions.length) out.push('**Preconditions:**', ...journey.preconditions.map((p) => `- ${p}`), '');
  out.push('## Flow', '', '```mermaid', journeyMermaid(journey), '```', '');
  out.push('## Friction table', '', `Totals: ${t.steps} steps · ${t.clicks} clicks/pointer actions · ${t.keys} key presses · ${t.typing} typing/paste actions · ${t.viewSwitches} view switches · ${t.decisions} decisions · ${t.modals} modal interruptions · ${t.apiCalls} service calls · ${t.failureBranches} failure branches · focus lost after ${t.focusLost} step(s). Evidence: ${Object.entries(t.evidence).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
  out.push('| Step | View | User sees | User does | Feedback | Persists | API | Can fail | Focus after | Evidence |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const step of journey.steps) {
    out.push(`| ${step.id}${step.title ? ` ${md(step.title)}` : ''}${step.modal ? ' (modal)' : ''}${step.decision ? ` — decision: ${md(step.decision)}` : ''} | ${step.view}${step.navigatesTo ? ` → ${step.navigatesTo}` : ''} | ${md(step.userSees)} | ${md(interactionSummary(step))} | ${md(step.feedback)} | ${(step.persists ?? []).map(md).join('; ') || '—'} | ${(step.api ?? []).join('; ') || '—'} | ${(step.canFail ?? []).map((f) => md(f.condition)).join('; ') || '—'} | ${step.focusAfter ? md(step.focusAfter) : '—'} | ${step.evidence?.kind ?? journey.evidence.kind} |`);
  }
  out.push('');
  if (journey.variants?.length) {
    out.push('## Variants not walked', '');
    for (const v of journey.variants) out.push(`- **${v.id}** (diverges at ${v.divergesAt}): ${v.summary}${v.evidence ? ` _[${v.evidence.kind}]_` : ''}`);
    out.push('');
  }
  out.push('## Outcome', '', journey.outcome.summary, '');
  if (journey.outcome.persisted?.length) out.push('Persisted: ' + journey.outcome.persisted.join('; '), '');
  if (journey.observations?.length) {
    out.push('## Observations (neutral, as-is)', '');
    for (const o of journey.observations) out.push(`- **${o.id}**${o.atStep ? ` (at ${o.atStep})` : ''}: ${o.text} _[${o.evidence.kind}${o.evidence.ref ? `: ${o.evidence.ref}` : ''}]_`);
    out.push('');
  }
  return out.join('\n');
}

export function indexMarkdown(catalog: Catalog): string {
  const s = catalog.structure;
  const out: string[] = [HEADER('docs/workflows/as-is/'), '# As-is workflow catalog — index', ''];
  out.push('## App structure (pass 1)', '', `Views in nav order: ${s.views.map((v) => `**${v.label}** (\`${v.id}\`)`).join(' → ')}.`, '');
  const byScope = new Map<string, number>();
  for (const c of s.controls) byScope.set(c.scope, (byScope.get(c.scope) ?? 0) + 1);
  out.push(`${s.controls.length} interactive controls: ${[...byScope.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
  out.push(`Keyboard: ${s.keyboard.declared.length} shortcuts declared in the help overlay; ${s.keyboard.handlers.length} \`event.key\` handler sites in source.`, '');
  out.push(`Service API: ${s.api.routes.length} routes (${s.api.routes.map((r) => `\`${r.methods.join('/')} ${r.path}\``).join(', ')}); the browser references ${new Set(s.api.callers.map((c) => c.route)).size} of them.`, '');
  out.push(`Persistence: ${s.persistence.autosaveCallers.length} model functions autosave to the local service when enabled; ${s.persistence.unsavedMarkers.length} mark browser-only edits as unsaved.`, '');
  out.push('## Journeys (pass 2)', '', '| Journey | Steps | Clicks | Keys | Typing | View switches | Decisions | Modals | API calls | Failure branches | Focus lost | Evidence |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const { journey } of catalog.journeys) {
    const t = frictionTotals(journey);
    out.push(`| [${journey.title}](./${journey.id}.md) | ${t.steps} | ${t.clicks} | ${t.keys} | ${t.typing} | ${t.viewSwitches} | ${t.decisions} | ${t.modals} | ${t.apiCalls} | ${t.failureBranches} | ${t.focusLost} | ${journey.evidence.kind} |`);
  }
  out.push('');
  return out.join('\n');
}

export function renderProjections(catalog: Catalog): Map<string, string> {
  const files = new Map<string, string>();
  files.set(`${GENERATED_DIR}/index.md`, indexMarkdown(catalog));
  for (const { file, journey } of catalog.journeys) files.set(`${GENERATED_DIR}/${journey.id}.md`, journeyMarkdown(journey, file));
  return files;
}
