import {z} from 'zod';
import {hedgyPostCaptionSchema} from './hedgy-caption.ts';
import {AppError} from './errors.ts';
import type {hedgyClient} from './hedgy-model-client.ts';

type Ask = ReturnType<typeof hedgyClient>;
const repairLimit = 3;
const storySchema = z.object({
 question: z.string().trim().min(1).max(200),
 answer: z.string().trim().min(1).max(260),
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
const copySchema = z.object({title:z.string().trim().min(1).max(90),postCaption:hedgyPostCaptionSchema}).strict();

export function parseEditorialJson(raw:string):unknown {
 try {return JSON.parse(raw);} catch {return undefined;}
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

export async function reviewHedgyStory(ask:Ask, idea:string) {
 const rounds = [];
 let feedback:string[] = [];
 let previousDraft = '';
 const brief = `Write one spoken Hedgy finance story for a viewer with no investing background.
${idea}
Decide the single question raised by the opening and its concrete answer. Build 3–7 causal beats: an immediately recognizable situation, what the character wants or risks, the action that changes the outcome, why it changes, and the outcome and tradeoff that resolve the opening. Keep the same people, object and terms throughout. If the everyday situation is an analogy, make the mapping to the financial mechanism explicit and keep its limits clear. Use a detail only if the viewer needs it to follow the next step.
Write say as natural spoken sentences with short clauses, clear subjects, everyday verbs and pauses at thought boundaries. Aim for 55–75 spoken words and one takeaway. Explain any essential financial term through its role in the story. Avoid arithmetic, unnecessary precision, generic advice and implied guarantees. Use link to explain how each beat follows the last (or sets up the question for the opener). The say fields alone must tell the complete story, and should be easy to split across multiple quick shots.`;
 for (let round = 0; round <= repairLimit; round++) {
  const raw = await ask(round ? 'story-repair' : 'story-script',
   round ? `${brief}\nPrevious draft: ${previousDraft}\nRequired fixes: ${JSON.stringify(feedback)}\nReturn the complete revised story.` : brief,
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
   ask('story-fact-check',`Independently check the finance claims in this hypothetical Hedgy story. Check causal mechanics, terminology, example numbers, conditions and tradeoffs. Flag any misleading analogy, omitted condition that changes the conclusion, implied guaranteed outcome or scenario presented as live data. Approve only when no correction is needed. Give concrete required fixes in findings and use an empty array on approval.\nNarration: ${JSON.stringify(narration)}`,{name:'hedgy_fact_review',schema:reviewSchema}),
   ask('story-first-listen',`Read this spoken narration once as a viewer with no finance background and no picture. Report the question you heard, the answer you heard and a retelling in at most three sentences using only information stated in the narration. If any part cannot be recovered, say so. Check whether the opening makes the stakes clear immediately, each beat follows causally, references and the analogy are understood in place, the script breathes at natural thought boundaries, and the ending resolves the opening with one useful takeaway. Flag the exact words where a first-time viewer must infer an unstated connection, hold too many ideas at once or reread. Judge understanding, including the role of each necessary term. Approve only if someone can follow the whole explanation in one listen. Give concrete required fixes in findings and use an empty array on approval.\nNarration: ${JSON.stringify(narration)}`,{name:'hedgy_listener_review',schema:listenerSchema}),
  ]);
  const facts = reviewSchema.safeParse(parseEditorialJson(factRaw));
  const listener = listenerSchema.safeParse(parseEditorialJson(listenerRaw));
  feedback = [...reviewProblems('Finance',facts.data),...reviewProblems('First listen',listener.data)];
  rounds.push({draft:story,facts:facts.data ?? factRaw,listener:listener.data ?? listenerRaw,problems:feedback});
  if (!feedback.length) return {story,narration,rounds};
 }
 throw new AppError(502,'hedgy_story_unapproved','Hedgy narration did not pass finance and first-listen review',{rounds});
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
