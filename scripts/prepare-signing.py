#!/usr/bin/env python3
"""Write a local Tauri signing override. Certificate and passwords stay in the bundler environment."""
import json,os,pathlib,sys
output=pathlib.Path(sys.argv[1]);output.parent.mkdir(parents=True,exist_ok=True)
identity=os.environ.get('APPLE_SIGNING_IDENTITY') or '-'
output.write_text(json.dumps({'bundle':{'macOS':{'signingIdentity':identity}}}))
