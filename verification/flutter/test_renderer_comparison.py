"""Device-free guards for the 10,000-panel comparison protocol."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'comparison', Path(__file__).with_name('renderer-comparison.py'))
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


class ScaleComparisonTest(unittest.TestCase):
    def test_matrix_covers_both_text_paths_and_reverses_order(self):
        cases = list(comparison.matrix('scale10k'))
        self.assertEqual(len(cases), 48)
        self.assertEqual(len(set(cases)), 48)
        for view in ('fit', 'zoom'):
            for workload in ('immediate', 'animated', 'text', 'text-cold'):
                forward = [v for b, z, w, v in cases if (b, z, w) == (0, view, workload)]
                backward = [v for b, z, w, v in cases if (b, z, w) == (1, view, workload)]
                self.assertEqual(forward, ['canvas', 'flame', 'flame-raw'])
                self.assertEqual(backward, forward[::-1])

    def test_rejects_wrong_scale_backend_and_incomplete_or_hot_samples(self):
        key = (0, 'fit', 'text-cold', 'flame-raw')
        report = dict(
            completed=True, mode='profile/AOT', fitAtlas=True,
            filter='/flame-raw/0/fit/text-cold',
            protocol='patch-map-canvas-flame/scale-10k-1',
            panelCount=10000, groupCount=100, seed=0x5eed,
            cases=[dict(
                block=0, zoom=False, workload='text-cold', variant='flame-raw',
                completed=True,
                rendererConfig=dict(host='flame', flameBatch=False,
                                    atlasBars=True, minAtlasScale=0.0),
                rows=[dict(sample=i, warmup=i < 5, thermalAfter=0,
                           commitMs=1, firstChangedMs=2, finalMs=2,
                           frames=[dict(buildMs=1, rasterMs=1, vsyncUs=1000)])
                      for i in range(25)])])
        comparison.validate(report, key, 'scale10k')
        mutations = [
            lambda r: r.update(panelCount=5000),
            lambda r: r.update(groupCount=50),
            lambda r: r['cases'][0]['rendererConfig'].update(flameBatch=True),
            lambda r: r['cases'][0]['rows'].pop(),
            lambda r: r['cases'][0]['rows'][-1].update(thermalAfter=1),
            lambda r: r['cases'][0]['rows'][-1].update(frames=[]),
        ]
        for mutate in mutations:
            changed = copy.deepcopy(report)
            mutate(changed)
            with self.assertRaises(AssertionError):
                comparison.validate(changed, key, 'scale10k')


if __name__ == '__main__':
    unittest.main()
