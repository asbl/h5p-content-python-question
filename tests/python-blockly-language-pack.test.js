import { describe, expect, it, vi } from 'vitest';
import {
  validateBlocklyLanguagePack,
} from '../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/blockly-language-pack-contract.js';
import {
  PYTHON_BLOCKLY_LANGUAGE_PACK,
} from '../src/scripts/blockly/python-blockly-language-pack.js';

describe('Python Blockly language pack', () => {
  it('fulfills the shared language pack contract', () => {
    expect(validateBlocklyLanguagePack(PYTHON_BLOCKLY_LANGUAGE_PACK)).toEqual([]);
  });

  it('builds a dynamic class category from the shared Blockly project context', () => {
    const categories = PYTHON_BLOCKLY_LANGUAGE_PACK.buildDynamicCategories({
      entryFileName: 'main.py',
      activeFileName: 'helper.py',
      files: [
        { name: 'main.py', isEntry: true },
        { name: 'helper.py', isEntry: false },
      ],
    });

    expect(categories[0].name).toBe('Klassen');
    expect(JSON.stringify(categories[0])).toContain('python_class_definition');
    expect(JSON.stringify(categories[0])).toContain('helper');
  });

  it('delegates code generation to the shared Blockly Python generator', () => {
    const workspace = { id: 'workspace' };
    const workspaceToCode = vi.fn(() => 'print("ok")\n');
    globalThis.H5P.getBlocklyPythonGenerator = vi.fn(() => ({ workspaceToCode }));

    expect(PYTHON_BLOCKLY_LANGUAGE_PACK.generate(workspace)).toBe('print("ok")\n');
    expect(workspaceToCode).toHaveBeenCalledWith(workspace);
  });
});
