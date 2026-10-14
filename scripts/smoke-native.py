#!/usr/bin/env python3
"""Real inference integration check. No mocked transcript. Requires the packaged helper on ARM64 macOS."""
import hashlib,json,os,pathlib,re,subprocess,sys,tempfile,time,urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
helper=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else root/'src-tauri/binaries/elpo-asr-aarch64-apple-darwin')
manifest=json.loads((root/'fixtures/jfk.json').read_text())
def call(request):
    started=time.monotonic()
    r=subprocess.run(['/usr/bin/time','-l',str(helper)],input=json.dumps(request),text=True,capture_output=True)
    elapsed=time.monotonic()-started
    values=[]
    for line in r.stdout.splitlines():
        try: values.append(json.loads(line))
        except json.JSONDecodeError: pass
    if r.returncode or not values or 'error' in values[-1]:
        raise RuntimeError(f'Native inference failed (exit={r.returncode}): {values[-1] if values else "no JSON result"}')
    value=values[-1]
    peak=re.search(r'(\d+)\s+maximum resident set size',r.stderr)
    value['measurement']={'wallSeconds':elapsed,'peakMemoryBytes':int(peak.group(1)) if peak else None,'platform':os.uname().machine}
    return value
with tempfile.TemporaryDirectory(prefix='elpo-smoke-') as temporary:
    temp=pathlib.Path(temporary);audio=temp/'jfk.wav'
    with urllib.request.urlopen(manifest['url']) as response: audio.write_bytes(response.read())
    assert hashlib.sha256(audio.read_bytes()).hexdigest()==manifest['sha256'], 'Fixture checksum mismatch'
    models=pathlib.Path(os.environ.get('ELPO_SMOKE_MODELS',root/'target/smoke-models'))
    call({'action':'install','models':str(models)})
    result=call({'action':'transcribe','models':str(models),'source':str(audio),'language':'en'})
    assert result['engine']=='Parakeet Ultra'
    assert result['words'] and all(w['endMs']>w['startMs']>=0 for w in result['words'])
    result['measurement']['realTimeFactor']=result['measurement']['wallSeconds']/(result['durationMs']/1000)
    text=result['text'].lower()
    for word in ['country','ask','you']: assert word in text, f'Missing expected word: {word}'
    output=root/'target/smoke-result.json';output.write_text(json.dumps(result,ensure_ascii=False))
    subprocess.run(['cargo','run','--locked','-p','elpo-core','--example','validate_transcript','--',str(output),str(root/'target/smoke-result.srt')],cwd=root,check=True)
    print('Real Parakeet Ultra inference and SRT validation passed:',len(result['words']),'timestamped words')
