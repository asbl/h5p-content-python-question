import { setActivePyodideSDLCanvas } from './pyodide-runtime-service';

/**
 * Binds SDL rendering to the current visible canvas.
 * @param {object} runner - PyodideRunner instance.
 * @param {boolean} [focus] - Whether keyboard focus should move to the canvas.
 * @returns {void}
 */
export function bindSDLCanvas(runner, focus = false) {
  if (!runner.sdlCanvas) {
    return;
  }

  setActivePyodideSDLCanvas(runner.sdlCanvas);
  runner.pyodide?.canvas?.setCanvas2D?.(runner.sdlCanvas);

  if (focus && runner.sdlCanvas.isConnected && typeof runner.sdlCanvas.focus === 'function') {
    runner.sdlCanvas.focus({ preventScroll: true });
  }
}

/**
 * Synchronizes the SDL canvas pixel size with its current host dimensions.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function syncSDLCanvasSize(runner) {
  if (!runner.sdlCanvas || !runner.canvasDiv) {
    return;
  }

  const width = runner.canvasDiv.clientWidth;
  const height = runner.canvasDiv.clientHeight;

  if (width > 0 && height > 0) {
    if (runner.sdlCanvas.width !== width) {
      runner.sdlCanvas.width = width;
    }

    if (runner.sdlCanvas.height !== height) {
      runner.sdlCanvas.height = height;
    }
  }
}

/**
 * Rebinds SDL canvas over multiple ticks to avoid browser-specific timing races.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function scheduleSDLCanvasRebind(runner) {
  syncSDLCanvasSize(runner);
  bindSDLCanvas(runner);

  if (typeof window?.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      syncSDLCanvasSize(runner);
      bindSDLCanvas(runner);
    });
  }
}
