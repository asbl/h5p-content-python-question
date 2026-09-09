/**
 * Returns whether the event key should be treated as SDL gameplay input.
 * @param {KeyboardEvent} event - Keyboard event.
 * @returns {boolean} True for keys that should not leak to editors.
 */
export function isSDLControlKey(event) {
  const key = String(event?.key || '');

  return key === 'ArrowUp'
    || key === 'ArrowDown'
    || key === 'ArrowLeft'
    || key === 'ArrowRight'
    || key === ' ';
}

/**
 * Returns whether an event target is a real text-entry control, e.g. the
 * SweetAlert input dialog used for Python's input(). Keys typed into such a
 * control (including Space and arrow keys used for cursor movement) must
 * never be hijacked as SDL gameplay input.
 * @param {EventTarget|null} target - Candidate event target.
 * @returns {boolean} True if the target accepts free text entry.
 */
function isEditableEventTarget(target) {
  if (!target || typeof target.tagName !== 'string') {
    return false;
  }

  const tagName = target.tagName.toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || Boolean(target.isContentEditable);
}

/**
 * Determines if this runner should capture and consume a key event.
 * @param {object} runner - PyodideRunner instance.
 * @param {KeyboardEvent} event - Keyboard event.
 * @param {object} sharedState - Shared Pyodide runtime state.
 * @returns {boolean} True when the active SDL canvas owns keyboard input.
 */
export function shouldCaptureSDLKeyboard(runner, event, sharedState) {
  if (!runner.runtime.containsSDLCode?.()) {
    return false;
  }

  if (!runner.sdlCanvas?.isConnected) {
    return false;
  }

  if (isEditableEventTarget(event?.target)) {
    return false;
  }

  const pageName = runner.runtime.codeContainer?.getPageManager?.().activePageName;
  if (pageName && pageName !== 'canvas') {
    return false;
  }

  if (sharedState.activeSDLRunner && sharedState.activeSDLRunner !== runner) {
    return false;
  }

  return isSDLControlKey(event);
}

/**
 * Installs capture-phase key handling so arrow keys target SDL only.
 * @param {object} runner - PyodideRunner instance.
 * @param {object} sharedState - Shared Pyodide runtime state.
 * @returns {void}
 */
export function installSDLKeyboardCapture(runner, sharedState) {
  if (runner._sdlKeyboardCaptureInstalled || typeof document?.addEventListener !== 'function') {
    return;
  }

  runner._sdlKeyboardCaptureBound = (event) => {
    if (!shouldCaptureSDLKeyboard(runner, event, sharedState)) {
      return;
    }

    const activeElement = document.activeElement;
    const ownCanvasScope = runner.canvasWrapper || runner.canvasDiv || runner.sdlCanvas;
    const focusIsInsideOwnCanvas = Boolean(
      ownCanvasScope
      && activeElement
      && typeof ownCanvasScope.contains === 'function'
      && ownCanvasScope.contains(activeElement),
    ) || activeElement === runner.sdlCanvas;

    if (!focusIsInsideOwnCanvas && typeof runner.sdlCanvas?.focus === 'function') {
      runner.sdlCanvas.focus({ preventScroll: true });

      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      return;
    }

    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  };

  document.addEventListener('keydown', runner._sdlKeyboardCaptureBound, true);
  runner._sdlKeyboardCaptureInstalled = true;
}

/**
 * Removes capture-phase SDL keyboard handling.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function uninstallSDLKeyboardCapture(runner) {
  if (!runner._sdlKeyboardCaptureInstalled || !runner._sdlKeyboardCaptureBound || typeof document?.removeEventListener !== 'function') {
    return;
  }

  document.removeEventListener('keydown', runner._sdlKeyboardCaptureBound, true);
  runner._sdlKeyboardCaptureBound = null;
  runner._sdlKeyboardCaptureInstalled = false;
}

const PYGAME_EVENT_QUEUE_LIMIT = 256;

/**
 * Queues a synthetic pygame mouse event as fallback for missing SDL bridges.
 *
 * Events are delivered only through window.__h5pPygameEventQueue, which the
 * patched pygame.event.get() consumes. Calling into Python per DOM event
 * (compile + execute) is far too expensive for high-frequency pointer moves
 * and would also deliver every event twice.
 * @param {object} runner - PyodideRunner instance.
 * @param {MouseEvent|PointerEvent|TouchEvent} event - Browser input event.
 * @param {DOMRect} rect - Canvas client rect.
 * @returns {void}
 */
export function postSyntheticPygameMouseEvent(runner, event, rect) {
  if (!runner.pyodide || !runner.sdlCanvas || !rect) {
    return;
  }

  const hasPointerSupport = typeof window?.PointerEvent === 'function';
  if (hasPointerSupport && String(event.type || '').startsWith('mouse')) {
    return;
  }

  const eventTypeMap = {
    mousedown: 'MOUSEBUTTONDOWN',
    mouseup: 'MOUSEBUTTONUP',
    mousemove: 'MOUSEMOTION',
    pointerdown: 'MOUSEBUTTONDOWN',
    pointerup: 'MOUSEBUTTONUP',
    pointermove: 'MOUSEMOTION',
  };

  const pygameEventType = eventTypeMap[event.type];
  if (!pygameEventType) {
    return;
  }

  const relClientX = event.clientX - rect.left;
  const relClientY = event.clientY - rect.top;
  const x = Math.max(0, Math.min(runner.sdlCanvas.width - 1, Math.round((relClientX / Math.max(1, rect.width)) * runner.sdlCanvas.width)));
  const y = Math.max(0, Math.min(runner.sdlCanvas.height - 1, Math.round((relClientY / Math.max(1, rect.height)) * runner.sdlCanvas.height)));
  const button = Number.isFinite(event.button) ? (event.button + 1) : 1;
  const buttons = Number.isFinite(event.buttons) ? event.buttons : 0;

  const queuedEvent = pygameEventType === 'MOUSEMOTION'
    ? {
      type: 'MOUSEMOTION',
      attrs: {
        pos: [x, y],
        rel: [0, 0],
        buttons: [buttons & 1, Boolean(buttons & 4) ? 1 : 0, Boolean(buttons & 2) ? 1 : 0],
        touch: false,
      },
    }
    : {
      type: pygameEventType,
      attrs: {
        pos: [x, y],
        button,
        touch: false,
      },
    };

  if (typeof window === 'undefined') {
    return;
  }

  if (!Array.isArray(window.__h5pPygameEventQueue)) {
    window.__h5pPygameEventQueue = [];
  }

  const queue = window.__h5pPygameEventQueue;

  // Coalesce high-frequency motion: only the latest pending position matters.
  if (pygameEventType === 'MOUSEMOTION' && queue.length > 0 && queue[queue.length - 1]?.type === 'MOUSEMOTION') {
    queue[queue.length - 1] = queuedEvent;
  }
  else {
    queue.push(queuedEvent);

    if (queue.length > PYGAME_EVENT_QUEUE_LIMIT) {
      queue.splice(0, queue.length - PYGAME_EVENT_QUEUE_LIMIT);
    }
  }

  window.__h5pSyntheticMousePosted = (window.__h5pSyntheticMousePosted || 0) + 1;
}

const SDL_MOUSE_EVENT_TYPES = [
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'pointerdown',
  'pointerup',
  'pointermove',
  'touchstart',
  'touchend',
  'touchmove',
];

/**
 * Installs mouse event handling for SDL canvas.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function installSDLMouseCapture(runner) {
  if (runner._sdlMouseCaptureInstalled || typeof document?.addEventListener !== 'function') {
    return;
  }

  if (typeof window !== 'undefined') {
    window.__h5pInstallMouseCaptureRuns = (window.__h5pInstallMouseCaptureRuns || 0) + 1;
  }

  runner._sdlMouseCaptureBound = (event) => {
    // The handler is registered on document and on the canvas, so the same
    // event object can arrive twice. Process it only once.
    if (event.__h5pSdlInputSeen) {
      return;
    }
    event.__h5pSdlInputSeen = true;

    if (!runner.sdlCanvas?.isConnected) {
      return;
    }

    const rect = runner.sdlCanvas.getBoundingClientRect();
    const isOverCanvas = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;

    if (!isOverCanvas) {
      return;
    }

    // Bounding-rect containment alone is not enough: a SweetAlert input
    // dialog (e.g. for Python's input()) can be positioned on top of the
    // canvas area, so a click on the dialog would otherwise still count as
    // "over canvas" and steal focus back to the canvas before the browser
    // focuses the dialog's input field. Require that the click actually
    // landed on the canvas (or its own wrapper), not on an unrelated
    // overlay that merely happens to overlap its screen position.
    const eventTarget = event.target;
    const ownScope = runner.canvasWrapper || runner.canvasDiv || runner.sdlCanvas;
    // A missing target (e.g. a synthetically constructed event) cannot prove
    // the click landed elsewhere, so it is treated permissively; only an
    // explicit target outside the canvas scope disqualifies the event.
    const targetIsWithinCanvasScope = !eventTarget
      || eventTarget === runner.sdlCanvas
      || Boolean(
        ownScope
        && typeof ownScope.contains === 'function'
        && ownScope.contains(eventTarget),
      );

    if (!targetIsWithinCanvasScope) {
      return;
    }

    const isPressEvent = event.type === 'pointerdown'
      || event.type === 'mousedown'
      || event.type === 'touchstart'
      || event.type === 'click';

    // Rebinding the SDL canvas and moving focus are only needed when the
    // learner actively clicks/taps; doing it per pointer move is expensive.
    if (isPressEvent) {
      runner.bindSDLCanvas();

      const activeElement = document.activeElement;
      const ownCanvasScope = runner.canvasWrapper || runner.canvasDiv || runner.sdlCanvas;
      const focusIsInsideOwnCanvas = Boolean(
        ownCanvasScope
        && activeElement
        && typeof ownCanvasScope.contains === 'function'
        && ownCanvasScope.contains(activeElement),
      ) || activeElement === runner.sdlCanvas;

      if (!focusIsInsideOwnCanvas && typeof runner.sdlCanvas?.focus === 'function') {
        runner.sdlCanvas.focus({ preventScroll: true });
      }
    }

    // Fallback bridge: feed pygame queue from DOM events.
    postSyntheticPygameMouseEvent(runner, event, rect);
  };

  SDL_MOUSE_EVENT_TYPES.forEach((type) => {
    document.addEventListener(type, runner._sdlMouseCaptureBound, true);
    runner.sdlCanvas.addEventListener(type, runner._sdlMouseCaptureBound, true);
  });

  runner._sdlMouseCaptureInstalled = true;
}

/**
 * Removes mouse event handling from SDL canvas.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function uninstallSDLMouseCapture(runner) {
  if (!runner._sdlMouseCaptureInstalled || !runner._sdlMouseCaptureBound || typeof document?.removeEventListener !== 'function') {
    return;
  }

  SDL_MOUSE_EVENT_TYPES.forEach((type) => {
    document.removeEventListener(type, runner._sdlMouseCaptureBound, true);
    if (runner.sdlCanvas?.isConnected) {
      runner.sdlCanvas.removeEventListener(type, runner._sdlMouseCaptureBound, true);
    }
  });

  runner._sdlMouseCaptureBound = null;
  runner._sdlMouseCaptureInstalled = false;
}

/**
 * Installs the lightweight pygame event pump helper once per runner.
 * @param {object} runner - PyodideRunner instance.
 * @returns {Promise<void>} Resolves once the helper is available.
 */
export function ensureSDLEventPumpFunction(runner) {
  if (typeof runner.pyodide?.runPythonAsync !== 'function') {
    return Promise.resolve();
  }

  if (runner._sdlEventPumpFunctionInstalled) {
    return Promise.resolve();
  }

  if (runner._sdlEventPumpInstallPromise) {
    return runner._sdlEventPumpInstallPromise;
  }

  runner._sdlEventPumpInstallPromise = runner.pyodide.runPythonAsync(`
def _h5p_pygame_event_pump():
    try:
        import pygame
        pygame.event.pump()
    except Exception:
        pass
`).then(() => {
    runner._sdlEventPumpFunctionInstalled = true;
  }).catch((error) => {
    runner._sdlEventPumpFunctionInstalled = false;
    throw error;
  }).finally(() => {
    runner._sdlEventPumpInstallPromise = null;
  });

  return runner._sdlEventPumpInstallPromise;
}

/**
 * Returns whether the periodic pygame event pump should run now.
 * @param {object} runner - PyodideRunner instance.
 * @param {object} [sharedState] - Shared runtime state.
 * @returns {boolean} True when this runner owns the visible SDL canvas.
 */
export function shouldRunSDLEventPump(runner, sharedState = sharedPyodideRuntimeState) {
  if (typeof runner.pyodide?.runPythonAsync !== 'function' || runner.stopped || !runner.sdlCanvas?.isConnected) {
    return false;
  }

  if (sharedState.activeSDLRunner !== runner) {
    return false;
  }

  const pageName = runner.runtime?.codeContainer?.getPageManager?.().activePageName;
  return !pageName || pageName === 'canvas';
}

/**
 * Starts a periodic pygame.event.pump() loop while SDL canvas is active.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function startSDLEventPumpLoop(runner) {
  if (runner._sdlEventPumpInterval != null || typeof window?.setInterval !== 'function') {
    return;
  }

  ensureSDLEventPumpFunction(runner).catch(() => {
    // Keep startup non-fatal; the interval retries while SDL remains active.
  });

  runner._sdlEventPumpInterval = window.setInterval(() => {
    if (!shouldRunSDLEventPump(runner)) {
      return;
    }

    if (runner._sdlEventPumpInFlight) {
      return;
    }

    runner._sdlEventPumpInFlight = true;
    ensureSDLEventPumpFunction(runner).then(() => {
      if (!shouldRunSDLEventPump(runner)) {
        return undefined;
      }

      return runner.pyodide.runPythonAsync('_h5p_pygame_event_pump()');
    }).catch(() => {
      // Keep loop alive even if pygame is temporarily unavailable.
    }).finally(() => {
      runner._sdlEventPumpInFlight = false;
    });
  }, 50);
}

/**
 * Stops the periodic pygame.event.pump() loop.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function stopSDLEventPumpLoop(runner) {
  if (runner._sdlEventPumpInterval == null || typeof window?.clearInterval !== 'function') {
    return;
  }

  window.clearInterval(runner._sdlEventPumpInterval);
  runner._sdlEventPumpInterval = null;
}
import { sharedPyodideRuntimeState } from './pyodide-runtime-service';
