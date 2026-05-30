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

const PYTHON_RAW_CODE_BLOCK_TYPE = 'python_raw_code';

function createNumberShadow(value) {
  return {
    shadow: {
      type: 'math_number',
      fields: { NUM: Number(value) },
    },
  };
}

function createRgbColorBlock(value) {
  const match = String(value || '').trim().match(/^\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/);

  if (!match) {
    return null;
  }

  return {
    block: {
      type: 'miniworlds_rgb_color',
      fields: {
        R: Number(match[1]),
        G: Number(match[2]),
        B: Number(match[3]),
      },
    },
  };
}

function createMiniworldsImportBlock() {
  return { type: 'miniworlds_import_core' };
}

function createMiniworldsWorldBlock(match) {
  return {
    type: 'miniworlds_create_world',
    fields: { WORLD_VAR: match[1] },
    inputs: {
      WIDTH: createNumberShadow(match[2]),
      HEIGHT: createNumberShadow(match[3]),
    },
  };
}

function createMiniworldsActorBlock(match) {
  return {
    type: 'miniworlds_create_actor',
    fields: { ACTOR_VAR: match[1] },
    inputs: {
      X: createNumberShadow(match[2]),
      Y: createNumberShadow(match[3]),
    },
  };
}

function createMiniworldsAttributeBlock(targetType, match) {
  const valueInput = createRgbColorBlock(match[3]);

  if (!valueInput) {
    return null;
  }

  if (targetType === 'world') {
    return {
      type: 'miniworlds_world_set_attribute',
      fields: { WORLD_VAR: match[1], ATTRIBUTE_NAME: match[2] },
      inputs: { VALUE: valueInput },
    };
  }

  return {
    type: 'miniworlds_actor_set_attribute',
    fields: { ACTOR_VAR: match[1], ATTRIBUTE_NAME: match[2] },
    inputs: { VALUE: valueInput },
  };
}

function createMiniworldsRunBlock(match) {
  return {
    type: 'miniworlds_world_run',
    fields: { WORLD_VAR: match[1] },
  };
}

function createMiniworldsActorMoveBlock(match) {
  return {
    type: 'miniworlds_actor_move',
    fields: { ACTOR_VAR: match[1], DIRECTION: match[2] },
  };
}

function createMiniworldsKeyDownEventBlock(lines, index) {
  const decoratorMatch = lines[index]?.match(/^@([A-Za-z_]\w*)\.register$/);
  const defMatch = lines[index + 1]?.match(/^def\s+on_key_down_([A-Za-z0-9_]+)\(self\):$/);
  const bodyMatch = lines[index + 2]?.match(/^\s+([A-Za-z_]\w*)\.(move_(?:up|down|left|right))\(\)$/);

  if (!decoratorMatch || !defMatch || !bodyMatch || decoratorMatch[1] !== bodyMatch[1]) {
    return null;
  }

  return {
    consumedLines: 3,
    block: {
      type: 'miniworlds_actor_event_key_down',
      fields: { ACTOR_VAR: decoratorMatch[1], KEY: defMatch[1] },
      inputs: {
        BODY: {
          block: createMiniworldsActorMoveBlock(bodyMatch),
        },
      },
    },
  };
}

function linkStatementBlocks(blocks) {
  if (blocks.length === 0) {
    return null;
  }

  for (let index = 0; index < blocks.length - 1; index += 1) {
    blocks[index].next = { block: blocks[index + 1] };
  }

  return blocks[0];
}

function createMiniworldsWorkspaceStateFromCode(code = '') {
  const lines = String(code || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  const blocks = [];
  const worldVars = new Set();
  const actorVars = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line === 'from miniworlds import World, Actor') {
      blocks.push(createMiniworldsImportBlock());
      continue;
    }

    let match = line.match(/^([A-Za-z_]\w*)\s*=\s*World\((\d+)\s*,\s*(\d+)\)$/);
    if (match) {
      worldVars.add(match[1]);
      blocks.push(createMiniworldsWorldBlock(match));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*Actor\(\((\d+)\s*,\s*(\d+)\)\)$/);
    if (match) {
      actorVars.add(match[1]);
      blocks.push(createMiniworldsActorBlock(match));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*(\(\d+\s*,\s*\d+\s*,\s*\d+\))$/);
    if (match) {
      const targetType = worldVars.has(match[1]) || (!actorVars.has(match[1]) && match[1] === 'world')
        ? 'world'
        : 'actor';
      const attributeBlock = createMiniworldsAttributeBlock(targetType, match);

      if (!attributeBlock) {
        return null;
      }

      blocks.push(attributeBlock);
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.run\(\)$/);
    if (match) {
      blocks.push(createMiniworldsRunBlock(match));
      continue;
    }

    const eventResult = createMiniworldsKeyDownEventBlock(lines, index);
    if (eventResult) {
      blocks.push(eventResult.block);
      index += eventResult.consumedLines - 1;
      continue;
    }

    return null;
  }

  const firstBlock = linkStatementBlocks(blocks);
  if (!firstBlock) {
    return null;
  }

  firstBlock.x = 24;
  firstBlock.y = 24;

  return {
    blocks: {
      languageVersion: 0,
      blocks: [firstBlock],
    },
  };
}

function createPythonRawCodeWorkspaceState(code = '') {
  const normalizedCode = String(code || '').trimEnd();

  if (!normalizedCode.trim()) {
    return null;
  }

  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: PYTHON_RAW_CODE_BLOCK_TYPE,
          x: 24,
          y: 24,
          fields: {
            CODE: normalizedCode,
          },
        },
      ],
    },
  };
}

function createPythonWorkspaceStateFromCode(code = '') {
  return createMiniworldsWorkspaceStateFromCode(code)
    || createPythonRawCodeWorkspaceState(code);
}

function registerPythonRawCodeBlock(Blockly) {
  if (!Blockly?.Blocks || Blockly.Blocks[PYTHON_RAW_CODE_BLOCK_TYPE]) {
    return;
  }

  const RawCodeField = Blockly.FieldMultilineInput || Blockly.FieldTextInput;

  Blockly.Blocks[PYTHON_RAW_CODE_BLOCK_TYPE] = {
    init() {
      this.appendDummyInput()
        .appendField('Python code')
        .appendField(new RawCodeField('print("Hello World")'), 'CODE');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#4D6C8D');
      this.setTooltip('Fuehrt Python-Code unveraendert aus.');
    },
  };
}

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
  toolbox: {
    ...PYTHON_TOOLBOX,
    contents: [
      {
        kind: 'category',
        name: 'Code',
        colour: '#4D6C8D',
        contents: [
          { kind: 'block', type: PYTHON_RAW_CODE_BLOCK_TYPE },
        ],
      },
      ...PYTHON_TOOLBOX.contents,
    ],
  },
  categoryFieldMap: PYTHON_CATEGORY_FIELDS,
  registerBlocks(Blockly) {
    registerPythonRawCodeBlock(Blockly);
    registerPythonOopBlocks(Blockly);

    const pythonGenerator = H5P.getBlocklyPythonGenerator();
    if (!pythonGenerator.forBlock[PYTHON_RAW_CODE_BLOCK_TYPE]) {
      pythonGenerator.forBlock[PYTHON_RAW_CODE_BLOCK_TYPE] = (block) => {
        const code = String(block.getFieldValue('CODE') || '').trimEnd();
        return code ? `${code}\n` : '';
      };
    }
  },
  buildDynamicCategories: (context) => [buildPythonProjectCategory(context)],
  createWorkspaceStateFromCode: createPythonWorkspaceStateFromCode,
  generate(workspace) {
    const pythonGenerator = H5P.getBlocklyPythonGenerator();
    return pythonGenerator.workspaceToCode(workspace) || '';
  },
  supported: true,
};

export function registerPythonBlocklyLanguagePack() {
  H5P.registerBlocklyLanguagePack(['python', 'pseudocode'], PYTHON_BLOCKLY_LANGUAGE_PACK);
}
