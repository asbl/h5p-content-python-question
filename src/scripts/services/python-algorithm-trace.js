export const TRACE_PREFIX = '__H5P_ALGORITHM_TRACE__:';

/** Creates the Python trace API that is injected before learner source. */
export const getAlgorithmTracePreamble = (config = {}) => {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const maxEvents = Math.max(1, Number(config.maxEvents) || 500);
  const maxSnapshotLength = Math.max(1, Number(config.maxSnapshotLength) || 100);
  const prefix = JSON.stringify(`${TRACE_PREFIX}${token}:`);
  return { token, code: `import json
class __H5PTrace:
    def __init__(self):
        self.step = 0
        self.max_events = ${maxEvents}
        self.max_snapshot_length = ${maxSnapshotLength}
        self.values = None
        self._print = print
        self._json = json
    def _emit(self, event_type, **data):
        if self.step >= self.max_events: return
        self.step += 1
        data.update({'type': event_type, 'step': self.step})
        self._print(${prefix} + self._json.dumps(data, default=str))
    def _snapshot(self, values):
        result = list(values)
        return result[:self.max_snapshot_length]
    def watch(self, values):
        self.values = values
        self._emit('watch', snapshot=self._snapshot(values))
    def compare(self, left, right):
        self._emit('compare', indices=[left, right])
    def mark(self, index, label='mark'):
        self._emit('mark', index=index, label=label)
    def swap(self, values, left, right):
        values[left], values[right] = values[right], values[left]
        self.values = values
        self._emit('swap', indices=[left, right], snapshot=self._snapshot(values))
trace = __H5PTrace()
` };
};
