import { getAlgorithmTraceNoopPreamble } from './python-algorithm-trace';

const OPS_USAGE = /\bops\s*\./;
const TRACE_USAGE = /\btrace\s*\./;

/**
 * Returns the Python source that defines the global `ops` step counter.
 *
 * Learners call `ops.count()` wherever their algorithm performs the unit of
 * work that is being counted (usually a comparison) and read `ops.total`
 * afterwards. `ops.measure(function, sizes)` runs a function for several input
 * sizes and prints how the step count grows, so the effort of an algorithm can
 * be observed instead of timed.
 * @returns {string} Python preamble source.
 */
export const getOpsCounterPreamble = () => `class _H5POps:
    def __init__(self):
        self.total = 0
        self.counts = {}
    def reset(self):
        self.total = 0
        self.counts = {}
    def count(self, n=1, kind='steps'):
        self.total += n
        self.counts[kind] = self.counts.get(kind, 0) + n
    def measure(self, function, sizes=(10, 20, 40, 80, 160), make_input=None, bars=True):
        import math
        rows = []
        for n in sizes:
            argument = make_input(n) if make_input else list(range(n))
            self.reset()
            function(argument)
            rows.append((n, self.total))
        widest = max([steps for _, steps in rows] + [1])
        print(f"{'n':>8} {'steps':>12} {'factor':>8}")
        previous = None
        for n, steps in rows:
            factor = '' if previous in (None, 0) else f"x{steps / previous:.1f}"
            line = f"{n:>8} {steps:>12} {factor:>8}"
            if bars:
                line += ' ' + '#' * max(1 if steps else 0, round(40 * steps / widest))
            print(line)
            previous = steps
        if len(rows) >= 2 and rows[-2][1] > 0 and rows[-1][1] > 0 and rows[-1][0] > rows[-2][0] > 0:
            exponent = math.log(rows[-1][1] / rows[-2][1]) / math.log(rows[-1][0] / rows[-2][0])
            print(f"steps ~ n^{exponent:.1f}")
        self.reset()
        return rows
ops = _H5POps()
`;

/**
 * Tells whether learner source uses the injected `ops` counter.
 * @param {string} source Learner source.
 * @returns {boolean} True when `ops.` appears in the source.
 */
export const usesOpsCounter = (source) => OPS_USAGE.test(String(source || ''));

/**
 * Returns the injected helper source needed for a plain "Run": the `ops`
 * counter and a silent `trace` stub, each only when the source uses it.
 * @param {string} source Learner source.
 * @returns {string} Python helper source, or an empty string.
 */
export const getManualRunHelpers = (source) => {
  const text = String(source || '');
  let helpers = '';
  if (OPS_USAGE.test(text)) helpers += `${getOpsCounterPreamble()}\n`;
  if (TRACE_USAGE.test(text)) helpers += `${getAlgorithmTraceNoopPreamble()}\n`;
  return helpers;
};
