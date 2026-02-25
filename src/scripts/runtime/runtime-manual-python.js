import PythonRuntime from './runtime-python';

export default class PythonManualRuntime extends H5P.ManualRuntimeMixin(PythonRuntime) {

  reset() {
    super.reset();
    this.getCanvasManager().removeCanvas();
  }
}
