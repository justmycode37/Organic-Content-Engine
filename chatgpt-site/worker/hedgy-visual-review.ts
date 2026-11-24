import {z} from 'zod';
import {parseEditorialJson,normalizeNarration} from './hedgy-editorial.ts';
import {WORLDS,isWorld} from '../src/motion/kit/world-ids.ts';
import {describeShotCatalog} from '../src/motion/shots/catalog.ts';

type Ask=(step:string,input:string,format?:{name:string;schema:z.ZodType})=>Promise<string>;
type Critic=(step:string,input:string,format?:{name:string;schema:z.ZodType},images?:{mime:string;base64:string}[])=>Promise<string>;
type Scene={say:string;shot?:string;params?:Record<string,unknown>;[key:string]:unknown};
type Spec={scenes:Scene[];[key:string]:unknown};

const visualReviewSchema=z.object({
 approved:z.boolean(),
 score:z.number().min(0).max(100),
 findings:z.array(z.object({scene:z.number().int().min(1),problem:z.string().max(400),fix:z.string().max(400)}).strict()).max(12),
}).strict();
export type HedgyVisualReview=z.infer<typeof visualReviewSchema>;

/**
 * A different model family watches the rendered frames (contact sheets with timestamps) and the
 * timed narration, and names shots that are unreadable, mismatched with the words, broken or dull.
 */
export async function reviewRenderedHedgy(critic:Critic,spec:Spec,sheets:{mime:string;base64:string}[],timeline:string){
 const raw=await critic('rendered-visual-review',`You are the final visual reviewer of an animated finance reel (Instagram Reels, 1080x1920, pixel-art hedgehog cast in pixel-art places). The attached contact sheets show the actual rendered frames in order; sheets.txt rules: ${timeline}
For each numbered scene, check what a viewer with sound OFF would see: is it instantly clear what happens (a verb, not a pose)? Can they tell who had the money before it moved, who got it, and which prop was transferred or removed? A subtitle cannot supply visual evidence of a missing prop or correct a misleading transfer. Does the scene act out the words spoken at that moment? Is anything broken, clipped, overlapping, unreadable, tiny, confusing, irrelevant or static for long? In the first two shots, identify the frame that shows the hook's physical evidence and the next frame that advances the story. Flag a second setup shot or an empty cover that hides the focal prop until the cut. Check the final frame for edge bars and collisions. Does the last shot show the payoff?
Score 0–100 the visual storytelling quality (90 = excellent). Approve only when score >= 85. For each problem, give the scene number, the problem, and a fix expressed as a change to that scene's shot, params or world (use only the shot library below). At most 6 findings, most important first.
Return JSON only: {"approved":boolean,"score":number,"findings":[{"scene":number,"problem":string,"fix":string}]}
Scenes: ${JSON.stringify(spec.scenes.map((s,i)=>({scene:i+1,say:s.say,shot:s.shot,params:s.params})))}
${describeShotCatalog()}`,{name:'hedgy_visual_review',schema:visualReviewSchema},sheets);
 const parsed=visualReviewSchema.safeParse(parseEditorialJson(raw));
 return parsed.success?parsed.data:undefined;
}

/** One Sol repair of the shot list from rendered-frame findings; narration, hook and post copy stay fixed. */
export async function repairFromVisualReview(ask:Ask,spec:Spec,review:HedgyVisualReview,schema:z.ZodType){
 const narration=normalizeNarration(spec.scenes.map(s=>s.say).join(' '));
 const raw=await ask('rendered-visual-repair',`Repair this Hedgy reel JSON using findings from a reviewer who watched the rendered frames. Change only shot choices, params (including params.world from ${WORLDS.join(', ')}), sync markers, durations and transitions of the scenes named. Keep every say line, the hook, header, payoff, title, postCaption, music and musicBrief exactly. You may split or merge scenes only if every spoken word stays in order.
Findings: ${JSON.stringify(review.findings)}
JSON: ${JSON.stringify(spec)}
${describeShotCatalog()}`,{name:'hedgy_reel',schema});
 const parsed=schema.safeParse(parseEditorialJson(raw));
 if(!parsed.success)return {problems:['repair did not match the reel schema']};
 const next=parsed.data as Spec;
 if(normalizeNarration(next.scenes.map(s=>s.say).join(' '))!==narration)return {problems:['repair changed the narration']};
 if(next.scenes.some(s=>s.shot&&!isWorld(s.params?.world)))return {problems:['repair dropped a world']};
 return {spec:{...spec,...next,hook:spec.hook,header:spec.header,payoff:spec.payoff,term:spec.term,title:spec.title,postCaption:spec.postCaption,music:spec.music,musicBrief:spec.musicBrief,look:spec.look}};
}
