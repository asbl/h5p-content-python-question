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

function createMiniworldsShapeBlock(type, match, fields) {
  return {
    type,
    fields: { ACTOR_VAR: match[1] },
    inputs: fields.reduce((inputs, [name, value]) => ({ ...inputs, [name]: createNumberShadow(value) }), {}),
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

function createPythonRawCodeBlock(code) {
  return {
    type: PYTHON_RAW_CODE_BLOCK_TYPE,
    fields: { CODE: String(code || '').trimEnd() },
  };
}

function createTextInput(value) {
  return {
    shadow: {
      type: 'text',
      fields: { TEXT: String(value || '').replace(/^(?:'|")|(?:'|")$/g, '') },
    },
  };
}

function createMiniworldsEventBlock(target, functionName, body) {
  const moveMatch = body.trim().match(/^([A-Za-z_]\w*)\.(move_(?:up|down|left|right))\(\)$/);
  const bodyBlock = moveMatch && moveMatch[1] === target
    ? createMiniworldsActorMoveBlock(moveMatch)
    : createPythonRawCodeBlock(body.replace(/^\s+/, ''));
  const bodyInput = { block: bodyBlock };

  const keyDownMatch = functionName.match(/^on_key_down_([A-Za-z0-9_]+)$/);
  if (keyDownMatch) {
    return {
      type: 'miniworlds_actor_event_key_down',
      fields: { ACTOR_VAR: target, KEY: keyDownMatch[1] },
      inputs: { BODY: bodyInput },
    };
  }

  if (functionName === 'on_key_pressed') {
    return {
      type: 'miniworlds_actor_event_key_pressed',
      fields: { ACTOR_VAR: target },
      inputs: { BODY: bodyInput },
    };
  }

  if (functionName === 'act' || functionName === 'on_setup') {
    return {
      type: target === 'world' ? 'miniworlds_world_event' : 'miniworlds_actor_event_lifecycle',
      fields: target === 'world'
        ? { WORLD_VAR: target, EVENT_NAME: functionName }
        : { ACTOR_VAR: target, EVENT_NAME: functionName },
      inputs: { BODY: bodyInput },
    };
  }

  return createPythonRawCodeBlock(`@${target}.register\ndef ${functionName}(self):\n${body}`);
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

/**
 * Parses the Miniworlds subset of Python into Blockly's serializable state.
 * This deliberately small indentation-aware parser is used in the browser,
 * where Python's AST module is not available. Unknown statements become local
 * raw-code blocks, preserving the rest of the program as editable blocks.
 */
function createMiniworldsWorkspaceStateFromCode(code = '') {
  const lines = String(code || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((text) => ({ text: text.trimEnd(), indent: text.match(/^\s*/)[0].length }));
  const blocks = [];
  const worldVars = new Set();
  const actorVars = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = lines[index];
    const line = sourceLine.text.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (/^(?:from\s+miniworlds\s+import\s+.+|import\s+miniworlds(?:\s+as\s+\w+)?)$/.test(line)) {
      blocks.push(createMiniworldsImportBlock());
      continue;
    }

    let match = line.match(/^([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?World\((\d+)\s*,\s*(\d+)\)$/);
    if (match) {
      worldVars.add(match[1]);
      blocks.push(createMiniworldsWorldBlock(match));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?World\(\)$/);
    if (match) {
      worldVars.add(match[1]);
      blocks.push(createMiniworldsWorldBlock([null, match[1], 400, 400]));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?Actor\(\((\d+)\s*,\s*(\d+)\)\)$/);
    if (match) {
      actorVars.add(match[1]);
      blocks.push(createMiniworldsActorBlock(match));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?Circle\(\((\d+)\s*,\s*(\d+)\)\s*,\s*(\d+)\)$/);
    if (match) {
      actorVars.add(match[1]);
      blocks.push(createMiniworldsShapeBlock('miniworlds_create_circle', match, [['X', match[2]], ['Y', match[3]], ['RADIUS', match[4]]]));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?Rectangle\(\((\d+)\s*,\s*(\d+)\)\s*,\s*(\d+)\s*,\s*(\d+)\)$/);
    if (match) {
      actorVars.add(match[1]);
      blocks.push(createMiniworldsShapeBlock('miniworlds_create_rectangle', match, [['X', match[2]], ['Y', match[3]], ['WIDTH', match[4]], ['HEIGHT', match[5]]]));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?TiledWorld\((\d+)\s*,\s*(\d+)\)$/);
    if (match) {
      worldVars.add(match[1]);
      blocks.push({ type: 'miniworlds_create_tiled_world', fields: { WORLD_VAR: match[1] }, inputs: { COLUMNS: createNumberShadow(match[2]), ROWS: createNumberShadow(match[3]) } });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.add_background\((.+)\)$/);
    if (match) {
      const valueInput = createRgbColorBlock(match[2]) || createTextInput(match[2]);
      blocks.push({
        type: 'miniworlds_add_background',
        fields: { WORLD_VAR: match[1] },
        inputs: { PATH: valueInput },
      });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.add_costume\((.+)\)$/);
    if (match) {
      blocks.push({
        type: 'miniworlds_actor_add_costume',
        fields: { ACTOR_VAR: match[1] },
        inputs: { PATH: createTextInput(match[2]) },
      });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.move\((\d+)\)$/);
    if (match) {
      blocks.push({ type: 'miniworlds_actor_move_by', fields: { ACTOR_VAR: match[1] }, inputs: { DISTANCE: createNumberShadow(match[2]) } });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.move_to\((\d+)\s*,\s*(\d+)\)$/);
    if (match) {
      blocks.push({ type: 'miniworlds_actor_move_to', fields: { ACTOR_VAR: match[1] }, inputs: { X: createNumberShadow(match[2]), Y: createNumberShadow(match[3]) } });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.turn_(left|right)\((\d+)\)$/);
    if (match) {
      blocks.push({ type: 'miniworlds_actor_turn', fields: { ACTOR_VAR: match[1], DIRECTION: match[2] }, inputs: { DEGREES: createNumberShadow(match[3]) } });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.remove\(\)$/);
    if (match) {
      blocks.push({ type: 'miniworlds_actor_remove', fields: { ACTOR_VAR: match[1] } });
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.sound\.play\((.+)\)$/);
    if (match) {
      blocks.push({ type: 'miniworlds_play_sound', fields: { WORLD_VAR: match[1] }, inputs: { PATH: createTextInput(match[2]) } });
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

    const decoratorMatch = line.match(/^@([A-Za-z_]\w*)\.register$/);
    const defMatch = lines[index + 1]?.text.trim().match(/^def\s+([A-Za-z_]\w*)\(self(?:,\s*keys)?\):$/);
    if (decoratorMatch && defMatch) {
      const bodyIndent = lines[index + 2]?.indent;
      let endIndex = index + 2;
      while (endIndex < lines.length && (!lines[endIndex].text.trim() || lines[endIndex].indent >= bodyIndent)) {
        endIndex += 1;
      }
      const body = lines
        .slice(index + 2, endIndex)
        .map((entry) => entry.text.slice(Math.min(bodyIndent || 0, entry.indent)))
        .join('\n')
        .trim();
      blocks.push(createMiniworldsEventBlock(decoratorMatch[1], defMatch[1], body || 'pass'));
      index = endIndex - 1;
      continue;
    }

    blocks.push(createPythonRawCodeBlock(sourceLine.text));
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
