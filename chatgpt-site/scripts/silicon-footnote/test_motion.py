import unittest
import numpy as np
from motion import Scene, lower_third

class MotionTests(unittest.TestCase):
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
