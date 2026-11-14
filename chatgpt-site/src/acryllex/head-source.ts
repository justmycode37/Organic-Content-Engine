/** Shared by the model and offline asset preparer; explicit body selections keep their source. */
export const HEAD_SCAN={key:'head-mesh:scan',file:'heads/lee-perry-smith/head.glb'} as const;
const BODIES=['megan','kate','louise','brian','james','leonard','remy'];
export function headSource(params:Record<string,unknown>={}){
 const source=params.source??(params.body===undefined?'scan':'body');
 if(source==='scan')return {kind:'scan',...HEAD_SCAN} as const;
 if(source!=='body')throw new Error('head-mesh: source must be scan or body');
 const body=params.body??'megan';
 if(typeof body!=='string'||!BODIES.includes(body))throw new Error('head-mesh: unknown source body');
 return {kind:'body',key:'human-'+body,body} as const;
}
