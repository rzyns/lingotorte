from pathlib import Path
import re, json, sys, hashlib
root=Path(__file__).resolve().parent
required=[
'docs/final/war-room-final-synthesis.md','docs/final/lingotorte-implementation-plan.md','docs/spec/lingopie-behavior-reference.md','docs/spec/feature-implementation-playbook.md','docs/architecture/local-first-architecture.md','docs/architecture/data-model-and-storage.md','docs/architecture/language-adapter-design.md','docs/product/srs-and-practice-design.md','docs/research/public-product-cartography.md','docs/research/live-ui-inventory-expanded.md','docs/research/oss-substrate-assessment.md','docs/review/safety-privacy-boundary-review.md','docs/plan/mvp-spike-plan.md','README.md','AGENTS.md','docs/final/artifact-manifest.json']
required_features=['local media import','subtitle extraction','parsing','alignment','dual subtitles','transcript synchronization','cue seek','highlight','clickable token lookup','phrase selection','grammar/POS','sentence explanation','save word','phrase','sentence','My Vocab','My Sentences','Listen','Loop','playback speed','saved occurrence context','FSRS flashcards','SRS states','quiz','match','sentence-builder','Anki export','generated subtitles','pronunciation','shadowing','progress tracking','privacy/settings','backups/sync']
errors=[]
for rel in required:
    p=root/rel
    if not p.exists(): errors.append(f'missing {rel}')
# feature coverage in playbook and plan
combo='\n'.join((root/r).read_text(encoding='utf-8') for r in ['docs/spec/feature-implementation-playbook.md','docs/plan/mvp-spike-plan.md','docs/final/lingotorte-implementation-plan.md','docs/product/srs-and-practice-design.md'])
for term in required_features:
    if term.lower() not in combo.lower():
        errors.append(f'missing feature term: {term}')
# evidence labels
for term in ['PROJECT-CONSTRAINT','MISSION-REQUIREMENT','SANITIZED-LIVE-UI','PUBLIC-DOC','OSS-DOC-SOURCE','DESIGN-RECOMMENDATION','OPEN-DECISION']:
    if term not in (root/'docs/planning/evidence-index.md').read_text(encoding='utf-8') + combo + (root/'docs/spec/lingopie-behavior-reference.md').read_text(encoding='utf-8'):
        errors.append(f'missing evidence label: {term}')
# simple local md link check ignoring anchors
for p in root.rglob('*.md'):
    txt=p.read_text(encoding='utf-8')
    for m in re.finditer(r'\[[^\]]+\]\(([^)]+)\)', txt):
        url=m.group(1).split('#',1)[0]
        if not url or re.match(r'^[a-z]+:', url) or url.startswith('/'):
            continue
        target=(p.parent/url).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError:
            continue
        if not target.exists():
            errors.append(f'bad link in {p.relative_to(root)} -> {url}')
# manifest hashes
manifest=json.loads((root/'docs/final/artifact-manifest.json').read_text())
for item in manifest['artifacts']:
    rel=item.get('relative_path')
    p=root/rel if rel else Path(item['path'])
    if not p.exists(): errors.append(f'manifest path missing {p}')
    else:
        h=hashlib.sha256(p.read_bytes()).hexdigest()
        if h!=item['sha256']: errors.append(f'hash mismatch {item["relative_path"]}')
print(json.dumps({'errors':errors,'required_count':len(required),'manifest_count':len(manifest['artifacts']),'markdown_files':len(list(root.rglob('*.md')))}, indent=2))
sys.exit(1 if errors else 0)
