#!/usr/bin/env python3
"""Expose bounded compiler diagnostics as GitHub annotations when raw logs require login."""
import pathlib,re,sys
lines=pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines()
indices=[i for i,line in enumerate(lines) if re.search(r'error(?:\[E\d+\])?:|Error:',line)]
if not indices:indices=[max(0,len(lines)-8)]
for i in indices[:8]:
    message='\n'.join(lines[max(0,i-1):i+6])
    message=message.replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print('::error title=Native build diagnostic::'+message)
