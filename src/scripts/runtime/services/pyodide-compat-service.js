import compatPreambleSource from '../assets/h5p_runtime_compat.py';
import { SDL_KEYBOARD_ELEMENT_ID } from './pyodide-sdl-constants';

/**
 * Builds the Python compatibility preamble installed once per Pyodide
 * instance. See assets/h5p_runtime_compat.py for the documented behavior.
 * @returns {string} Python source to run once per Pyodide instance.
 */
export function getPyodideCompatibilityPreamble() {
  return compatPreambleSource.replaceAll(
    '__H5P_SDL_KEYBOARD_ELEMENT_ID__',
    SDL_KEYBOARD_ELEMENT_ID,
  );
}
