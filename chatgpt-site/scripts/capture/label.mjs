const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function addSourceLabel(browser,screenshot,label){
 const image=`data:image/png;base64,${screenshot.toString('base64')}`;
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 try{
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
   *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;width:max-content;font-family:Arial,sans-serif}
   img{display:block;width:auto;height:auto}.source{height:64px;padding:0 28px;display:flex;align-items:center;background:#f1f1f1;color:#222;font:600 20px/1.2 Arial,sans-serif;white-space:nowrap;border-top:1px solid #d0d0d0}
  </style><img alt="Captured source page" src="${image}"><div class="source">${escapeHtml(label)}</div>`);
  await page.locator('img').evaluate(img=>img.decode());
  return await page.screenshot({type:'png',fullPage:true});
 }finally{await page.close();}
}

