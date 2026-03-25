/* global loadPyodide */

import {
  getPythonL10nValue,
  tPython,
} from '../../services/python-l10n';
import { normalizePythonExecutionLimit } from '../../services/python-execution-limit';

/**
 * Shared Pyodide loader state across all runner instances.
 * Per-instance Pyodide state is stored in a WeakMap keyed by the Pyodide object.
 * @type {{loadPyodidePromise: Promise<*>|null, sharedPyodidePromise: Promise<*>|null, inputOverridePromise: Promise<*>|null, compatibilityPromise: Promise<*>|null, activeRuntime: object|null, activeSDLCanvas: HTMLCanvasElement|null, loadedPackages: Set<string>, pyodideInstanceState: WeakMap<object, {compatibilityPromise: Promise<*>|null, inputOverridePromise: Promise<*>|null, loadedPackages: Set<string>}>}}
 */
export const sharedPyodideRuntimeState = {
  compatibilityPromise: null,
  loadPyodidePromise: null,
  sharedPyodidePromise: null,
  inputOverridePromise: null,
  activeRuntime: null,
  activeSDLCanvas: null,
  loadedPackages: new Set(),
  pyodideInstanceState: new WeakMap(),
};

/**
 * Returns the mutable state associated with one concrete Pyodide instance.
 * @param {object} pyodide - Pyodide instance.
 * @returns {{compatibilityPromise: Promise<*>|null, inputOverridePromise: Promise<*>|null, loadedPackages: Set<string>}} Instance state.
 */
export function getPyodideInstanceState(pyodide) {
  let instanceState = sharedPyodideRuntimeState.pyodideInstanceState.get(pyodide);

  if (!instanceState) {
    instanceState = {
      compatibilityPromise: null,
      inputOverridePromise: null,
      loadedPackages: new Set(),
    };
    sharedPyodideRuntimeState.pyodideInstanceState.set(pyodide, instanceState);
  }

  return instanceState;
}

/**
 * Returns the package registry for one concrete Pyodide instance.
 * @param {object} pyodide - Pyodide instance.
 * @returns {Set<string>} Loaded package names.
 */
export function getLoadedPyodidePackages(pyodide) {
  return getPyodideInstanceState(pyodide).loadedPackages;
}

/**
 * Resets shared runtime state for tests or hard reloads.
 * @returns {void}
 */
export function resetSharedPyodideRuntimeState() {
  sharedPyodideRuntimeState.compatibilityPromise = null;
  sharedPyodideRuntimeState.loadPyodidePromise = null;
  sharedPyodideRuntimeState.sharedPyodidePromise = null;
  sharedPyodideRuntimeState.inputOverridePromise = null;
  sharedPyodideRuntimeState.activeRuntime = null;
  sharedPyodideRuntimeState.activeSDLCanvas = null;
  sharedPyodideRuntimeState.loadedPackages.clear();
  sharedPyodideRuntimeState.pyodideInstanceState = new WeakMap();
}

/**
 * Returns the active runtime localization map.
 * @returns {object} Runtime localization map.
 */
export function getActivePyodideL10n() {
  return sharedPyodideRuntimeState.activeRuntime?.l10n || {};
}

/**
 * Stores the runtime that currently owns the shared Pyodide instance.
 * @param {object|null} runtime - Active runtime.
 * @returns {void}
 */
export function setActivePyodideRuntime(runtime) {
  sharedPyodideRuntimeState.activeRuntime = runtime;
}

/**
 * Keeps exactly one SDL canvas bound to the global canvas id expected by SDL.
 * @param {HTMLCanvasElement|null} canvas - Next active SDL canvas.
 * @returns {void}
 */
export function setActivePyodideSDLCanvas(canvas) {
  const state = sharedPyodideRuntimeState;

  if (state.activeSDLCanvas && state.activeSDLCanvas !== canvas && state.activeSDLCanvas.id === 'canvas') {
    state.activeSDLCanvas.id = `canvas-inactive-${H5P.createUUID()}`;
  }

  if (!canvas) {
    if (state.activeSDLCanvas?.id === 'canvas') {
      state.activeSDLCanvas.id = `canvas-inactive-${H5P.createUUID()}`;
    }
    state.activeSDLCanvas = null;
    return;
  }

  canvas.id = 'canvas';
  state.activeSDLCanvas = canvas;
}

/**
 * Ensures that the Pyodide loader script is present exactly once.
 * @param {string} url - Pyodide script URL.
 * @returns {Promise<void>} Resolves when loadPyodide is available.
 */
export function ensurePyodideScript(url) {
  const state = sharedPyodideRuntimeState;

  if (typeof window === 'undefined') {
    return Promise.reject(new Error(tPython(getActivePyodideL10n(), 'pyodideMissingWindow')));
  }

  if (window.loadPyodide) {
    return Promise.resolve();
  }

  if (state.loadPyodidePromise) {
    return state.loadPyodidePromise;
  }

  state.loadPyodidePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.h5pPyodide = 'true';
    script.onload = () => {
      if (window.loadPyodide) {
        resolve();
        return;
      }

      reject(new Error(tPython(getActivePyodideL10n(), 'pyodideMissingApi')));
    };
    script.onerror = () => reject(new Error(tPython(getActivePyodideL10n(), 'pyodideScriptLoadFailed', { url })));
    document.head.appendChild(script);
  }).catch((error) => {
    state.loadPyodidePromise = null;
    throw error;
  });

  return state.loadPyodidePromise;
}

/**
 * Writes runtime output to the active runtime, or stderr if no runtime exists.
 * @param {string} text - Output text.
 * @param {boolean} [isError] - Whether the text is stderr.
 * @returns {void}
 */
export function writePyodideRuntimeOutput(text, runtimeOrIsError = false, isError = false) {
  const activeRuntime = (runtimeOrIsError && typeof runtimeOrIsError === 'object')
    ? runtimeOrIsError
    : sharedPyodideRuntimeState.activeRuntime;
  const treatAsError = typeof runtimeOrIsError === 'boolean' ? runtimeOrIsError : isError;

  if (activeRuntime?.outputHandler) {
    activeRuntime.outputHandler(text);
    return;
  }

  if (treatAsError) {
    console.error(text);
  }
}

/**
 * Reads runtime input from the active runtime input handler.
 * @param {string} [promptText] - Prompt shown to the learner.
 * @returns {Promise<string>} User input string.
 */
export function getPyodideRuntimeInput(promptText = '', runtime = null) {
  const activeRuntime = runtime || sharedPyodideRuntimeState.activeRuntime;
  const l10n = activeRuntime?.l10n || getActivePyodideL10n();

  if (activeRuntime?.inputHandler) {
    return Promise.resolve(
      activeRuntime.inputHandler(promptText || getPythonL10nValue(l10n, 'pythonInputPrompt')),
    ).then((value) => (typeof value === 'string' ? value : ''));
  }

  return Promise.resolve('');
}

/**
 * Installs the async input override once per shared Pyodide instance.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves when the override is installed.
 */
export function installPyodideInputOverride(pyodide, runtime = null) {
  const state = getPyodideInstanceState(pyodide);

  if (state.inputOverridePromise) {
    return state.inputOverridePromise;
  }

  pyodide.globals.set('input_handler', (prompt) => getPyodideRuntimeInput(prompt, runtime));

  state.inputOverridePromise = pyodide.runPythonAsync(`
import builtins

async def _h5p_input(prompt=''):
  return await input_handler(prompt)

builtins.input = _h5p_input
  `).catch((error) => {
    state.inputOverridePromise = null;
    throw error;
  });

  return state.inputOverridePromise;
}

/**
 * Installs Pyodide runtime compatibility helpers once.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves when compatibility helpers are installed.
 */
export function installPyodideRuntimeCompatibility(pyodide) {
  const state = getPyodideInstanceState(pyodide);

  if (state.compatibilityPromise) {
    return state.compatibilityPromise;
  }

  state.compatibilityPromise = pyodide.runPythonAsync(`
import asyncio
import ast as _h5p_ast
import sys as _h5p_sys
import time as _h5p_time

if not globals().get('_h5p_runtime_compat_installed', False):
  _h5p_original_asyncio_run = asyncio.run
  _h5p_background_task = None
  _h5p_background_task_started = False
  _h5p_execution_limit_ms = 0
  _h5p_execution_limit_started = 0.0
  _h5p_execution_limit_message = 'Execution limit exceeded.'
  _h5p_previous_trace = None

  def _h5p_execution_limit_trace(frame, event, arg):
    if _h5p_execution_limit_ms > 0 and event in ('call', 'line'):
      elapsed_ms = (_h5p_time.monotonic() - _h5p_execution_limit_started) * 1000
      if elapsed_ms > _h5p_execution_limit_ms:
        raise TimeoutError(_h5p_execution_limit_message)
    return _h5p_execution_limit_trace

  def _h5p_set_execution_limit(limit_ms, message):
    global _h5p_execution_limit_ms
    global _h5p_execution_limit_started
    global _h5p_execution_limit_message
    global _h5p_previous_trace

    _h5p_previous_trace = _h5p_sys.gettrace()
    _h5p_execution_limit_ms = max(int(limit_ms or 0), 0)
    _h5p_execution_limit_message = str(message)

    if _h5p_execution_limit_ms > 0:
      _h5p_execution_limit_started = _h5p_time.monotonic()
      _h5p_sys.settrace(_h5p_execution_limit_trace)
    else:
      _h5p_execution_limit_started = 0.0
      _h5p_sys.settrace(_h5p_previous_trace)

  def _h5p_clear_execution_limit():
    global _h5p_execution_limit_ms
    global _h5p_execution_limit_started
    global _h5p_previous_trace

    _h5p_sys.settrace(_h5p_previous_trace)
    _h5p_previous_trace = None
    _h5p_execution_limit_ms = 0
    _h5p_execution_limit_started = 0.0

  def _h5p_reset_background_task_state():
    global _h5p_background_task, _h5p_background_task_started
    _h5p_background_task = None
    _h5p_background_task_started = False

  def _h5p_has_background_task():
    return bool(
      _h5p_background_task_started
      and _h5p_background_task is not None
      and not _h5p_background_task.done()
    )

  async def _h5p_cancel_background_task():
    global _h5p_background_task, _h5p_background_task_started

    try:
      import miniworlds
      running_app = getattr(miniworlds.App, 'running_app', None)
      if running_app is not None:
        running_app.quit()
    except Exception:
      pass

    task = _h5p_background_task
    if task is None:
      _h5p_background_task_started = False
      return False

    if task.done():
      _h5p_background_task = None
      _h5p_background_task_started = False
      return False

    task.cancel()
    try:
      await task
    except asyncio.CancelledError:
      pass
    except BaseException:
      pass

    _h5p_background_task = None
    _h5p_background_task_started = False
    return True

  class _h5p_await_input_transformer(_h5p_ast.NodeTransformer):
    def __init__(self):
      super().__init__()
      self._inside_await = False

    def visit_Await(self, node):
      previous = self._inside_await
      self._inside_await = True
      self.generic_visit(node)
      self._inside_await = previous
      return node

    def visit_Call(self, node):
      self.generic_visit(node)
      if (
        not self._inside_await
        and isinstance(node.func, _h5p_ast.Name)
        and node.func.id == 'input'
      ):
        return _h5p_ast.copy_location(_h5p_ast.Await(value=node), node)
      return node

  def _h5p_build_async_input_module(source):
    source = '' if source is None else str(source)
    tree = _h5p_ast.parse(source, mode='exec')
    transformed_body = _h5p_await_input_transformer().visit(tree).body

    if not transformed_body:
      transformed_body = [_h5p_ast.Pass()]

    async_main = _h5p_ast.AsyncFunctionDef(
      name='_h5p_main',
      args=_h5p_ast.arguments(
        posonlyargs=[],
        args=[],
        kwonlyargs=[],
        kw_defaults=[],
        defaults=[]
      ),
      body=transformed_body,
      decorator_list=[],
      returns=None,
      type_comment=None,
    )

    module = _h5p_ast.Module(body=[async_main], type_ignores=[])

    return _h5p_ast.fix_missing_locations(module)

  async def _h5p_run_with_async_input(source):
    module = _h5p_build_async_input_module(source)
    namespace = globals()
    exec(compile(module, '<h5p-learner-code>', 'exec'), namespace, namespace)
    return await namespace['_h5p_main']()

  def _h5p_asyncio_run(main, *args, **kwargs):
    global _h5p_background_task, _h5p_background_task_started

    _h5p_background_task = None
    _h5p_background_task_started = False

    try:
      return _h5p_original_asyncio_run(main, *args, **kwargs)
    except RuntimeError as error:
      message = str(error)
      if (
        'event loop is running' not in message
        and 'WebAssembly stack switching not supported' not in message
      ):
        raise

      try:
        loop = asyncio.get_running_loop()
      except RuntimeError:
        loop = asyncio.get_event_loop()

      task = loop.create_task(main)
      _h5p_background_task = task
      _h5p_background_task_started = True
      return task

  asyncio.run = _h5p_asyncio_run
  globals()['_h5p_runtime_compat_installed'] = True
`).catch((error) => {
    state.compatibilityPromise = null;
    throw error;
  });

  return state.compatibilityPromise;
}

/**
 * Resets the tracked background-task state inside Python.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves when the state was reset.
 */
export async function resetPyodideBackgroundTaskState(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  await pyodide.runPythonAsync('_h5p_reset_background_task_state()');
}

/**
 * Checks whether a background task is still running.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<boolean>} True if a background task exists.
 */
export async function hasPyodideBackgroundTask(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  return Boolean(await pyodide.runPythonAsync('_h5p_has_background_task()'));
}

/**
 * Cancels the current background task if present.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<boolean>} True if a task was cancelled.
 */
export async function cancelPyodideBackgroundTask(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  return Boolean(await pyodide.runPythonAsync('await _h5p_cancel_background_task()'));
}

/**
 * Applies the execution limit trace for the next Pyodide run.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {number} executionLimit - Maximum runtime in milliseconds.
 * @param {string} message - Localized timeout message.
 * @returns {Promise<void>} Resolves once the trace hook is installed.
 */
export async function setPyodideExecutionLimit(pyodide, executionLimit, message) {
  await installPyodideRuntimeCompatibility(pyodide);

  const safeLimit = normalizePythonExecutionLimit(executionLimit);

  if (safeLimit <= 0) {
    await clearPyodideExecutionLimit(pyodide);
    return;
  }

  await pyodide.runPythonAsync(`_h5p_set_execution_limit(${safeLimit}, ${JSON.stringify(String(message || 'Execution limit exceeded.'))})`);
}

/**
 * Removes the active execution limit trace hook.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves once the trace hook is removed.
 */
export async function clearPyodideExecutionLimit(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  await pyodide.runPythonAsync('_h5p_clear_execution_limit()');
}

/**
 * Returns a fresh Pyodide instance while sharing only the loader script.
 * @param {object} [options] - Runtime options.
 * @param {string} [options.pyodideCdnUrl] - Optional CDN override.
 * @param {object|null} [runtime] - Owning runtime for bound IO handlers.
 * @returns {Promise<object>} Isolated Pyodide instance.
 */
export async function getSharedPyodide(options = {}, runtime = null) {
  const cdnUrl = options.pyodideCdnUrl || 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js';

  await ensurePyodideScript(cdnUrl);

  const pyodide = await loadPyodide({
    stdout: (text) => writePyodideRuntimeOutput(text, runtime),
    stderr: (text) => writePyodideRuntimeOutput(text, runtime, true),
    stdin: () => '\n',
  });

  await installPyodideInputOverride(pyodide, runtime);

  return pyodide;
}