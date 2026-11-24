# Professor Rowan Ellery

Rowan is the fictional on-camera physics professor for *Mysteries of the Sky*. His fictional PhD is in physics. He introduces a question from his study, then hands the explanation over to the diagrams. Use his character name for the speaker and credit the original researchers for scientific findings.

The [portrait](rowan-ellery.png) and [speaking master](rowan-ellery-master.mp4) anchor the face, voice, wardrobe, camera and room. The source master is 1890 × 1080 with audio. For a 1920 × 1080 composition, fill the stage proportionally with a slight vertical crop. Keep his face and all lower-third typography at native resolution.

## Make another take with HeyGen through Monid

From the repository root, write a request using the saved identity and your new dialogue. The helper fetches the reference URL from the original Monid run. It writes to a new file and leaves generation to the next command.

```sh
node scripts/mysteries-presenter.mjs "A hidden planet can leave a trace in starlight." 6 /tmp/rowan-take.json
monid discover -q 'HeyGen Video 1 reference to video'
monid inspect -p heygen -e /v1/video/heygen-video-1-r2v
monid run -p heygen -e /v1/video/heygen-video-1-r2v -f /tmp/rowan-take.json -w
```

Monid also offered a promotional route during creation. Use the current catalog for availability and pricing. If the provider's original media URL expires, supply an HTTPS location for the checked-in master as the helper's fourth argument. A take uses the original video as its identity reference every time. The master-generation prompt is in [heygen-master.json](heygen-master.json). The run and video IDs in [profile.json](profile.json) identify that master. The reusable identity lives in these files.
