/**
 * Allows startup benchmarks to disable every speculative loading path.
 * @returns {boolean} Whether background preparation is enabled.
 */
export function isPyodidePreloadEnabled() {
  return typeof window !== 'undefined' && window.__h5pDisablePyodidePreload !== true;
}
