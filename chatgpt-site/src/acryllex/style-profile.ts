import type {AcryllexSpec,Scene} from './spec.ts';

/** Recording-native calibration. Density remains shading-dependent; ink RGB never shades to grey.
 * Reference active image: 1164x670 at crop [42,684] of the supplied 1206x2192 recording.
 * This is a shared starting profile, not a claim of a perfect perceptual match to every source patch.
 */
export const RECORDING_LOOK={
 inkMode:'fixed' as const,palette:{blue:'#382ef5',red:'#d00a3e',azure:'#1e56c9',white:'#c5c5c5'},textColor:'#c5c5c5',
 dotRoundness:1,dotSoftness:.5,noise:.015,fuzz:0,blackPoint:.025,whitePoint:.9,inkLo:.16,gamma:1,aoMethod:'legacy' as const,
 contrast:.8,shadows:1,ao:1,gap:0,ink:1,key:.65,fill:.08,ambient:.065,rim:.35,dir:[1.5,1.1,1.2],
};
export const RECORDING_LIGHT:NonNullable<Scene['light']>={
 dir:[1.5,1.1,1.2],key:.65,fill:.08,ambient:.065,rim:.35,
 contrast:.8,exposure:.68,blackPoint:.025,whitePoint:.9,inkLo:.16,gamma:.8,softness:.95,
};
export const RECORDING_PITCH=3.72/1164;

/** Opt-in for existing specs; the account author selects this for newly generated work.
 * Preserve composition, source geometry, motion and aspect. Scale dot pitch/edge optics with output width.
 * Reels cannot accidentally replace the calibration with arbitrary per-scene contrast/exposure settings.
 */
export function applyStyleProfile(spec:AcryllexSpec):AcryllexSpec{
 if(spec.style!=='reference-recording')return spec;
 const width=Math.round(Math.min(3840,Math.max(160,Number(spec.format?.width)||1080))),scale=width/1164,cell=Math.max(1,width*RECORDING_PITCH);
 const look={...spec.look,...structuredClone(RECORDING_LOOK),dotSoftness:.5*scale};delete look.noiseReference;
 return {...spec,format:{...spec.format,width,cell},look,
  scenes:spec.scenes.map(scene=>({...scene,
   raster:{activity:.06,activityRate:12,...scene.raster,cell,dotRoundness:1,dotSoftness:.5*scale},
   light:{...structuredClone(RECORDING_LIGHT),softness:.95*scale,
    ...(scene.light?.points?{points:structuredClone(scene.light.points)}:{}),
   },
  })),
 };
}
