import {z} from 'zod';

/** Post copy below the reel, separate from narration and on-screen captions. */
export const hedgyPostCaptionSchema=z.string().trim().min(1).max(2200).superRefine((caption,ctx)=>{
 const tags=caption.match(/(?:^|\s)#[\p{L}\p{N}_]+/gu)??[];
 const body=caption.replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu,' ').trim();
 if(body.split(/\s+/).filter(Boolean).length<60)ctx.addIssue({code:'custom',message:'Post caption needs at least 60 words of useful copy, excluding hashtags; aim for 80–140.'});
 if(body.split(/\r?\n\s*\r?\n/).filter(p=>p.trim()).length<2)ctx.addIssue({code:'custom',message:'Break post copy into short paragraphs separated by blank lines.'});
 if(tags.length<3||tags.length>5||new Set(tags.map(t=>t.trim().toLowerCase())).size!==tags.length)ctx.addIssue({code:'custom',message:'End with 3–5 distinct, relevant hashtags.'});
 if(!/^(?:#[\p{L}\p{N}_]+\s*){3,5}$/u.test(caption.split(/\r?\n/).at(-1)??''))ctx.addIssue({code:'custom',message:'Put the hashtags together on their own final line.'});
});
