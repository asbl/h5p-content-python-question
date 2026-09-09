/**
 * DOM id given to whichever canvas currently owns the shared SDL/pygame
 * instance. pygame-ce's emscripten SDL2 build binds its native keyboard
 * listener to `document` by default, which swallows every keystroke on the
 * page - including ones typed into an unrelated input() dialog - regardless
 * of DOM focus. Pointing SDL_EMSCRIPTEN_KEYBOARD_ELEMENT (see
 * installPyodideRuntimeCompatibility in pyodide-runtime-service.js) at this
 * id scopes that native listener to the canvas itself, so it only receives
 * keys while the canvas actually has focus. bindSDLCanvas (in
 * pyodide-sdl-canvas-service.js) keeps the id on exactly the active canvas.
 * @type {string}
 */
export const SDL_KEYBOARD_ELEMENT_ID = 'h5p-pyodide-sdl-canvas';
