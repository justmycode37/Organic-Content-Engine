import records from './assets/media/realism-reference-provenance.json' with {type:'json'};

/** Actual photographed subjects. Copyright/attribution and adaptation terms travel with prepared media. */
function photo(file:keyof typeof records,name:string,limits:string,defaults:Record<string,unknown>={}){
 const r=records[file];
 return {name,creator:r.creator,acquired:r.acquired,page:r.page,license:r.license,terms:r.license,
  capture:'Photographed, not generated. '+r.original,limitations:'Shape comparison source; recording-style contrast/density has NOT been approved. '+limits,
  defaults:{file:'library:'+file,expectedSHA256:r.sha256,blur:0,monochrome:true,preserveAspect:true,sampleScale:3,loop:false,...defaults}};
}
export const REFERENCE_CATALOG={
 'reference-hand-palm':photo('realism-hand-palm.png','Photographed right hand with visible palm creases and natural finger proportions',
  'One open-palm view. Cannot close, grip or acquire a new viewpoint; use recorded action for contact.',{backgroundKey:{color:'#ffffff',similarity:.03,blend:.01}}),
 'reference-face-portrait':photo('realism-face-portrait.jpg','Photographed whole face and head, Jean-Marc Ligny',
  'Named real person, side portrait for anatomy/reference review. No invented expressions or generic actor identity.',{crop:'3600:3456:1300:0'}),
 'reference-metal-spoon':photo('realism-metal-spoon.jpg','Photographed polished stainless serving spoon with curved bowl and thin handle',
  'One real ornamental serving spoon viewed from above; not a generic teaspoon and not a rotatable mesh.',{cols:3000}),
 'reference-water-glass':photo('realism-water-glass.jpg','Photographed water in glass with a refracted spoon, rim and water surface',
  'Static reference, with a spoon rather than straw. Dark-field photographed light; cannot pour or change fill.',{crop:'2800:2300:1200:900'}),
 'reference-hand-contact':{
  name:'Filmed fingers gripping and stirring with a metal bar spoon',creator:records['realism-hand-contact.mp4'].creator,
  acquired:'2026-11-14',page:records['realism-hand-contact.mp4'].page,license:records['realism-hand-contact.mp4'].license,terms:'https://www.pexels.com/terms-of-service/',
  capture:'Filmed real hand contact, not generated or an articulated photo.',limitations:'Shape/action comparison source; recording-style contrast/density has NOT been approved. Fixed recorded closeup of a bar spoon/cocktail cup, not a teaspoon or arbitrary grasp. Motion cannot be retargeted or viewed from unseen angles. Background remains the captured dark bar stage.',
  defaults:{file:'library:realism-hand-contact.mp4',expectedSHA256:records['realism-hand-contact.mp4'].sha256,sourceStart:0,sourceDuration:2.5,fps:24,cols:720,preserveAspect:true,blur:0,monochrome:true,sampleScale:3,loop:false},
 },
 'reference-face-motion':{
  name:'Filmed whole face smiling, blinking and turning naturally',creator:records['realism-face-motion.mp4'].creator,
  acquired:'2026-11-14',page:records['realism-face-motion.mp4'].page,license:records['realism-face-motion.mp4'].license,terms:'https://www.pexels.com/terms-of-service/',
  capture:'Filmed real face, not generated or a deforming photograph.',limitations:'Shape/action comparison source; recording-style contrast/density has NOT been approved. Recorded identity and expression; rainbow cheek marks remain in the source. Captured head motion only, no novel expression, identity or camera angle.',
  defaults:{file:'library:realism-face-motion.mp4',expectedSHA256:records['realism-face-motion.mp4'].sha256,sourceStart:0,sourceDuration:3,fps:25,crop:'1440:1080:480:0',cols:960,preserveAspect:true,blur:0,monochrome:true,sampleScale:3,loop:false},
 },
};
