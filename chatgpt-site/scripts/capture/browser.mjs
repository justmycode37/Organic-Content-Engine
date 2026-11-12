import {chromium} from 'playwright-core';
export const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');

export async function openCapturePage({width=1440,height=1000,scale=1,dark=false}={}){
 const browser=await chromium.launch({headless:true,executablePath:CHROME});
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:scale,colorScheme:dark?'dark':'light'});
 return {browser,context,page:await context.newPage()};
}

export async function openCaptureBrowser(){
 return chromium.launch({headless:true,executablePath:CHROME});
}

export async function openPublicPage(page,url){
 const target=new URL(url);
 if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('Capture URL must be public HTTP(S) without embedded credentials.');
 let response;
 try{response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:30000});}
 catch(error){throw new Error(`Capture navigation failed: ${error.message}`);}
 const status=response?.status()??0;
 if([401,403,407,423,429,451,503].includes(status)||status>=400)throw new Error(`Capture stopped: page returned HTTP ${status} (blocked or unavailable); no login or bot-protection workaround was attempted.`);
 await page.evaluate(()=>document.fonts?.ready);
 const evidence=await page.evaluate(()=>({
  title:document.title,
  text:(document.body?.innerText??'').slice(0,1000),
  passwordInputs:[...document.querySelectorAll('input[type="password"]')].some(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0;}),
  challenge:!!document.querySelector('iframe[src*="captcha" i],form[action*="challenge" i],#challenge-form,#cf-challenge-running')
 }));
 if(evidence.passwordInputs)throw new Error('Capture stopped: the page presents a login gate. Logins are not supported.');
 if(evidence.challenge||/^(access denied|403 forbidden|verify you are human|checking your browser|request blocked)/i.test(evidence.title)||/verify you are human|checking your browser before accessing|automated requests? (?:are|is) not allowed/i.test(evidence.text))
  throw new Error('Capture stopped: the page presents a bot-protection or access-block screen; no workaround was attempted.');
 return {response,status,...evidence};
}

export async function extractPageMetadata(page,url){
 const metadata=await page.evaluate(()=>{
  const meta=(...selectors)=>{for(const selector of selectors){const value=document.querySelector(selector)?.getAttribute('content')?.trim();if(value)return value;}return '';};
  return {
   title:meta('meta[property="og:title"]','meta[name="twitter:title"]')||document.title||location.hostname,
   publisher:meta('meta[property="og:site_name"]','meta[name="application-name"]')||location.hostname,
   author:meta('meta[name="author"]','meta[property="article:author"]','meta[name="parsely-author"]'),
   publishedAt:meta('meta[property="article:published_time"]','meta[name="date"]')
  };
 });
 return {...metadata,creator:metadata.author||metadata.publisher,sourceUrl:url};
}
