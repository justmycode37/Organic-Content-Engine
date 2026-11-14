/** Source identifiers are data, never guessed geometry or executable URLs. */
export function objaverseSource(value:unknown){
 if(typeof value!=='string'||!/^[a-f0-9]{32}$/i.test(value))throw new Error('mesh: objaverse must be a 32-character hexadecimal object UID');
 return 'objaverse:'+value.toLowerCase();
}
