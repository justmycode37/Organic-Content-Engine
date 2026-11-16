import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import type {Context} from 'hono';
import type {Db} from '../db/database.ts';
import {digest,equal,passwordHash,randomHex,sign} from '../lib/crypto.ts';
import {AppError} from '../errors.ts';
export async function unlocked(c:Context,env:Record<string,unknown>,userId:string){
  if(!env.APP_PASSWORD_HASH||!env.SESSION_SECRET)return false;
  const [expires,nonce,signature]=(getCookie(c,'oce_access')??'').split('.');
  if(!expires||!nonce||!signature||!/^\d+$/.test(expires)||Number(expires)<Date.now()/1000)return false;
  return equal(signature,await sign(`${userId}:${expires}.${nonce}`,String(env.SESSION_SECRET??'')));
}
export async function login(c:Context,env:Record<string,unknown>,db:Db,userId:string,password:string){
  if(!env.APP_PASSWORD_HASH||!env.SESSION_SECRET)throw new AppError(503,'password_not_configured','Workspace password access is not configured');
  // Cloudflare supplies this address. Do not use client-controlled forwarded headers.
  const limiter=env.WORKSPACE_ACCESS==='password'?`password:${c.req.header('cf-connecting-ip')??'unknown'}`:userId;
  const key=await digest(limiter),now=Date.now();
  const limit=await db.prepare('INSERT INTO login_limits (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN login_limits.reset_at<? THEN 1 ELSE login_limits.attempts+1 END,reset_at=CASE WHEN login_limits.reset_at<? THEN ? ELSE login_limits.reset_at END RETURNING attempts').bind(key,now+900000,now,now,now+900000).first<{attempts:number}>();
  if((limit?.attempts??99)>10)return c.json({message:'Too many attempts. Try again in 15 minutes.'},429);
  const [salt,expected]=String(env.APP_PASSWORD_HASH??'').split(':');
  if(!salt||!expected||!equal(await passwordHash(password,salt),expected))return c.json({message:'Incorrect password.'},401);
  await db.prepare('DELETE FROM login_limits WHERE key=?').bind(key).run();
  const payload=`${Math.floor(now/1000)+604800}.${randomHex(24)}`;
  setCookie(c,'oce_access',`${payload}.${await sign(`${userId}:${payload}`,String(env.SESSION_SECRET))}`,{httpOnly:true,secure:true,sameSite:'None',path:'/',maxAge:604800});
  return c.json({authRequired:true,authenticated:true});
}
export function logout(c:Context){deleteCookie(c,'oce_access',{path:'/'});return c.body(null,204);}
