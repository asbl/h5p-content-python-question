import { getPythonL10nValue } from '../../services/python-l10n';
import { ensureP5Script } from './p5-runtime-service';

/** Owns the p5 and SDL canvas mounting lifecycle for a Pyodide runner. */
export default class PyodideCanvasService {
  constructor(runner) {
    this.runner = runner;
  }

  setupP5(canvasDiv) {
    const runner = this.runner;
    if (!window.p5) {
      console.error(getPythonL10nValue(runner.l10n, 'pyodideP5Missing'));
      return;
    }

    const learnerSetup = typeof window.setup === 'function' ? window.setup : null;
    const learnerDraw = typeof window.draw === 'function' ? window.draw : null;
    runner.restoreP5WindowBindings();
    runner.p5Instance?.remove?.();
    runner.p5Instance = null;
    canvasDiv.replaceChildren();
    runner.canvasDiv = canvasDiv;

    const sketch = (p) => {
      runner.p5Instance = p;
      if (learnerSetup) p.setup = () => learnerSetup();
      if (learnerDraw) {
        p.draw = () => {
          if (runner.stopped) {
            p.noLoop();
            return;
          }
          learnerDraw();
        };
      }
      if (learnerSetup) runner.bindP5WindowFunction('setup', (...args) => p.setup?.(...args));
      if (learnerDraw) runner.bindP5WindowFunction('draw', (...args) => p.draw?.(...args));
      Object.getOwnPropertyNames(p.__proto__).forEach((name) => {
        if (name !== 'constructor' && typeof p[name] === 'function') {
          runner.bindP5WindowFunction(name, (...args) => p[name](...args));
        }
      });
    };
    runner.p5Instance = new window.p5(sketch, canvasDiv);
  }

  setupSDLCanvas(canvasDiv) {
    const runner = this.runner;
    if (!canvasDiv || !runner.pyodide?.canvas?.setCanvas2D) return null;
    runner.canvasDiv = canvasDiv;
    const existing = canvasDiv.querySelector('canvas.pyodide-sdl-canvas');
    if (existing) {
      if (runner.pyodide?._api) runner.pyodide._api._skip_unwind_fatal_error = true;
      return runner.finalizeSDLCanvasSetup(existing);
    }

    canvasDiv.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.classList.add('pyodide-sdl-canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'auto';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'auto';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Program canvas');
    canvasDiv.append(canvas);
    if (runner.pyodide?._api) runner.pyodide._api._skip_unwind_fatal_error = true;
    return runner.finalizeSDLCanvasSetup(canvas);
  }

  addCanvas(canvasWrapper, canvasDiv, canvasRuntimeManager = null) {
    const runner = this.runner;
    if (!canvasDiv) return;
    runner.canvasWrapper = canvasWrapper;
    runner.canvasDiv = canvasDiv;
    runner.canvasRuntimeManager = canvasRuntimeManager;
    runner.setCanvasLoading(true);

    if (runner.runtime.containsP5Code()) {
      ensureP5Script(runner.options.p5CdnUrl)
        .then(() => {
          this.setupP5(canvasDiv);
          runner.setCanvasLoading(false);
        })
        .catch((error) => {
          runner.setCanvasLoading(false);
          runner.onError(error);
        });
      return;
    }
    if (runner.runtime.containsSDLCode()) {
      runner.setup()
        .then(() => {
          this.setupSDLCanvas(canvasDiv);
          runner.setCanvasLoading(false);
        })
        .catch((error) => {
          runner.setCanvasLoading(false);
          runner.onError(error);
        });
      return;
    }
    if (!runner._isInitialized) {
      runner.setup().then(() => runner.setCanvasLoading(false)).catch((error) => {
        runner.setCanvasLoading(false);
        runner.onError(error);
      });
      return;
    }
    runner.setCanvasLoading(false);
  }
}
