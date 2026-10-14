#!/usr/bin/env python3
"""Release gate: real short French audio, packaged Ultra/Turbo and real Rust queue."""
import json, os, pathlib, re, subprocess, sys, tempfile
root = pathlib.Path(__file__).resolve().parent.parent
helper = pathlib.Path(sys.argv[1]).resolve()
def call(request):
    result = subprocess.run([str(helper)], input=json.dumps(request), text=True, capture_output=True, timeout=600)
    values = []
    for line in result.stdout.splitlines():
        try: values.append(json.loads(line))
        except ValueError: pass
    if result.returncode or not values or 'error' in values[-1]:
        raise RuntimeError(str(values[-1] if values else result.stderr[-2000:]))
    return values[-1]
def integration(name, env):
    result = subprocess.run(['cargo','test','--locked','--release','-p','elpotranscribe','--target','aarch64-apple-darwin',name,'--','--ignored','--nocapture'], cwd=root, env=env, text=True, capture_output=True, timeout=900)
    print(result.stdout, flush=True)
    if result.returncode or not re.search(r'test result: ok\. [1-9]\d* passed', result.stdout):
        raise RuntimeError(result.stderr[-5000:] + result.stdout[-3000:])
with tempfile.TemporaryDirectory(prefix='elpo-release-') as folder:
    temp = pathlib.Path(folder)
    voices = subprocess.check_output(['/usr/bin/say','-v','?'],text=True)
    voice = next((m.group(1).strip() for line in voices.splitlines() if (m:=re.match(r'(.+?)\s+fr_FR\s',line))), None)
    assert voice, 'Voix système française locale absente'
    audio = temp/'Français.aiff'
    subprocess.run(['/usr/bin/say','-v',voice,'-o',str(audio),'Bonjour. Ce soir, nous vérifions la transcription en français. Les sous-titres conservent les vrais horaires du moteur. Merci de votre attention.'],check=True,timeout=60)
    duration = call({'action':'probe','source':str(audio)})['durationMs']
    assert 1000 <= duration <= 90000, duration
    models = temp/'models'
    env = os.environ.copy()
    env.update(ELPO_TEST_HELPER=str(helper),ELPO_TEST_MODELS=str(models),ELPO_TEST_AUDIO=str(audio),ELPO_TEST_LANGUAGE='fr',ELPO_TEST_EXPECTED='bonjour')
    for engine in ['ultra','whisper-turbo']:
        call({'action':'install','models':str(models),'engine':engine})
        value = call({'action':'transcribe','models':str(models),'source':str(audio),'language':'fr','engine':engine})
        assert 'bonjour' in value['text'].lower(), value['text']
        path = root/'target'/f'smoke-{engine}-fr-short.json'
        path.write_text(json.dumps(value,ensure_ascii=False))
        subprocess.run(['cargo','run','--locked','-p','elpo-core','--example','validate_transcript','--',str(path),str(path.with_suffix('.srt'))],cwd=root,check=True,timeout=180)
        env['ELPO_TEST_ENGINE'] = engine
        integration('real_queue_recovers_and_exports_to_each_source_folder',env)
    integration('real_double_verification_preserves_primary_and_reverses_engines',env)
    print('::notice title=Short French release gate::Ultra, Turbo, real queues, export, persisted deletion, cancellation and sequential double verification passed; fixture duration '+str(duration)+' ms.',flush=True)
