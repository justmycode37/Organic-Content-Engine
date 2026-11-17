// Model catalogue for the generator. Bundled with esbuild so model packs may use any TypeScript syntax.
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
let cached;
export async function loadCatalog({fresh=false}={}){
 if(cached&&!fresh)return cached;
 const out=join(ROOT,'.quriozity-cache','catalog.bundle.mjs');await mkdir(join(ROOT,'.quriozity-cache'),{recursive:true});
 await build({entryPoints:[join(ROOT,'src/quriozity/models/index.ts')],bundle:true,outfile:out,format:'esm',platform:'node',target:'node22',logLevel:'error',loader:{'.ttf':'dataurl'}});
 const m=await import(pathToFileURL(out).href+`?t=${Date.now()}`);
 const ids=m.MODELS.map(x=>x.id);
 cached={text:m.describeModels(),assets:m.describeAssets(),entries:m.describeCatalogEntries(),has:id=>!!m.findModel(String(id)),canonicalId:id=>m.findModel(String(id))?.id??id,ids,models:m.MODELS};
 return cached;
}
