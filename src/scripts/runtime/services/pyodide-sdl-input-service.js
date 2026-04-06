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

/**
 * Posts a synthetic pygame mouse event as fallback for missing SDL bridges.
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

  const pythonCode = pygameEventType === 'MOUSEMOTION'
    ? `import pygame\npygame.event.post(pygame.event.Event(pygame.MOUSEMOTION, {'pos': (${x}, ${y}), 'rel': (0, 0), 'buttons': (${buttons & 1}, ${Boolean(buttons & 4) ? 1 : 0}, ${Boolean(buttons & 2) ? 1 : 0}), 'touch': False}))`
    : `import pygame\npygame.event.post(pygame.event.Event(pygame.${pygameEventType}, {'pos': (${x}, ${y}), 'button': ${button}, 'touch': False}))`;

  if (typeof window !== 'undefined') {
    window.__h5pSyntheticMousePosted = (window.__h5pSyntheticMousePosted || 0) + 1;
  }

  runner.pyodide.runPythonAsync(pythonCode).catch(() => {
    // Ignore fallback posting failures to avoid interrupting execution.
  });
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

    // Suppress the corresponding legacy mouse event (mousedown/mousemove/mouseup)
    // that browsers synthesise after pointer events. emscripten SDL hooks into
    // those legacy events, so without this suppression every click or move
    // produces one native SDL event AND one synthetic event posted below,
    // causing double-fire (e.g. on_mouse_left_down toggles back immediately).
    if (typeof event.preventDefault === 'function'
      && typeof event.type === 'string'
      && event.type.startsWith('pointer')) {
      event.preventDefault();
    }

    // Keep SDL bound to the visible canvas right before input is processed.
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

    // Fallback bridge: feed pygame queue from DOM events.
    postSyntheticPygameMouseEvent(runner, event, rect);
  };

  // Register on document only (capture phase).  Installing the same handler
  // on the canvas element too would cause a second invocation for every event
  // that originates on the canvas, resulting in two synthetic pygame events
  // per user action.
  SDL_MOUSE_EVENT_TYPES.forEach((type) => {
    document.addEventListener(type, runner._sdlMouseCaptureBound, true);
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
  });

  runner._sdlMouseCaptureBound = null;
  runner._sdlMouseCaptureInstalled = false;
}

/**
 * Starts a periodic pygame.event.pump() loop while SDL canvas is active.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function startSDLEventPumpLoop(runner) {
  if (runner._sdlEventPumpInterval !== null || typeof window?.setInterval !== 'function') {
    return;
  }

  runner._sdlEventPumpInterval = window.setInterval(() => {
    if (!runner.pyodide || runner.stopped || !runner.sdlCanvas?.isConnected) {
      return;
    }

    runner.pyodide.runPythonAsync('import pygame\\npygame.event.pump()').catch(() => {
      // Keep loop alive even if pygame is temporarily unavailable.
    });
  }, 50);
}

/**
 * Stops the periodic pygame.event.pump() loop.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function stopSDLEventPumpLoop(runner) {
  if (runner._sdlEventPumpInterval === null || typeof window?.clearInterval !== 'function') {
    return;
  }

  window.clearInterval(runner._sdlEventPumpInterval);
  runner._sdlEventPumpInterval = null;
}
