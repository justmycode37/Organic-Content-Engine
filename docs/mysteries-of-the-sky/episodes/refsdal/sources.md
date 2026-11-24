# The Star That Kept Its Appointment

The opening cross, the dated October and December exposures, and the orbital film are archival material. The spiral-arm comparisons, mass contours, ray paths and light curves are explanatory illustrations. The positions and brightnesses of points in the illustrated curves are illustrative.

## Scientific sources

- The discovery team identified four images in an Einstein cross around a member of a foreground galaxy cluster. [Kelly et al., Science, 2015](https://doi.org/10.1126/science.aaa3350)
- Jauzac and colleagues reported a prediction around November 2015 with a one-month window in their analytical estimate. [Jauzac et al., MNRAS, 2016](https://doi.org/10.1093/mnras/stw069)
- Hubble detected the delayed image in December 2015 near the predicted position. [Kelly et al., ApJL, 2016](https://doi.org/10.3847/2041-8205/819/1/L8)
- The SX–S1 delay was 376.0 days, with uncertainties of +5.6 and −5.5 days. The relative magnification was 0.30. [Kelly et al., 2023](https://arxiv.org/abs/2305.06377)
- Eight lens models gave a central expansion-rate estimate of 64.8 km/s/Mpc. The two with the best observational agreement gave 66.6 km/s/Mpc. [Kelly et al., Science, 2023](https://arxiv.org/abs/2305.06367)
- The proposed use of lensed supernovae as cosmological clocks dates to 1964. [Sjur Refsdal, MNRAS](https://doi.org/10.1093/mnras/128.4.307)

## Archival material

- Cluster and discovery composite. NASA, ESA, S. Rodney and the FrontierSN team, T. Treu, P. Kelly and the GLASS team, J. Lotz and the Frontier Fields team, M. Postman and the CLASH team, and Z. Levay. [Wide cluster image](https://esahubble.org/images/heic1505b/) · [Discovery cross](https://esahubble.org/images/heic1505a/)
- October 30 and December 11, 2015 comparison. NASA, ESA and P. Kelly, University of California, Berkeley. [Hubble comparison plate](https://esahubble.org/images/heic1525a/)
- Hubble in orbit during STS-125, May 2009. NASA / Johnson Space Center. The closing shot comes from the Flight Day 9–11 highlights at 00:12:40. [NASA mission footage](https://svs.gsfc.nasa.gov/13160/)

## Production

The master combines 24 fps animation, native-resolution type, a stereo score, Titan's ElevenLabs Flash v2.5 narration at 20% stability and 20% similarity, and an English caption track. The revised cut opens on the dated exposures, then moves through the cross and the path diagram. Professor Rowan Ellery explains the two-curve fit in ElevenLabs voice `PerZoH0r6nxBZXCoIPpv`. The audio-driven HeyGen take cost $0.55, in addition to $0.21 for the superseded take.

The chapter renderer is `chatgpt-site/scripts/sky-refsdal.mjs`. Its work directory takes numbered Titan recordings (`01.mp3` to `15.mp3`) and the three Hubble JPEGs identified by their ESA IDs. Run it with the work directory and `refresh` after artwork changes. The finishing script `scripts/mysteries-refsdal-finish.py` takes the same directory, the dated mission excerpt (`hubble-orbit.mp4`), the Rowan take (`rowan.mp4`) and its original ElevenLabs recording (`00.mp3`) and the word timestamps (`00.words.json` through `15.words.json`). It mixes the audio, edits the archive footage and cameo, adds chapters and optional captions, and writes the MP4 beside the work directory.
