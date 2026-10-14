#!/usr/bin/env python3
"""Nonblocking 20-minute French regression, no release gate dependency."""
import json,os,pathlib,re,subprocess,sys,tempfile
root=pathlib.Path(__file__).resolve().parent.parent
helper=pathlib.Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='elpo-long-') as temporary:
    temp=pathlib.Path(temporary)
    models=temp/'models'
    installed=subprocess.run([str(helper)],input=json.dumps({'action':'install','models':str(models),'engine':'whisper-turbo'}),text=True,capture_output=True,check=True,timeout=600)
    # Synthesized French audio exercises format/duration, not human-speech accuracy.
    voices=subprocess.check_output(['/usr/bin/say','-v','?'],text=True)
    french=[re.match(r'(.+?)\s+fr_FR\s',line) for line in voices.splitlines()]
    voice=next((match.group(1).strip() for match in french if match),None)
    assert voice, 'A local French system voice is required for MP3 regression'
    script=temp/'français.txt'
    script.write_text("Bonjour. Ce soir, nous allons parler de la transcription en français. Les petits mots doivent rester lisibles et les sous-titres doivent conserver leurs vrais horaires. Voici une interview enregistrée pour vérifier le fonctionnement du logiciel. Nous préparons une formation avec plusieurs exemples, des questions et des réponses. Demain, nous comparerons les résultats. Merci de votre attention.")
    spoken=temp/'français.aiff'
    subprocess.run(['/usr/bin/say','-v',voice,'-o',str(spoken),'-f',str(script)],check=True)
    french_audio=temp/'Français.long.mp3'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-stream_loop','-1','-i',str(spoken),'-t','1200','-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','128k',str(french_audio)],check=True)
    env=os.environ.copy()
    env.update(ELPO_TEST_HELPER=str(helper),ELPO_TEST_MODELS=str(models),ELPO_TEST_AUDIO=str(french_audio))
    result=subprocess.run(['cargo','test','--locked','--release','-p','elpotranscribe','--target','aarch64-apple-darwin','real_long_french_mp3_default_engine_and_history','--','--ignored','--nocapture'],cwd=root,env=env,text=True,capture_output=True,timeout=3000)
    print(result.stdout,flush=True)
    print(result.stderr,flush=True)
    assert result.returncode==0 and re.search(r'test result: ok\. [1-9]\d* passed',result.stdout)
    print('::notice title=Long French regression::20-minute French MP3 completed, SRT and persistent delete passed.',flush=True)
