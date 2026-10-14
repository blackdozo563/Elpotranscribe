#!/usr/bin/env python3
"""Benchmark actual helper JSON results against references; no fabricated measurements.
Usage: python3 scripts/benchmark.py result.json reference.txt
Peak memory and wall time: on a Mac use /usr/bin/time -l with the native helper.
"""
import json,re,sys
from pathlib import Path
def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1): nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]
def normalized(text): return ' '.join(re.findall(r'\w+',text.lower(),re.UNICODE))
if __name__=='__main__':
    result=json.loads(Path(sys.argv[1]).read_text());reference=normalized(Path(sys.argv[2]).read_text());prediction=normalized(result['text'])
    if not reference: raise SystemExit('A nonempty reference is required')
    print(json.dumps({'WER':distance(reference.split(),prediction.split())/len(reference.split()),'CER':distance(reference,prediction)/len(reference),'engine':result['engine'],'peakMemory':'unmeasured; collect /usr/bin/time -l output on target Mac','alignmentQuality':'requires manually aligned ground truth'},ensure_ascii=False,indent=2))
