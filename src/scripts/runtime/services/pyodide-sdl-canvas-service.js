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
 * Strategy: display the canvas at its natural 1:1 logical size, but cap it at
 * the container width via max-width:100% (set once in setupSDLCanvas).
 * Setting height:auto + aspect-ratio instead of an explicit pixel height means
 * that CSS scaling is self-consistent: if the container narrows after setup,
 * both width and height shrink proportionally without distortion, even without
 * a ResizeObserver.
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
    // Natural 1:1 size; max-width:100% (set on the element) caps it at the
    // container width. height:auto derives from width via aspect-ratio.
    runner.sdlCanvas.style.width = `${logicalW}px`;
    runner.sdlCanvas.style.height = 'auto';
    runner.sdlCanvas.style.aspectRatio = `${logicalW} / ${logicalH}`;
  }
  else {
    // Canvas not yet initialised (pygame hasn't called set_mode yet).
    // Use container width with a 4:3 placeholder so the div has visible height.
    runner.sdlCanvas.style.width = `${containerW}px`;
    runner.sdlCanvas.style.height = 'auto';
    runner.sdlCanvas.style.aspectRatio = '4 / 3';
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
