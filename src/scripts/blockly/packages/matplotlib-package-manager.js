import {
  getBlocklyPythonGenerator,
  getBlocklyRuntime,
} from '../../../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/blockly-runtime.js';

const MATPLOTLIB_CATEGORY_NAME = 'Matplotlib';
const MATPLOTLIB_CATEGORY_COLOUR = '#2D6A9F';

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
 * Adds Matplotlib-specific Blockly blocks and category definition.
 */
export default class MatplotlibPackageManager {
  /**
   * Returns the normalized package identifier.
   * @returns {string} Package name.
   */
  getPackageName() {
    return 'matplotlib';
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
   * Builds the toolbox category for Matplotlib.
   * @returns {object} Blockly category descriptor.
   */
  buildCategory() {
    this._registerBlocks();

    return {
      kind: 'category',
      name: MATPLOTLIB_CATEGORY_NAME,
      colour: MATPLOTLIB_CATEGORY_COLOUR,
      contents: [
        { kind: 'block', type: 'matplotlib_import_pyplot' },
        { kind: 'block', type: 'matplotlib_create_figure' },
        {
          kind: 'block',
          type: 'matplotlib_plot_line',
          inputs: {
            X_VALUES: {
              shadow: {
                type: 'lists_create_empty',
              },
            },
            Y_VALUES: {
              shadow: {
                type: 'lists_create_empty',
              },
            },
          },
        },
        {
          kind: 'block',
          type: 'matplotlib_set_title',
          inputs: {
            TITLE: {
              shadow: {
                type: 'text',
                fields: { TEXT: 'Diagramm' },
              },
            },
          },
        },
        { kind: 'block', type: 'matplotlib_show_plot' },
      ],
    };
  }

  _registerBlocks() {
    const Blockly = getBlocklyRuntime();
    const pythonGenerator = getBlocklyPythonGenerator();

    if (!Blockly.Blocks.matplotlib_import_pyplot) {
      Blockly.Blocks.matplotlib_import_pyplot = {
        init() {
          this.appendDummyInput()
            .appendField('import matplotlib.pyplot as')
            .appendField(new Blockly.FieldTextInput('plt'), 'ALIAS');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MATPLOTLIB_CATEGORY_COLOUR);
          this.setTooltip('Importiert pyplot, z. B. mit Alias plt.');
        },
      };
    }

    if (!Blockly.Blocks.matplotlib_create_figure) {
      Blockly.Blocks.matplotlib_create_figure = {
        init() {
          this.appendDummyInput().appendField('plt.figure()');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MATPLOTLIB_CATEGORY_COLOUR);
          this.setTooltip('Erstellt eine neue Figure.');
        },
      };
    }

    if (!Blockly.Blocks.matplotlib_plot_line) {
      Blockly.Blocks.matplotlib_plot_line = {
        init() {
          this.appendValueInput('X_VALUES').appendField('plt.plot x');
          this.appendValueInput('Y_VALUES').appendField('y');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MATPLOTLIB_CATEGORY_COLOUR);
          this.setTooltip('Zeichnet eine Linie aus x- und y-Werten.');
        },
      };
    }

    if (!Blockly.Blocks.matplotlib_set_title) {
      Blockly.Blocks.matplotlib_set_title = {
        init() {
          this.appendValueInput('TITLE').appendField('plt.title');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MATPLOTLIB_CATEGORY_COLOUR);
          this.setTooltip('Setzt den Diagrammtitel.');
        },
      };
    }

    if (!Blockly.Blocks.matplotlib_show_plot) {
      Blockly.Blocks.matplotlib_show_plot = {
        init() {
          this.appendDummyInput().appendField('plt.show()');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MATPLOTLIB_CATEGORY_COLOUR);
          this.setTooltip('Zeigt das Diagramm an.');
        },
      };
    }

    if (!pythonGenerator.forBlock.matplotlib_import_pyplot) {
      pythonGenerator.forBlock.matplotlib_import_pyplot = (block) => {
        const alias = sanitizePythonIdentifier(block.getFieldValue('ALIAS'), 'plt');
        return `import matplotlib.pyplot as ${alias}\n`;
      };
    }

    if (!pythonGenerator.forBlock.matplotlib_create_figure) {
      pythonGenerator.forBlock.matplotlib_create_figure = () => 'plt.figure()\n';
    }

    if (!pythonGenerator.forBlock.matplotlib_plot_line) {
      pythonGenerator.forBlock.matplotlib_plot_line = (block, generator) => {
        const xValues = generator.valueToCode(block, 'X_VALUES', pythonGenerator.ORDER_NONE) || '[]';
        const yValues = generator.valueToCode(block, 'Y_VALUES', pythonGenerator.ORDER_NONE) || '[]';
        return `plt.plot(${xValues}, ${yValues})\n`;
      };
    }

    if (!pythonGenerator.forBlock.matplotlib_set_title) {
      pythonGenerator.forBlock.matplotlib_set_title = (block, generator) => {
        const title = generator.valueToCode(block, 'TITLE', pythonGenerator.ORDER_NONE) || '\'\'';
        return `plt.title(${title})\n`;
      };
    }

    if (!pythonGenerator.forBlock.matplotlib_show_plot) {
      pythonGenerator.forBlock.matplotlib_show_plot = () => 'plt.show()\n';
    }
  }
}
