"""Analytic fixtures for the temporal comparison (python3 this-file.py)."""
import importlib.util
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('activity', Path(__file__).with_name('compare-activity.py'))
activity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activity)


class ActivityComparison(unittest.TestCase):
    def test_static_colored_pattern_has_zero_turnover(self):
        rgb = np.zeros((64, 64, 3), np.uint8)
        rgb[::2, :, 2] = 190
        result = activity.measure([activity.prepare(rgb)] * 9, 4, 1)
        self.assertEqual(result['pairs'], 5)
        self.assertEqual(result['pixelTurnover'], 0)
        self.assertEqual(result['coarseDrift'], 0)

    def test_equal_density_complement_changes_every_interior_pixel(self):
        rgb = np.zeros((64, 64, 3), np.uint8)
        rgb[::2, :, 2] = 190
        other = np.roll(rgb, 1, axis=0)
        result = activity.measure([activity.prepare(rgb), activity.prepare(other)], 1, 1)
        self.assertEqual(result['pairs'], 1)
        self.assertEqual(result['pixelTurnover'], 1)
        self.assertEqual(result['cellTurnover'], 1)

    def test_red_and_blue_receive_identical_measurements(self):
        rgb = np.zeros((64, 64, 3), np.uint8)
        rgb[::2, :, 2] = 190
        blue = [activity.prepare(rgb), activity.prepare(np.roll(rgb, 1, axis=0))]
        red = [activity.prepare(rgb[:, :, ::-1]), activity.prepare(np.roll(rgb, 1, axis=0)[:, :, ::-1])]
        self.assertEqual(activity.measure(blue, 1), activity.measure(red, 1))

    def test_empty_black_and_white_captions_produce_no_false_zero(self):
        for value in [0, 255]:
            rgb = np.full((64, 64, 3), value, np.uint8)
            result = activity.measure([activity.prepare(rgb)] * 9, 4)
            self.assertEqual(result['pairs'], 0)
            self.assertIsNone(result['pixelTurnover'])
            self.assertIsNone(result['cellTurnover'])

    def test_missing_window_does_not_fabricate_activity(self):
        self.assertEqual(activity.measure([], 4)['pairs'], 0)
        self.assertIsNone(activity.measure([], 4)['stablePixels'])

    def test_intensity_mode_can_measure_white_ink(self):
        rgb = np.zeros((64, 64, 3), np.uint8)
        rgb[::2] = 190
        result = activity.measure([activity.prepare(rgb, 'intensity'),
                                  activity.prepare(np.roll(rgb, 1, axis=0), 'intensity')], 1, 1)
        self.assertEqual(result['pairs'], 1)
        self.assertEqual(result['pixelTurnover'], 1)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Needs FFmpeg/FFprobe')
    def test_decoder_uses_absolute_output_frame_and_reports_a_short_window(self):
        frames = np.zeros((12, 64, 64, 3), np.uint8)
        for index, rgb in enumerate(frames):
            rgb[index % 2::2, :, 2] = 190
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.mkv'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo',
                '-pix_fmt', 'rgb24', '-video_size', '64x64', '-framerate', '60',
                '-i', '-', '-c:v', 'ffv1', str(path)], input=frames.tobytes(), check=True)
            self.assertEqual(activity.dimensions(path), (64, 64))
            decoded = activity.decode_window(path, (64, 64), 3, 4, 60)
            self.assertEqual(len(decoded), 4)
            np.testing.assert_array_equal(decoded[0][0], activity.prepare(frames[3])[0])
            np.testing.assert_array_equal(decoded[3][0], activity.prepare(frames[6])[0])
            self.assertEqual(len(activity.decode_window(path, (64, 64), 10, 9, 60)), 2)
            self.assertEqual(len(activity.decode_window(path, (64, 64), 50, 9, 60)), 0)


if __name__ == '__main__':
    unittest.main()
