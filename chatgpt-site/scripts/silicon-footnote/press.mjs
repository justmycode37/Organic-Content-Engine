// Photograph the actual publisher page, retaining its original layout and type.
import {createHash} from 'node:crypto';
import {capturePost} from './post.mjs';
import {chromium} from 'playwright-core';
import {mkdtemp,readFile,rm,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),here=fileURLToPath(new URL('.',import.meta.url));
const types={document:'text/html',stylesheet:'text/css',font:'font/woff2'};
async function exists(p){try{await access(p);return true;}catch{return false;}}
export async function capturePress(root,sources,indices){
 if(!indices.length)return;
 const exe=[process.env.CHROME_BIN,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean);
 let executablePath;
 for(const f of exe)if(await exists(f)){executablePath=f;break;}
 const scratch=await mkdtemp(join(tmpdir(),'news-page-'));
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  for(const item of new Set(indices.map(v=>JSON.stringify(v)))){
   const spec=JSON.parse(item),i=typeof spec==='number'?spec:spec.source,phrase=spec.quote??'';
   const suffix=phrase?'-'+createHash('sha256').update(phrase).digest('hex').slice(0,10):'';
   const src=sources[i],path=join(root,'press-'+i+suffix+'.png'),meta=path+'.json';
   if(await exists(path)&&await exists(meta)&&JSON.parse(await readFile(meta)).revision>=7 && JSON.parse(await readFile(meta)).url===src.url)continue;
   const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1.5,locale:'en-US',javaScriptEnabled:true,serviceWorkers:'block'});
   try{
    const page=await ctx.newPage();
    let serial=0;
    await ctx.route('**/*',async route=>{
     const req=route.request(),type=req.resourceType();
     if(!['document','stylesheet','image','font','script','xhr','fetch'].includes(type)||!req.url().startsWith('https://')||req.method()!=='GET')return route.abort();
     const temp=join(scratch,String(i)+'-'+String(++serial));
     try{
      const {stdout}=await run('python3',[join(here,'fetch.py'),req.url(),temp,'press'],{timeout:18000});
      const ct=stdout.trim()||types[type]||'application/octet-stream';
      await route.fulfill({contentType:ct,body:await readFile(temp),headers:{'access-control-allow-origin':'*'}});
     }catch{await route.abort().catch(()=>{});}
    });
    let url=src.url.replace('raw.githubusercontent.com/','github.com/').replace(/(github\.com\/[^/]+\/[^/]+)\/main\//,'$1/blob/main/');
    const post=url.match(/\/status\/(\d+)/);
    if(post){
     await capturePost(page,root,post[1],i,src.url,path,async(url,file)=>{
      const {stdout}=await run('python3',[join(here,'fetch.py'),url,file,'press'],{timeout:22000});
      return stdout.trim();
     });
     console.log('Captured public X post '+post[1]);continue;
    }else await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
    await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
    const cookies=page.getByRole('button',{name:/^(essential only|reject all|reject optional cookies|no,? thanks|ok,? got it)$/i}).filter({visible:true}).first();
    if(await cookies.isVisible().catch(()=>false))await cookies.click({timeout:2500}).catch(()=>{});
    const title=await page.title();
    if(/access denied|please verify|just a moment|checking your browser/i.test(title))throw Error('Publisher interstitial');
    let heading=page.locator('h1.title,article h1,[itemprop="headline"]').filter({visible:true}).first();
    if(!await heading.count())heading=page.locator('main h1,h1').filter({visible:true}).first();
    if(!await heading.count())heading=page.locator('blockquote,[data-testid="tweetText"]').first();
    if(!await heading.count())heading=page.locator('pre').filter({visible:true}).first();
    if(!await heading.count())throw Error('Page has no readable article or post');
    const headingText=(await heading.innerText()).trim();
    if(!headingText||/access denied|enable javascript|something went wrong/i.test(headingText))throw Error('Page did not yield source content');
    const box=await heading.boundingBox();if(!post&&box&&box.y>430)await page.evaluate(y=>window.scrollTo(0,y),box.y-260);
    let rect=await heading.boundingBox();
    let quoteRange;
    if(phrase){
     quoteRange=await page.evaluateHandle(async phrase=>{
      const normalize=s=>s.toLowerCase().replace(/[‘’]/g,"'");
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
       const node=walker.currentNode,offset=normalize(node.textContent).indexOf(normalize(phrase));
       if(offset<0||!node.parentElement?.getBoundingClientRect().height)continue;
       node.parentElement.setAttribute('data-documentary-quote','selected');
       const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+phrase.length);
       node.parentElement.scrollIntoView({block:'center',behavior:'instant'});
       for(let attempt=0;attempt<4;attempt++){
        window.scrollBy({top:range.getBoundingClientRect().y-280,behavior:'instant'});
        await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
        if(Math.abs(range.getBoundingClientRect().y-280)<2)break;
       }
       return range;
      }
      return null;
     },phrase);
     if(!await quoteRange.evaluate(range=>range!==null))throw Error('The quoted passage is absent from the visible publisher page');
    }
    if(phrase)await page.waitForTimeout(1100); // Let the site's scroll-triggered dialog finish appearing.
    // A cookie bar can obscure the bottom of the picture without touching the citation.
    const notice=page.locator('[role="dialog"], [aria-label*="cookie" i], [id*="cookie" i], [class*="cookie-banner" i], [class*="cookie-notice" i]')
      .filter({hasText:/cookies?/i}).filter({visible:true});
    const closeLabel=/^(acknowledge|close|dismiss|reject all|essential only|got it)$/i;
    const dismissNotice=notice.getByRole('button',{name:closeLabel})
      .or(notice.getByRole('link',{name:closeLabel})).or(notice.getByText(closeLabel,{exact:true})).filter({visible:true}).first();
    if(await dismissNotice.isVisible().catch(()=>false)){
     await dismissNotice.click({timeout:2000}).catch(()=>{});
     await dismissNotice.waitFor({state:'hidden',timeout:1800}).catch(()=>{});
    }
    const visibleNotice=await notice.evaluateAll(nodes=>nodes.some(el=>{
     const r=el.getBoundingClientRect();
     return ['fixed','sticky'].includes(getComputedStyle(el).position) && r.height>24 && r.top<innerHeight && r.bottom>0;
    }));
    if(visibleNotice)throw Error('A cookie notice remains in the publisher capture');
    const subject=phrase?page.locator('[data-documentary-quote="selected"]'):heading;
    const subjectRect=()=>quoteRange?quoteRange.evaluate(range=>range.getBoundingClientRect().toJSON()):heading.boundingBox();
    rect=await subjectRect();
    const uncovered=()=>subject.evaluate((el,r)=>{
     if(!r||r.height<=0||r.y<0||r.y+r.height>innerHeight)return false;
     return [.12,.5,.88].every(fraction=>{
      const x=Math.max(1,Math.min(innerWidth-2,r.x+r.width*.5));
      const y=Math.max(1,Math.min(innerHeight-2,r.y+r.height*fraction));
      const front=document.elementFromPoint(x,y);
      return !!front && (el===front||el.contains(front)||front.contains(el));
     });
    },rect);
    if(!phrase&&!await uncovered()){
     await page.evaluate(y=>window.scrollBy(0,y),rect.y-innerHeight*.4);
     rect=await heading.boundingBox();
    }
    if(!await uncovered()){
     const dismiss=page.getByRole('button',{name:/^close (?:popup|dialog|overlay|modal)|^dismiss|^no thanks$/i}).or(page.locator('[role="dialog"] button,dialog button,button[aria-label*="close" i],button[title*="close" i]')).filter({visible:true});
     for(const button of await dismiss.all()){
      const name=await button.evaluate(b=>(b.getAttribute('aria-label')||b.title||b.innerText).trim());
      if(/^(?:close|dismiss|no thanks|×|✕|x)(?:\b|$)/i.test(name)){
       await button.click({timeout:1800}).catch(()=>{});break;
      }
     }
     await page.keyboard.press('Escape');
     for(let attempt=0;attempt<12;attempt++){
      rect=await subjectRect();if(await uncovered())break;
      await page.waitForTimeout(100);
     }
     if(!await uncovered())throw Error('Publisher overlay covers the cited text; select a readable source capture');
    }
    rect=await subjectRect();
    await page.screenshot({path,animations:'allow',timeout:25000});
    if(!await uncovered())throw Error('The publisher changed its layout during capture');
    await writeFile(meta,JSON.stringify({revision:7,rect,viewport:{width:1280,height:800},url:src.url,displayUrl:url,title,heading:headingText,captured:new Date().toISOString()},null,2));
    console.log('Captured '+i+' '+headingText.slice(0,80));
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await rm(scratch,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [dir,...ids]=process.argv.slice(2);await capturePress(dir,JSON.parse(await readFile(join(dir,'sources.json'))).sources,ids.map(Number));
}
