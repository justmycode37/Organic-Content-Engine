import * as THREE from 'three';
import type {GLTFLoaderPlugin,GLTFParser} from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Older Objaverse assets put diffuse RGBA inside this archived extension.
 * Keep its authored coverage/UV mapping for the neutral library material.
 * This is a diffuse compatibility path, not an exact specular/gloss BRDF conversion.
 */
export function legacyDiffusePlugin(parser:GLTFParser):GLTFLoaderPlugin{
 const name='KHR_materials_pbrSpecularGlossiness';
 const definition=(index:number)=>parser.json.materials?.[index]?.extensions?.[name];
 return {name,
  getMaterialType:index=>definition(index)?THREE.MeshStandardMaterial:null,
  extendMaterialParams(index,params){
   const source=definition(index);if(!source)return null;
   const factor=source.diffuseFactor??[1,1,1,1];
   params.color=new THREE.Color().setRGB(factor[0],factor[1],factor[2],THREE.LinearSRGBColorSpace);params.opacity=factor[3];
   params.metalness=0;params.roughness=1-(source.glossinessFactor??1);
   delete params.map;delete params.metalnessMap;delete params.roughnessMap;
   return source.diffuseTexture?parser.assignTexture(params,'map',source.diffuseTexture,THREE.SRGBColorSpace):Promise.resolve();
  },
  afterRoot(result){
   result.scene.traverse(object=>{const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    const index=parser.associations.get(material)?.materials;
    if(index!==undefined&&definition(index))material.userData.acryllexMaterialConversion='Legacy specular/glossiness diffuse RGBA compatibility; native specular textures/BRDF are not preserved.';
   }});return null;
  },
 };
}
