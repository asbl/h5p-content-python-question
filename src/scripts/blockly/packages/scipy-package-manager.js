import {
  getBlocklyGeneratorOrder,
  getBlocklyPythonGenerator,
  getBlocklyRuntime,
} from '../../../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/blockly-runtime.js';

const SCIPY_CATEGORY_NAME = 'SciPy';
const SCIPY_CATEGORY_COLOUR = '#7A9CC6';
function getPythonFunctionOrder() {
  return getBlocklyGeneratorOrder('ORDER_FUNCTION_CALL');
}

/**
 * Adds SciPy-specific Blockly blocks and category definition.
 */
export default class ScipyPackageManager {
  /**
   * Returns the normalized package identifier.
   * @returns {string} Package name.
   */
  getPackageName() {
    return 'scipy';
  }

  /**
   * Indicates whether this manager is relevant for the language.
   * @param {string} codingLanguage Current coding language.
   * @returns {boolean} True if package blocks are supported.
   */
  supportsLanguage(codingLanguage) {
    const normalized = String(codingLanguage || '').toLowerCase();
    return normalized === 'python' || normalized === 'pseudocode';
  }

  /**
   * Builds the toolbox category for SciPy.
   * @returns {object} Blockly category descriptor.
   */
  buildCategory() {
    this._registerBlocks();

    return {
      kind: 'category',
      name: SCIPY_CATEGORY_NAME,
      colour: SCIPY_CATEGORY_COLOUR,
      contents: [
        { kind: 'block', type: 'scipy_import_linalg' },
        {
          kind: 'block',
          type: 'scipy_linalg_solve',
          inputs: {
            MATRIX_A: {
              shadow: {
                type: 'lists_create_empty',
              },
            },
            VECTOR_B: {
              shadow: {
                type: 'lists_create_empty',
              },
            },
          },
        },
      ],
    };
  }

  _registerBlocks() {
    const Blockly = getBlocklyRuntime();
    const pythonGenerator = getBlocklyPythonGenerator();

    if (!Blockly.Blocks.scipy_import_linalg) {
      Blockly.Blocks.scipy_import_linalg = {
        init() {
          this.appendDummyInput().appendField('from scipy import linalg');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(SCIPY_CATEGORY_COLOUR);
          this.setTooltip('Importiert scipy.linalg.');
        },
      };
    }

    if (!Blockly.Blocks.scipy_linalg_solve) {
      Blockly.Blocks.scipy_linalg_solve = {
        init() {
          this.appendValueInput('MATRIX_A').appendField('linalg.solve A');
          this.appendValueInput('VECTOR_B').appendField('b');
          this.setInputsInline(true);
          this.setOutput(true, null);
          this.setColour(SCIPY_CATEGORY_COLOUR);
          this.setTooltip('Loest Ax = b mit scipy.linalg.solve.');
        },
      };
    }

    if (!pythonGenerator.forBlock.scipy_import_linalg) {
      pythonGenerator.forBlock.scipy_import_linalg = () => 'from scipy import linalg\n';
    }

    if (!pythonGenerator.forBlock.scipy_linalg_solve) {
      pythonGenerator.forBlock.scipy_linalg_solve = (block, generator) => {
        const matrixA = generator.valueToCode(block, 'MATRIX_A', pythonGenerator.ORDER_NONE) || '[]';
        const vectorB = generator.valueToCode(block, 'VECTOR_B', pythonGenerator.ORDER_NONE) || '[]';
        return [`linalg.solve(${matrixA}, ${vectorB})`, getPythonFunctionOrder()];
      };
    }
  }
}
