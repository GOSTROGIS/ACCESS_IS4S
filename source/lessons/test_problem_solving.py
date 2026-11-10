"""Protect reviewed data and evidence boundaries in problem-solving lessons."""
from collections import Counter
from pathlib import Path
import math
import re
import unittest
ROOT = Path(__file__).resolve().parents[2] / 'skills/problem-solving/lessons'
def source(number, role):
    return (next(ROOT.glob(f'{number:02}-*')) / f'{role}.md').read_text()
class ProblemSolvingReview(unittest.TestCase):
    def test_reject_tallies_and_rates(self):
        block=source(13,'learner').split('| Parts | Reject codes |')[1].split('**Task 2**')[0]
        counts=Counter(re.findall(r'\b[BHLUP]\b',block))
        self.assertEqual(counts,{'B':14,'L':10,'H':8,'U':5,'P':3})
        answers=source(13,'answers')
        for code,count in counts.items():
            self.assertRegex(answers,rf'\| {code} \| [^\n]+ \| {count} \|')
        self.assertIn('**40.9%**',answers)
        self.assertEqual(round(720/1760*100,1),40.9)
    def test_estimate_is_not_guaranteed_boundary(self):
        self.assertIn('estimated error radius',source(16,'learner'))
        answers=source(16,'answers')
        self.assertIn('not a guaranteed maximum error',answers)
        self.assertNotIn('Up to **12 m**',answers)
        self.assertIn('**24 m**',answers)
    def test_observation_report_does_not_invent_action(self):
        answers=source(3,'answers')
        self.assertNotIn('Told the lead hand at 2:20',answers)
        self.assertIn('report not yet made',answers)
        self.assertIn('width not established by the drawing',answers)
    def test_risk_task_requires_likelihood(self):
        self.assertIn('Likelihood has not been supplied',source(12,'answers'))
        self.assertIn('likelihood',source(12,'learner').split('**Task 5**')[1].split('**Task 6**')[0].lower())
    def test_crane_distances(self):
        answers=source(14,'answers')
        for point,expected in [((34,22),35.0),((16,26),25.1),((2,26),34.1)]:
            distance=max(math.dist(point,corner) for corner in [(4,4),(28,4),(4,18),(28,18)])
            self.assertEqual(round(distance,1),expected)
            self.assertIn(f'{expected} m',answers)
    def test_causal_claim_is_qualified(self):
        self.assertIn('do not prove causation',source(13,'answers'))
        self.assertNotIn('stops them from happening at all',source(13,'answers'))
if __name__=='__main__': unittest.main()
