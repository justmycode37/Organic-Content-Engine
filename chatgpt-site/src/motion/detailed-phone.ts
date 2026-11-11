import {box,cylinder,merge,place,voxels,type Mesh} from './three.ts';
import {GLYPHS} from './glyphs.ts';
/** Detailed reusable handset: machined rim, glass, status UI, camera hardware and physical controls. */
export function detailedPhoneParts():Mesh[]{
 const at=(mesh:Mesh,x:number,y:number,z:number)=>place(mesh,{pos:[x,y,z]});
 const parts:Mesh[]=[];
 // Stepped corners preserve the pixel silhouette while avoiding a featureless rectangular slab.
 parts.push(merge(box(1.28,2.44,.19,0),box(1.18,2.58,.19,0),box(1.34,2.3,.19,0)));
 parts.push(at(box(1.20,2.43,.025,1),0,0,-.11));
 parts.push(at(box(1.10,2.30,.012,2),0,0,-.13));
 const status:Mesh[]=[];
 // Camera/speaker island, battery and signal bars are on the front; rear lenses remain on the back.
 status.push(at(box(.37,.09,.022,1),0,1.04,-.155));
 status.push(at(box(.18,.025,.026,4),-.035,1.04,-.17));
 status.push(at(place(cylinder(.025,.015,12,5),{rot:[Math.PI/2,0,0]}),.12,1.04,-.17));
 status.push(at(box(.13,.05,.01,3),.39,1.05,-.16),at(box(.018,.025,.01,3),.47,1.05,-.16));
 for(let i=0;i<3;i++)status.push(at(box(.025,.025+i*.018,.01,3),-.45+i*.045,1.04,-.16));
 parts.push(merge(...status));
 const clock=[...Array(7)].map((_,row)=>[...'9:41'].map(ch=>GLYPHS[ch]?.[row]??'00000').join('0'));
 parts.push(at(voxels(clock,.3,.85),0,.63,-.155));
 // A lock-screen notification and four small dock controls; visual hierarchy avoids a wall of app squares.
 const notification=[at(box(.95,.31,.018,4),0,.05,-.15),at(box(.15,.15,.012,3),-.31,.05,-.17),at(box(.48,.035,.012,3),.07,.11,-.17),at(box(.34,.025,.012,3),0,.01,-.17)];
 parts.push(merge(...notification));
 const dock:Mesh[]=[];for(let i=0;i<4;i++){dock.push(at(box(.17,.17,.016,4),-.36+i*.24,-.78,-.15));dock.push(at(box(.055,.055,.012,3),-.36+i*.24,-.78,-.17));}
 dock.push(at(box(.34,.025,.012,3),0,-1.05,-.16));parts.push(merge(...dock));
 // Buttons, charging port, speaker perforations and antenna seams.
 const hardware=[at(box(.045,.33,.1,3),.69,.42,0),at(box(.045,.19,.1,3),-.69,.49,0),at(box(.045,.19,.1,3),-.69,.18,0),at(box(.19,.018,.06,1),0,-1.3,0)];
 for(let i=0;i<5;i++)for(const side of [-1,1])hardware.push(at(box(.025,.02,.04,1),side*(.2+i*.052),-1.29,0));
 for(const x of [-.65,.65])for(const y of [-.94,.94])hardware.push(at(box(.025,.03,.2,1),x,y,0));
 parts.push(merge(...hardware));
 const rear=[at(box(.51,.58,.065,4),-.28,.83,.14)];
 for(const [x,y] of [[-.40,.98],[-.16,.80],[-.40,.63]]){
 rear.push(at(place(cylinder(.09,.035,16,3),{rot:[Math.PI/2,0,0]}),x!,y!,.20));
 rear.push(at(place(cylinder(.058,.04,12,1),{rot:[Math.PI/2,0,0]}),x!,y!,.22));
 }
 rear.push(at(box(.065,.065,.03,3),-.13,1.02,.20));parts.push(merge(...rear));
 return parts;
}
export const PHONE_MATERIALS=[{tone:.65},{tone:.025},{tone:.10,unlit:true},{tone:1,unlit:true},{tone:.28},{tone:.7}];
