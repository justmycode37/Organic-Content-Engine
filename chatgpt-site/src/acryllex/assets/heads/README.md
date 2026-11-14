# Head scan

“Infinite, 3D Head Scan” by **Lee Perry-Smith / Infinite Realities**, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Source: [Three.js r180 distribution](https://github.com/mrdoob/three.js/tree/r180/examples/models/gltf/LeePerrySmith), based on work at www.triplegangers.com. The original notice is retained in `lee-perry-smith/LeePerrySmith_License.txt`.

The supplied scan, photographic colour map and tangent normal map are repackaged into `head.glb`. Geometry, normals, UVs and triangle topology are retained. The source texture orientation and normal-channel convention are serialized by Three.js GLTFExporter. `provenance.json` pins the original inputs and derived output by SHA-256. Rebuild with `node scripts/acryllex/build-head-scan.mjs`.

The default library material uses uniform scene-hue albedo and the supplied surface normal relief. Source RGB contributes only when texture detail is explicitly enabled. Pixel pitch, ink, density transfer and lighting come from the shared style profile.

This source captures one closed-eye neutral expression and includes neck and shoulders. It has no expression rig, separate eye movement, blinking or articulated neck. `head-mesh` supports rigid turns of the complete bust. Facial expression animation requires a separately licensed source rig with real authored targets or tracks.
