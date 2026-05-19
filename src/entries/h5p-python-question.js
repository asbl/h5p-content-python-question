import '../styles/h5p-python-question.css';

import PythonQuestion from '../scripts/h5p-python-question';
import { registerPythonBlocklyLanguagePack } from '../scripts/blockly/python-blockly-language-pack';
import MatplotlibPackageManager from '../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/managers/packages/matplotlib-package-manager';
import MiniworldsPackageManager from '../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/managers/packages/miniworlds-package-manager';
import NumpyPackageManager from '../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/managers/packages/numpy-package-manager';
import ScipyPackageManager from '../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/managers/packages/scipy-package-manager';

import PythonRuntime from '../scripts/runtime/runtime-python';

// Runtime
import PythonSolutionRuntime from '../scripts/runtime/runtime-solution-python';
import PythonTestRuntime from '../scripts/runtime/runtime-test-python';
import PythonManualRuntime from '../scripts/runtime/runtime-manual-python';

H5P.PythonRuntime = PythonRuntime;
H5P.PythonQuestion = PythonQuestion;
H5P.PythonSolutionRuntime = PythonSolutionRuntime;
H5P.PythonTestRuntime = PythonTestRuntime;
H5P.PythonManualRuntime = PythonManualRuntime;
registerPythonBlocklyLanguagePack();
H5P.registerBlocklyPackageManagers?.([
  new NumpyPackageManager(),
  new MatplotlibPackageManager(),
  new MiniworldsPackageManager(),
  new ScipyPackageManager(),
]);
