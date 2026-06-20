from pathlib import Path
import json, hashlib
root=Path('/home/openclaw/workspace/lingotorte')
manifest_path=root/'docs/final/artifact-manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
for item in manifest['artifacts']:
    p=Path(item['path'])
    if p.exists():
        txt=p.read_text(encoding='utf-8') if p.suffix in ['.md','.json'] else ''
        item['bytes']=p.stat().st_size
        item['lines']=txt.count('\n')+1 if txt else item.get('lines')
        item['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print('updated manifest', len(manifest['artifacts']))
