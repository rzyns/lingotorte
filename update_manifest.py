from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parent
manifest_path=root/'docs/final/artifact-manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
for item in manifest['artifacts']:
    rel=item.get('relative_path')
    p=root/rel if rel else Path(item['path'])
    if p.exists():
        txt=p.read_text(encoding='utf-8') if p.suffix in ['.md','.json'] else ''
        # Keep the committed manifest portable/public-safe.  The validator uses
        # relative_path for local readback, so path should not capture a
        # developer-specific absolute checkout path.
        item['path']=rel
        item['bytes']=p.stat().st_size
        item['lines']=txt.count('\n')+1 if txt else item.get('lines')
        item['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print('updated manifest', len(manifest['artifacts']))
