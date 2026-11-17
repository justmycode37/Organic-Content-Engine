/** Stable material is a separate prefix; findings and changing specs stay after it. */
export type PromptContext={prefix:string};

export function solPrompt(input:string,images:{mime:string;base64:string}[],context?:PromptContext){
 const prefix=context?.prefix.trim();
 return {
  // Explicit-only also avoids paying cache-write rates for one-use suffixes.
  prompt_cache_options:{mode:'explicit',ttl:'30m'},
  input:[...(prefix?[{role:'developer',content:[{type:'input_text',text:prefix,prompt_cache_breakpoint:{mode:'explicit'}}]}]:[]),
   {role:'user',content:[{type:'input_text',text:input},...images.map(i=>({type:'input_image',image_url:`data:${i.mime};base64,${i.base64}`}))]}],
 };
}
