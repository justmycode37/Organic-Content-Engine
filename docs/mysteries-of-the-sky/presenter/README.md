# Professor Rowan Ellery

Rowan is the fictional on-camera physics expert for *Mysteries of the Sky*. Titan narrates the main explanation. Bring Rowan into the edit for a short interview answer or question, then cut back to Titan over the evidence. His fictional PhD is in physics. He is in his early sixties, clean-shaven, with a high, receding hairline and short, casually swept grey hair. His rectangular glasses have faint handling marks at the edges. He wears a lightly rumpled white shirt with an open collar in his bookshelf study.

Use the [current portrait](rowan-ellery.png) and ElevenLabs voice `PerZoH0r6nxBZXCoIPpv`. Use his slightly quicker 1.09× speaking pace. Write Rowan one specific observation about a measurement, a model assumption, or an uncertainty. Have him speak directly about a specific result or a limitation of the instrument. Give him room to think aloud: a brief “um,” a pause, or an occasional repeated word can make an interview answer feel spoken. Vary the delivery between appearances.

## Generate an interview

Create the episode’s voice plan with the [story pipeline](../story-pipeline.md). Submit the Rowan cue’s `speech.body` to ElevenLabs through Monid. Put its returned MP3 URL into `body.audio` as `{"type":"url","url":"<MP3 URL>"}`, then submit the completed body to the cue’s HeyGen endpoint. The avatar performs the supplied recording. Keep the exact ElevenLabs track for the final mix.

The series-average avatar budget is approximately $3 per episode. The older reference-to-video command and master assets are available for reproducing earlier experiments.
