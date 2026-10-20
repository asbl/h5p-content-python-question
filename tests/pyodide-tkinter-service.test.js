import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTkinterOpenPort,
  createWaitMessageRegistry,
  installPyodideTurtleModule,
  setupPyodideTkinterBridge,
} from '../src/scripts/runtime/services/pyodide-tkinter-service.js';

/**
 * Creates a Pyodide mock that records filesystem and globals access.
 * The FS mock tracks written files so existence checks behave like Emscripten.
 * @returns {object} Pyodide mock.
 */
function createPyodide() {
  const files = new Set();

  return {
    FS: {
      writeFile: vi.fn((path, data) => files.add(path)),
      analyzePath: vi.fn((path) => ({ exists: files.has(path) })),
    },
    globals: {
      set: vi.fn(),
      delete: vi.fn(),
    },
    runPythonAsync: vi.fn(async () => {}),
  };
}

/**
 * Installs a fake MessageChannel implementation (jsdom has none) and records
 * every created channel so tests can simulate both port ends.
 * @returns {Array<object>} Created channels (program channel first, gui second).
 */
function stubMessageChannel() {
  const channels = [];
  const createPorts = () => {
    const port1 = { onmessage: null, postMessage: vi.fn() };
    return { port1, port2: {} };
  };

  vi.stubGlobal('MessageChannel', class {
    constructor() {
      const channel = createPorts();
      channels.push(channel);
      return channel;
    }
  });

  return channels;
}

/**
 * Extracts the open_port callback registered under the given global name.
 * @param {object} pyodide - Pyodide mock.
 * @param {number} occurrence - Zero-based index among open_port registrations.
 * @returns {Function} Registered open_port callback.
 */
function registeredOpenPort(pyodide, occurrence) {
  const calls = pyodide.globals.set.mock.calls.filter((call) => call[0] === '_h5p_tkinter_open_port');

  return calls[occurrence][1];
}

describe('Pyodide tkinter service', () => {
  beforeEach(() => {
    stubMessageChannel();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('writes the vendored turtle module once and skips when present', () => {
    const pyodide = createPyodide();

    installPyodideTurtleModule(pyodide);
    installPyodideTurtleModule(pyodide);

    expect(pyodide.FS.writeFile).toHaveBeenCalledTimes(1);
    expect(pyodide.FS.writeFile).toHaveBeenCalledWith('/turtle.py', expect.stringContaining('turtle'));
  });

  it('creates a client iframe and port for each Tk application', () => {
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container);

    const port = openPort('<html><body>desktop</body></html>');

    const iframe = container.querySelector('iframe.pyodide-tkinter-frame');
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('srcdoc')).toContain('desktop');
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(typeof port.postMessage).toBe('function');
    expect(port.onmessage).toBeNull();

    const secondPort = openPort('<html>second</html>');
    expect(container.querySelectorAll('iframe')).toHaveLength(2);
    expect(typeof secondPort.postMessage).toBe('function');
  });

  it('forwards messages between the client page and Python', () => {
    const channels = stubMessageChannel();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container);
    const port = openPort('<html></html>');
    const onmessage = vi.fn();

    port.onmessage = onmessage;
    port.postMessage('{"t":"ops"}');

    // Python -> client: postMessage goes through the program channel.
    expect(channels[0].port1.postMessage).toHaveBeenCalledWith('{"t":"ops"}');

    // Client -> Python: events on the program channel reach the Python port.
    channels[0].port1.onmessage({ data: '{"t":"hello"}' });
    expect(onmessage).toHaveBeenCalledWith({ data: '{"t":"hello"}' });
  });

  it('resizes the client iframe from gui size messages', () => {
    const channels = stubMessageChannel();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container);

    openPort('<html></html>');
    const iframe = container.querySelector('iframe');
    expect(iframe.style.height).toBe('320px');

    channels[1].port1.onmessage({ data: { type: 'size', content: { width: 400, height: 250 } } });
    expect(iframe.style.height).toBe('250px');
  });

  it('resolves blocking waits from gui iframe messages', () => {
    const channels = stubMessageChannel();
    const registry = createWaitMessageRegistry();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container, registry);

    openPort('<html></html>');
    const wait = registry.waitMessage('key-0');
    expect(registry.pendingCount()).toBe(1);

    channels[1].port1.onmessage({
      data: { type: 'iframe-message', key: 'key-0', message: '[{"t":"wm"}]' },
    });

    return wait.then((message) => {
      expect(message).toBe('[{"t":"wm"}]');
      expect(registry.pendingCount()).toBe(0);
    });
  });

  it('ignores unknown wait keys and unknown gui messages', () => {
    const channels = stubMessageChannel();
    const registry = createWaitMessageRegistry();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container, registry);

    openPort('<html></html>');
    channels[1].port1.onmessage({
      data: { type: 'iframe-message', key: 'missing', message: '[]' },
    });
    channels[1].port1.onmessage({ data: { type: 'unknown' } });

    expect(registry.pendingCount()).toBe(0);
  });

  it('delivers program messages through callPromising in order', async () => {
    const channels = stubMessageChannel();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container);
    const port = openPort('<html></html>');
    const calls = [];
    const handler = () => {};
    handler.callPromising = vi.fn(async (payload) => {
      calls.push(payload.data);
    });
    port.onmessage = handler;

    channels[0].port1.onmessage({ data: 'first' });
    channels[0].port1.onmessage({ data: 'second' });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(calls).toEqual(['first', 'second']);
    expect(handler.callPromising).toHaveBeenCalledTimes(2);
  });

  it('keeps delivering after a handler rejection', async () => {
    const channels = stubMessageChannel();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container);
    const port = openPort('<html></html>');
    const calls = [];
    const handler = () => {};
    handler.callPromising = async (payload) => {
      calls.push(payload.data);

      if (payload.data === 'boom') {
        throw new Error('sys.exit in a Tk callback');
      }
    };
    port.onmessage = handler;

    channels[0].port1.onmessage({ data: 'first' });
    channels[0].port1.onmessage({ data: 'boom' });
    channels[0].port1.onmessage({ data: 'third' });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(calls).toEqual(['first', 'boom', 'third']);
  });

  it('falls back to synchronous delivery without callPromising', () => {
    const channels = stubMessageChannel();
    const container = document.createElement('div');
    const openPort = createTkinterOpenPort(container);
    const port = openPort('<html></html>');
    const onmessage = vi.fn();

    port.onmessage = onmessage;
    channels[0].port1.onmessage({ data: 'sync' });

    expect(onmessage).toHaveBeenCalledWith({ data: 'sync' });
  });

  it('connects the embedded backend inside the canvas host', async () => {
    const pyodide = createPyodide();
    const runner = { pyodide };
    const canvasDiv = document.createElement('div');

    await setupPyodideTkinterBridge(runner, canvasDiv);

    expect(pyodide.FS.writeFile).toHaveBeenCalledWith('/turtle.py', expect.any(String));
    expect(pyodide.globals.set).toHaveBeenCalledWith(
      '_h5p_tkinter_open_port',
      expect.any(Function),
    );
    expect(pyodide.globals.set).toHaveBeenCalledWith(
      '_h5p_tk_wait_message',
      expect.any(Function),
    );
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(expect.stringContaining('tkinter_web.embed'));
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(expect.stringContaining('_h5p_tk_embed.setup'));
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(expect.stringContaining('can_run_sync'));
    expect(pyodide.runPythonAsync).toHaveBeenCalledWith(expect.stringContaining('_h5p_run_sync'));
    expect(pyodide.globals.delete).toHaveBeenCalledWith('_h5p_tkinter_open_port');
    expect(pyodide.globals.delete).toHaveBeenCalledWith('_h5p_tk_wait_message');
    expect(canvasDiv.querySelectorAll('iframe')).toHaveLength(0);

    // The registered open_port renders client pages into the host.
    const openPort = registeredOpenPort(pyodide, 0);
    openPort('<html>first</html>');
    expect(canvasDiv.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('clears windows of previous runs before reconnecting', async () => {
    const pyodide = createPyodide();
    const runner = { pyodide };
    const canvasDiv = document.createElement('div');

    await setupPyodideTkinterBridge(runner, canvasDiv);
    const firstOpenPort = registeredOpenPort(pyodide, 0);
    firstOpenPort('<html>first</html>');
    firstOpenPort('<html>second</html>');
    expect(canvasDiv.querySelectorAll('iframe')).toHaveLength(2);

    await setupPyodideTkinterBridge(runner, canvasDiv);
    expect(canvasDiv.querySelectorAll('iframe')).toHaveLength(0);

    const secondOpenPort = registeredOpenPort(pyodide, 1);
    secondOpenPort('<html>fresh</html>');
    expect(canvasDiv.querySelectorAll('iframe')).toHaveLength(1);
    expect(canvasDiv.querySelector('iframe').getAttribute('srcdoc')).toContain('fresh');
  });

  it('does nothing without a Pyodide instance or canvas host', async () => {
    await setupPyodideTkinterBridge({ pyodide: null }, document.createElement('div'));

    const pyodide = createPyodide();
    await setupPyodideTkinterBridge({ pyodide }, null);

    expect(pyodide.runPythonAsync).not.toHaveBeenCalled();
  });

  it('releases the bridge globals when the backend setup fails', async () => {
    const pyodide = createPyodide();
    pyodide.runPythonAsync.mockRejectedValue(new Error('no tkinter_web module'));

    await expect(setupPyodideTkinterBridge({ pyodide }, document.createElement('div')))
      .rejects.toThrow('no tkinter_web module');

    const deleted = pyodide.globals.delete.mock.calls.map((call) => call[0]);
    expect(deleted).toContain('_h5p_tkinter_open_port');
    expect(deleted).toContain('_h5p_tk_wait_message');
  });
});
