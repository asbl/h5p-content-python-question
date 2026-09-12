import {
  getBlocklyGeneratorOrder,
  getBlocklyPythonGenerator,
  getBlocklyRuntime,
} from '../../../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/blockly-runtime.js';

const NUMPY_CATEGORY_NAME = 'NumPy';
const NUMPY_CATEGORY_COLOUR = '#4B8BBE';
function getPythonFunctionOrder() {
  return getBlocklyGeneratorOrder('ORDER_FUNCTION_CALL');
}

/**
 * Normalizes a value so it can be used as a Python identifier.
 * @param {string} value Raw identifier candidate.
 * @param {string} fallback Used when the candidate becomes empty.
 * @returns {string} Safe identifier.
 */
function sanitizePythonIdentifier(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z_]+/, '')
    .replace(/^_+/, '');

  return normalized || fallback;
}

/**
 * Adds NumPy-specific Blockly blocks and category definition.
 */
export default class NumpyPackageManager {
  /**
   * Returns the normalized package identifier.
   * @returns {string} Package name.
   */
  getPackageName() {
    return 'numpy';
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
   * Builds the toolbox category for NumPy.
   * @returns {object} Blockly category descriptor.
   */
  buildCategory() {
    this._registerBlocks();

    return {
      kind: 'category',
      name: NUMPY_CATEGORY_NAME,
      colour: NUMPY_CATEGORY_COLOUR,
      contents: [
        { kind: 'block', type: 'numpy_import_as' },
        {
          kind: 'block',
          type: 'numpy_array_create',
          inputs: {
            VALUES: {
              shadow: {
                type: 'lists_create_empty',
              },
            },
          },
        },
        {
          kind: 'block',
          type: 'numpy_linspace',
          inputs: {
            START: {
              shadow: {
                type: 'math_number',
                fields: { NUM: 0 },
              },
            },
            STOP: {
              shadow: {
                type: 'math_number',
                fields: { NUM: 10 },
              },
            },
            COUNT: {
              shadow: {
                type: 'math_number',
                fields: { NUM: 50 },
              },
            },
          },
        },
        {
          kind: 'block',
          type: 'numpy_mean',
          inputs: {
            VALUES: {
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

    if (!Blockly.Blocks.numpy_import_as) {
      Blockly.Blocks.numpy_import_as = {
        init() {
          this.appendDummyInput()
            .appendField('import numpy as')
            .appendField(new Blockly.FieldTextInput('np'), 'ALIAS');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(NUMPY_CATEGORY_COLOUR);
          this.setTooltip('Importiert NumPy mit Alias, z. B. np.');
        },
      };
    }

    if (!Blockly.Blocks.numpy_array_create) {
      Blockly.Blocks.numpy_array_create = {
        init() {
          this.appendValueInput('VALUES')
            .appendField('np.array');
          this.setOutput(true, null);
          this.setColour(NUMPY_CATEGORY_COLOUR);
          this.setTooltip('Erstellt ein NumPy-Array aus einer Liste.');
        },
      };
    }

    if (!Blockly.Blocks.numpy_linspace) {
      Blockly.Blocks.numpy_linspace = {
        init() {
          this.appendValueInput('START')
            .setCheck('Number')
            .appendField('np.linspace start');
          this.appendValueInput('STOP')
            .setCheck('Number')
            .appendField('stop');
          this.appendValueInput('COUNT')
            .setCheck('Number')
            .appendField('anzahl');
          this.setInputsInline(true);
          this.setOutput(true, null);
          this.setColour(NUMPY_CATEGORY_COLOUR);
          this.setTooltip('Erstellt eine gleichmaessig verteilte Zahlenfolge.');
        },
      };
    }

    if (!Blockly.Blocks.numpy_mean) {
      Blockly.Blocks.numpy_mean = {
        init() {
          this.appendValueInput('VALUES')
            .appendField('np.mean');
          this.setOutput(true, 'Number');
          this.setColour(NUMPY_CATEGORY_COLOUR);
          this.setTooltip('Berechnet den Mittelwert eines NumPy-Arrays.');
        },
      };
    }

    if (!pythonGenerator.forBlock.numpy_import_as) {
      pythonGenerator.forBlock.numpy_import_as = (block) => {
        const alias = sanitizePythonIdentifier(block.getFieldValue('ALIAS'), 'np');
        return `import numpy as ${alias}\n`;
      };
    }

    if (!pythonGenerator.forBlock.numpy_array_create) {
      pythonGenerator.forBlock.numpy_array_create = (block, generator) => {
        const values = generator.valueToCode(block, 'VALUES', pythonGenerator.ORDER_NONE) || '[]';
        return [`np.array(${values})`, getPythonFunctionOrder()];
      };
    }

    if (!pythonGenerator.forBlock.numpy_linspace) {
      pythonGenerator.forBlock.numpy_linspace = (block, generator) => {
        const start = generator.valueToCode(block, 'START', pythonGenerator.ORDER_NONE) || '0';
        const stop = generator.valueToCode(block, 'STOP', pythonGenerator.ORDER_NONE) || '1';
        const count = generator.valueToCode(block, 'COUNT', pythonGenerator.ORDER_NONE) || '50';
        return [`np.linspace(${start}, ${stop}, ${count})`, getPythonFunctionOrder()];
      };
    }

    if (!pythonGenerator.forBlock.numpy_mean) {
      pythonGenerator.forBlock.numpy_mean = (block, generator) => {
        const values = generator.valueToCode(block, 'VALUES', pythonGenerator.ORDER_NONE) || '[]';
        return [`np.mean(${values})`, getPythonFunctionOrder()];
      };
    }
  }
}
