/** Source meshes required inside reusable composite models. This is shared with
 * offline preparation so nested assets are available before a model is built. */
const DEPENDENCIES:Readonly<Record<string,readonly string[]>>={
 'onion-cutting-take':['yellow_onion','chef-knife','man-head-scan'],
 'onion-cut-half':['yellow_onion'],
};
export function modelAssetDependencies(id:string):readonly string[]{
 return DEPENDENCIES[String(id).toLowerCase().trim().replace(/[\s_]+/g,'-')]??[];
}
