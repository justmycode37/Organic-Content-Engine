/** ACRYLLEX account rules. Separate from Hedgy in every way except the narrator voice. */
export const ACRYLLEX_POLICY={
 version:1,
 account:'acryllex',
 series:'ACRYLLEX',
 topic:'Curious explainers: things people are curious about but never thought about before (why we sleep and dream, why the blue LED was so hard to invent, why the sky is blue, why ice floats).',
 look:'Real 3D objects rendered as ordered-dither square dots in one hue per scene on a pure black stage; condensed caps headlines typed on with a hue cursor, key word in a hue box; small mono running narration line. Calm, cinematic, storytelling.',
 voice:'ElevenLabs Adam (s3TPKV1kjDlVtZbl4Ksh), same narrator as Hedgy, default settings, natural pace.',
 models:{all:'gpt-6.1-sol',effort:'medium'},
 effectSelection:'Give scan and glitch a slight preference when several object effects fit the spoken action equally well. Keep the full effect library in rotation and choose a more specific effect whenever it tells the story better; do not force scan or glitch into every scene.',
 rules:[
  'Every object on screen must be instantly recognisable to a stranger with the sound off. One hero object per scene, at most three things.',
  'Every scene visibly acts out its sentence: the action lands on the spoken word (glow on "lit up", crack on "cracked", walk on "walked").',
  'Story first: a hook the viewer has wondered about, a concrete journey with stakes and a twist, a satisfying answer. Simple words, warm curious tone.',
  'Facts must be correct and verifiable; no invented quotes, numbers or dates.',
  'No greeting, no call to action, no logo, no disclaimer.',
 ],
} as const;
