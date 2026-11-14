# Experimental human motion keyframes

These AI-generated, undithered grayscale plates provide explicit initial full-stride, walking, backward-reaching and seated typing inputs for a continuous human-motion experiment. The synthetic actor is fully clothed; all RGB frames use the same 1164×670 canvas and a black background.

`start.png`, `walk.png`, `reach.png` and `type.png` are source images, not animation frames from an adopted recreation. `provenance.json` records generation, global framing, file hashes and remaining pose/density errors. The seated plate remains wider than the reference, and the reach hand extends too far left.

The first/end-only generation preserved identity and natural proportions but crouched too early and omitted the backward chair reach. Its full recreation trial was rejected. The reach frame explicitly supplies that missing action for a new controlled test. The additional start frame corrects the earlier use of the one-second walking pose as the first frame; foot/knee deviations remain and are recorded in provenance. Intermediate poses, local density, contrast and timing still require comparison before adoption.

No model preset or renderer default is changed by these files. Original reference images and video are not included.

`motion-guide.mp4` is a continuous 4.9-second, furniture-free grayscale render of the existing fitted human rig and camera, for a pose-conditioned appearance-transfer test. It contains no original reference-video pixels. Its provenance is recorded separately. Four-pose generation restored the reach but still altered gait, arm swing and foot contacts, so it remains unadopted. The motion guide tests whether explicit video motion conditioning can preserve those constraints.
