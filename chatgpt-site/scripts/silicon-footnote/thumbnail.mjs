import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {here,read,save} from './editor.mjs';

export function prepareThumbnails(dir){
 const manifest=join(dir,'thumbnails.json');
 if(existsSync(manifest)){
  const saved=read(manifest);
  if(saved.every(({id})=>existsSync(join(dir,`thumbnail-${id}.jpg`))))return saved;
 }
 const generated=JSON.parse(execFileSync('python3',[join(here,'thumbnail.py'),dir],{encoding:'utf8'}));
 save(manifest,generated);
 return generated;
}
