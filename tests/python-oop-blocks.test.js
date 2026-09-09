import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blocklyProjectClassRegistry } from '../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/project-symbols.js';
import { registerPythonOopBlocks } from '../src/scripts/blockly/python-oop-blocks.js';

function createBlocklyStub() {
  return {
    Blocks: {},
    FieldTextInput: vi.fn((value) => ({ type: 'text', value })),
    FieldDropdown: vi.fn((options) => ({ type: 'dropdown', options })),
  };
}

function createBlock(fields = {}) {
  return {
    getFieldValue: vi.fn((name) => fields[name]),
  };
}

describe('Python OOP Blockly blocks', () => {
  let generator;

  beforeEach(() => {
    generator = {
      ORDER_FUNCTION_CALL: 2,
      ORDER_NONE: 0,
      forBlock: {},
    };
    globalThis.H5P = {
      ...(globalThis.H5P || {}),
      getBlocklyPythonGenerator: vi.fn(() => generator),
    };
    delete globalThis.__H5P_BLOCKLY_PROJECT_CLASSES__;
  });

  it('registers all OOP blocks and skips repeated registration', () => {
    const Blockly = createBlocklyStub();

    registerPythonOopBlocks(Blockly);
    const classDefinition = Blockly.Blocks.python_class_definition;

    registerPythonOopBlocks(Blockly);

    expect(Object.keys(Blockly.Blocks).sort()).toEqual([
      'python_class_definition',
      'python_constructor_definition',
      'python_declare_object',
      'python_method_call_statement',
      'python_method_call_value',
      'python_method_definition',
      'python_new_object',
      'python_return',
      'python_set_attribute',
    ]);
    expect(Blockly.Blocks.python_class_definition).toBe(classDefinition);
    expect(globalThis.H5P.getBlocklyPythonGenerator).toHaveBeenCalledTimes(1);
  });

  it('generates class, method and return Python code with safe fallback names', () => {
    const Blockly = createBlocklyStub();
    const statementToCode = vi.fn((_block, name) => (name === 'MEMBERS' ? '    def answer(self):\n        pass\n' : '    return 1\n'));
    const valueToCode = vi.fn(() => '');

    registerPythonOopBlocks(Blockly);

    expect(generator.forBlock.python_class_definition(createBlock({ CLASS_NAME: '123 Bad-Name' }), { statementToCode }))
      .toBe('class _Bad_Name:\n    def answer(self):\n        pass\n\n');
    expect(generator.forBlock.python_method_definition(createBlock({ METHOD_NAME: '' }), { statementToCode }))
      .toBe('def method(self):\n    return 1\n');
    expect(generator.forBlock.python_method_definition(createBlock({ METHOD_NAME: 'set-name', PARAMS: 'self, user name, age' }), { statementToCode }))
      .toBe('def set_name(self, user_name, age):\n    return 1\n');
    expect(generator.forBlock.python_return(createBlock(), { valueToCode }))
      .toBe('return None\n');
  });

  it('generates constructor and attribute assignment code', () => {
    const Blockly = createBlocklyStub();
    const statementToCode = vi.fn(() => '    self.name = name\n');
    const valueToCode = vi.fn(() => 'name');

    registerPythonOopBlocks(Blockly);

    expect(generator.forBlock.python_constructor_definition(createBlock({ PARAMS: 'name, invalid-value' }), { statementToCode }))
      .toBe('def __init__(self, name, invalid_value):\n    self.name = name\n');
    expect(generator.forBlock.python_set_attribute(createBlock({ ATTRIBUTE_NAME: 'display name' }), { valueToCode }))
      .toBe('self.display_name = name\n');
  });

  it('generates object creation and method-call code', () => {
    const Blockly = createBlocklyStub();

    registerPythonOopBlocks(Blockly);

    expect(generator.forBlock.python_declare_object(createBlock({
      VAR_NAME: 'my helper',
      CLASS_NAME: 'Helper',
    }))).toBe('my_helper = Helper()\n');
    expect(generator.forBlock.python_new_object(createBlock({ CLASS_NAME: 'Other Helper' })))
      .toEqual(['Other_Helper()', generator.ORDER_FUNCTION_CALL]);
    expect(generator.forBlock.python_method_call_statement(createBlock({
      OBJECT_NAME: 'my helper',
      METHOD_NAME: 'do-work',
      ARGS: '1, 2',
    }))).toBe('my_helper.do_work(1, 2)\n');
    expect(generator.forBlock.python_method_call_value(createBlock({
      OBJECT_NAME: 'helper',
      METHOD_NAME: 'answer',
      ARGS: '',
    }))).toEqual(['helper.answer()', generator.ORDER_FUNCTION_CALL]);
  });

  it('uses project classes in dropdowns and falls back to Helper', () => {
    const Blockly = createBlocklyStub();
    const block = {
      appendDummyInput: vi.fn(() => ({
        appendField: vi.fn().mockReturnThis(),
      })),
      setOutput: vi.fn(),
      setColour: vi.fn(),
      setTooltip: vi.fn(),
    };

    registerPythonOopBlocks(Blockly);
    Blockly.Blocks.python_new_object.init.call(block);

    let dropdownCallback = Blockly.FieldDropdown.mock.calls[0][0];
    expect(dropdownCallback()).toEqual([['Helper', 'Helper']]);

    blocklyProjectClassRegistry.set('python', ['Robot Helper', '42Bad']);
    Blockly.Blocks.python_new_object.init.call(block);
    dropdownCallback = Blockly.FieldDropdown.mock.calls[1][0];

    expect(dropdownCallback()).toEqual([
      ['Robot_Helper', 'Robot_Helper'],
      ['Bad', 'Bad'],
    ]);
  });
});
