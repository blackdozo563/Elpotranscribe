#!/usr/bin/env python3
"""Collect license notices from the installed, lockfile-resolved dependencies for bundling."""
import json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parent.parent
metadata=json.loads(subprocess.check_output(['cargo','metadata','--locked','--format-version','1'],cwd=root,text=True))
entries=[]
for package in metadata['packages']:
    if package.get('source'):
        entries.append((package['name']+' '+package['version'],pathlib.Path(package['manifest_path']).parent,package.get('license') or 'See upstream license'))
node_paths=subprocess.check_output(['npm','ls','--omit=dev','--all','--parseable'],cwd=root,text=True).splitlines()
for path in node_paths:
    path=pathlib.Path(path)
    if path==root:continue
    package=json.loads((path/'package.json').read_text())
    entries.append((package['name']+' '+package['version'],path,str(package.get('license','See upstream license'))))
parts=['ELPOTRANSCRIBE — Third-party notices\nGenerated from installed dependency sources.\n']
for name,path,license in sorted(entries):
    parts.append('\n'+'='*72+'\n'+name+'\nDeclared license: '+license+'\n')
    notices=[p for p in path.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE','LICENCE','COPYING','NOTICE'))]
    for notice in sorted(notices):parts.append('\n'+notice.name+'\n'+notice.read_text(errors='replace')+'\n')
parts.append('\nFluidAudio SDK pinned to 224de0fb3c304b41bbae24e85e1801900865ff3e\n'+(root/'third-party/FluidAudio-LICENSE.txt').read_text())
parts.append('\nwhisper.cpp 1.8.3 pinned to 2eeeba56e9edd762b4b38467bab96c2517163158\n'+(root/'third-party/whisper.cpp-LICENSE.txt').read_text())
output=root/'src-tauri/resources/THIRD_PARTY_NOTICES.txt';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(''.join(parts))
print('Collected notices for',len(entries),'resolved Rust/npm packages plus FluidAudio')
