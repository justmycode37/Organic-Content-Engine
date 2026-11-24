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

if __name__=='__main__':
    unittest.main()
