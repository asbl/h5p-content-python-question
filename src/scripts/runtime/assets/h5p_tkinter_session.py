# Adapter for the pinned tkinter-web-backend embedded application. This factory
# keeps backend state out of the learner namespace and returns an owned cleanup
# callback, which the host releases after all pending port deliveries settle.
def _h5p_create_tk_session(open_port, wait_message, unsupported_message, retain_globals=False):
    restore_globals = globals().get("_h5p_restore_globals")
    import sys
    import tkinter_web.embed as embed
    from pyodide.ffi import can_run_sync, run_sync

    if '/' not in sys.path:
        sys.path.insert(0, '/')

    if can_run_sync():
        def wait(key):
            return run_sync(wait_message(key))
    else:
        def wait(key):
            raise RuntimeError(unsupported_message)

    app = embed.setup(open_port, wait)

    def dispose():
        app.quit_flag = True
        # Cancel both regular ticks and delayed/throttled render operations.
        for name in ('_tick_handle', '_timer_handle', '_send_timer'):
            handle = getattr(app, name, None)
            if handle is not None:
                handle.cancel()
                setattr(app, name, None)
        for interp in list(app.interps):
            ref = embed._roots.pop(interp.id, None)
            root = ref() if ref is not None else None
            try:
                if root is not None:
                    root.destroy()
            except Exception:
                pass
            finally:
                interp.deleted = True
                app.transport.close(interp.id)
        app.interps.clear()
        # root.destroy() can schedule another flush; cancel that too.
        for name in ('_tick_handle', '_timer_handle', '_send_timer'):
            handle = getattr(app, name, None)
            if handle is not None:
                handle.cancel()
                setattr(app, name, None)
        tkinter = sys.modules.get('tkinter')
        if tkinter is not None:
            tkinter._default_root = None
        turtle = sys.modules.get('turtle')
        if turtle is not None:
            turtle.Turtle._pen = None
            turtle.Turtle._screen = None
            turtle.TurtleScreen._RUNNING = True
            turtle._Screen._root = None
            turtle._Screen._canvas = None
        app.wait_message = None
        app.transport.open_port = None
        app.transport.on_message = None
        if not retain_globals and restore_globals is not None:
            restore_globals()

    return dispose
