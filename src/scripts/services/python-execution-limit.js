/**
 * Normalizes the configured execution limit in milliseconds.
 * @param {*} executionLimit - Raw execution limit value.
 * @returns {number} Normalized limit in milliseconds, or 0 if disabled.
 */
export function normalizePythonExecutionLimit(executionLimit) {
  const normalizedLimit = Number(executionLimit);

  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    return 0;
  }

  return Math.floor(normalizedLimit);
}