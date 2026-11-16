import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSlots,weekSchema} from '../worker/services/accounts.ts';
import {Postiz} from '../worker/services/postiz.ts';
const account={id:'hedgy',name:'hedgy',topic:'finance',platform:'instagram',postsPerDay:1,postingTime:'18:00',timezone:'Europe/Zurich',enabled:true};
const week=(days,times)=>Array.from({length:7},(_,day)=>({day,times:days.includes(day)?times:[]}));
test('weekly slots use chosen weekdays and independent times without spilling into the next day',()=>{
 const slots=accountSlots({...account,week:week([0,2],['09:15','23:30'])},new Date('2026-11-16T00:00:00Z'),0,7);
 assert.deepEqual(slots.map(s=>s.scheduledAt),['2026-11-16T08:15:00.000Z','2026-11-16T22:30:00.000Z','2026-11-18T08:15:00.000Z','2026-11-18T22:30:00.000Z']);
});
test('DST gaps are skipped and overlaps run once, while winter and summer retain the local hour',()=>{
 const a={...account,week:week([6],['02:30','09:00'])};
 assert.deepEqual(accountSlots(a,new Date('2027-03-28T00:00:00Z'),0,1).map(s=>s.scheduledAt),['2027-03-28T07:00:00.000Z']);
 const fall=accountSlots(a,new Date('2027-10-31T00:00:00Z'),0,1);assert.equal(fall.length,2);assert.equal(fall.at(-1).scheduledAt,'2027-10-31T08:00:00.000Z');
});
test('invalid, duplicate, empty and six-slot weeks are validated correctly',()=>{
 assert.equal(weekSchema.safeParse(week([1],['09:00','09:00'])).success,false);
 assert.equal(weekSchema.safeParse(week([1],['24:00'])).success,false);
 assert.equal(weekSchema.safeParse(Array(7).fill({day:1,times:[]})).success,false);
 assert.equal(weekSchema.safeParse(week([],[])).success,true);
 assert.equal(accountSlots({...account,week:week([],[])},new Date()).length,0);
});
test('Postiz uploads a finished file and creates the correctly bound standalone Instagram post',async()=>{
 const requests=[],target={id:'insta1',name:'Brand',identifier:'instagram-standalone',disabled:false};
 const p=new Postiz({POSTIZ_API_KEY:'private-test-key'},async(url,init)=>{
  requests.push({url,init});assert.equal(init.headers.Authorization,'private-test-key');assert.equal(init.redirect,'manual');
  if(url.endsWith('/integrations'))return Response.json([target,{id:'x',identifier:'x'}]);
  if(url.endsWith('/upload')){const form=await new Response(init.body,{headers:init.headers}).formData();assert.equal(form.get('adjust'),'false');assert.equal(form.get('file').type,'video/mp4');assert.equal(await form.get('file').text(),'video');return Response.json({id:'m1',path:'https://uploads.postiz.com/m1.mp4'});}
  const b=JSON.parse(init.body);assert.equal(b.type,'now');assert.equal(b.posts[0].integration.id,'insta1');assert.equal(b.posts[0].settings.__type,'instagram-standalone');assert.equal(b.posts[0].settings.post_type,'post');assert.deepEqual(b.posts[0].value[0].image,[{id:'m1',path:'https://uploads.postiz.com/m1.mp4'}]);return Response.json([{postId:'p1',integration:'insta1'}]);
 });
 const t=await p.target('insta1'),m=await p.upload(new Blob(['video'],{type:'video/mp4'}).stream(),'finished.mp4');assert.equal(await p.create(t,m,'Caption'),'p1');assert.equal(requests.length,3);
});
test('provider failures are sanitized and never return credentials or upstream response bodies',async()=>{
 const p=new Postiz({POSTIZ_API_KEY:'private-test-key'},async()=>new Response('private-test-key',{status:401}));await assert.rejects(()=>p.integrations(),e=>!e.message.includes('private-test-key')&&e.message.includes('401'));
 const q=new Postiz({POSTIZ_API_KEY:'test'},async()=>Response.json([{id:'wrong',identifier:'instagram',disabled:true}]));await assert.rejects(()=>q.target('wrong'),/unavailable/);
});
test('Instagram integrations expose HTTPS profile pictures without leaking other provider fields',async()=>{
 const pictures=['https://images.example.com/instagram.jpg',undefined,null,'http://images.example.com/photo.jpg','javascript:alert(1)','not a URL','https://user:secret@images.example.com/photo.jpg'];
 const rows=pictures.map((picture,i)=>({id:String(i),name:'Brand',identifier:'instagram',profile:'brand',picture,accessToken:'private'}));
 const p=new Postiz({POSTIZ_API_KEY:'test'},async()=>Response.json([...rows,{id:'other',identifier:'x',picture:pictures[0]}]));
 const items=await p.integrations();assert.equal(items.length,pictures.length);assert.equal(items[0].picture,pictures[0]);
 for(const item of items.slice(1))assert.equal(item.picture,undefined);
 assert.ok(items.every(item=>!('accessToken' in item)));
});
