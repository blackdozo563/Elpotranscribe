#!/usr/bin/env python3
"""Real inference integration check. No mocked transcript. Requires the packaged helper on ARM64 macOS."""
import hashlib,json,os,pathlib,re,subprocess,sys,tempfile,time,urllib.request
def failure_hook(kind,value,traceback):
    message=(str(value) or repr(value)).replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print('::error title=Native inference validation::'+message,flush=True)
    sys.__excepthook__(kind,value,traceback)
sys.excepthook=failure_hook
root=pathlib.Path(__file__).resolve().parent.parent
helper=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else root/'src-tauri/binaries/elpo-asr-aarch64-apple-darwin')
manifest=json.loads((root/'fixtures/jfk.json').read_text())
def call(request):
    started=time.monotonic()
    selected=helper.with_name('elpo-qwen') if request.get('engine','').startswith('qwen-') else helper
    r=subprocess.run(['/usr/bin/time','-l',str(selected)],input=json.dumps(request),text=True,capture_output=True)
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
    models=pathlib.Path(os.environ.get('ELPO_SMOKE_MODELS',temp/'models'))
    call({'action':'install','models':str(models)})
    result=call({'action':'transcribe','models':str(models),'source':str(audio),'language':'en'})
    assert result['engine']=='Parakeet Ultra'
    assert result['words'] and all(w['endMs']>w['startMs']>=0 for w in result['words'])
    result['measurement']['realTimeFactor']=result['measurement']['wallSeconds']/(result['durationMs']/1000)
    text=result['text'].lower()
    for word in ['country','ask','you']: assert word in text, f'Missing expected word: {word}'
    output=root/'target/smoke-result.json';output.write_text(json.dumps(result,ensure_ascii=False))
    subprocess.run(['cargo','run','--locked','-p','elpo-core','--example','validate_transcript','--',str(output),str(root/'target/smoke-result.srt')],cwd=root,check=True)
    test_env=os.environ.copy()
    test_env.update({'ELPO_TEST_HELPER':str(helper.resolve()),'ELPO_TEST_MODELS':str(models.resolve()),'ELPO_TEST_AUDIO':str(audio)})
    queued=subprocess.run(['cargo','test','--locked','--release','-p','elpotranscribe','--target','aarch64-apple-darwin','real_queue_recovers_and_exports_to_each_source_folder','--','--ignored','--nocapture'],cwd=root,env=test_env,text=True,capture_output=True)
    if queued.returncode or not re.search(r'test result: ok\. [1-9]\d* passed',queued.stdout):
        raise RuntimeError('Native queue integration failed: '+(queued.stderr+'\n'+queued.stdout)[-5000:])
    print(queued.stdout)
    print('Real Parakeet Ultra inference, native queue, per-folder SRT and error recovery passed:',len(result['words']),'timestamped words')
    for engine in ['whisper-base','whisper-small','whisper-turbo']:
        call({'action':'install','models':str(models),'engine':engine})
        result=call({'action':'transcribe','models':str(models),'source':str(audio),'language':'en','engine':engine})
        assert result['engine']==engine
        assert result['words'] and all(w['endMs']>w['startMs']>=0 for w in result['words'])
        assert all(word in result['text'].lower() for word in ['country','ask','you']), result['text']
        result['measurement']['realTimeFactor']=result['measurement']['wallSeconds']/(result['durationMs']/1000)
        output=root/f'target/smoke-{engine}.json'; output.write_text(json.dumps(result,ensure_ascii=False))
        subprocess.run(['cargo','run','--locked','-p','elpo-core','--example','validate_transcript','--',str(output),str(root/f'target/smoke-{engine}.srt')],cwd=root,check=True)
        test_env['ELPO_TEST_ENGINE']=engine
        queued=subprocess.run(['cargo','test','--locked','--release','-p','elpotranscribe','--target','aarch64-apple-darwin','real_queue_recovers_and_exports_to_each_source_folder','--','--ignored','--nocapture'],cwd=root,env=test_env,text=True,capture_output=True)
        if queued.returncode or not re.search(r'test result: ok\. [1-9]\d* passed',queued.stdout):
            raise RuntimeError(engine+' native queue integration failed: '+(queued.stderr+'\n'+queued.stdout)[-5000:])
        print(queued.stdout)
        # Corrupt model bytes must be rejected before inference, then restore.
        installed=json.loads((models/(engine+'.json')).read_text())
        directory=models/installed.get('directory',engine)
        weights=next((directory/'asr').glob('*.safetensors')) if engine.startswith('qwen-') else directory/'model.bin'
        with weights.open('r+b') as file:
            original=file.read(1);file.seek(0);file.write(bytes([original[0]^255]))
        try:
            try: call({'action':'transcribe','models':str(models),'source':str(audio),'language':'en','engine':engine})
            except RuntimeError as error: assert 'Intégrité' in str(error), str(error)
            else: raise AssertionError('Corrupted model was accepted: '+engine)
        finally:
            with weights.open('r+b') as file: file.write(original)
        print('Real packaged inference, queue, cancellation and integrity passed:',engine,flush=True)

    updates = call({'action':'check-updates','models':str(models)})['updates']
    assert {row['engine'] for row in updates} >= {'ultra','whisper-base','whisper-small','whisper-turbo'}
    assert all(row['status']=='current' for row in updates), updates
    verified=subprocess.run(['cargo','test','--locked','--release','-p','elpotranscribe','--target','aarch64-apple-darwin','real_double_verification_preserves_primary_and_reverses_engines','--','--ignored','--nocapture'],cwd=root,env=test_env,text=True,capture_output=True)
    if verified.returncode or not re.search(r'test result: ok\. [1-9]\d* passed',verified.stdout):
        raise RuntimeError('Double verification failed: '+(verified.stderr+'\n'+verified.stdout)[-5000:])
    print(verified.stdout)
    print('Real sequential verification passed in both directions; model metadata current',flush=True)
