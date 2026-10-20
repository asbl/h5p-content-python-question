import {
  createTkinterOpenPort,
  createWaitMessageRegistry,
  installPyodideTurtleModule,
  setupPyodideTkinterBridge,
} from '../scripts/runtime/services/pyodide-tkinter-service.js';

/**
 * Smoke-test entry: exposes the real tkinter service on the window object so
 * the browser regression harness can drive it without a full H5P host.
 * Built by webpack.smoke.config.js, never shipped with the library.
 */
window.H5PTkinterSmoke = {
  createTkinterOpenPort,
  createWaitMessageRegistry,
  installPyodideTurtleModule,
  setupPyodideTkinterBridge,
};
