"""Produce source and reuse credits next to each finished film."""
import re
from pathlib import Path

def write_credits(root,plan,pack):
    lines=[plan['title'],'','Reporting and data','']
    seen_sources=set()
    photo_ids=set()
    clip_ids=set()
    for beat in plan['beats']:
        seen_sources.add(beat['source'])
        if beat['kind']=='image':photo_ids.add(beat['image'])
        if beat['kind']=='footage':clip_ids.add(beat['clip'])
        for view in [beat.get('insert'),*(beat.get('comparison') or [])]:
            if view:photo_ids.add(view['image'])
    for i in sorted(seen_sources):
        s=pack['sources'][i];lines.extend([s['title'],s['url'],''])
    lines.extend(['Photographs',''])
    for i in sorted(photo_ids):
        s=pack['images'][i];license=re.search(r'CC (BY(?:-SA)?) ([0-9.]+)',s['credit'])
        lines.extend([s['title'],s['credit'],s['page']])
        if license:lines.append('https://creativecommons.org/licenses/'+license[1].lower()+'/'+license[2]+'/')
        if 'CC0' in s['credit']:lines.append('https://creativecommons.org/publicdomain/zero/1.0/')
        lines.extend(['Reframed and animated with a camera move. Adapted photographs retain their source license.',''])
    lines.extend(['Footage',''])
    for i in sorted(clip_ids):
        s=pack['clips'][i];lines.extend([s['title'],s['credit'],s['url'],''])
    lines.extend(['Original score, sound effects and explanatory animation.','Voice: ElevenLabs Titan.'])
    (root/'credits.txt').write_text('\n'.join(lines)+'\n')
