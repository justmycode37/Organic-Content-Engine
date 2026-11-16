// Apply the authored sparse POSITION/NORMAL fields to their pinned anatomical base body.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function parseGLB(bytes){
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Expected complete GLB2');
 const jsonLength=bytes.readUInt32LE(12);
 if(bytes.readUInt32LE(16)!==0x4e4f534a)throw new Error('Expected JSON chunk');
 const at=20+jsonLength,binLength=bytes.readUInt32LE(at);
 if(bytes.readUInt32LE(at+4)!==0x004e4942||at+8+binLength!==bytes.length)throw new Error('Expected one BIN chunk');
 return {doc:JSON.parse(bytes.subarray(20,at).toString('utf8')),json:bytes.subarray(20,at),bin:bytes.subarray(at+8)};
}
export function encodeGLB(json,bin){
 if(json.length%4||bin.length%4)throw new Error('GLB chunks must be four-byte aligned');
 const header=Buffer.alloc(20),binaryHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);
 header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 binaryHeader.writeUInt32LE(bin.length);binaryHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,binaryHeader,bin]);
}
export function applyHumanCorrectives(baseBytes,payloadBytes){
 const payload=JSON.parse(gunzipSync(payloadBytes));
 if(payload.version!==1||sha256(baseBytes)!==payload.baseSHA256)throw new Error('Corrective payload does not match this pinned base body');
 const base=parseGLB(baseBytes);
 if(base.bin.length!==payload.baseBinaryBytes)throw new Error('Base body BIN length changed');
 const bin=Buffer.concat([base.bin,Buffer.from(payload.binarySuffix,'base64')]);
 const out=encodeGLB(Buffer.from(payload.jsonChunk,'base64'),bin);
 if(sha256(out)!==payload.outputSHA256)throw new Error('Corrective repack hash differs from authored output');
 return out;
}
