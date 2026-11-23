import {z} from 'zod';
import {hedgyPostCaptionSchema} from './hedgy-caption.ts';
import {AppError} from './errors.ts';
import type {hedgyClient} from './hedgy-model-client.ts';

type Ask = ReturnType<typeof hedgyClient>;
type Critic = (step:string,input:string,format?:{name:string;schema:z.ZodType},images?:{mime:string;base64:string}[])=>Promise<string>;
const repairLimit = 3;
/** Story drafts get one extra repair: the cross-model critic adds a second axis (shareability) to correctness. */
const storyRepairLimit = 4;
const storySchema = z.object({
 hookText: z.string().trim().min(3).max(60).optional(),
 question: z.string().trim().min(1).max(200),
 answer: z.string().trim().min(1).max(260),
 anchor: z.string().trim().min(1).max(200),
 beats: z.array(z.object({
  say: z.string().trim().min(1).max(220),
  link: z.string().trim().min(1).max(220),
 }).strict()).min(3).max(7),
}).strict();
const findingsSchema = z.array(z.string().trim().min(1).max(400)).max(12);
const reviewSchema = z.object({approved:z.boolean(),findings:findingsSchema}).strict();
const listenerSchema = reviewSchema.extend({
 heardQuestion:z.string().trim().min(1).max(200),
 heardAnswer:z.string().trim().min(1).max(260),
 retell:z.string().trim().min(1).max(500),
});
const sceneReviewSchema = reviewSchema.extend({
 handoffs:z.array(z.object({
  intoScene:z.number().int().min(2).max(16),
  connects:z.boolean(),
  evidence:z.string().trim().min(1).max(400),
 }).strict()).max(15),
});
const viralSchema = reviewSchema.extend({score:z.number().min(0).max(100),hookVerdict:z.string().trim().max(400).optional()});
/** Cross-model gate: the story must be strong enough to stop a scroll and be worth sharing. */
export const VIRAL_STORY_RULES = `Viral bar (this reel competes with the best short-form explainers):
- The FIRST spoken sentence is the hook: at most 12 words, instantly clear, and it opens a curiosity gap or names a surprising, relatable tension (a question the viewer suddenly needs answered, or a claim that sounds wrong). No scene-setting before it.
- Concrete stakes for one character the viewer recognises; the viewer should feel "wait, why?" within 3 seconds.
- One "aha" turn where the mechanism clicks, shown by what happens to the anchor.
- The last line pays off the hook in a punchy, memorable way (a twist, reversal, or a line people would quote), ideally echoing the opening words so the reel loops.
- Brisk: 55–80 spoken words, no filler, no throat-clearing, no lecture tone. Talk like a sharp friend.
- One or two simple round numbers are welcome when they make the surprise concrete; never ask the viewer to calculate.
- hookText: the on-screen hook title (max 7 words, may mark the key word with *asterisks*), punchier than the spoken line and never a spoiler of the answer.`;
const copySchema = z.object({title:z.string().trim().min(1).max(90),postCaption:hedgyPostCaptionSchema}).strict();

export function parseEditorialJson(raw:string):unknown {
 try {return JSON.parse(raw);} catch {}
 // Critics from another model family sometimes wrap JSON in a fence or a sentence.
 const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)?.[1] ?? raw;
 const start = fenced.search(/[[{]/), end = Math.max(fenced.lastIndexOf('}'), fenced.lastIndexOf(']'));
 if (start < 0 || end <= start) return undefined;
 try {return JSON.parse(fenced.slice(start, end + 1));} catch {return undefined;}
}

export function normalizeNarration(text:string) {
 return text.trim().replace(/\s+/g,' ');
}

function reviewProblems(label:string, review:z.infer<typeof reviewSchema>|undefined) {
 if (!review) return [`${label}: invalid review response`];
 if (review.findings.length) return review.findings.map(finding => `${label}: ${finding}`);
 return review.approved ? [] : [`${label}: rejected without actionable findings`];
}

function parseProblems(error:z.ZodError) {
 return error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
}

export async function reviewHedgyStory(ask:Ask, idea:string, concept:string, critic?:Critic) {
 const rounds = [];
 let feedback:string[] = [];
 let previousDraft = '';
 let best:{story:z.infer<typeof storySchema>;narration:string;score:number}|undefined;
 const brief = `Write one spoken Hedgy finance story for a viewer with no investing background.
${idea}
Decide the single question raised by the opening and its concrete answer. Name one visible anchor (a person, object, or repeated transaction) the viewer can follow from the opening through the outcome. Build 3–7 causal beats. Each beat picks up the person, object, question, or outcome we just saw and makes one change the viewer can follow. Start where the decision or problem happens, and make the last beat answer the opening using that same anchor in its changed state. For a before/after comparison, keep what stays constant explicit so we can see what changed. Use one concrete sequence and consistent words for the same things. Prefer stories where the characters directly experience the mechanism. If you use an analogy, make its mapping explicit. Cut detours and examples that require a second setup.
Tell it as if a friend missed what happened. In the first breath, put someone in a specific predicament we can recognize before we know the finance term. Name the object the first time we hear about it. A viewer should know what “mine,” “the pair” or “the other one” refers to when the words are spoken. The hook is provisional: replace it if it promises a different story. Let us understand why the character acts before we see the consequence. When money or an item changes hands, tell us who gives what to whom and why each side agrees, in the order we need to know it. For a comparison, establish the baseline first. Leave room for the one detail that makes the outcome click. For instance, a seller might accept less because she needs the cash today and the buyer can afford to wait. Use details appropriate to this story. Land the outcome for the person we started with, and connect it to the finance idea in everyday words.
Write say as natural spoken sentences with short clauses, clear subjects, everyday verbs and pauses at thought boundaries. Aim for 55–80 spoken words. Keep an essential causal step even if it takes another sentence. Explain any essential financial term through its role in the story. Avoid arithmetic, unnecessary precision, generic advice and implied guarantees. Use link to explain how each beat follows the last (or sets up the question for the opener). The say fields alone must tell the complete story, and should be easy to split across multiple quick shots.
${VIRAL_STORY_RULES}`;
 for (let round = 0; round <= storyRepairLimit; round++) {
  const raw = await ask(round ? 'story-repair' : 'story-script',
   round ? `${brief}\nPrevious draft: ${previousDraft}\nRequired fixes: ${JSON.stringify(feedback)}\nFix the meaning in the fewest spoken words. If a line introduces a distracting side lesson, cut or narrow the claim instead of appending a technical explanation. Preserve working beats. Return the complete revised story.` : brief,
   {name:'hedgy_story',schema:storySchema});
  previousDraft = raw;
  const parsed = storySchema.safeParse(parseEditorialJson(raw));
  if (!parsed.success) {
   feedback = parseProblems(parsed.error);
   rounds.push({draft:raw,problems:feedback});
   continue;
  }
  const story = parsed.data;
  const narration = story.beats.map(beat => beat.say).join(' ');
  const [factRaw, listenerRaw] = await Promise.all([
   ask('story-fact-check',`Independently check the finance claims in this hypothetical Hedgy story. Check the claims actually spoken. Reject a factual error, an implied guarantee, or an omitted condition when it would give a beginner the wrong takeaway. In a story used as an analogy, check the specific mapping the narrator makes. Keep the everyday transaction in its own setting. Approve a sound simplification. Do not require industry vocabulary, secondary mechanisms, remote exceptions or technical detail just because a textbook would cover them. For each necessary correction, quote the offending words, state the false impression, and prefer narrowing the claim. Approve only when no correction is needed. Give concrete required fixes in findings and use an empty array on approval.\nNarration: ${JSON.stringify(narration)}`,{name:'hedgy_fact_review',schema:reviewSchema}),
   ask('story-first-listen',`Read this spoken narration once as a viewer with no finance background and no picture. Report the question you heard, the answer you heard and a retelling in at most three sentences using only information stated in the narration. If any part cannot be recovered, say so. Check whether you can name the person, object and immediate problem from the opening without looking ahead, whether the opening makes the stakes clear immediately, each beat follows causally, references and the analogy are understood in place, the script breathes at natural thought boundaries, and the ending resolves the opening with one useful takeaway. Only flag a comprehension problem that affects the story a viewer takes away. Quote the stumbling point and say what a listener could misunderstand there. Allow an ordinary inference and a short setup paid off in the next phrase. An accurate, easy retelling merits approval even when you can imagine a stylistic improvement. Do not request extra terminology or a second explanation of a point already clear. Judge understanding, including the role of each necessary term. Approve only if someone can follow the whole explanation in one listen. Give concrete required fixes in findings and use an empty array on approval.\nNarration: ${JSON.stringify(narration)}`,{name:'hedgy_listener_review',schema:listenerSchema}),
  ]);
  const facts = reviewSchema.safeParse(parseEditorialJson(factRaw));
  const listener = listenerSchema.safeParse(parseEditorialJson(listenerRaw));
  feedback = [...reviewProblems('Finance',facts.data),...reviewProblems('First listen',listener.data)];
  // A listener can confidently understand a different story. Compare what came
  // back with the intended mechanism without giving the judge the script to fill in gaps.
  let takeaway;
  if (!feedback.length && listener.data) {
   const {heardQuestion,heardAnswer,retell} = listener.data;
   const raw = await ask('story-takeaway-match',`Compare the intended finance lesson with what a first-time listener understood. Use only the listener account as evidence of what got through. In their own words, did they identify the opening problem, explain the decision or change that caused the outcome, and recover the point of this particular finance mechanism? Accept faithful paraphrases. A matching term or final result alone is insufficient. Reject a hook answered by a different story, reversed roles, or a missing reason that you must supply yourself. In findings identify the missing or misleading connection and the smallest spoken change that would clarify it. Use empty findings on approval.
Intended: ${JSON.stringify({concept,question:story.question,answer:story.answer})}
Listener account: ${JSON.stringify({heardQuestion,heardAnswer,retell})}`,{name:'hedgy_takeaway_review',schema:reviewSchema});
   const checked = reviewSchema.safeParse(parseEditorialJson(raw));
   takeaway = checked.data ?? raw;
   feedback = reviewProblems('Takeaway',checked.data);
   if (feedback.length) feedback.push(`The listener understood: ${JSON.stringify({heardQuestion,heardAnswer,retell})}`);
  }
  const correct = !feedback.length;
  // Shareability is judged by a different model family, as a polish pass on top of correctness:
  // it never vetoes a correct story, and its rewrites go back through every correctness check.
  let viral, viralScore = 0;
  if (critic) {
   const viralRaw = await critic('story-viral-review',`You are the head of content at a top short-form explainer studio (Instagram Reels / TikTok). Judge this narration for a ~30 s animated reel with a hedgehog cast, before any animation exists. ${VIRAL_STORY_RULES}
Score 0–100 how likely this script is to hold and delight a broad audience and get shared (90 = excellent). Check the hook (would people stop scrolling?), the curiosity gap, clarity on first listen, the aha moment, the punch of the last line, pacing and wordiness. Approve when score >= 85 and nothing important is missing. Give at most 3 findings, most important first, each a specific rewrite (quote words, give the better line); do not ask for more terminology or length. Every rewrite must stay literally true and precise: a finance fact-checker rejects paradoxes that overstate (e.g. "the bank doesn't have your money"), so make the surprise come from true specifics, not exaggeration. Never contradict the required fixes from the other reviewers listed below. Empty findings on approval.
Required fixes from the finance and first-listen reviewers (already being applied): ${JSON.stringify(feedback)}
Return JSON only: {"approved":boolean,"score":number,"hookVerdict":string,"findings":string[]}
Hook title on screen: ${JSON.stringify(story.hookText ?? '')}
Narration: ${JSON.stringify(narration)}`,{name:'hedgy_viral_review',schema:viralSchema});
   const checked = viralSchema.safeParse(parseEditorialJson(viralRaw));
   viral = checked.data ?? viralRaw;
   // An unreadable critic reply is not a finding about the story; it must not force a rewrite.
   if (checked.success) { viralScore = checked.data.score; if (checked.data.score < 85) feedback.push(...checked.data.findings.slice(0, 3).map(f => `Viral (score ${checked.data.score}): ${f}`)); }
  }
  rounds.push({draft:story,takeaway,viral,correct,facts:facts.data ?? factRaw,listener:listener.data ?? listenerRaw,problems:feedback});
  if (correct && (!best || viralScore > best.score)) best = {story,narration,score:viralScore};
  if (!feedback.length) return {story,narration,rounds};
 }
 // Repairs exhausted: publish the most shareable draft that passed every correctness review.
 if (best) return {story:best.story,narration:best.narration,rounds,selected:`best correct draft (viral score ${best.score})`};
 throw new AppError(502,'hedgy_story_unapproved','Hedgy narration did not pass finance and first-listen review',{rounds});
}

export async function reviewHedgyScenes(ask:Ask, story:z.infer<typeof storySchema>, scenes:readonly {say:string}[], catalog:string) {
 const raw = await ask('scene-continuity-review',`Review the actual shot sequence for a first-time viewer. The storyboard is the evidence available to you. Use the documented shot behaviors and parameters to infer what will be visible, and use the narration to check when each new idea is heard.
Follow the golden thread from the opening question to the changed anchor in the payoff. Judge each cut from the previous shot's last meaningful state into the next shot's first meaningful state. Record one handoff per incoming scene in order, numbering the first scene 1. Name the specific object, actor, action or comparison that the viewer can carry across. A recurring item by itself is insufficient if its role, location, ownership, quantity or state has reset without explanation. Look for avoidable establishing shots, visual actions that restart, repeated explanations, unexplained jumps in time or place, visuals that contradict the current words, and a payoff that abandons the opening example. For a comparison, keep composition and the unchanged quantity easy to compare.
Set connects=false at a cut that needs a fix, with the exact problem and smallest fix in evidence. Put any additional required changes in findings. Approve only when the sequence can be followed without reconstructing events. Prefer holding or repeating a setup on purpose when it helps the viewer.
Story: ${JSON.stringify(story)}
Numbered scenes: ${JSON.stringify(scenes.map((scene,index)=>({number:index+1,...scene})))}
${catalog}`,{name:'hedgy_scene_review',schema:sceneReviewSchema});
 const result = sceneReviewSchema.safeParse(parseEditorialJson(raw));
 if (!result.success) return {review:raw,problems:reviewProblems('Scene continuity',undefined)};
 const {handoffs} = result.data;
 const problems = reviewProblems('Scene continuity',result.data);
 if (handoffs.length !== scenes.length - 1 || handoffs.some((cut,index)=>cut.intoScene !== index+2)) {
  problems.push('Scene continuity: review must cover every adjacent cut in order.');
 }
 for (const cut of handoffs) {
  if (!cut.connects) problems.push(`Cut into scene ${cut.intoScene}: ${cut.evidence}`);
 }
 return {review:result.data,problems};
}

export async function reviewHedgyCopy(ask:Ask, narration:string, initialCopy:z.infer<typeof copySchema>) {
 const rounds = [];
 let copy = initialCopy;
 let feedback:string[] = [];
 for (let round = 0; round <= repairLimit; round++) {
  if (round) {
   const raw = await ask('post-copy-repair',`Revise only the title and Instagram post caption. Keep the same story, mechanism and tradeoff as the approved narration. Target 80–140 words (at least 60 excluding hashtags) with a hook, short paragraphs separated by blank lines, a concrete takeaway and 3–5 distinct relevant hashtags on their own final line. Maximum 2,200 characters.\nApproved narration: ${JSON.stringify(narration)}\nPrevious copy: ${JSON.stringify(copy)}\nRequired fixes: ${JSON.stringify(feedback)}`,{name:'hedgy_post_copy',schema:copySchema});
   const repaired = copySchema.safeParse(parseEditorialJson(raw));
   if (!repaired.success) {
    feedback = parseProblems(repaired.error);
    rounds.push({copy:raw,problems:feedback});
    continue;
   }
   copy = repaired.data;
  }
  const raw = await ask('post-copy-review',`Review the assembled Hedgy reel's title and Instagram caption against its approved narration. A reader who sees only the caption should follow the same concrete story, understand why the mechanism works and what it costs or where it stops working, and take away the same answer. Check that the hook and title promise what the reel actually delivers. Flag any new unsupported finance claim, unwarranted guarantee, confusing jump, inconsistent analogy or distracting side lesson. Give concrete required fixes in findings and use an empty array on approval.\nNarration: ${JSON.stringify(narration)}\nPost copy: ${JSON.stringify(copy)}`,{name:'hedgy_copy_review',schema:reviewSchema});
  const reviewed = reviewSchema.safeParse(parseEditorialJson(raw));
  feedback = reviewProblems('Post copy',reviewed.data);
  rounds.push({copy,review:reviewed.data ?? raw,problems:feedback});
  if (!feedback.length) return {copy,rounds};
 }
 throw new AppError(502,'hedgy_copy_unapproved','Hedgy post copy did not pass editorial review',{rounds});
}
