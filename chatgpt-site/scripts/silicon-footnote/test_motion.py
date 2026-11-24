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
    def test_interview_captions_follow_the_source_trim(self):
        from captions import caption_cues
        beats=[{'narration':'Here.', 'actuality':{'start':6,'end':10,'captions':[
            {'start':5,'end':8,'text':'First phrase.'},{'start':8,'end':11,'text':'Second phrase.'}]}},
            {'narration':'Next.'}]
        alignment=[{'text':b['narration'],'starts':[0]*5} for b in beats]
        cues=caption_cues({'beats':beats},[2,3],alignment)
        self.assertEqual(cues,[(0,2,'Here.'),(2,4,'First phrase.'),(4,6,'Second phrase.'),(6,9,'Next.')])

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
