import { SDL_KEYBOARD_ELEMENT_ID } from './pyodide-sdl-constants';

/**
 * Builds the Python compatibility preamble installed once per Pyodide instance.
 *
 * Patches asyncio.run() to track a cancellable background task (so miniworlds/pygame loops can
 * be stopped from JS), rewrites input()-calling functions to run under asyncio via an AST
 * transform (Pyodide has no synchronous input()), scopes pygame-ce's SDL keyboard capture to the
 * active canvas, forwards JS-side pygame events into pygame's event queue, and installs the
 * execution-limit sys.settrace() hooks used by setPyodideExecutionLimit()/clearPyodideExecutionLimit().
 * @returns {string} Python source to run once per Pyodide instance.
 */
export function getPyodideCompatibilityPreamble() {
  return `
import asyncio
import ast as _h5p_ast
import builtins as _h5p_builtins
import os as _h5p_os
import sys as _h5p_sys
import time as _h5p_time

if not globals().get('_h5p_runtime_compat_installed', False):
  _h5p_os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'
  # pygame-ce's emscripten SDL2 build otherwise binds its native keyboard
  # listener to the whole document, which swallows keystrokes meant for an
  # unrelated input() dialog no matter where DOM focus actually is. Scoping
  # it to the active SDL canvas element (see SDL_KEYBOARD_ELEMENT_ID) means
  # SDL only sees keys while the canvas itself has focus. Must be set before
  # the first pygame.init()/SDL_Init() call.
  _h5p_os.environ['SDL_EMSCRIPTEN_KEYBOARD_ELEMENT'] = '#${SDL_KEYBOARD_ELEMENT_ID}'
  _h5p_original_asyncio_run = asyncio.run
  _h5p_background_task = None
  _h5p_background_task_started = False
  _h5p_execution_limit_ms = 0
  _h5p_execution_limit_started = 0.0
  _h5p_execution_limit_message = 'Execution limit exceeded.'
  _h5p_original_import = _h5p_builtins.__import__
  _h5p_previous_trace = None

  def _h5p_execution_limit_trace(frame, event, arg, _h5p_time=_h5p_time):
    if _h5p_execution_limit_ms > 0 and event in ('call', 'line'):
      elapsed_ms = (_h5p_time.monotonic() - _h5p_execution_limit_started) * 1000
      if elapsed_ms > _h5p_execution_limit_ms:
        raise TimeoutError(_h5p_execution_limit_message)
    return _h5p_execution_limit_trace

  def _h5p_set_execution_limit(limit_ms, message):
    import sys as _h5p_sys_local

    global _h5p_execution_limit_ms
    global _h5p_execution_limit_started
    global _h5p_execution_limit_message
    global _h5p_previous_trace

    _h5p_previous_trace = _h5p_sys_local.gettrace()
    _h5p_execution_limit_ms = max(int(limit_ms or 0), 0)
    _h5p_execution_limit_message = str(message)

    if _h5p_execution_limit_ms > 0:
      _h5p_execution_limit_started = _h5p_time.monotonic()
      _h5p_sys_local.settrace(_h5p_execution_limit_trace)
    else:
      _h5p_execution_limit_started = 0.0
      _h5p_sys_local.settrace(_h5p_previous_trace)

  def _h5p_clear_execution_limit():
    import sys as _h5p_sys_local

    global _h5p_execution_limit_ms
    global _h5p_execution_limit_started
    global _h5p_previous_trace

    _h5p_sys_local.settrace(_h5p_previous_trace)
    _h5p_previous_trace = None
    _h5p_execution_limit_ms = 0
    _h5p_execution_limit_started = 0.0

  def _h5p_reset_background_task_state():
    global _h5p_background_task, _h5p_background_task_started
    _h5p_background_task = None
    _h5p_background_task_started = False

  def _h5p_consume_js_pygame_event_queue():
    try:
      from js import window as _h5p_window
    except Exception:
      return []

    queue = getattr(_h5p_window, '__h5pPygameEventQueue', None)
    if queue is None:
      return []

    events = []

    try:
      while int(getattr(queue, 'length', 0)) > 0:
        item = queue.shift()
        if item is None:
          continue

        if hasattr(item, 'to_py'):
          item = item.to_py()

        if isinstance(item, dict):
          events.append(item)
    except Exception:
      return events

    return events

  def _h5p_patch_pygame_event_get():
    try:
      import pygame
    except Exception:
      return

    if getattr(pygame.event, '_h5p_patched_get', False):
      return

    _h5p_original_pygame_event_get = pygame.event.get

    def _h5p_event_get(*args, **kwargs):
      events = list(_h5p_original_pygame_event_get(*args, **kwargs))

      for payload in _h5p_consume_js_pygame_event_queue():
        event_type_name = str(payload.get('type') or '')
        event_type = getattr(pygame, event_type_name, None)
        if event_type is None:
          continue

        attrs = payload.get('attrs') or {}
        try:
          attrs = dict(attrs)
        except Exception:
          attrs = {}

        try:
          events.append(pygame.event.Event(event_type, attrs))
        except Exception:
          continue

      return events

    pygame.event.get = _h5p_event_get
    pygame.event._h5p_patched_get = True

  def _h5p_import(name, globals=None, locals=None, fromlist=(), level=0):
    module = _h5p_original_import(name, globals, locals, fromlist, level)

    try:
      if str(name).split('.', 1)[0] == 'pygame':
        _h5p_patch_pygame_event_get()
    except Exception:
      pass

    return module

  def _h5p_has_background_task():
    return bool(
      _h5p_background_task_started
      and _h5p_background_task is not None
      and not _h5p_background_task.done()
    )

  async def _h5p_cancel_background_task():
    global _h5p_background_task, _h5p_background_task_started

    miniworlds_app = None

    try:
      import miniworlds
      running_app = getattr(miniworlds.App, 'running_app', None)
      miniworlds_app = getattr(miniworlds, 'App', None)
      if running_app is not None:
        running_app.quit()
    except Exception:
      pass

    task = _h5p_background_task
    if task is None:
      try:
        if miniworlds_app is not None and hasattr(miniworlds_app, 'reset'):
          miniworlds_app.reset()
      except Exception:
        pass
      _h5p_background_task_started = False
      return False

    if task.done():
      try:
        if miniworlds_app is not None and hasattr(miniworlds_app, 'reset'):
          miniworlds_app.reset()
      except Exception:
        pass
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

    try:
      if miniworlds_app is not None and hasattr(miniworlds_app, 'reset'):
        miniworlds_app.reset()
    except Exception:
      pass

    _h5p_background_task = None
    _h5p_background_task_started = False
    return True

  class _h5p_async_input_function_discoverer(_h5p_ast.NodeVisitor):
    def __init__(self, async_function_names):
      super().__init__()
      self.async_function_names = async_function_names
      self.contains_async_input = False
      self._nested_function_depth = 0

    def visit_FunctionDef(self, node):
      if self._nested_function_depth == 0 and node.name in self.async_function_names:
        self.contains_async_input = True
        return

      self._nested_function_depth += 1
      if self._nested_function_depth == 1:
        for child in node.body:
          self.visit(child)
      self._nested_function_depth -= 1

    def visit_AsyncFunctionDef(self, node):
      return

    def visit_Call(self, node):
      if (
        isinstance(node.func, _h5p_ast.Name)
        and (
          node.func.id == 'input'
          or node.func.id in self.async_function_names
        )
      ):
        self.contains_async_input = True
      self.generic_visit(node)

  class _h5p_await_input_transformer(_h5p_ast.NodeTransformer):
    def __init__(self, async_function_names):
      super().__init__()
      self.async_function_names = async_function_names
      self._inside_await = False

    def visit_FunctionDef(self, node):
      self.generic_visit(node)
      if node.name not in self.async_function_names:
        return node

      return _h5p_ast.copy_location(_h5p_ast.AsyncFunctionDef(
        name=node.name,
        args=node.args,
        body=node.body,
        decorator_list=node.decorator_list,
        returns=node.returns,
        type_comment=getattr(node, 'type_comment', None),
      ), node)

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
        and (
          node.func.id == 'input'
          or node.func.id in self.async_function_names
        )
      ):
        return _h5p_ast.copy_location(_h5p_ast.Await(value=node), node)
      return node

  def _h5p_discover_async_input_function_names(tree):
    discovered_async_function_names = set()
    changed = True

    while changed:
      changed = False
      for node in tree.body:
        if not isinstance(node, _h5p_ast.FunctionDef):
          continue
        if node.name in discovered_async_function_names:
          continue

        discoverer = _h5p_async_input_function_discoverer(discovered_async_function_names)
        for child in node.body:
          discoverer.visit(child)

        if discoverer.contains_async_input:
          discovered_async_function_names.add(node.name)
          changed = True

    return discovered_async_function_names

  def _h5p_build_async_input_module(source):
    source = '' if source is None else str(source)
    tree = _h5p_ast.parse(source, mode='exec')
    discovered_async_function_names = _h5p_discover_async_input_function_names(tree)
    transformed_body = _h5p_await_input_transformer(discovered_async_function_names).visit(tree).body

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

  async def _h5p_wrap_background_coro(coro):
    try:
      return await coro
    except SystemExit as error:
      # miniworlds exits with sys.exit(0) after normal shutdown.
      # In Pyodide background tasks this must not surface as uncaught error.
      code = getattr(error, 'code', 0)
      if code in (0, None):
        return code
      raise

  def _h5p_track_background_task(task):
    global _h5p_background_task, _h5p_background_task_started

    _h5p_background_task = task
    _h5p_background_task_started = True

    def _h5p_finalize_background_task(done_task):
      try:
        error = done_task.exception()
      except asyncio.CancelledError:
        return
      except BaseException:
        return

      if isinstance(error, SystemExit):
        code = getattr(error, 'code', 0)
        if code in (0, None):
          return

      if error is not None:
        try:
          done_task.get_loop().call_exception_handler({
            'message': 'Unhandled exception in H5P background task',
            'exception': error,
            'task': done_task,
          })
        except Exception:
          pass

    task.add_done_callback(_h5p_finalize_background_task)
    return task

  def _h5p_asyncio_run(main, *args, **kwargs):
    global _h5p_background_task, _h5p_background_task_started

    _h5p_background_task = None
    _h5p_background_task_started = False

    try:
      result = _h5p_original_asyncio_run(main, *args, **kwargs)
      if isinstance(result, asyncio.Task):
        return _h5p_track_background_task(result)
      return result
    except SystemExit as error:
      code = getattr(error, 'code', 0)
      if code in (0, None):
        return code
      raise
    except RuntimeError as error:
      try:
        loop = asyncio.get_running_loop()
      except RuntimeError:
        loop = None

      # If no running loop is available, this RuntimeError was unrelated and
      # should be surfaced to the caller.
      if loop is None:
        message = str(error)
        if (
          'event loop is running' in message
          or 'WebAssembly stack switching not supported' in message
        ):
          loop = asyncio.get_event_loop()
        else:
          raise

      task = loop.create_task(_h5p_wrap_background_coro(main))
      return _h5p_track_background_task(task)

  _h5p_builtins.__import__ = _h5p_import
  _h5p_patch_pygame_event_get()
  asyncio.run = _h5p_asyncio_run
  globals()['_h5p_runtime_compat_installed'] = True
`;
}
