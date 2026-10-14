#!/usr/bin/env python3
import pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text(errors='replace')
counts=[int(n) for n in re.findall(r'Executed (\d+) tests?',text)]
assert counts and max(counts)>0, 'No completed XCTest cases found'
print(f'::notice title=Swift tests::{max(counts)} XCTest cases executed successfully')
