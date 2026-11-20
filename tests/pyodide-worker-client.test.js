import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PyodideWorkerClient from '../src/scripts/runtime/services/pyodide-worker-client';

let workers;
beforeEach(() => {
  workers = [];
  vi.useFakeTimers();
  vi.stubGlobal('Worker', class {
    constructor() { this.postMessage = vi.fn(); this.terminate = vi.fn(); workers.push(this); }
    send(data) { return this.onmessage({ data }); }
  });
  URL.createObjectURL = vi.fn(() => 'blob:worker');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Pyodide worker transport', () => {
  it('hard-stops a run and ignores late messages before starting a fresh worker', async () => {
    const output = vi.fn();
    const client = new PyodideWorkerClient({ onOutput: output });
    const first = client.run('while True: pass');
    client.stop();
    await expect(first).resolves.toEqual({ stopped: true });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const next = client.run('print(2)');
    await workers[0].send({ type: 'stdout', text: 'stale' });
    expect(output).not.toHaveBeenCalled();
    await workers[1].send({ type: 'stdout', text: '2\n' });
    await workers[1].send({ type: 'success' });
    await expect(next).resolves.toEqual({ stopped: false });
    expect(output).toHaveBeenCalledWith('2\n');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('kills an infinite computation after the execution budget, excluding startup', async () => {
    const client = new PyodideWorkerClient({ executionLimit: 50, startupLimit: 5000 });
    const run = client.run('while True: pass');
    const rejection = expect(run).rejects.toThrow('Execution limit exceeded');
    await vi.advanceTimersByTimeAsync(100);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    await workers[0].send({ type: 'executing' });
    await vi.advanceTimersByTimeAsync(51);
    await rejection;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('pauses the execution budget while waiting for input and restarts it afterwards', async () => {
    let answer;
    const client = new PyodideWorkerClient({ executionLimit: 50,
      onInput: () => new Promise((resolve) => { answer = resolve; }) });
    const run = client.run('input()');
    await workers[0].send({ type: 'executing' });
    const input = workers[0].send({ type: 'input', id: 7, prompt: 'Name?' });
    await vi.advanceTimersByTimeAsync(500);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    answer('Ada');
    await input;
    expect(workers[0].postMessage).toHaveBeenLastCalledWith({ type: 'input', id: 7, value: 'Ada' });
    await workers[0].send({ type: 'success' });
    await expect(run).resolves.toEqual({ stopped: false });
  });
});
