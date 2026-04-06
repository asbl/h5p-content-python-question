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
 * The scaling preserves the canvas aspect ratio (set by pygame.display.set_mode)
 * by fitting it within the container using uniform scaling (no stretch).
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function syncSDLCanvasSize(runner) {
  if (!runner.sdlCanvas || !runner.canvasDiv) {
    return;
  }

  const containerW = runner.canvasDiv.clientWidth;
  const containerH = runner.canvasDiv.clientHeight;

  if (containerW <= 0 || containerH <= 0) {
    return;
  }

  const logicalW = runner.sdlCanvas.width;
  const logicalH = runner.sdlCanvas.height;

  if (logicalW > 0 && logicalH > 0) {
    // Scale uniformly so the canvas fits within the container without distortion.
    const scale = Math.min(containerW / logicalW, containerH / logicalH);
    runner.sdlCanvas.style.width = `${Math.round(logicalW * scale)}px`;
    runner.sdlCanvas.style.height = `${Math.round(logicalH * scale)}px`;
  }
  else {
    runner.sdlCanvas.style.width = `${containerW}px`;
    runner.sdlCanvas.style.height = `${containerH}px`;
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
