// macOS module resolution must distinguish .ts helpers from .tsx views by name.
import {readdir} from 'node:fs/promises';
import {join,relative,resolve,dirname,basename,extname} from 'node:path';
const root=resolve(process.argv[2]??'src');
const modules=new Map();
async function visit(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory())await visit(path);
  else if(/\.tsx?$/u.test(entry.name)){
   const key=join(dirname(relative(root,path)),basename(path,extname(path))).toLowerCase();
   modules.set(key,[...(modules.get(key)??[]),relative(root,path)]);
  }
 }
}
await visit(root);
const collisions=[...modules.values()].filter(paths=>paths.length>1);
if(collisions.length){
 console.error('Modules ambigus sur un système de fichiers macOS insensible à la casse:');
 for(const paths of collisions)console.error(paths.join(' / '));
 process.exitCode=1;
}
