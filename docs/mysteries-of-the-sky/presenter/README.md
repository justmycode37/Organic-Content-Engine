# Professor Rowan Ellery

Rowan is the fictional on-camera physics expert for *Mysteries of the Sky*. Titan narrates the main explanation. Bring Rowan into the edit for a short interview answer or question, then cut back to Titan over the evidence. His fictional PhD is in physics. He is in his early sixties, clean-shaven, with a high, receding hairline and short, casually swept grey hair. His rectangular glasses have faint handling marks at the edges. He wears a lightly rumpled white shirt with an open collar in his bookshelf study.

The [current portrait](rowan-ellery.png) is the visual identity. The [voice sample](rowan-ellery-voice.m4a) is from Rowan’s HeyGen take with the older voice direction. Use the mild softness and muted indoor colour of an older webcam for the interview footage. Add readable titles after scaling the footage. The earlier [speaking master](rowan-ellery-master.mp4) shows a superseded design. The white-shirt speaking take is pending.

## Generate a take

From the repository root, prepare a HeyGen Video 1 reference-to-video request using the current portrait, voice sample and a new line. The default request uses a 480p landscape capture. The optional fourth argument supplies an alternative HTTPS speaking-master URL.

```sh
node scripts/mysteries-presenter.mjs "A hidden planet can leave a trace in starlight." 6 /tmp/rowan-take.json
monid discover -q 'HeyGen Video 1 reference to video'
monid inspect -p heygen -e /v1/video/heygen-video-1-r2v
monid run -p heygen -e /v1/video/heygen-video-1-r2v -f /tmp/rowan-take.json -w
```

The saved [five-second introduction request](heygen-master.json) uses the current portrait with HeyGen Video 1 image-to-video. Its spoken line is “I'm Professor Rowan Ellery. Welcome to Mysteries of the Sky.” The promotional endpoint at preparation was `/promo/v1/video/heygen-video-1-i2v`. Check the Monid catalog for current pricing. [Profile and source references](profile.json).
