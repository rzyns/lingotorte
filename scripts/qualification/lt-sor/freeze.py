"""Freeze current tracked production inputs into explicit scratch. No application startup."""
import hashlib,json,os,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[3]
def freeze(image):
    if not image.startswith('sha256:') or len(image)!=71:raise ValueError('ImmutableImageRequired')
    actual=subprocess.check_output(['docker','image','inspect',image,'--format','{{.Id}}'],text=True).strip()
    if actual!=image:raise ValueError('ImageIdentityMismatch')
    paths=subprocess.check_output(['git','-C',str(ROOT),'ls-files','-z']).decode().split('\0')
    entries=[]
    for name in paths:
        if not name or not (name.startswith(('apps/','packages/','vendor/','fixtures/','scripts/','tests/')) or name in ('package.json','package-lock.json','tsconfig.json','vite.config.ts','vitest.config.ts','.dockerignore','Dockerfile')):continue
        p=ROOT/name
        if p.is_file():entries.append({'path':name,'kind':'file','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    out=pathlib.Path(os.environ['LT_SOR_SCRATCH'])/'lt-sor-harness';out.mkdir(parents=True,exist_ok=True)
    path=out/'checkpoint-source-manifest.json';path.write_text(json.dumps(entries,indent=2),encoding='utf8')
    # Verify all packaged bytes and task-owned workspace aliases inside the actual image.
    script="const fs=require('fs'),crypto=require('crypto');const rows=JSON.parse(fs.readFileSync('/manifest.json'));let bad=[];for(const r of rows){if(['Dockerfile','.dockerignore'].includes(r.path))continue;try{if(crypto.createHash('sha256').update(fs.readFileSync('/app/'+r.path)).digest('hex')!==r.sha256)bad.push(r.path)}catch{bad.push(r.path)}};const aliases=fs.readdirSync('/app/node_modules/@lingotorte').map(n=>({name:n,target:fs.realpathSync('/app/node_modules/@lingotorte/'+n)}));console.log(JSON.stringify({mismatches:bad,aliases}));if(bad.length||aliases.some(p=>!p.target.startsWith('/app/')))process.exit(1)"
    proof=subprocess.check_output(['docker','run','--rm','--network','none','--mount',f'type=bind,source={path},target=/manifest.json,readonly',image,'node','-e',script],text=True)
    print(json.dumps({'image':image,'manifest':str(path),'manifestSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'entries':len(entries),'imageReadback':json.loads(proof),'HEAD':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()}))
    return path
if __name__=='__main__':freeze(sys.argv[1])
