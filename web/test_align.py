import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from align import proportional_estimates


class ProportionalEstimateTests(unittest.TestCase):
    def test_allocates_duration_by_word_count(self):
        stamps = proportional_estimates(["one word", "one two three four"], 60)

        first_duration = stamps[0][1] - stamps[0][0]
        second_duration = stamps[1][1] - stamps[1][0]
        self.assertAlmostEqual(first_duration, 20)
        self.assertAlmostEqual(second_duration, 40)
        self.assertAlmostEqual(stamps[-1][1], 60)


if __name__ == "__main__":
    unittest.main()
