import turtlePySource from '../assets/turtle.py';

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
 * @returns {void}
 */
export function installPyodideTurtleModule(pyodide) {
  if (!pyodide?.FS?.writeFile || !pyodide?.FS?.analyzePath) {
    return;
  }

  try {
    if (pyodide.FS.analyzePath('/turtle.py').exists) {
      return;
    }

    pyodide.FS.writeFile('/turtle.py', turtlePySource);
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
 * @returns {{waitMessage: Function, deliverMessage: Function, pendingCount: Function}} Registry.
 */
export function createWaitMessageRegistry() {
  const waiters = new Map();

  return {
    waitMessage: (key) => new Promise((resolve) => {
      waiters.set(key, resolve);
    }),
    deliverMessage: (key, message) => {
      const resolve = waiters.get(key);

      if (resolve) {
        waiters.delete(key);
        resolve(message);
      }
    },
    pendingCount: () => waiters.size,
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
 * @returns {{postMessage: Function, onmessage: Function|null}} Python-facing port.
 */
function createClientPort(iframe, waitRegistry) {
  const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  const guiChannel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  const port = {
    onmessage: null,
    postMessage: (message) => channel?.port1.postMessage(message),
  };

  if (!channel) {
    return port;
  }

  let delivery = Promise.resolve();
  channel.port1.onmessage = (event) => {
    const handler = port.onmessage;

    if (typeof handler !== 'function') {
      return;
    }

    if (typeof handler.callPromising !== 'function') {
      handler({ data: event.data });
      return;
    }

    delivery = delivery
      .then(() => handler.callPromising({ data: event.data }))
      .catch((error) => {
        // A failing handler (e.g. sys.exit() in a Tk callback, which the
        // engine lets through) must not kill the chain: every later client
        // message would be dropped silently.
        console.error('Pyodide tkinter message delivery failed:', error);
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

  iframe.addEventListener('load', () => {
    iframe.contentWindow?.postMessage(channel.port2, '*', [channel.port2]);

    if (guiChannel) {
      iframe.contentWindow?.postMessage({ type: 'gui-port', port: guiChannel.port2 }, '*', [guiChannel.port2]);
    }
  });

  return port;
}

/**
 * Creates the `open_port(html)` callback that tkinter-web-backend calls for
 * every Tk application: it displays the client page in a fresh iframe and
 * returns the port that talks to it.
 * @param {HTMLElement} container - Element that hosts the client iframes.
 * @param {object} [waitRegistry] - Registry created by createWaitMessageRegistry().
 * @returns {function} open_port callback usable from Python.
 */
export function createTkinterOpenPort(container, waitRegistry) {
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

    return createClientPort(iframe, waitRegistry);
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
 * @returns {Promise<void>} Resolves once the backend is connected.
 */
export async function setupPyodideTkinterBridge(runner, canvasDiv) {
  const pyodide = runner?.pyodide;

  if (!pyodide || !canvasDiv) {
    return;
  }

  installPyodideTurtleModule(pyodide);

  const container = prepareTkinterContainer(canvasDiv);
  const waitRegistry = createWaitMessageRegistry();
  pyodide.globals.set('_h5p_tkinter_open_port', createTkinterOpenPort(container, waitRegistry));
  pyodide.globals.set('_h5p_tk_wait_message', waitRegistry.waitMessage);

  try {
    await pyodide.runPythonAsync(`
import sys as _h5p_sys
if '/' not in _h5p_sys.path:
    _h5p_sys.path.insert(0, '/')
import tkinter_web.embed as _h5p_tk_embed
_h5p_wait = None
try:
    from pyodide.ffi import can_run_sync, run_sync as _h5p_run_sync
    if can_run_sync():
        def _h5p_wait(key, _h5p_waiter=_h5p_tk_wait_message):
            return _h5p_run_sync(_h5p_waiter(key))
except ImportError:
    pass
_h5p_tk_embed.setup(_h5p_tkinter_open_port, _h5p_wait)
del _h5p_sys, _h5p_tk_embed, _h5p_wait
`);
  }
  finally {
    // Also on failure (e.g. the backend is not installed): never leave the
    // bridge globals in the learner-visible namespace.
    pyodide.globals.delete('_h5p_tkinter_open_port');
    pyodide.globals.delete('_h5p_tk_wait_message');
  }
}
