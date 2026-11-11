import {writeFileSync} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import {generateHedgyReel} from '../worker/hedgy-generation.ts';
const folder=new URL('../../artifacts/hedgy/hedging/',import.meta.url);await mkdir(folder,{recursive:true});
const usage=[],started=Date.now();
try{
 const result=await generateHedgyReel({OPENAI_API_KEY:process.env.OPENAI_API_KEY},'Hedging: how a protective put changes a stock loss, and what protection costs',entry=>{usage.push(entry);writeFileSync(new URL('api-usage.json',folder),JSON.stringify({startedAt:new Date(started).toISOString(),elapsedSeconds:(Date.now()-started)/1000,calls:usage},null,2));console.log(`${entry.model}: ${entry.status}`)});
 await writeFile(new URL('api-production.json',folder),JSON.stringify(result,null,2));
 await writeFile(new URL('reel.json',folder),JSON.stringify(result.spec,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{await writeFile(new URL('api-usage.json',folder),JSON.stringify({startedAt:new Date(started).toISOString(),elapsedSeconds:(Date.now()-started)/1000,calls:usage},null,2));}
