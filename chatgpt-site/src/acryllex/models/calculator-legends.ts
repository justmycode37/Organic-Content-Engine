import * as THREE from 'three';

/** Optional cap legend: removes ink-bearing cap fragments to expose the dark deck. */
export function applyCalculatorKeyLegend(
 mesh:THREE.Mesh,label:string,width:number,height:number,legendScale=.55,
):boolean{
 const text=String(label??'').trim().slice(0,8);
 if(!text||Array.isArray(mesh.material)||typeof document==='undefined')return false;
 const material=mesh.material as THREE.MeshStandardMaterial;
 const canvas=document.createElement('canvas');
 canvas.width=256;canvas.height=Math.max(64,Math.round(256*height/width));
 const ctx=canvas.getContext('2d');if(!ctx)return false;
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 let size=canvas.width*Math.max(.2,Math.min(.8,legendScale));
 ctx.font=`600 ${size}px AcxRobotoMono`;
 const fit=ctx.measureText(text).width;
 if(fit>canvas.width*.78){size*=canvas.width*.78/fit;ctx.font=`600 ${size}px AcxRobotoMono`;}
 const metrics=ctx.measureText(text);
 ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='alphabetic';
 ctx.fillText(text,canvas.width/2,(canvas.height+metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2);
 const positions=mesh.geometry.getAttribute('position'),uv=new Float32Array(positions.count*2);
 for(let i=0;i<positions.count;i++){
  uv[i*2]=positions.getX(i)/width+.5;
  uv[i*2+1]=positions.getY(i)/height+.5;
 }
 mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.NoColorSpace;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
 material.alphaMap=texture;material.alphaTest=.5;material.needsUpdate=true;
 // Every generated mask belongs to this material; no shared texture cache.
 const release=()=>{texture.dispose();material.removeEventListener('dispose',release);};
 material.addEventListener('dispose',release);
 return true;
}
