// The public X syndication record supplies the exact author, text, date and link card.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function capturePost(page,root,id,index,url,path,fetchFile){
 const datafile=join(root,'post-'+index+'.json');
 await fetchFile('https://cdn.syndication.twimg.com/tweet-result?id='+id+'&lang=en&token=1',datafile);
 const post=JSON.parse(await readFile(datafile));
 if(post.id_str!==id||!post.text||!post.user?.screen_name)throw Error('Unverified public post');
 async function picture(url,name){
  if(!url)return '';
  const file=join(root,'post-'+index+'-'+name);
  try{const mime=await fetchFile(url,file),buffer=await readFile(file);
   if(!mime.startsWith('image/'))return '';
   return 'data:'+mime.split(';')[0]+';base64,'+buffer.toString('base64');
  }catch{return '';}
 }
 const user=post.user,avatar=await picture(user.profile_image_url_https,'avatar');
 let copy=post.text;
 for(const link of post.entities?.urls??[])copy=copy.replace(link.url,link.display_url);
 const card=post.card?.binding_values;
 const media=Object.entries(card??{}).find(([key,v])=>/photo_image_full_size_original|thumbnail_image_original|summary_photo_image_original/.test(key)&&v.image_value?.url)?.[1].image_value.url;
 const photo=await picture(media,'link-photo');
 const date=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(post.created_at));
 const hour=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(post.created_at));
 const badge=user.is_blue_verified||user.verified?'<span class="badge" style="background:'+(user.verified_type==='Business'?'#e8bd57':'#1d9bf0')+'">✓</span>':'';
 await page.setViewportSize({width:1152,height:648});
 await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;background:#000;color:#e7e9ea;font:24px Arial,Helvetica,sans-serif}main{width:880px;margin:auto;border:solid #2f3336;border-width:0 1px;min-height:648px;padding:0 36px}header{font-size:30px;font-weight:bold;padding:17px 0 27px}.author{display:flex;align-items:center;gap:15px}.avatar{width:63px;height:63px;object-fit:cover;border-radius:12px}.name{font-size:29px;font-weight:bold}.badge{font-size:16px;border-radius:50%;color:#111;display:inline-flex;width:23px;height:23px;align-items:center;justify-content:center;vertical-align:4px}.handle,.stamp{color:#8b98a5;font-size:23px}.post{font-size:38px;line-height:1.25;white-space:pre-wrap;margin:24px 0 18px}.card{border:1px solid #34383b;border-radius:18px;overflow:hidden;font-size:22px;margin:18px 0}.photo{width:100%;height:128px;object-fit:cover;display:block}.link{padding:12px 17px}.stamp{border-bottom:1px solid #303438;padding:12px 0 24px}</style></head><body><main><header>← &nbsp; Post</header><div class="author">${avatar?'<img class="avatar" src="'+avatar+'">':''}<div><div class="name">${escape(user.name)} ${badge}</div><div class="handle">@${escape(user.screen_name)}</div></div></div><div class="post">${escape(copy)}</div>${card?'<div class="card">'+(photo?'<img class="photo" src="'+photo+'">':'')+'<div class="link">'+escape(card.title?.string_value||card.domain?.string_value)+'</div></div>':''}<div class="stamp">${escape(hour)} UTC · ${escape(date)}</div></main></body></html>`);
 await page.screenshot({path});
 const rect=await page.locator('.post').boundingBox();
 await writeFile(path+'.json',JSON.stringify({revision:4,url,displayUrl:url,title:user.name+' on X',heading:post.text,rect,viewport:{width:1152,height:648},source:'X public syndication record, rendered in dark post layout',captured:new Date().toISOString()},null,2));
}
