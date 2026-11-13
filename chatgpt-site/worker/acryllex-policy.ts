/** ACRYLLEX account rules. Separate from Hedgy in every way except the narrator voice. */
export const ACRYLLEX_POLICY={
 version:1,
 account:'acryllex',
 series:'ACRYLLEX',
 topic:'Curious explainers: things people are curious about but never thought about before (why we sleep and dream, why the blue LED was so hard to invent, why the sky is blue, why ice floats).',
 look:'Recognisable real subjects from licensed photos, moving footage, scans or editable 3D, rendered as dither dots in one fixed ink colour per scene on a pure black stage. Light and shadow change dot density, not individual dot colour; remove sky and background. Condensed caps headlines typed on with a hue cursor, key word in a hue box; small mono running narration line. Calm, cinematic, storytelling.',
 voice:'ElevenLabs Adam (s3TPKV1kjDlVtZbl4Ksh), same narrator as Hedgy, default settings, natural pace.',
 models:{all:'gpt-6.1-sol',effort:'medium'},
 effectSelection:'Give scan and glitch a slight preference when several object effects fit the spoken action equally well. Keep the full effect library in rotation and choose a more specific effect whenever it tells the story better; do not force scan or glitch into every scene.',
 assetSelection:'Default to licensed photo/video-backed library assets for complex natural subjects, fluids, animals and people. Use moving footage when the subject must move (a wave curling, spray, walking); use a photo for a static view. For editable human poses use a clothed scanned, rigged model with supported pose/animation controls. Use real 3D for editable mechanical shapes, interactions or camera viewpoints. Do not force hard natural subjects into primitive assemblies. All media must have a black or transparent background, including the sky; fixed-view footage cannot supply a new 3D viewpoint.',
 assetProvenance:'Reuse approved library assets and their source/license records. For each new photo, video, scan and mask, retain the source page and direct file URL or local path, creator, exact license and attribution requirements, any required releases, acquisition date, source hash, capture origin (filmed, rendered, generated or unverified), and crop/trim/mask/preparation recipe. Verify permission for the intended use and adaptation; a downloadable URL alone is not a license. Keep these records with the reusable asset catalogue or production provenance, not as invented spec fields. Never invent source URLs or license claims, or describe unverified media as filmed evidence.',
 rules:[
  'Every object on screen must be instantly recognisable to a stranger with the sound off. One hero object per scene, at most three things.',
  'Every scene visibly acts out its sentence: the action lands on the spoken word (glow on "lit up", crack on "cracked", walk on "walked").',
  'Story first: a hook the viewer has wondered about, a concrete journey with stakes and a twist, a satisfying answer. Simple words, warm curious tone.',
  'Facts must be correct and verifiable; no invented quotes, numbers or dates.',
  'No greeting, no call to action, no logo, no disclaimer.',
 ],
} as const;
