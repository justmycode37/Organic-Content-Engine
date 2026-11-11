import {writeFile} from 'node:fs/promises';
const r=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(20000)});
if(!r.ok){console.log(`Audio billing metadata unavailable: HTTP ${r.status}`);process.exit(0)}
const x=await r.json();const safe={observedAt:new Date().toISOString(),characterCount:x.character_count,characterLimit:x.character_limit,tier:x.tier,currency:x.currency,billingPeriod:x.billing_period};await writeFile(process.argv[2],JSON.stringify(safe,null,2));console.log('Audio billing meter recorded.');
