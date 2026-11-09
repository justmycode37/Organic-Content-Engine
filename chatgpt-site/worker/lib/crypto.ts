const encoder=new TextEncoder();
export const randomHex=(length:number)=>Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>b.toString(16).padStart(2,'0')).join('');
export const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export const sign=async(value:string,secret:string)=>hex(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),encoder.encode(value)));
export const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;};
const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64=(value:Uint8Array)=>btoa(Array.from(value,c=>String.fromCharCode(c)).join(''));
export async function encrypt(value:unknown,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['encrypt']);const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(value)));return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;}
export async function decrypt<T>(value:string,secret:string):Promise<T>{const [iv,data]=value.split('.');const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv!)},key,bytes(data!))));}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
