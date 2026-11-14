import{mkdir,writeFile,rename,rm}from'node:fs/promises';import{dirname,basename,join}from'node:path';import{randomUUID}from'node:crypto';
/** Publish only complete files. Unique sibling temp files keep concurrent readers/preparers isolated. */
export async function writeAtomic(file,bytes){await mkdir(dirname(file),{recursive:true});const temp=join(dirname(file),`.${basename(file)}.${process.pid}.${randomUUID()}.tmp`);try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,file);}finally{await rm(temp,{force:true});}}
