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
 const a={id:'hedgy',name:'hedgy',topic:'finance',platform:'instagram',postsPerDay:1,postingTime:'18:00',timezone:'Europe/Zurich',enabled:false,notifyResults:true,postizIntegrationId:null,week:Array.from({length:7},(_,day)=>({day,times:day===0?['09:00']:[]})),schedule:[],health:{state:'paused',issues:[]}};
 const browser=await chromium.launch({headless:true,executablePath:chrome});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div><script src="/app.js"></script>'});
   if(url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
   if(url.pathname==='/api/postiz/integrations')return route.fulfill({json:{configured:true,integrations:[{id:'insta1',name:'Test',profile:'test_brand',identifier:'instagram-standalone',disabled:false}]}});
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
 }finally{await browser.close();}
});
