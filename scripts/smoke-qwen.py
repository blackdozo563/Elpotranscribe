#!/usr/bin/env python3
"""Execute Qwen inference and raw forced alignment, without mocked output."""
import hashlib,json,os,pathlib,re,subprocess,sys,tempfile,time,urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
helper=pathlib.Path(sys.argv[1]).resolve()
def failure_hook(kind,value,traceback):
    print('::error title=Qwen inference::'+str(value).replace('%','%25').replace('\n','%0A'),flush=True)
    sys.__excepthook__(kind,value,traceback)
sys.excepthook=failure_hook
def call(request):
    started=time.monotonic()
    result=subprocess.run(['/usr/bin/time','-l',str(helper)],input=json.dumps(request),text=True,capture_output=True)
    objects=[]
    for line in result.stdout.splitlines():
        try: objects.append(json.loads(line))
        except json.JSONDecodeError: pass
    if result.returncode or not objects or 'error' in objects[-1]:
        raise RuntimeError(f'Qwen failed ({result.returncode}): {objects[-1] if objects else result.stderr[-2500:]}')
    value=objects[-1]
    peak=re.search(r'(\d+)\s+maximum resident set size',result.stderr)
    value['measurement']={'wallSeconds':time.monotonic()-started,'peakMemoryBytes':int(peak.group(1)) if peak else None,'platform':os.uname().machine}
    return value
with tempfile.TemporaryDirectory(prefix='elpo-qwen-') as temp:
    temp=pathlib.Path(temp)
    manifest=json.loads((root/'fixtures/jfk.json').read_text())
    with urllib.request.urlopen(manifest['url']) as response: data=response.read()
    assert hashlib.sha256(data).hexdigest()==manifest['sha256']
    audio=temp/'jfk.wav'; audio.write_bytes(data)
    for engine in ['qwen-0.6b','qwen-1.7b']:
        request={'models':str(root/'target/smoke-models'),'engine':engine}
        call({**request,'action':'install'})
        result=call({**request,'action':'transcribe','source':str(audio),'language':'en'})
        assert result['engine']==engine and result['words']
        assert all(w['endMs']>w['startMs']>=0 for w in result['words'])
        assert all(word in result['text'].lower() for word in ['country','ask','you']), result['text']
        assert all(b['startMs']>=a['startMs'] for a,b in zip(result['words'],result['words'][1:]))
        result['measurement']['realTimeFactor']=result['measurement']['wallSeconds']/(result['durationMs']/1000)
        (root/f'target/smoke-{engine}.json').write_text(json.dumps(result,ensure_ascii=False))
        print('::notice title=Real Qwen inference::'+engine+' passed with '+str(len(result['words']))+' raw aligned words',flush=True)
