# Python compatibility preamble installed once per Pyodide instance.
#
# Patches asyncio.run() to track a cancellable background task (so
# miniworlds/pygame loops can be stopped from JS), rewrites input()-calling
# functions to run under asyncio via an AST transform (Pyodide has no
# synchronous input()), scopes pygame-ce's SDL keyboard capture to the active
# canvas, forwards JS-side pygame events into pygame's event queue, and
# installs the execution-limit sys.settrace() hooks used by
# setPyodideExecutionLimit()/clearPyodideExecutionLimit().
#
# The __H5P_SDL_KEYBOARD_ELEMENT_ID__ placeholder is replaced by
# getPyodideCompatibilityPreamble() in pyodide-compat-service.js.
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
  _h5p_os.environ['SDL_EMSCRIPTEN_KEYBOARD_ELEMENT'] = '#__H5P_SDL_KEYBOARD_ELEMENT_ID__'
  _h5p_original_asyncio_run = asyncio.run
  _h5p_background_task = None
  _h5p_background_task_started = False
  _h5p_execution_limit_ms = 0
  _h5p_execution_limit_started = 0.0
  _h5p_execution_limit_message = 'Execution limit exceeded.'
  _h5p_original_import = _h5p_builtins.__import__
  _h5p_previous_trace = None
  _h5p_globals_snapshot = None

  class _h5p_eval_result_exception(Exception):
    # Carrier exception that returns the value of the last top-level
    # expression statement from module-level learner code (pyodide's
    # runPythonAsync resolves with the same value).
    def __init__(self, value):
      super().__init__(value)
      self.value = value

  # Stored in a list on the module globals so the generated raise statement
  # can resolve it by name from the executed learner code.
  ___h5p_eval_result_exception = [_h5p_eval_result_exception]

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

  def _h5p_reset_execution_limit_clock():
    # Time spent waiting for a learner to answer an input() dialog is not
    # program execution time, so the limit clock restarts after each answer.
    global _h5p_execution_limit_started

    if _h5p_execution_limit_ms > 0:
      _h5p_execution_limit_started = _h5p_time.monotonic()

  def _h5p_reset_background_task_state():
    global _h5p_background_task, _h5p_background_task_started
    _h5p_background_task = None
    _h5p_background_task_started = False

  def _h5p_snapshot_globals():
    # Records which global names exist before learner code runs, so
    # _h5p_restore_globals() can drop learner-created names afterwards and
    # every Run starts from a fresh namespace (matching Skulpt's
    # retainGlobals=false default).
    global _h5p_globals_snapshot
    _h5p_globals_snapshot = frozenset(globals().keys())

  def _h5p_restore_globals():
    # Removes all global names added since the last _h5p_snapshot_globals()
    # call. Intentionally a no-op without a snapshot, so callers can invoke it
    # unconditionally to clean up a pending snapshot from an earlier run that
    # left a background task running.
    global _h5p_globals_snapshot

    if _h5p_globals_snapshot is None:
      return

    snapshot = _h5p_globals_snapshot
    _h5p_globals_snapshot = None

    for key in [key for key in globals().keys() if key not in snapshot]:
      try:
        del globals()[key]
      except Exception:
        pass

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

        # Pyodide's JS->Python dict conversion turns JS arrays into Python
        # lists, but real pygame events always carry pos/rel/buttons as
        # tuples. Code that validates its own position arguments strictly
        # (e.g. miniworlds' Actor.detect_pixel) rejects a list, silently
        # dropping every synthetic click/motion event, so these must match
        # pygame's real attribute types before the Event is constructed.
        for tuple_key in ('pos', 'rel', 'buttons'):
          if isinstance(attrs.get(tuple_key), list):
            attrs[tuple_key] = tuple(attrs[tuple_key])

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

  class _h5p_async_input_call_scanner(_h5p_ast.NodeVisitor):
    # Collects the plain names called in one function's own statements.
    # Nested scopes (inner functions, classes and lambdas) are separate
    # discovery units and are not descended into, so an input() call inside
    # a nested def does not mark the enclosing function.
    def __init__(self):
      super().__init__()
      self.called_names = set()

    def visit_FunctionDef(self, node):
      return

    def visit_AsyncFunctionDef(self, node):
      return

    def visit_ClassDef(self, node):
      return

    def visit_Lambda(self, node):
      return

    def visit_Call(self, node):
      if isinstance(node.func, _h5p_ast.Name):
        self.called_names.add(node.func.id)
      self.generic_visit(node)

  class _h5p_await_input_transformer(_h5p_ast.NodeTransformer):
    def __init__(self, marked_node_ids, async_function_names):
      super().__init__()
      self.marked_node_ids = marked_node_ids
      self.async_function_names = async_function_names
      self._inside_await = False
      # Await legality per enclosing scope: module level allows top-level
      # await, a converted function allows await inside, while class bodies
      # and lambdas never do (await is a SyntaxError there even inside an
      # async function).
      self._await_legal = [True]

    def visit_FunctionDef(self, node):
      is_marked = id(node) in self.marked_node_ids
      self._await_legal.append(is_marked)
      self.generic_visit(node)
      self._await_legal.pop()

      if not is_marked:
        return node

      return _h5p_ast.copy_location(_h5p_ast.AsyncFunctionDef(
        name=node.name,
        args=node.args,
        body=node.body,
        decorator_list=node.decorator_list,
        returns=node.returns,
        type_comment=getattr(node, 'type_comment', None),
      ), node)

    def visit_AsyncFunctionDef(self, node):
      # Learner-written async functions already permit await inside.
      self._await_legal.append(True)
      self.generic_visit(node)
      self._await_legal.pop()
      return node

    def visit_ClassDef(self, node):
      self._await_legal.append(False)
      self.generic_visit(node)
      self._await_legal.pop()
      return node

    def visit_Lambda(self, node):
      self._await_legal.append(False)
      self.generic_visit(node)
      self._await_legal.pop()
      return node

    def visit_Await(self, node):
      previous = self._inside_await
      self._inside_await = True
      self.generic_visit(node)
      self._inside_await = previous
      return node

    def visit_Call(self, node):
      self.generic_visit(node)
      if (
        self._await_legal[-1]
        and not self._inside_await
        and isinstance(node.func, _h5p_ast.Name)
        and (
          node.func.id == 'input'
          or node.func.id in self.async_function_names
        )
      ):
        return _h5p_ast.copy_location(_h5p_ast.Await(value=node), node)
      return node

  def _h5p_discover_async_input_functions(tree):
    # Returns the ids of all FunctionDef nodes that must become async
    # (their own statements call input() or a function discovered earlier),
    # plus their names for call-site await insertion. Discovery is
    # node-based so an unrelated method that merely shares a name with a
    # discovered top-level function is not silently converted.
    #
    # Each function's called names are collected once; the fixpoint then
    # only intersects name sets, because this runs inside the traced
    # execution-limit region and re-scanning ASTs per iteration would
    # burn the learner's time budget.
    function_nodes = [
      node for node in _h5p_ast.walk(tree)
      if isinstance(node, _h5p_ast.FunctionDef)
    ]
    called_names_per_function = []
    for node in function_nodes:
      scanner = _h5p_async_input_call_scanner()
      for child in node.body:
        scanner.visit(child)
      called_names_per_function.append(scanner.called_names)

    marked_node_ids = set()
    marked_names = set()
    pending = list(range(len(function_nodes)))

    while pending:
      remaining = []
      progressed = False

      for index in pending:
        node = function_nodes[index]
        if 'input' in called_names_per_function[index] \
          or (called_names_per_function[index] & marked_names):
          marked_node_ids.add(id(node))
          marked_names.add(node.name)
          progressed = True
        else:
          remaining.append(index)

      pending = remaining if progressed else []

    return marked_node_ids, marked_names

  def _h5p_build_async_input_module(source):
    source = '' if source is None else str(source)
    tree = _h5p_ast.parse(source, mode='exec')
    marked_node_ids, async_function_names = _h5p_discover_async_input_functions(tree)
    transformed_body = _h5p_await_input_transformer(marked_node_ids, async_function_names).visit(tree).body

    module = _h5p_ast.Module(body=transformed_body, type_ignores=[])

    # Replicate pyodide's "last_expr" return mode: the value of the final
    # top-level expression statement is returned by raising a carrier
    # exception, because module-level code cannot use `return`.
    if module.body and isinstance(module.body[-1], (_h5p_ast.Expr, _h5p_ast.Await)):
      last_node = module.body[-1]
      module.body[-1] = _h5p_ast.Raise(
        exc=_h5p_ast.Call(
          func=_h5p_ast.Subscript(
            value=_h5p_ast.Name(id='___h5p_eval_result_exception', ctx=_h5p_ast.Load()),
            slice=_h5p_ast.Constant(value=0),
            ctx=_h5p_ast.Load(),
          ),
          args=[last_node.value],
          keywords=[],
        ),
        cause=None,
      )

    return _h5p_ast.fix_missing_locations(module)

  async def _h5p_run_with_async_input(source):
    # Executes the transformed code at module level, exactly like pyodide's
    # own runPythonAsync(): top-level definitions land in the module globals
    # (so harnesses can resolve learner functions via globals()), and
    # top-level await is enabled through PyCF_ALLOW_TOP_LEVEL_AWAIT. eval()
    # returns a coroutine when the code contains top-level await, which is
    # awaited here.
    module = _h5p_build_async_input_module(source)
    # Parsing and transforming is runtime overhead, not learner execution
    # time, so the execution-limit clock restarts before the code runs.
    _h5p_reset_execution_limit_clock()
    namespace = globals()
    code = compile(module, '<h5p-learner-code>', 'exec', flags=_h5p_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)

    try:
      result = eval(code, namespace, namespace)
      if result is not None:
        await result
    except _h5p_eval_result_exception as error:
      return error.value

    return None

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

  def _h5p_register_background_task(task):
    # Opt-in hook for libraries (e.g. miniworlds) that schedule their own
    # fire-and-forget mainloop task via loop.create_task() instead of going
    # through asyncio.run(). Pyodide's runPythonAsync() always executes
    # top-level code with a running event loop, so asyncio.get_running_loop()
    # succeeds and such libraries never hit the asyncio.run() patch below,
    # leaving the task untracked (has_background_task() would incorrectly
    # report False while the loop keeps running). Exposed on builtins so it
    # can be discovered from any module without a hard dependency.
    if not isinstance(task, asyncio.Task):
      return task
    return _h5p_track_background_task(task)

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
          # asyncio.get_event_loop() is deprecated for this purpose and
          # raises on newer Python versions when no current loop exists, so
          # fall back to creating one explicitly.
          try:
            loop = asyncio.get_event_loop()
          except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        else:
          raise

      task = loop.create_task(_h5p_wrap_background_coro(main))
      return _h5p_track_background_task(task)

  _h5p_builtins.__import__ = _h5p_import
  _h5p_builtins._h5p_register_background_task = _h5p_register_background_task
  _h5p_patch_pygame_event_get()
  asyncio.run = _h5p_asyncio_run
  globals()['_h5p_runtime_compat_installed'] = True
