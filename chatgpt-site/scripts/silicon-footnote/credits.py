"""Produce source and reuse credits next to each finished film."""
import re

def closing_cards(plan,pack):
    if plan.get('closingCredits'):
        return plan['closingCredits']
    from film import publisher,readable_credit
    reporting=[]
    media=[]
    for b in plan['beats']:
        source=pack['sources'][b['source']]
        name=publisher(source)
        if name not in reporting:reporting.append(name)
        if b['kind'] in ('footage','image'):
            asset=pack['clips'][b['clip']] if b['kind']=='footage' else pack['images'][b['image']]
            credit=readable_credit(asset['credit']).split(' · ')[0].strip()
            if credit and credit not in media:media.append(credit)
    def line(names):
        selected=[]
        for name in names:
            if len('  /  '.join(selected+[name]))<=150:selected.append(name)
        return '  /  '.join(selected)
    return [{'title':'Reporting and data','text':line(reporting)},
            {'title':'Footage and photography','text':line(media)}]

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
