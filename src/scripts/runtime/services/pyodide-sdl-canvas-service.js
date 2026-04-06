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
 * Synchronizes the SDL canvas display size with its current host dimensions.
 *
 * Uses CSS style scaling rather than changing canvas.width/canvas.height so
 * that the logical coordinate space set by pygame.display.set_mode() is
 * preserved. Changing the pixel dimensions would shift SDL's coordinate origin
 * and cause mouse events to map to wrong game positions.
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
    runner.sdlCanvas.style.width = `${width}px`;
    runner.sdlCanvas.style.height = `${height}px`;
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
