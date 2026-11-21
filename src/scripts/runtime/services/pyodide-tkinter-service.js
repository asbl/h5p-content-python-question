/* global __webpack_public_path__: writable */
import libraryJson from '../../../../library.json';
import sessionSource from '../assets/h5p_tkinter_session.py';
import { getPythonL10nValue } from '../../services/python-l10n';

const activeSessions = new WeakMap();

/**
 * CSS class of the container that hosts the tkinter client pages.
 * @type {string}
 */
const TKINTER_CONTAINER_CLASS = 'pyodide-tkinter-desktop';

/**
 * CSS class of a single tkinter client iframe.
 * @type {string}
 */
const TKINTER_FRAME_CLASS = 'pyodide-tkinter-frame';

/**
 * Default height of a tkinter client iframe before the client reports
 * its actual desktop size.
 * @type {number}
 */
const TKINTER_FRAME_DEFAULT_HEIGHT = 320;

/**
 * Writes the vendored turtle module into the Pyodide filesystem.
 *
 * Pyodide removes `turtle` from its standard library distribution, but the
 * module is pure Python on top of tkinter. tkinter-web-backend provides the
 * tkinter package, so supplying turtle.py makes `import turtle` work.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves once installed.
 */
export async function installPyodideTurtleModule(pyodide) {
  if (!pyodide?.FS?.writeFile || !pyodide?.FS?.analyzePath) {
    return;
  }

  try {
    if (pyodide.FS.analyzePath('/turtle.py').exists) {
      return;
    }

    // Moodle can concatenate the entry script into a cached-assets URL. Async
    // chunks still belong to the installed library, not that aggregate URL.
    if (typeof __webpack_public_path__ !== 'undefined' && typeof H5P.getLibraryPath === 'function') {
      const library = `H5P.PythonQuestion-${libraryJson.majorVersion}.${libraryJson.minorVersion}`;
      __webpack_public_path__ = `${H5P.getLibraryPath(library).replace(/\/$/, '')}/dist/`;
    }
    const { default: turtlePySource } = await import(/* webpackChunkName: "python-turtle" */ '../assets/turtle.py');
    if (!pyodide.FS.analyzePath('/turtle.py').exists) {
      pyodide.FS.writeFile('/turtle.py', turtlePySource);
    }
  }
  catch (_) {
    // Best effort: without turtle.py only the turtle module is unavailable,
    // tkinter itself keeps working.
  }
}

/**
 * Creates the registry that connects tkinter-web-backend's blocking waits
 * to the client pages.
 *
 * While the program waits for the user (messagebox, simpledialog,
 * wait_window), the engine calls `wait_message(key)` and suspends until the
 * client posts the matching batched message through its gui port. The
 * registry hands out the promise per key and resolves it on delivery.
 * @returns {object} Wait registry with delivery, cancellation and pending count.
 */
export function createWaitMessageRegistry() {
  const waiters = new Map();
  let disposed = false;

  return {
    waitMessage: (key) => {
      if (disposed) return Promise.reject(new Error('Tkinter execution stopped.'));
      return new Promise((resolve, reject) => {
        waiters.set(key, { resolve, reject });
      });
    },
    deliverMessage: (key, message) => {
      const waiter = waiters.get(key);

      if (waiter) {
        waiters.delete(key);
        waiter.resolve(message);
      }
    },
    pendingCount: () => waiters.size,
    dispose: () => {
      disposed = true;
      waiters.forEach(({ reject }) => reject(new Error('Tkinter execution stopped.')));
      waiters.clear();
    },
  };
}

/**
 * Creates the host side of one tkinter client page.
 *
 * tkinter-web-backend's embedded client expects two window messages: the
 * program port (a raw MessagePort, first one wins) and an optional
 * `{type: "gui-port", port}` channel that reports desktop sizes and blocked
 * dialog batches. The returned object is handed to Python, which sets
 * `onmessage` and calls `postMessage` on it.
 *
 * Incoming program messages are delivered through `callPromising` when the
 * Python handler supports it: callbacks that block on the user (dialogs)
 * need a promising entry point so `run_sync` can suspend the frame. A
 * serialized promise chain keeps the message order intact.
 * @param {HTMLIFrameElement} iframe - Client page iframe.
 * @param {object} [waitRegistry] - Registry created by createWaitMessageRegistry().
 * @param {function} [onClose] - Called when this application closes.
 * @returns {object} Python-facing port with close and whenIdle methods.
 */
function createClientPort(iframe, waitRegistry, onClose = () => {}) {
  const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  const guiChannel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  let disposed = false;
  let delivery = Promise.resolve();
  const port = {
    onmessage: null,
    postMessage: (message) => {
      if (!disposed) channel?.port1.postMessage(message);
    },
    close: () => {
      if (disposed) return;
      disposed = true;
      iframe.removeEventListener('load', connect);
      port.onmessage = null;
      for (const pair of [channel, guiChannel]) {
        if (!pair) continue;
        pair.port1.onmessage = null;
        pair.port1.close?.();
        pair.port2.close?.();
      }
      iframe.remove();
      onClose(port);
    },
    whenIdle: () => delivery,
  };
  const connect = () => {
    if (disposed) return;
    iframe.contentWindow?.postMessage(channel.port2, '*', [channel.port2]);
    if (guiChannel) {
      iframe.contentWindow?.postMessage({ type: 'gui-port', port: guiChannel.port2 }, '*', [guiChannel.port2]);
    }
  };

  if (!channel) {
    return port;
  }

  channel.port1.onmessage = (event) => {
    const handler = port.onmessage;

    if (disposed || typeof handler !== 'function') {
      return;
    }

    if (typeof handler.callPromising !== 'function') {
      handler({ data: event.data });
      return;
    }

    delivery = delivery
      .then(() => disposed ? undefined : handler.callPromising({ data: event.data }))
      .catch((error) => {
        // A failing handler (e.g. sys.exit() in a Tk callback, which the
        // engine lets through) must not kill the chain: every later client
        // message would be dropped silently.
        if (!disposed) console.error('Pyodide tkinter message delivery failed:', error);
      });
  };

  if (guiChannel) {
    guiChannel.port1.onmessage = (event) => {
      const data = event.data;

      if (data?.type === 'size' && data.content) {
        const height = Number(data.content.height);

        if (Number.isFinite(height) && height > 0) {
          iframe.style.height = `${Math.ceil(height)}px`;
        }
      }
      else if (data?.type === 'iframe-message' && waitRegistry) {
        waitRegistry.deliverMessage(data.key, data.message);
      }
    };
  }

  iframe.addEventListener('load', connect, { once: true });

  return port;
}

/**
 * Creates the `open_port(html)` callback that tkinter-web-backend calls for
 * every Tk application: it displays the client page in a fresh iframe and
 * returns the port that talks to it.
 * @param {HTMLElement} container - Element that hosts the client iframes.
 * @param {object} [waitRegistry] - Registry created by createWaitMessageRegistry().
 * @param {Set<object>} [ports] - Live ports belonging to the session.
 * @param {function} [onEmpty] - Called when the final application closes.
 * @returns {function} open_port callback usable from Python.
 */
export function createTkinterOpenPort(container, waitRegistry, ports = new Set(), onEmpty = () => {}) {
  return (html) => {
    const iframe = document.createElement('iframe');
    iframe.className = TKINTER_FRAME_CLASS;
    iframe.setAttribute('title', 'Tkinter');
    iframe.setAttribute('srcdoc', String(html || ''));
    iframe.style.width = '100%';
    iframe.style.height = `${TKINTER_FRAME_DEFAULT_HEIGHT}px`;
    iframe.style.border = '0';
    iframe.style.display = 'block';
    container.append(iframe);

    const port = createClientPort(iframe, waitRegistry, (closedPort) => {
      ports.delete(closedPort);
      if (!ports.size) onEmpty();
    });
    ports.add(port);
    return port;
  };
}

/**
 * Prepares the tkinter container inside the canvas host.
 *
 * Each run starts from a fresh container so windows of previous runs cannot
 * receive stale display operations.
 * @param {HTMLElement} canvasDiv - Canvas mount target.
 * @returns {HTMLElement} Tkinter container.
 */
function prepareTkinterContainer(canvasDiv) {
  const existing = canvasDiv.querySelector(`.${TKINTER_CONTAINER_CLASS}`);

  if (existing) {
    existing.replaceChildren();
    return existing;
  }

  canvasDiv.replaceChildren();
  const container = document.createElement('div');
  container.className = TKINTER_CONTAINER_CLASS;
  container.style.width = '100%';
  canvasDiv.append(container);

  return container;
}

/**
 * Connects tkinter-web-backend's embedded mode to the visible page.
 *
 * Installs the vendored turtle module, registers the `open_port` callback
 * that renders every Tk application as an iframe inside the canvas host and
 * switches tkinter to the web backend. When the runtime supports synchronous
 * waits (`run_sync`, needs JSPI), blocking dialogs (messagebox,
 * simpledialog, wait_window) are wired through the gui port as well.
 * Must run before learner code creates any Tk root window.
 * @param {object} runner - PyodideRunner instance.
 * @param {HTMLElement} canvasDiv - Canvas mount target.
 * @returns {Promise<object|undefined>} Owned session, or undefined without a host.
 */
export async function setupPyodideTkinterBridge(runner, canvasDiv) {
  const pyodide = runner?.pyodide;

  if (!pyodide || !canvasDiv) {
    return;
  }

  await disposeActiveTkinterSession(pyodide);
  if (runner.runtime?.containsTurtleCode?.() !== false) {
    await installPyodideTurtleModule(pyodide);
  }

  const container = prepareTkinterContainer(canvasDiv);
  const waitRegistry = createWaitMessageRegistry();
  const ports = new Set();
  const allPorts = new Set();
  let disposed = false;
  let disposePromise;
  let pythonDispose;
  let execution = Promise.resolve();
  const session = {
    owner: runner,
    get active() {
      return !disposed && ports.size > 0;
    },
    get current() {
      return !disposed && activeSessions.get(pyodide) === session;
    },
    trackExecution: (promise) => {
      execution = promise.catch(() => {});
    },
    close: () => {
      if (disposed) return;
      disposed = true;
      waitRegistry.dispose();
      [...ports].forEach((port) => port.close());
    },
    dispose: () => {
      if (disposePromise) return disposePromise;
      session.close();
      disposePromise = (async () => {
        await Promise.all([execution, ...[...allPorts].map((port) => port.whenIdle())]);
        try {
          if (pythonDispose) await pythonDispose.callPromising();
        }
        finally {
          pythonDispose?.destroy?.();
          allPorts.clear();
          if (activeSessions.get(pyodide) === session) activeSessions.delete(pyodide);
        }
      })();
      return disposePromise;
    },
  };
  activeSessions.set(pyodide, session);
  runner.tkinterSession = session;
  const openPort = createTkinterOpenPort(container, waitRegistry, ports, () => {
    if (!disposed) runner.onTkinterClosed?.(session);
  });
  pyodide.globals.set('_h5p_tkinter_open_port', (html) => {
    if (disposed) throw new Error('Tkinter execution stopped.');
    const port = openPort(html);
    allPorts.add(port);
    return port;
  });
  pyodide.globals.set('_h5p_tk_wait_message', waitRegistry.waitMessage);
  pyodide.globals.set('_h5p_tk_unsupported', getPythonL10nValue(runner.l10n || {}, 'tkinterBlockingUnsupported'));

  try {
    pythonDispose = await pyodide.runPythonAsync(`${sessionSource}
_h5p_create_tk_session(_h5p_tkinter_open_port, _h5p_tk_wait_message, _h5p_tk_unsupported, ${runner.retainGlobals ? 'True' : 'False'})
`);
    return session;
  }
  catch (error) {
    await session.dispose();
    throw error;
  }
  finally {
    for (const name of ['_h5p_tkinter_open_port', '_h5p_tk_wait_message', '_h5p_tk_unsupported', '_h5p_create_tk_session']) {
      pyodide.globals.delete(name);
    }
  }
}

/**
 * Tears down the previous GUI before another run uses the shared namespace.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {object} [nextRunner] - New owner taking over the shared runtime.
 * @returns {Promise<void>} Resolves when ports, dialogs and timers are released.
 */
export async function disposeActiveTkinterSession(pyodide, nextRunner) {
  const previous = activeSessions.get(pyodide);
  if (previous && nextRunner && previous.owner !== nextRunner) {
    previous.owner.stop?.();
    await previous.owner.waitForBackgroundTaskCancellation?.();
  }
  await previous?.dispose();
}
