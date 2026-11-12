import {markupWords,stripMarkup} from '../../src/motion/core.ts';

const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const normalize=value=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');

function sourceWords(say){
 const marked=markupWords(say),plain=stripMarkup(say),words=[];
 for(const match of plain.matchAll(/\S+/gu)){
  const index=words.length,source=marked[index];
  words.push({text:source?.text??match[0],accent:source?.accent??false,start:match.index,end:match.index+match[0].length});
 }
 return {plain,words};
}

function overlappingWords(words,start,end){
 const indices=[];
 for(let index=0;index<words.length;index++)if(words[index].start<end&&words[index].end>start)indices.push(index);
 return indices.length?indices:[Math.max(0,words.findIndex(word=>word.start>=start))];
}

function appendWords(target,text,sourceStart,sourceEnd,accent){
 for(const match of text.matchAll(/\S+/gu))target.push({text:match[0],sourceStart,sourceEnd,accent});
}

/** Expand known terms for TTS while keeping a source-word span for every spoken word. */
export function pronounce(say,lexicon={}){
 const {plain,words}=sourceWords(say),entries=Object.entries(lexicon).filter(([term,spoken])=>term&&typeof spoken==='string'&&spoken.trim());
 const ordered=entries.sort((a,b)=>b[0].length-a[0].length);
 if(!ordered.length)return {text:plain,words:words.map((word,index)=>({text:word.text,sourceStart:index,sourceEnd:index,accent:word.accent})),sourceWords:words};
 const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])(?:${ordered.map(([term])=>escapeRegExp(term)).join('|')})(?![\\p{L}\\p{N}_])`,'giu');
 const expected=[],parts=[];let cursor=0,match;
 const appendOriginal=(start,end)=>{
  if(end<=start)return;
  const text=plain.slice(start,end);parts.push(text);
  for(const item of text.matchAll(/\S+/gu)){
   const source=overlappingWords(words,start+item.index,start+item.index+item[0].length);
   const first=source[0],last=source.at(-1);
   appendWords(expected,item[0],first,last,source.some(index=>words[index].accent));
  }
 };
 while((match=pattern.exec(plain))){
  appendOriginal(cursor,match.index);
  const found=ordered.find(([term])=>term.toLocaleLowerCase()===match[0].toLocaleLowerCase());
  const replacement=found[1];parts.push(replacement);
  const source=overlappingWords(words,match.index,match.index+match[0].length),first=source[0],last=source.at(-1);
  appendWords(expected,replacement,first,last,source.some(index=>words[index].accent));
  cursor=match.index+match[0].length;
 }
 appendOriginal(cursor,plain.length);
 return {text:parts.join(''),words:expected,sourceWords:words};
}

function alignWords(expected,actual){
 const rows=expected.length+1,cols=actual.length+1,dp=Array.from({length:rows},()=>new Float64Array(cols)),step=Array.from({length:rows},()=>new Uint8Array(cols));
 for(let i=1;i<rows;i++){dp[i][0]=i*.9;step[i][0]=1;}
 for(let j=1;j<cols;j++){dp[0][j]=j*.9;step[0][j]=2;}
 for(let i=1;i<rows;i++)for(let j=1;j<cols;j++){
  const same=normalize(expected[i-1].text)===normalize(actual[j-1].text)&&normalize(expected[i-1].text).length>0;
  const options=[dp[i-1][j-1]+(same?0:1),dp[i-1][j]+.9,dp[i][j-1]+.9];
  const best=Math.min(...options);dp[i][j]=best;step[i][j]=options.indexOf(best);
 }
 const pairs=[];let i=expected.length,j=actual.length;
 while(i||j){
  const direction=step[i][j];
  if(i&&j&&direction===0){pairs.push([i-1,j-1]);i--;j--;}
  else if(i&&(j===0||direction===1))i--;
  else {pairs.push([Math.max(0,Math.min(expected.length-1,i-1)),j-1]);j--;}
 }
 return pairs.reverse();
}

/** Project provider word timings onto the original written words, including expanded lexicon entries. */
export function mapSpeechTimings(pronunciation,actualWords){
 const expected=pronunciation.words,source=pronunciation.sourceWords;
 if(!source.length)return [];
 const intervals=expected.map(()=>({start:Infinity,end:-Infinity}));
 for(const [expectedIndex,actualIndex] of alignWords(expected,actualWords)){
  const target=intervals[expectedIndex],word=actualWords[actualIndex];
  if(word.start<target.start)target.start=word.start;
  if(word.end>target.end)target.end=word.end;
 }
 for(let index=0;index<intervals.length;index++)if(!Number.isFinite(intervals[index].start)){
  const before=intervals.slice(0,index).reverse().find(item=>Number.isFinite(item.start));
  const after=intervals.slice(index+1).find(item=>Number.isFinite(item.start));
  const at=before&&after?(before.end+after.start)/2:before?.end??after?.start??0;
  intervals[index]={start:at,end:at};
 }
 const result=source.map(word=>({...word,start:Infinity,end:-Infinity}));
 expected.forEach((spoken,index)=>{
  for(let sourceIndex=spoken.sourceStart;sourceIndex<=spoken.sourceEnd;sourceIndex++){
   const target=result[sourceIndex],timing=intervals[index];
   target.start=Math.min(target.start,timing.start);target.end=Math.max(target.end,timing.end);
  }
 });
 for(let index=0;index<result.length;index++)if(!Number.isFinite(result[index].start)){
  const before=result.slice(0,index).reverse().find(item=>Number.isFinite(item.start));
  const after=result.slice(index+1).find(item=>Number.isFinite(item.start));
  const at=before&&after?(before.end+after.start)/2:before?.end??after?.start??0;
  result[index].start=at;result[index].end=at;
 }
 return result;
}
