import { randomHex,digest,encrypt,decrypt } from '../lib/crypto.ts';
import type { Db } from '../db/database.ts';
import { AppError } from '../errors.ts';
export const SOCIAL = ['instagram','tiktok','x','youtube','linkedin'] as const;
export type SocialPlatform = typeof SOCIAL[number];
interface Credentials { access_token:string;refresh_token?:string;expires_at:number;scope?:string }
interface Account { platform:SocialPlatform;account_id:string;name:string;credentials:string;updated_at:string }
export const platformOf=(value:string):SocialPlatform=>{if(!(SOCIAL as readonly string[]).includes(value))throw new AppError(400,'invalid_platform','Choose Instagram, TikTok, or YouTube');return value as SocialPlatform;};
export class SocialAccounts {
  db:Db; network:typeof fetch; env:Record<string,string|undefined>;
  constructor(db:Db,env:Record<string,string|undefined>,network:typeof fetch=fetch){this.db=db;this.env=env;this.network=(input,init)=>network(input,init);}
  config(platform:SocialPlatform) {
    const prefix={instagram:'INSTAGRAM',tiktok:'TIKTOK',youtube:'YOUTUBE',x:'X',linkedin:'LINKEDIN'}[platform];
    const id=this.env[`${prefix}_CLIENT_ID`];const secret=this.env[`${prefix}_CLIENT_SECRET`];
    const missing=[!id&&`${prefix}_CLIENT_ID`,!secret&&`${prefix}_CLIENT_SECRET`,!this.env.PUBLIC_BASE_URL&&'PUBLIC_BASE_URL',!this.env.TOKEN_ENCRYPTION_KEY&&'TOKEN_ENCRYPTION_KEY'].filter(Boolean) as string[];
    return {id:id??'',secret:secret??'',missing,callback:`${this.env.PUBLIC_BASE_URL}/api/social/${platform}/callback`};
  }
  async account(platform:SocialPlatform) {return this.db.prepare('SELECT * FROM social_accounts WHERE platform=?').bind(platform).first<Account>();}
  async statuses() {return Promise.all(SOCIAL.map(async platform=>{const account=await this.account(platform);const config=this.config(platform);return {platform,connected:Boolean(account),name:account?.name??null,accountId:account?.account_id??null,setupRequired:config.missing,callback:config.callback};}));}
  async start(platform:SocialPlatform,browser:string) {
    const c=this.config(platform);if(c.missing.length)throw new AppError(409,'provider_setup_required',`Application setup needed: ${c.missing.join(', ')}`);
    const state=randomHex(32),verifier=randomHex(48);
    await this.db.prepare('DELETE FROM oauth_pending WHERE expires<?').bind(Date.now()).run();
    await this.db.prepare('INSERT INTO oauth_pending (state,platform,verifier,expires,browser_hash) VALUES (?,?,?,?,?)').bind(state,platform,verifier,Date.now()+600000,await digest(browser)).run();
    const params=new URLSearchParams({redirect_uri:c.callback,response_type:'code',state});let base='';
    if(platform==='instagram'){base='https://www.instagram.com/oauth/authorize';params.set('client_id',c.id);params.set('scope','instagram_business_basic,instagram_business_content_publish');params.set('enable_fb_login','0');params.set('force_authentication','1');}
    if(platform==='tiktok'){base='https://www.tiktok.com/v2/auth/authorize/';params.set('client_key',c.id);params.set('scope','user.info.basic,video.publish');}
    if(platform==='linkedin'){base='https://www.linkedin.com/oauth/v2/authorization';params.set('client_id',c.id);params.set('scope','openid profile email w_member_social');}
    if(platform==='x'){base='https://x.com/i/oauth2/authorize';params.set('client_id',c.id);params.set('scope','tweet.read tweet.write users.read offline.access');params.set('code_challenge',btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''));params.set('code_challenge_method','S256');}
    if(platform==='youtube'){base='https://accounts.google.com/o/oauth2/v2/auth';params.set('client_id',c.id);params.set('scope','https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');params.set('access_type','offline');params.set('prompt','consent');params.set('code_challenge',btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''));params.set('code_challenge_method','S256');}
    return `${base}?${params}`;
  }
  async json(url:string,init:RequestInit={}) {
    const response=await this.network(url,{...init,redirect:'manual',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new AppError(response.status===401||response.status===403?409:502,'provider_request_failed',`Provider request failed (HTTP ${response.status}). Check app permissions or reconnect the account.`);
    const text=await response.text();let data:any;try{data=text?JSON.parse(text):{};}catch{throw new AppError(502,'invalid_provider_response','Provider returned an unreadable response');}
    if(data.error && (typeof data.error==='string'||(data.error.code&&data.error.code!=='ok')))throw new AppError(409,'provider_rejected','The provider rejected this request. Check account permissions and publishing limits.');
    return data;
  }
  async callback(platform:SocialPlatform,state:string,browser:string,code:string,error?:string) {
    const pending=await this.db.prepare('DELETE FROM oauth_pending WHERE state=? AND platform=? AND browser_hash=? AND expires>? RETURNING verifier').bind(state,platform,await digest(browser),Date.now()).first<{verifier:string}>();
    if(!pending)throw new AppError(400,'invalid_oauth_state','Connection expired or did not originate in this browser. Try connecting again.');
    if(error)throw new AppError(400,'access_denied','Account connection was not authorized.');
    if(!code)throw new AppError(400,'missing_code','No account authorization code was returned');
    const c=this.config(platform);let tokens:any;let accountId='',name='';
    const form=(url:string,body:Record<string,string>)=>this.json(url,{method:'POST',body:new URLSearchParams(body)});
    if(platform==='youtube') {
      tokens=await form('https://oauth2.googleapis.com/token',{client_id:c.id,client_secret:c.secret,grant_type:'authorization_code',code,code_verifier:pending.verifier,redirect_uri:c.callback});
      const scopes=String(tokens.scope??'').split(' ');if(!scopes.includes('https://www.googleapis.com/auth/youtube.upload')||!scopes.includes('https://www.googleapis.com/auth/youtube.readonly'))throw new AppError(409,'scope_missing','Allow YouTube uploads and channel access when connecting');
      const info=await this.json('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
      accountId=info.items?.[0]?.id;name=info.items?.[0]?.snippet?.title;
    } else if(platform==='tiktok') {
      tokens=await form('https://open.tiktokapis.com/v2/oauth/token/',{client_key:c.id,client_secret:c.secret,grant_type:'authorization_code',code,redirect_uri:c.callback});
      if(!String(tokens.scope??'').split(',').includes('video.publish'))throw new AppError(409,'scope_missing','Allow TikTok publishing when connecting');
      const info=await this.json('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers:{Authorization:`Bearer ${tokens.access_token}`}});accountId=tokens.open_id;name=info.data?.user?.display_name;
    } else if(platform==='x'){
      tokens=await this.json('https://api.x.com/2/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`},body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:pending.verifier,redirect_uri:c.callback})});
      if(!String(tokens.scope??'').split(' ').includes('tweet.write'))throw new AppError(409,'scope_missing','Allow X publishing when connecting');
      const info=await this.json('https://api.x.com/2/users/me',{headers:{Authorization:`Bearer ${tokens.access_token}`}});accountId=info.data?.id;name=info.data?.username;
    } else if(platform==='linkedin'){
      tokens=await form('https://www.linkedin.com/oauth/v2/accessToken',{client_id:c.id,client_secret:c.secret,grant_type:'authorization_code',code,redirect_uri:c.callback});
      const info=await this.json('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});if(!info.sub)throw new AppError(409,'account_unavailable','LinkedIn returned no member identifier');accountId=`urn:li:person:${info.sub}`;name=info.name;
    } else {
      const short=await form('https://api.instagram.com/oauth/access_token',{client_id:c.id,client_secret:c.secret,grant_type:'authorization_code',code,redirect_uri:c.callback});
      const shortToken=short.access_token??short.data?.[0]?.access_token;
      if(!shortToken)throw new AppError(502,'invalid_token_response','Instagram returned no access token');
      const params=new URLSearchParams({grant_type:'ig_exchange_token',client_secret:c.secret,access_token:shortToken});
      tokens=await this.json(`https://graph.instagram.com/access_token?${params}`);
      const info=await this.json('https://graph.instagram.com/me?fields=user_id,username',{headers:{Authorization:`Bearer ${tokens.access_token}`}});accountId=String(info.user_id??info.id??'');name=info.username;
    }
    if(!accountId||!name||!tokens.access_token)throw new AppError(409,'account_unavailable','No eligible publishing account was returned');
    const prior=await this.account(platform);const old=prior&&prior.account_id===accountId?await decrypt<Credentials>(prior.credentials,this.env.TOKEN_ENCRYPTION_KEY!):null;
    const credentials={access_token:tokens.access_token,refresh_token:tokens.refresh_token??old?.refresh_token,expires_at:Date.now()+Number(tokens.expires_in??3600)*1000,scope:tokens.scope};
    await this.db.prepare('INSERT INTO social_accounts (platform,account_id,name,credentials,updated_at) VALUES (?,?,?,?,?) ON CONFLICT (platform) DO UPDATE SET account_id=excluded.account_id,name=excluded.name,credentials=excluded.credentials,updated_at=excluded.updated_at').bind(platform,accountId,name,await encrypt(credentials,this.env.TOKEN_ENCRYPTION_KEY!),new Date().toISOString()).run();
  }
  async token(platform:SocialPlatform) {
    const account=await this.account(platform);if(!account)throw new AppError(409,'account_missing',`Connect your ${platform} account in Platforms`);
    let tokens=await decrypt<Credentials>(account.credentials,this.env.TOKEN_ENCRYPTION_KEY!);
    if(tokens.expires_at>Date.now()+300000)return {account,access:tokens.access_token};
    const lock=await this.db.prepare('INSERT INTO job_locks (name,locked_until) VALUES (?,?) ON CONFLICT (name) DO UPDATE SET locked_until=excluded.locked_until WHERE job_locks.locked_until<? RETURNING name').bind(`refresh:${platform}`,new Date(Date.now()+60000).toISOString(),new Date().toISOString()).first();
    if(!lock)throw new AppError(409,'account_refreshing','Account authorization is refreshing. Try again shortly.');
    try {
      const c=this.config(platform);let fresh:any;
      if(platform==='instagram')fresh=await this.json(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({grant_type:'ig_refresh_token',access_token:tokens.access_token})}`);
      else {
        if(platform==='linkedin'&&!tokens.refresh_token)throw new AppError(409,'reconnect_required','LinkedIn authorization expired. Reconnect LinkedIn.');
        if(!tokens.refresh_token)throw new AppError(409,'reconnect_required','Reconnect this account to renew publishing permission');
        if(platform==='x'){const c=this.config(platform);const fresh=await this.json('https://api.x.com/2/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token})});tokens={...tokens,access_token:fresh.access_token,refresh_token:fresh.refresh_token??tokens.refresh_token,expires_at:Date.now()+Number(fresh.expires_in)*1000};await this.db.prepare('UPDATE social_accounts SET credentials=? WHERE platform=? AND credentials=?').bind(await encrypt(tokens,this.env.TOKEN_ENCRYPTION_KEY!),platform,account.credentials).run();return {account,access:tokens.access_token};}
        const body:Record<string,string>=platform==='youtube'||platform==='linkedin'?{client_id:c.id,client_secret:c.secret,grant_type:'refresh_token',refresh_token:tokens.refresh_token}:{client_key:c.id,client_secret:c.secret,grant_type:'refresh_token',refresh_token:tokens.refresh_token};
        fresh=await this.json(platform==='youtube'?'https://oauth2.googleapis.com/token':platform==='linkedin'?'https://www.linkedin.com/oauth/v2/accessToken':'https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',body:new URLSearchParams(body)});
      }
      if(!fresh.access_token)throw new AppError(409,'reconnect_required','Reconnect this account');
      tokens={...tokens,access_token:fresh.access_token,refresh_token:fresh.refresh_token??tokens.refresh_token,expires_at:Date.now()+Number(fresh.expires_in)*1000};
      const updated=await this.db.prepare('UPDATE social_accounts SET credentials=?,updated_at=? WHERE platform=? AND credentials=? RETURNING platform').bind(await encrypt(tokens,this.env.TOKEN_ENCRYPTION_KEY!),new Date().toISOString(),platform,account.credentials).first();
      if(!updated)throw new AppError(409,'connection_changed','The account connection changed. Try again.');
      return {account,access:tokens.access_token};
    }finally{await this.db.prepare('DELETE FROM job_locks WHERE name=?').bind(`refresh:${platform}`).run();}
  }
  async creator() {const {access}=await this.token('tiktok');const info=await this.json('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:'{}'});return info.data;}
  async disconnect(platform:SocialPlatform) {
    const account=await this.account(platform);await this.db.prepare('DELETE FROM social_accounts WHERE platform=?').bind(platform).run();
    let revoked=true;
    if(account){const token=await decrypt<Credentials>(account.credentials,this.env.TOKEN_ENCRYPTION_KEY!);try {
      if(platform==='youtube')await this.json('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:token.refresh_token??token.access_token})});
      else if(platform==='tiktok'){const c=this.config(platform);await this.json('https://open.tiktokapis.com/v2/oauth/revoke/',{method:'POST',body:new URLSearchParams({client_key:c.id,client_secret:c.secret,token:token.access_token})});}
      else if(platform==='x'){const c=this.config(platform);await this.json('https://api.x.com/2/oauth2/revoke',{method:'POST',headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`},body:new URLSearchParams({token:token.access_token,token_type_hint:'access_token'})});}
      else if(platform==='linkedin')revoked=false;
      else await this.json('https://graph.instagram.com/me/permissions',{method:'DELETE',headers:{Authorization:`Bearer ${token.access_token}`}});
    }catch{revoked=false;}}
    return {revoked};
  }
}
