const CAPTURE_AGENT='OrganicContentCaptureKit';

function escapeRegex(value){return value.replace(/[.+?^${}()|[\]\\]/g,'\\$&');}

function patternRegex(rule){
 const end=rule.endsWith('$'),body=end?rule.slice(0,-1):rule;
 return new RegExp(`^${body.split('*').map(escapeRegex).join('.*')}${end?'$':''}`);
}

export function parseRobotsTxt(text,userAgent=CAPTURE_AGENT){
 const groups=[];let group=null,hasRules=false;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#',1)[0].trim();if(!line)continue;
  const divider=line.indexOf(':');if(divider<0)continue;
  const directive=line.slice(0,divider).trim().toLowerCase(),value=line.slice(divider+1).trim();
  if(directive==='user-agent'){
   if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}
   group.agents.push(value.toLowerCase());
  }else if((directive==='allow'||directive==='disallow')&&group){
   group.rules.push({allow:directive==='allow',path:value});hasRules=true;
  }
 }
 const agent=userAgent.toLowerCase();
 const matched=groups.map(group=>({group,specificity:Math.max(-1,...group.agents.map(name=>name==='*'?0:agent.includes(name)?name.length:-1))})).filter(item=>item.specificity>=0);
 if(!matched.length)return {allowed:true,matchedRules:[]};
 const best=Math.max(...matched.map(item=>item.specificity));
 const rules=matched.filter(item=>item.specificity===best).flatMap(item=>item.group.rules).filter(rule=>rule.path.length>0);
 return {allowed:true,matchedRules:rules};
}

export function robotsAllows(policy,url){
 const requestPath=`${new URL(url).pathname}${new URL(url).search}`;
 const matches=(policy.matchedRules??[]).filter(rule=>patternRegex(rule.path).test(requestPath));
 if(!matches.length)return true;
 const specificity=rule=>rule.path.replace(/[\*$]/g,'').length;
 matches.sort((a,b)=>specificity(b)-specificity(a)||Number(b.allow)-Number(a.allow));
 return matches[0].allow;
}

export async function assertRobotsAllows(url,{fetchImpl=fetch}={}){
 const target=new URL(url);
 const robotsUrl=new URL('/robots.txt',target.origin);
 let response;
 try{response=await fetchImpl(robotsUrl,{headers:{'user-agent':`${CAPTURE_AGENT}/1.0 (local editorial capture)`},signal:AbortSignal.timeout(10000)});}
 catch(error){throw new Error(`Capture stopped: could not check ${robotsUrl.href} (${error.message}); robots policy was not bypassed.`);}
 if(response.status===404||response.status===410)return;
 if(response.status===401||response.status===403)throw new Error(`Capture stopped: ${robotsUrl.href} returned HTTP ${response.status}; the site is blocked by its robots endpoint.`);
 if(!response.ok)throw new Error(`Capture stopped: robots.txt returned HTTP ${response.status}; robots policy was not bypassed.`);
 const text=await response.text(),policy=parseRobotsTxt(text);
 if(!robotsAllows(policy,target.href))throw new Error(`Capture stopped: robots.txt disallows ${target.pathname}; no retry or access workaround was attempted.`);
}
