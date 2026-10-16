import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('refuse les modules .ts/.tsx ambigus pour macOS',()=>{
 const root=mkdtempSync(join(tmpdir(),'elpo-imports-'));
 try{
  writeFileSync(join(root,'review.ts'),'export type Review = {};');
  writeFileSync(join(root,'Review.tsx'),'export const View = () => null;');
  const failed=spawnSync(process.execPath,['scripts/check-import-paths.mjs',root],{encoding:'utf8'});
  assert.equal(failed.status,1);assert.match(failed.stderr,/review\.ts/u);assert.match(failed.stderr,/Review\.tsx/u);
  rmSync(join(root,'Review.tsx'));writeFileSync(join(root,'ReviewComponents.tsx'),'export const View = () => null;');
  assert.equal(spawnSync(process.execPath,['scripts/check-import-paths.mjs',root]).status,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
