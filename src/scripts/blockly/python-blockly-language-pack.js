import {
  blocklyProjectClassRegistry,
  ProjectClassSymbolExtractor,
} from '../../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/project-symbols';
import { registerPythonOopBlocks } from './python-oop-blocks';

const PYTHON_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Variablen', colour: '#A65C81', custom: 'VARIABLE' },
    {
      kind: 'category',
      name: 'Logik',
      colour: '#5C81A6',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare', fields: { OP: 'EQ' } },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
        { kind: 'block', type: 'logic_null' },
        { kind: 'block', type: 'logic_ternary' },
      ],
    },
    {
      kind: 'category',
      name: 'Schleifen',
      colour: '#5CA65C',
      contents: [
        {
          kind: 'block',
          type: 'controls_repeat_ext',
          inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
        },
        { kind: 'block', type: 'controls_whileUntil' },
        {
          kind: 'block',
          type: 'controls_for',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        { kind: 'block', type: 'controls_forEach' },
        { kind: 'block', type: 'controls_flow_statements' },
      ],
    },
    {
      kind: 'category',
      name: 'Mathematik',
      colour: '#5C5CA6',
      contents: [
        { kind: 'block', type: 'math_number' },
        {
          kind: 'block',
          type: 'math_arithmetic',
          fields: { OP: 'ADD' },
          inputs: {
            A: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        {
          kind: 'block',
          type: 'math_modulo',
          inputs: {
            DIVIDEND: { shadow: { type: 'math_number', fields: { NUM: 64 } } },
            DIVISOR: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          },
        },
        { kind: 'block', type: 'math_round' },
        { kind: 'block', type: 'math_single' },
        { kind: 'block', type: 'math_random_int' },
        { kind: 'block', type: 'math_random_float' },
        {
          kind: 'block',
          type: 'math_number_property',
          fields: { PROPERTY: 'EVEN' },
          inputs: { NUMBER_TO_CHECK: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Text',
      colour: '#A65C5C',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_append', inputs: { TEXT: { shadow: { type: 'text' } } } },
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_isEmpty' },
        { kind: 'block', type: 'text_indexOf' },
        { kind: 'block', type: 'text_charAt' },
        { kind: 'block', type: 'text_getSubstring' },
        { kind: 'block', type: 'text_changeCase' },
        { kind: 'block', type: 'text_trim' },
        {
          kind: 'block',
          type: 'text_print',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hallo' } } } },
        },
        {
          kind: 'block',
          type: 'text_prompt_ext',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Eingabe:' } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Listen',
      colour: '#5CA6A6',
      contents: [
        { kind: 'block', type: 'lists_create_empty' },
        { kind: 'block', type: 'lists_create_with' },
        { kind: 'block', type: 'lists_repeat' },
        { kind: 'block', type: 'lists_length' },
        { kind: 'block', type: 'lists_isEmpty' },
        { kind: 'block', type: 'lists_indexOf' },
        { kind: 'block', type: 'lists_getIndex' },
        { kind: 'block', type: 'lists_setIndex' },
        { kind: 'block', type: 'lists_getSublist' },
        { kind: 'block', type: 'lists_sort' },
      ],
    },
    { kind: 'category', name: 'Funktionen', colour: '#9A5CA6', custom: 'PROCEDURE' },
  ],
};

const PYTHON_CATEGORY_FIELDS = {
  variables: 'Variablen',
  logic: 'Logik',
  loops: 'Schleifen',
  math: 'Mathematik',
  text: 'Text',
  lists: 'Listen',
  functions: 'Funktionen',
};

function buildPythonProjectCategory(context = {}) {
  const classNames = new ProjectClassSymbolExtractor(context, {
    extension: '.py',
    entryFileName: context.entryFileName || 'main.py',
  }).getClassNames();
  blocklyProjectClassRegistry.set('python', classNames);

  return {
    kind: 'category',
    name: 'Klassen',
    colour: '#3366AA',
    contents: [
      {
        kind: 'block',
        type: 'python_class_definition',
        fields: {
          CLASS_NAME: String(context.activeFileName || 'helper.py').replace(/\.py$/i, '') || 'Helper',
        },
      },
      {
        kind: 'block',
        type: 'python_method_definition',
        fields: {
          METHOD_NAME: 'answer',
        },
      },
      {
        kind: 'block',
        type: 'python_return',
        inputs: {
          VALUE: {
            shadow: {
              type: 'math_number',
              fields: { NUM: 42 },
            },
          },
        },
      },
      ...classNames.flatMap((className) => [
        {
          kind: 'block',
          type: 'python_declare_object',
          fields: {
            VAR_NAME: className.charAt(0).toLowerCase() + className.slice(1),
            CLASS_NAME: className,
          },
        },
        {
          kind: 'block',
          type: 'python_new_object',
          fields: {
            CLASS_NAME: className,
          },
        },
      ]),
      { kind: 'block', type: 'python_method_call_value' },
      { kind: 'block', type: 'python_method_call_statement' },
    ],
  };
}

export const PYTHON_BLOCKLY_LANGUAGE_PACK = {
  toolbox: PYTHON_TOOLBOX,
  categoryFieldMap: PYTHON_CATEGORY_FIELDS,
  registerBlocks: registerPythonOopBlocks,
  buildDynamicCategories: (context) => [buildPythonProjectCategory(context)],
  generate(workspace) {
    const pythonGenerator = H5P.getBlocklyPythonGenerator();
    return pythonGenerator.workspaceToCode(workspace) || '';
  },
  supported: true,
};

export function registerPythonBlocklyLanguagePack() {
  H5P.registerBlocklyLanguagePack(['python', 'pseudocode'], PYTHON_BLOCKLY_LANGUAGE_PACK);
}
