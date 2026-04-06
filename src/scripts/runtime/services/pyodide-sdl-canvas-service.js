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
 *
 * The canvas always fills the full container width; height is derived from
 * the world's aspect ratio. Using containerH as a second constraint would
 * create a circular dependency (canvasDiv.clientHeight is set by the canvas
 * CSS height itself) that locks small or square worlds to a narrower display
 * than the available container width.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function syncSDLCanvasSize(runner) {
  if (!runner.sdlCanvas || !runner.canvasDiv) {
    return;
  }

  const containerW = runner.canvasDiv.clientWidth;

  if (containerW <= 0) {
    return;
  }

  const logicalW = runner.sdlCanvas.width;
  const logicalH = runner.sdlCanvas.height;

  if (logicalW > 0 && logicalH > 0) {
    // Scale to fill the full container width; height follows from the aspect ratio.
    const scale = containerW / logicalW;
    runner.sdlCanvas.style.width = `${Math.round(logicalW * scale)}px`;
    runner.sdlCanvas.style.height = `${Math.round(logicalH * scale)}px`;
  }
  else {
    // Canvas not yet initialised (pygame hasn't called set_mode yet); use a 4:3
    // placeholder so the div has a visible height before the game starts.
    runner.sdlCanvas.style.width = `${containerW}px`;
    runner.sdlCanvas.style.height = `${Math.round(containerW * 0.75)}px`;
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
