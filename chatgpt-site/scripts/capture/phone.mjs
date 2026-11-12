import {readFile} from 'node:fs/promises';

export async function renderPhoneFrame(browser,imagePath){
 const image=`data:image/png;base64,${(await readFile(imagePath)).toString('base64')}`;
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 try{
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
   *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#e8e8e8}
   .phone{position:absolute;left:34px;top:42px;width:1012px;height:1836px;border-radius:64px;background:#222;box-shadow:0 0 0 3px #555}
   .screen{position:absolute;left:20px;right:20px;top:26px;bottom:26px;border-radius:43px;overflow:hidden;background:#f7f7f7;display:grid;place-items:center}
   .screen img{width:100%;height:100%;object-fit:contain;display:block}.speaker{position:absolute;z-index:2;left:calc(50% - 48px);top:10px;width:72px;height:8px;border-radius:6px;background:#111}.camera{position:absolute;z-index:2;left:calc(50% + 36px);top:7px;width:13px;height:13px;border-radius:50%;background:#101010;box-shadow:inset 0 0 0 3px #333}
  </style><div class="phone"><div class="speaker"></div><div class="camera"></div><div class="screen"><img alt="Captured page" src="${image}"></div></div>`);
  await page.locator('img').evaluate(img=>img.decode());
  return await page.screenshot({type:'png'});
 }finally{await page.close();}
}
