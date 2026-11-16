import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const chrome=process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome');
test('weekly planner saves separate start times, selects Postiz, starts/stops and fits mobile',async t=>{
 if(!await access(chrome).then(()=>true,()=>false)){t.skip('Chrome is not installed');return;}
 const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{AccountsView}from'./src/views/Accounts.tsx';createRoot(document.getElementById('root')).render(<AccountsView/>);",resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8'),patches=[];
 let picture='https://images.example.com/instagram.svg';
 const a={id:'hedgy',name:'hedgy',topic:'finance',platform:'instagram',postsPerDay:1,postingTime:'18:00',timezone:'Europe/Zurich',enabled:false,notifyResults:true,postizIntegrationId:null,week:Array.from({length:7},(_,day)=>({day,times:day===0?['09:00']:[]})),schedule:[],health:{state:'paused',issues:[]}};
 const browser=await chromium.launch({headless:true,executablePath:chrome});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div><script src="/app.js"></script>'});
   if(url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
   if(url.hostname==='images.example.com'&&url.pathname==='/instagram.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path fill="#2463eb" d="M0 0h40v40H0z"/><circle fill="#fbc333" cx="20" cy="20" r="12"/></svg>'});
   if(url.pathname==='/api/postiz/integrations')return route.fulfill({json:{configured:true,integrations:[{id:'insta1',name:'Test',profile:'test_brand',picture,identifier:'instagram-standalone',disabled:false}]}});
   if(request.method()==='PATCH'){const patch=request.postDataJSON();patches.push(patch);Object.assign(a,patch);a.health.state=a.enabled?'running':'paused';return route.fulfill({json:a});}
   if(url.pathname==='/api/accounts')return route.fulfill({json:{accounts:[a]}});
   return route.abort();
  });
  await page.goto('https://planner.invalid');await page.addStyleTag({content:css.replace(/^@import[^\n]+\n/gm,'')});
  await page.getByRole('heading',{name:'Your weekly rhythm'}).waitFor();
  await page.getByRole('combobox',{name:'Reels on Monday'}).selectOption('2');
  const times=page.locator('input[type=time]');assert.equal(await times.count(),2);await times.nth(0).fill('08:15');await times.nth(1).fill('17:45');
  await page.getByRole('button',{name:'Save weekly plan'}).click();await page.getByRole('button',{name:'Saved',exact:true}).waitFor();
  assert.deepEqual(patches.find(p=>p.week).week[0].times,['08:15','17:45']);
  await page.getByRole('combobox',{name:'Postiz Instagram account'}).selectOption('insta1');
  await page.getByText('Reels from hedgy will post to @test_brand.').waitFor();
  await page.locator('.account-title .brand-icon img').waitFor();
  assert.equal(await page.locator('.account-title .brand-icon img').getAttribute('src'),picture);
  assert.ok(await page.locator('.brand-icon img').evaluateAll(imgs=>imgs.every(img=>getComputedStyle(img).filter==='none')),'Instagram account pictures must keep their original colours');
  await page.waitForFunction(()=>[...document.querySelectorAll('.brand-icon img')].every(img=>img.complete&&img.naturalWidth>0));
  picture='https://images.example.com/expired.jpg';
  await page.getByRole('button',{name:'Refresh Postiz accounts'}).click();
  await page.locator('.account-title .brand-initial').waitFor();
  assert.equal(await page.locator('.account-title .brand-initial').innerText(),'h');
  assert.equal(await page.locator('.brand-icon img').count(),0,'expired pictures fall back to the account initial');
  await page.getByRole('button',{name:'Start',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
  await page.getByRole('button',{name:'Stop',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).waitFor();assert.deepEqual(patches.slice(-2),[{enabled:true},{enabled:false}]);
  await page.getByRole('button',{name:'Edit Monday times'}).click();
  assert.equal(await page.getByRole('combobox',{name:'Reels on Monday'}).isVisible(),false);
  await page.getByRole('switch',{name:'Post on Wednesday',exact:true}).check();
  await page.getByRole('combobox',{name:'Reels on Wednesday'}).waitFor();
  await page.getByRole('combobox',{name:'Reels on Wednesday'}).selectOption('2');
  const wednesday=page.locator('#day-config-hedgy-2 input[type=time]');
  await wednesday.nth(0).fill('14:00');await wednesday.nth(1).fill('19:45');
  await page.getByRole('button',{name:'Save weekly plan'}).click();await page.getByRole('button',{name:'Saved',exact:true}).waitFor();
  assert.deepEqual(patches.filter(p=>p.week).at(-1).week[2].times,['14:00','19:45']);
  await page.getByRole('button',{name:'Edit Tuesday times'}).click();
  assert.equal(await page.getByRole('combobox',{name:'Reels on Wednesday'}).isVisible(),false);
  assert.equal(await page.getByRole('combobox',{name:'Reels on Tuesday'}).inputValue(),'0');
  assert.equal(await page.getByRole('switch',{name:'Post on Tuesday',exact:true}).isChecked(),false);
  await page.getByRole('switch',{name:'Report reel results to ChatGPT',exact:true}).click();
  await page.getByRole('switch',{name:'Report reel results to ChatGPT',exact:true,checked:false}).waitFor();
  assert.equal(patches.at(-1).notifyResults,false);
  await page.emulateMedia({colorScheme:'dark'});
  assert.equal(await page.locator('.account-shell').evaluate(el=>getComputedStyle(el).colorScheme),'light');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile layout must not overflow horizontally');
  const palette=await page.locator('.account-shell').evaluate(root=>[...root.querySelectorAll('*'),root].flatMap(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor]}));
  assert.deepEqual([...new Set(palette)].filter(c=>!['rgb(0, 0, 0)','rgb(255, 255, 255)','rgb(245, 245, 245)','rgba(0, 0, 0, 0)'].includes(c)),[],'UI paint uses black, white and the soft grey canvas');
  assert.equal(await page.locator('.account-shell').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 245, 245)');
  for(const selector of ['.connection-panel','.notification-panel','.upcoming-panel','.activity-panel','.weekday-row','.day-config']){
   assert.ok(await page.locator(selector).evaluateAll(els=>els.length>0&&els.every(el=>getComputedStyle(el).backgroundColor==='rgb(255, 255, 255)')),`${selector} must stay filled white against the grey canvas`);
  }
  for(const selector of ['.account-sidebar','.account-topbar','.account-main section','.weekday-row','.day-editor-title','.upcoming-list > div','.activity-row']){
   const framed=await page.locator(selector).evaluateAll(els=>els.some(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth].some(w=>w!=='0px')||s.boxShadow!=='none'}));
   assert.equal(framed,false,`${selector} must have no frame or divider`);
  }
  const panel=page.locator('#day-config-hedgy-0');
  await page.getByRole('button',{name:'Edit Monday times'}).click();
  const motion=await panel.evaluate(async el=>{
   getComputedStyle(el).gridTemplateRows;
   const animation=el.getAnimations().find(a=>a.transitionProperty==='grid-template-rows');
   if(!animation)return null;
   await animation.ready;animation.pause();animation.currentTime=90;
   const middle=el.getBoundingClientRect().height;animation.finish();
   return {middle,full:el.getBoundingClientRect().height,fill:getComputedStyle(el).backgroundColor};
  });
  assert.ok(motion&&motion.middle>0&&motion.middle<motion.full,'day expansion must interpolate the panel height');
  assert.equal(motion.fill,'rgb(255, 255, 255)');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Edit Monday times'}).click();
  assert.equal(await panel.evaluate(el=>el.inert&&el.getBoundingClientRect().height===0),true,'collapsed controls must be inert and fully collapsed with reduced motion');
 }finally{await browser.close();}
});
