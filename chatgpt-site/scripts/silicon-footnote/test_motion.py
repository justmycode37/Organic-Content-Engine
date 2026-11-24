import unittest
import numpy as np
from motion import Scene, lower_third

class MotionTests(unittest.TestCase):
    def test_accent_is_confined_to_one_source_word(self):
        beat={'title':'Mission record','labels':['Route'],'kind':'document','quote':'','accentWord':'Route'}
        source={'title':'The Route Near the Rim','url':'https://science.nasa.gov'}
        im=np.asarray(Scene(beat,source,0,2).frame(2,8))
        color=im[:,:,0]!=im[:,:,2]
        y,x=np.where(color)
        self.assertGreater(len(x),100)
        self.assertLess(np.ptp(x),180)
        self.assertLess(np.ptp(y),65)
        self.assertTrue(np.all(im[color,0]>im[color,2]))

    def test_graphics_and_nameplate_are_achromatic(self):
        beat={'title':'Route planning','labels':['Plan','Review','Drive'],'quote':'Check the route',
              'chart':{'values':[1,3,5],'unit':'m'},'nameplate':{'name':'Operator','date':'December 10','role':'Rover team'}}
        for kind in ('terrain','steps','chart','document','quote'):
            scene=Scene(dict(beat,kind=kind),{'url':'https://science.nasa.gov','title':'Mission record'},0,3)
            first=np.asarray(scene.frame(0,6))
            later=np.asarray(scene.frame(2,6))
            self.assertFalse(np.array_equal(first,later))
            self.assertTrue(np.array_equal(later[:,:,0],later[:,:,1]))
            self.assertTrue(np.array_equal(later[:,:,1],later[:,:,2]))
        plate=np.asarray(lower_third(beat,'NASA/JPL-Caltech'))
        self.assertTrue(np.array_equal(plate[:,:,0],plate[:,:,2]))
        self.assertGreater(np.sum(np.all(plate==255,axis=2)),100)

class DocumentaryTests(unittest.TestCase):
    def test_archival_header_and_interview_chyron_stay_readable(self):
        from title_layout import avoid_source_text
        title = {'title':'Mission control', 'titlePosition':'upper-left'}
        avoid_source_text(title, 'Mission archive', [(0, 20, 600, 150)])
        self.assertEqual(title['titlePosition'], 'upper-right')
        avoid_source_text(title, 'Mission archive', [(0, 0, 1280, 720)])
        self.assertTrue(title['clean'])
        speaker = {'title':'An interview', 'originalSpeech':True, 'speakerX':.25,
                   'nameplate':{'name':'Interviewee','role':'Mission scientist','date':'2026'}}
        avoid_source_text(speaker, 'Mission archive', [(20, 640, 800, 690)])
        self.assertLessEqual(677-speaker['tagLift']+16, 640)
        self.assertGreater(505-speaker['tagLift'], 360)

    def test_archive_keeps_round_when_working_file_is_replaced_or_removed(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from render import archive_round
        with TemporaryDirectory() as directory:
            project = Path(directory)
            work = project / 'chatgpt-site' / 'outputs' / 'evaluation' / 'r10'
            work.mkdir(parents=True)
            source = work / 'episode.mp4'
            archived = project / 'videos' / 'round-10.mp4'
            source.write_bytes(b'first complete cut')
            archive_round(work)
            archive_round(work)
            self.assertTrue(archived.samefile(source))
            source.unlink()
            self.assertEqual(archived.read_bytes(), b'first complete cut')
            source.write_bytes(b'revised complete cut')
            archive_round(work)
            self.assertEqual(archived.read_bytes(), b'revised complete cut')

    def test_observed_track_appears_only_after_the_spoken_cue(self):
        from film import Sequence, PALETTE
        from PIL import ImageColor
        beat = {'art': {'headline': 'Where the storm turned', 'caption': 'Matched forecast hour'},
                'labels': [], 'narration': '', 'kind': 'chart', 'source': 0, 'revealAt': 4,
                'chart': {'layout': 'track-map', 'bounds': [-80, 15, -74, 20],
                          'land': [[[-79, 18], [-77, 18], [-76, 19]]], 'places': [],
                          'routes': [{'label': 'Forecast', 'points': [[-76, 16], [-77, 17]]},
                                     {'label': 'Observed', 'points': [[-76, 16], [-78, 16]]}]}}
        scene = Sequence(None, beat, {'sources': [{'url': 'https://www.nhc.noaa.gov'}]}, 0)
        accent = ImageColor.getrgb(PALETTE[1])
        def observed_pixels(t):
            map_area = np.asarray(scene.track_map(t))[182:572, 70:1210]
            return np.sum(np.all(map_area == accent, axis=2))
        self.assertEqual(observed_pixels(3.9), 0)
        self.assertGreater(observed_pixels(5.2), observed_pixels(4.2))

    def test_reading_hold_keeps_both_ends_of_a_full_width_headline(self):
        import json
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from PIL import Image, ImageDraw
        from citation import frame
        with TemporaryDirectory() as folder:
            path=Path(folder)/'press.png'
            source=Image.new('RGB',(1280,720),'white')
            draw=ImageDraw.Draw(source)
            draw.rectangle((4,280,18,320),fill='red')
            draw.rectangle((1261,280,1275,320),fill='blue')
            source.save(path)
            path.with_suffix('.png.json').write_text(json.dumps({
                'url':'https://example.org/report','viewport':{'width':1280,'height':720},
                'rect':{'x':0,'y':275,'width':1280,'height':60}}))
            for variant in range(3):
                result=np.asarray(frame(path,4,7,variant))
                self.assertGreater(result[300,10,0],220)
                self.assertLess(result[300,10,2],50)
                self.assertGreater(result[300,-11,2],220)
                self.assertLess(result[300,-11,0],50)

    def test_interview_captions_follow_the_source_trim(self):
        from captions import caption_cues
        beats=[{'narration':'Here.', 'actuality':{'start':6,'end':10,'captions':[
            {'start':5,'end':8,'text':'First phrase.'},{'start':8,'end':11,'text':'Second phrase.'}]}},
            {'narration':'Next.'}]
        alignment=[{'text':b['narration'],'starts':[0]*5} for b in beats]
        cues=caption_cues({'beats':beats},[2,3],alignment)
        self.assertEqual(cues,[(0,2,'Here.'),(2,4,'First phrase.'),(4,6,'Second phrase.'),(6,9,'Next.')])

    def test_original_interview_has_a_quiet_score_and_the_theme_returns_afterward(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        import wave
        from score import score, SR
        beats=[{'kind':'footage','musicTheme':'pulse'},
               {'kind':'footage','originalSpeech':True},
               {'kind':'footage','musicTheme':'resolution'}]
        with TemporaryDirectory() as folder:
            path=Path(folder)/'score.wav'
            score(path,[3,2,4],beats)
            with wave.open(str(path)) as stream:
                samples=np.frombuffer(stream.readframes(stream.getnframes()),dtype='<i2').reshape(-1,2)
        self.assertGreater(np.max(np.abs(samples[SR:2*SR])),0)
        self.assertFalse(np.any(samples[3*SR:5*SR]))
        self.assertGreater(np.max(np.abs(samples[6*SR:8*SR])),0)

    def test_reading_hold_preserves_narration_and_delays_next_caption(self):
        import wave
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from captions import caption_cues
        from timeline import assemble
        beats = [{'kind':'image', 'narration':'First.', 'readingHold':.5},
                 {'kind':'image', 'narration':'Next.'}]
        plan = {'beats':beats}
        first, second = b'\x14\x00' * 300, b'\x25\x00' * 300
        with TemporaryDirectory() as folder:
            root = Path(folder)
            with wave.open(str(root/'voice.wav'),'wb') as original:
                original.setparams((1,2,1000,0,'NONE','not compressed'))
                original.writeframes(first + second)
            _, durations, broadcast = assemble(root,plan,[.3,.3],{})
            self.assertEqual(durations,[.8,.3])
            with wave.open(str(broadcast)) as audio:
                self.assertEqual(audio.readframes(audio.getnframes()), first + bytes(1000) + second)
        alignment = [{'text':b['narration'],'starts':[0]*len(b['narration'])} for b in beats]
        cues = caption_cues(plan,[.3,.3],alignment)
        self.assertEqual(cues,[(0,.3,'First.'),(.8,1.1,'Next.')])

    def test_panorama_tracks_detail_with_overview_in_frame(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from PIL import Image, ImageDraw
        from film import Sequence
        with TemporaryDirectory() as folder:
            root = Path(folder)
            plate = Image.new('RGB',(1200,100),'red')
            ImageDraw.Draw(plate).rectangle((600,0,1199,99),fill='blue')
            plate.save(root/'image-0.png')
            scene = Sequence(root,{'kind':'image','source':0,'art':{'headline':'Manuscript',
                'caption':''},'labels':[],'narration':''},
                {'sources':[{}],'images':[{'panorama':True,'credit':'Archive'}]},0)
            for progress, detail_color in [(0,(255,0,0)), (1,(0,0,255))]:
                frame = scene.image(0,progress)
                self.assertEqual(frame.getpixel((640,415)),detail_color)
                self.assertEqual(frame.getpixel((110,155)),(255,0,0))
                self.assertEqual(frame.getpixel((1170,155)),(0,0,255))

    def test_nearby_spoken_cues_leave_readable_shots(self):
        from timeline import assemble
        from pathlib import Path
        from tempfile import TemporaryDirectory
        base={'kind':'footage','art':{'headline':'Generator'},'narration':'Full power.',
              'cutaways':[{'at':t,'kind':'image','image':0,'title':'Plant'} for t in (.1,.4,.48,.9)]}
        with TemporaryDirectory() as tmp:
            _,durations,_=assemble(Path(tmp),{'style':'reported-footage','beats':[base]},[10],{})
        self.assertEqual(durations,[4,6])

    def test_footage_reserves_interviews_and_uses_distinct_camera_ranges(self):
        from footage import reserve_footage
        shots=[{'kind':'footage','clip':0} for _ in range(4)]
        shots[2].update(clipStart=4,originalSpeech=True)
        clips=[{'coverage':[{'start':4,'end':16},{'start':21,'end':26}]}]
        reserve_footage(shots,[4,4,4,4],clips,{0:26})
        self.assertEqual([s['clipStart'] for s in shots],[8,12,4,21])

    def test_close_numeric_cues_keep_both_charts_readable(self):
        from timeline import assemble
        from pathlib import Path
        from tempfile import TemporaryDirectory
        shot={'kind':'footage','narration':'','art':{'headline':'Two rates'},'cutaways':[
            {'at':.5,'kind':'chart','title':'Energy'}, {'at':.64,'kind':'chart','title':'Carbon intensity'}]}
        with TemporaryDirectory() as tmp:
            plan,durations,_=assemble(Path(tmp),{'style':'reported-footage','beats':[shot]},[10],{})
        self.assertEqual([b['kind'] for b in plan['beats']],['footage','chart','chart'])
        self.assertAlmostEqual(sum(durations[:2]),6.4)
        self.assertGreaterEqual(min(durations),1.8-1e-6)

    def test_title_gradient_and_speaker_tag_follow_the_shot(self):
        from film import lower
        beat={'title':'Winter storm preparations','nameplate':{'name':'Tom Henry','role':'Powerhouse manager'}}
        top=np.asarray(lower(dict(beat,titlePosition='upper-right'),'USACE'))
        self.assertGreater(top[2,0,3],190)
        self.assertEqual(top[500,0,3],0)
        bottom=np.asarray(lower(dict(beat,titlePosition='lower-left'),'USACE'))
        self.assertGreater(bottom[-2,0,3],190)
        self.assertEqual(bottom[2,0,3],0)
        person=np.asarray(lower(dict(beat,originalSpeech=True,speakerX=.72),'USACE'))
        y,x=np.where(person[:,:,3]>0)
        self.assertGreater(y.min(),480)
        self.assertAlmostEqual((x.min()+x.max())/2,1280*.72,delta=3)
        self.assertFalse(np.any(lower(dict(beat,originalSpeech=True,introduceSpeaker=False),'USACE')))

    def test_flash_removal_includes_frames_consumed_by_prior_repairs(self):
        from footage import trim_flashes
        flashes=[(3.0,3.04),(5.0,5.08),(6.04,6.08),(15,15.04)]
        trims=trim_flashes(flashes,4,2)
        self.assertEqual(len(trims),2)
        self.assertLess(trims[0][0],1)
        self.assertGreater(trims[1][1],2)

    def test_chart_answer_uses_narration_offset_within_its_own_shot(self):
        import json
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from timeline import assemble
        line='First compare them. Both use the same amount.'
        b={'kind':'image','art':{'headline':'Comparison'},'narration':line,
           'cutaways':[{'kind':'chart','at':.3,'title':'Customer demand',
                        'chart':{'revealCue':'Both use'}}]}
        with TemporaryDirectory() as tmp:
            p=Path(tmp)
            (p/'alignment.json').write_text(json.dumps([{'text':line,'starts':[i/4 for i in range(len(line))]}]))
            plan,times,_=assemble(p,{'beats':[b]},[10],{})
        self.assertAlmostEqual(times[0]+plan['beats'][1]['revealAt'],line.index('Both use')/4)

    def test_graph_events_follow_named_words_in_their_own_shot(self):
        import json
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from timeline import assemble
        line='At first the load fell and then returned.'
        cues=['fell','returned']
        for chart,key in [({'checkpoints':[{'index':3,'cue':cues[0]},{'index':8,'cue':cues[1]}]},'traceCues'),
                          ({'valueCues':cues},'barCues')]:
            shot={'kind':'document','art':{'headline':'Original study'},'narration':line,
                  'cutaways':[{'at':.2,'cue':'the load','kind':'chart','title':'Power','chart':chart}]}
            with TemporaryDirectory() as tmp:
                p=Path(tmp)
                (p/'alignment.json').write_text(json.dumps([{'text':line,'starts':[i/4 for i in range(len(line))]}]))
                plan,times,_=assemble(p,{'beats':[shot]},[11],{})
            events=plan['beats'][1][key]
            if key=='traceCues':
                self.assertEqual([index for at,index in events],[3,8])
                events=[at for at,index in events]
            self.assertEqual([at+times[0] for at in events],[line.index(cue)/4 for cue in cues])

    def test_subset_reveals_true_proportion_on_cue(self):
        from film import Sequence, PALETTE
        from PIL import ImageColor
        from pathlib import Path
        beat={'kind':'chart','narration':'candidate count','source':0,'labels':['Signals'],'title':'Candidate catalog','revealAt':2,
              'chart':{'layout':'subset','total':147568,'count':7330,'totalLabel':'Unlabeled signals','countLabel':'Candidate signals'},
              'art':{'headline':'Candidate catalog','caption':'Two-minute survey'}}
        seq=Sequence(Path('.'),beat,{'sources':[{'url':'https://example.org/study'}]},0)
        rgb=ImageColor.getrgb(PALETTE[0])
        for time,expected in [(1.9,0),(3,round(1134*7330/147568)+1)]:
            row=np.asarray(seq.subset(time))[430]
            self.assertEqual(int(np.all(row==rgb,axis=1).sum()),expected)

    def test_response_percentage_waits_for_narration(self):
        from film import Sequence
        from pathlib import Path
        beat={'kind':'chart','narration':'The trial reported a reduction.','source':0,'labels':['Response'],'title':'Grid call','revealAt':2,
              'chart':{'layout':'response-window','seconds':40,'reduction':30,'unit':'Emergency drill'},
              'art':{'headline':'Grid call','caption':'London emergency trial'}}
        seq=Sequence(Path('.'),beat,{'sources':[{'url':'https://example.org/study'}]},0)
        area=(570,270,1170,480)
        before=np.asarray(seq.response_window(1.95).crop(area))
        after=np.asarray(seq.response_window(2.65).crop(area))
        self.assertEqual(len(np.unique(before.reshape(-1,3),axis=0)),1)
        self.assertGreater(len(np.unique(after.reshape(-1,3),axis=0)),2)

    def test_broll_offsets_respect_logged_clean_ranges(self):
        from footage import reserve_footage
        beats=[{'kind':'footage','clip':0,'clipStart':0},
               {'kind':'footage','clip':0,'clipStart':18},
               {'kind':'footage','clip':0,'clipStart':2,'originalSpeech':True}]
        reserve_footage(beats,[4,5,2],[{'coverage':[{'start':8,'end':20}]}],{0:30})
        self.assertEqual([shot['clipStart'] for shot in beats],[8,12,2])

    def test_camera_moves_in_both_directions(self):
        from film import camera
        from PIL import Image
        pixels=np.random.default_rng(7).integers(0,256,(190,340,3),dtype=np.uint8)
        img=Image.fromarray(pixels)
        opening=camera(img,(160,90),0)
        midpoint=camera(img,(160,90),.5)
        closing=camera(img,(160,90),1)
        self.assertNotEqual(opening.tobytes(),midpoint.tobytes())
        self.assertNotEqual(closing.tobytes(),midpoint.tobytes())
        self.assertEqual(opening.tobytes(),camera(img,(160,90),1,True).tobytes())

    def test_cut_lands_on_its_spoken_cue(self):
        import json
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from timeline import assemble
        b={'kind':'steps','art':{'headline':'Grid'},'narration':'See Iowa now.',
           'cutaways':[{'kind':'image','image':0,'at':.75,'cue':'Iowa','title':'Iowa'}]}
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'alignment.json').write_text(json.dumps([{'text':b['narration'],'starts':[i/4 for i in range(len(b['narration']))]}]))
            plan,timing,_=assemble(root,{'beats':[b]},[5],{})
        self.assertEqual(timing,[1,4])
        self.assertEqual(plan['beats'][1]['art']['headline'],'Iowa')

if __name__=='__main__':
    unittest.main()
