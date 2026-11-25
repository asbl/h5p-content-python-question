import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  getManualRunHelpers,
  getOpsCounterPreamble,
  usesOpsCounter,
} from '../src/scripts/services/python-ops-counter.js';

const runPython = (body) => execFileSync('python3', ['-c', `${getOpsCounterPreamble()}\n${body}`], { encoding: 'utf8' });

describe('ops step counter', () => {
  it('counts steps per kind and resets', () => {
    const output = runPython([
      'ops.count()',
      'ops.count(3, "compare")',
      'print(ops.total, ops.counts)',
      'ops.reset()',
      'print(ops.total, ops.counts)',
    ].join('\n'));

    expect(output.trim().split('\n')).toEqual([
      "4 {'steps': 1, 'compare': 3}",
      '0 {}',
    ]);
  });

  it('measures growth and estimates the exponent', () => {
    const output = runPython([
      'def quadratic(values):',
      '    for a in values:',
      '        for b in values:',
      '            ops.count()',
      'rows = ops.measure(quadratic, sizes=(10, 20, 40))',
      'print(rows)',
    ].join('\n'));

    expect(output).toContain('steps ~ n^2.0');
    expect(output).toContain('x4.0');
    expect(output).toContain('[(10, 100), (20, 400), (40, 1600)]');
  });

  it('measures linear growth with a custom input builder', () => {
    const output = runPython([
      'def total(text):',
      '    for _ in text:',
      '        ops.count()',
      'ops.measure(total, sizes=(5, 10), make_input=lambda n: "x" * n, bars=False)',
    ].join('\n'));

    expect(output).toContain('steps ~ n^1.0');
    expect(output).not.toContain('#');
  });

  it('detects usage only when the source calls ops or trace', () => {
    expect(usesOpsCounter('ops.count()')).toBe(true);
    expect(usesOpsCounter('shops = 1')).toBe(false);
    expect(getManualRunHelpers('print(1)')).toBe('');
    expect(getManualRunHelpers('ops.count()')).toContain('class _H5POps');
    expect(getManualRunHelpers('trace.compare(0, 1)')).toContain('__H5PTraceNoop');
  });
});
