import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  getAlgorithmTracePreamble,
  TRACE_PREFIX,
} from '../src/scripts/services/python-algorithm-trace.js';

function runTraceSnippet(config, body) {
  const { token, code } = getAlgorithmTracePreamble(config);
  const marker = `${TRACE_PREFIX}${token}:`;
  const output = execFileSync('python3', ['-c', `${code}\n${body}`], { encoding: 'utf8' });

  return output
    .trim()
    .split('\n')
    .filter((line) => line.startsWith(marker))
    .map((line) => JSON.parse(line.slice(marker.length)));
}

describe('algorithm trace preamble', () => {
  it('emits bounded watch, compare and mark events with clipped snapshots', () => {
    const events = runTraceSnippet({ maxEvents: 3, maxSnapshotLength: 2 }, [
      'trace.watch([3, 1, 2])',
      'trace.compare(0, 1)',
      'trace.mark(2, "pivot")',
      'trace.mark(0, "ignored")',
    ].join('\n'));

    expect(events).toEqual([
      { type: 'watch', step: 1, snapshot: [3, 1] },
      { type: 'compare', step: 2, indices: [0, 1] },
      { type: 'mark', step: 3, index: 2, label: 'pivot' },
    ]);
  });

  it('mutates values during swap and clamps negative limits', () => {
    const events = runTraceSnippet({ maxEvents: -1, maxSnapshotLength: -1 }, [
      'values = [1, 2, 3]',
      'trace.swap(values, 0, 2)',
      'trace.watch(values)',
    ].join('\n'));

    expect(events).toEqual([
      { type: 'swap', step: 1, indices: [0, 2], snapshot: [3] },
    ]);
  });
});
