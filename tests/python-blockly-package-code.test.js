import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import MatplotlibPackageManager from '../src/scripts/blockly/packages/matplotlib-package-manager.js';
import MiniworldsPackageManager from '../src/scripts/blockly/packages/miniworlds-package-manager.js';
import NumpyPackageManager from '../src/scripts/blockly/packages/numpy-package-manager.js';
import ScipyPackageManager from '../src/scripts/blockly/packages/scipy-package-manager.js';

/**
 * Collects the block types of a toolbox category, including nested categories.
 * @param {object} category - Blockly category descriptor.
 * @returns {string[]} Block types.
 */
function blockTypes(category) {
  return (category.contents || []).flatMap((item) => (
    item.kind === 'block' ? [item.type] : blockTypes(item)
  ));
}

/**
 * Generates the Python code of one block with its default field values.
 * @param {string} type - Block type.
 * @returns {string} Generated code.
 */
function generate(type) {
  const workspace = new Blockly.Workspace();

  try {
    // A fixed id keeps names derived from it (timer callbacks) stable.
    const block = workspace.newBlock(type, type);
    pythonGenerator.init(workspace);
    const code = pythonGenerator.blockToCode(block);
    return Array.isArray(code) ? code[0] : code;
  }
  finally {
    workspace.dispose();
  }
}

describe.each([
  ['NumPy', new NumpyPackageManager()],
  ['Matplotlib', new MatplotlibPackageManager()],
  ['SciPy', new ScipyPackageManager()],
  ['Miniworlds', new MiniworldsPackageManager()],
])('%s Blockly blocks', (_name, manager) => {
  it('generate the expected Python code for every toolbox block', () => {
    const categories = [manager.buildCategory()].flat();
    const types = [...new Set(categories.flatMap(blockTypes))];

    expect(types.length).toBeGreaterThan(0);
    expect(Object.fromEntries(types.map((type) => [type, generate(type)]))).toMatchSnapshot();
  });
});
