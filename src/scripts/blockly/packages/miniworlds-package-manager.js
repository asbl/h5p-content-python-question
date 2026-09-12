import {
  getBlocklyPythonGenerator,
  getBlocklyRuntime,
} from '../../../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/blockly-runtime.js';

const MINIWORLDS_CATEGORY_NAME = 'Miniworlds';
const MINIWORLDS_WORLD_CATEGORY_NAME = 'World';
const MINIWORLDS_ACTOR_CATEGORY_NAME = 'Actor';
const MINIWORLDS_CATEGORY_COLOUR = '#3C8D5A';

function getPythonMemberOrder() {
  const pythonGenerator = getBlocklyPythonGenerator();

  return pythonGenerator.ORDER_MEMBER
    ?? pythonGenerator.ORDER_FUNCTION_CALL
    ?? pythonGenerator.ORDER_NONE
    ?? 0;
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
 * Returns the generated statement body or a Python pass fallback.
 * @param {object} block Blockly block.
 * @param {object} generator Blockly generator.
 * @returns {string} Indented body code.
 */
function getEventBody(block, generator) {
  const body = generator.statementToCode(block, 'BODY');
  return body || '    pass\n';
}

/**
 * Returns the generated value or a fallback.
 * @param {object} block Blockly block.
 * @param {object} generator Blockly generator.
 * @param {string} inputName Blockly input key.
 * @param {string} fallback Python fallback code.
 * @returns {string} Generated expression.
 */
function getInputValue(block, generator, inputName, fallback) {
  const pythonGenerator = getBlocklyPythonGenerator();
  return generator.valueToCode(block, inputName, pythonGenerator.ORDER_NONE) || fallback;
}

/**
 * Builds a method call string with optional arguments.
 * @param {string} targetVar Variable name.
 * @param {string} methodName Method name.
 * @param {string[]} args List of raw Python argument expressions.
 * @returns {string} Python method call expression.
 */
function buildMethodCall(targetVar, methodName, args = []) {
  const normalizedArgs = args.filter((arg) => typeof arg === 'string' && arg.trim() !== '');
  return `${targetVar}.${methodName}(${normalizedArgs.join(', ')})`;
}

/**
 * Adds Miniworlds-specific Blockly blocks and category definitions.
 */
export default class MiniworldsPackageManager {
  /**
   * Returns the normalized package identifier.
   * @returns {string} Package name.
   */
  getPackageName() {
    return 'miniworlds';
  }

  /**
   * Returns all package identifiers that should expose Miniworlds blocks.
   * @returns {string[]} Package names.
   */
  getPackageNames() {
    return [
      'miniworlds',
      'miniworlds-data',
      'miniworlds-robot',
      'miniworlds-turtle',
    ];
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
   * Builds the toolbox categories for Miniworlds.
   * @returns {object[]} Blockly category descriptors.
   */
  buildCategory() {
    this._registerBlocks();

    return [
      {
        kind: 'category',
        name: MINIWORLDS_CATEGORY_NAME,
        colour: MINIWORLDS_CATEGORY_COLOUR,
        contents: [
          { kind: 'block', type: 'miniworlds_import_core' },
          { kind: 'block', type: 'miniworlds_rgb_color' },
          { kind: 'block', type: 'miniworlds_rgba_color' },
          { kind: 'block', type: 'miniworlds_play_sound' },
        ],
      },
      {
        kind: 'category',
        name: MINIWORLDS_WORLD_CATEGORY_NAME,
        colour: MINIWORLDS_CATEGORY_COLOUR,
        contents: [
          {
            kind: 'block',
            type: 'miniworlds_create_world',
            inputs: {
              WIDTH: {
                shadow: {
                  type: 'math_number',
                  fields: { NUM: 400 },
                },
              },
              HEIGHT: {
                shadow: {
                  type: 'math_number',
                  fields: { NUM: 400 },
                },
              },
            },
          },
          {
            kind: 'block',
            type: 'miniworlds_add_background',
            inputs: {
              PATH: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'images/grass.jpg' },
                },
              },
            },
          },
          {
            kind: 'block',
            type: 'miniworlds_world_set_attribute',
            inputs: {
              VALUE: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: '(100, 100, 100)' },
                },
              },
            },
          },
          { kind: 'block', type: 'miniworlds_world_get_attribute' },
          {
            kind: 'block',
            type: 'miniworlds_world_call_method',
            inputs: {
              ARG1: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'arg1' },
                },
              },
              ARG2: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'arg2' },
                },
              },
            },
          },
          { kind: 'block', type: 'miniworlds_world_event' },
          { kind: 'block', type: 'miniworlds_world_run' },
          { kind: 'block', type: 'miniworlds_create_tiled_world' },
        ],
      },
      {
        kind: 'category',
        name: MINIWORLDS_ACTOR_CATEGORY_NAME,
        colour: MINIWORLDS_CATEGORY_COLOUR,
        contents: [
          {
            kind: 'block',
            type: 'miniworlds_create_actor',
            inputs: {
              X: {
                shadow: {
                  type: 'math_number',
                  fields: { NUM: 90 },
                },
              },
              Y: {
                shadow: {
                  type: 'math_number',
                  fields: { NUM: 90 },
                },
              },
            },
          },
          {
            kind: 'block',
            type: 'miniworlds_actor_add_costume',
            inputs: {
              PATH: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'images/player.png' },
                },
              },
            },
          },
          { kind: 'block', type: 'miniworlds_actor_set_costume_option' },
          { kind: 'block', type: 'miniworlds_actor_set_costume_index' },
          { kind: 'block', type: 'miniworlds_actor_move' },
          { kind: 'block', type: 'miniworlds_actor_move_by' },
          { kind: 'block', type: 'miniworlds_actor_move_to' },
          { kind: 'block', type: 'miniworlds_actor_move_towards' },
          { kind: 'block', type: 'miniworlds_actor_turn' },
          { kind: 'block', type: 'miniworlds_actor_detect' },
          { kind: 'block', type: 'miniworlds_actor_set_position' },
          { kind: 'block', type: 'miniworlds_actor_set_visible' },
          { kind: 'block', type: 'miniworlds_actor_remove' },
          { kind: 'block', type: 'miniworlds_create_circle' },
          { kind: 'block', type: 'miniworlds_create_rectangle' },
          {
            kind: 'block',
            type: 'miniworlds_actor_set_attribute',
            inputs: {
              VALUE: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: '(255, 0, 0)' },
                },
              },
            },
          },
          { kind: 'block', type: 'miniworlds_actor_get_attribute' },
          {
            kind: 'block',
            type: 'miniworlds_actor_call_method',
            inputs: {
              ARG1: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'arg1' },
                },
              },
              ARG2: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'arg2' },
                },
              },
            },
          },
          { kind: 'block', type: 'miniworlds_actor_event_lifecycle' },
          { kind: 'block', type: 'miniworlds_actor_event_key_down' },
          { kind: 'block', type: 'miniworlds_actor_event_key_pressed' },
          { kind: 'block', type: 'miniworlds_actor_event_key' },
          { kind: 'block', type: 'miniworlds_actor_event_mouse' },
          { kind: 'block', type: 'miniworlds_after_delay' },
        ],
      },
    ];
  }

  /**
   * Registers all Miniworlds blocks and generators.
   */
  _registerBlocks() {
    const Blockly = getBlocklyRuntime();
    const pythonGenerator = getBlocklyPythonGenerator();
    const objectDropdown = (fieldName, fallback) => new Blockly.FieldDropdown(function getObjectOptions() {
      const workspace = this.getSourceBlock?.()?.workspace;
      const blockTypes = fieldName === 'WORLD_VAR'
        ? new Set(['miniworlds_create_world', 'miniworlds_create_tiled_world'])
        : new Set(['miniworlds_create_actor', 'miniworlds_create_circle', 'miniworlds_create_rectangle']);
      const sourceField = fieldName === 'WORLD_VAR' ? 'WORLD_VAR' : 'ACTOR_VAR';
      const names = workspace?.getAllBlocks?.(false)
        ?.filter((block) => blockTypes.has(block.type))
        .map((block) => String(block.getFieldValue(sourceField) || '').trim())
        .filter(Boolean) || [];
      const uniqueNames = [...new Set(names)];
      return uniqueNames.length ? uniqueNames.map((name) => [name, name]) : [[fallback, fallback]];
    });
    const optionDropdown = (options) => new Blockly.FieldDropdown(options.map((value) => [value, value]));

    if (!Blockly.Blocks.miniworlds_import_core) {
      Blockly.Blocks.miniworlds_import_core = {
        init() {
          this.appendDummyInput().appendField('from miniworlds import World, Actor');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Importiert die wichtigsten Miniworlds-Klassen.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_rgb_color) {
      Blockly.Blocks.miniworlds_rgb_color = {
        init() {
          this.appendDummyInput()
            .appendField('RGB')
            .appendField(new Blockly.FieldNumber(255, 0, 255, 1), 'R')
            .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'G')
            .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'B');
          this.setOutput(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Erzeugt eine Miniworlds-Farbe als Python-Tupel.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_create_world) {
      Blockly.Blocks.miniworlds_create_world = {
        init() {
          this.appendDummyInput()
            .appendField('world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField('= World');
          this.appendValueInput('WIDTH')
            .setCheck('Number')
            .appendField('breite');
          this.appendValueInput('HEIGHT')
            .setCheck('Number')
            .appendField('hoehe');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Erstellt eine neue Welt mit Breite und Hoehe.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_add_background) {
      Blockly.Blocks.miniworlds_add_background = {
        init() {
          this.appendDummyInput()
            .appendField('world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField('.add_background');
          this.appendValueInput('PATH').appendField('pfad');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Setzt den Hintergrund der Welt.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_world_set_attribute) {
      Blockly.Blocks.miniworlds_world_set_attribute = {
        init() {
          this.appendDummyInput()
            .appendField('world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField('.')
            .appendField(optionDropdown(['color', 'background_color', 'is_visible']), 'ATTRIBUTE_NAME')
            .appendField('=');
          this.appendValueInput('VALUE').appendField('wert');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Setzt ein World-Attribut wie z. B. color.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_world_get_attribute) {
      Blockly.Blocks.miniworlds_world_get_attribute = {
        init() {
          this.appendDummyInput()
            .appendField('world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField('.')
            .appendField(optionDropdown(['color', 'width', 'height', 'is_visible']), 'ATTRIBUTE_NAME');
          this.setOutput(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Liest ein World-Attribut wie z. B. color.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_world_call_method) {
      Blockly.Blocks.miniworlds_world_call_method = {
        init() {
          this.appendDummyInput()
            .appendField('world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField('.')
            .appendField(optionDropdown(['add_background', 'clear', 'reset']), 'METHOD_NAME');
          this.appendValueInput('ARG1').appendField('arg1');
          this.appendValueInput('ARG2').appendField('arg2');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Ruft eine World-Methode mit bis zu zwei Argumenten auf.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_create_actor) {
      Blockly.Blocks.miniworlds_create_actor = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('= Actor');
          this.appendValueInput('X')
            .setCheck('Number')
            .appendField('x');
          this.appendValueInput('Y')
            .setCheck('Number')
            .appendField('y');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Erstellt eine Figur an der Position (x, y).');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_add_costume) {
      Blockly.Blocks.miniworlds_actor_add_costume = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('.add_costume');
          this.appendValueInput('PATH').appendField('pfad');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Fuegt einer Figur ein Kostuem hinzu.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_move) {
      Blockly.Blocks.miniworlds_actor_move = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField(new Blockly.FieldDropdown([
              ['move_up', 'move_up'],
              ['move_down', 'move_down'],
              ['move_left', 'move_left'],
              ['move_right', 'move_right'],
            ]), 'DIRECTION');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Bewegt eine Figur in eine Richtung.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_detect) {
      Blockly.Blocks.miniworlds_actor_detect = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('berührt actor')
            .appendField(objectDropdown('TARGET_VAR', 'target'), 'TARGET_VAR');
          this.setOutput(true, 'Boolean');
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Prüft, ob zwei Actors einander berühren.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_set_attribute) {
      Blockly.Blocks.miniworlds_actor_set_attribute = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('.')
            .appendField(optionDropdown(['color', 'x', 'y', 'position', 'direction', 'is_visible']), 'ATTRIBUTE_NAME')
            .appendField('=');
          this.appendValueInput('VALUE').appendField('wert');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Setzt ein Actor-Attribut wie z. B. color.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_get_attribute) {
      Blockly.Blocks.miniworlds_actor_get_attribute = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('.')
            .appendField(optionDropdown(['color', 'x', 'y', 'position', 'direction', 'is_visible']), 'ATTRIBUTE_NAME');
          this.setOutput(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Liest ein Actor-Attribut wie z. B. color.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_call_method) {
      Blockly.Blocks.miniworlds_actor_call_method = {
        init() {
          this.appendDummyInput()
            .appendField('actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('.')
            .appendField(optionDropdown(['move', 'move_to', 'move_towards', 'remove']), 'METHOD_NAME');
          this.appendValueInput('ARG1').appendField('arg1');
          this.appendValueInput('ARG2').appendField('arg2');
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Ruft eine Actor-Methode mit bis zu zwei Argumenten auf.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_world_run) {
      Blockly.Blocks.miniworlds_world_run = {
        init() {
          this.appendDummyInput()
            .appendField('world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField('.run()');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Startet die Miniworlds-Welt.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_event_lifecycle) {
      Blockly.Blocks.miniworlds_actor_event_lifecycle = {
        init() {
          this.appendDummyInput()
            .appendField('event actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField(new Blockly.FieldDropdown([
              ['on_setup', 'on_setup'],
              ['act', 'act'],
            ]), 'EVENT_NAME');
          this.appendStatementInput('BODY').appendField('do');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Registriert ein Actor-Lifecycle-Event.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_event_key_down) {
      Blockly.Blocks.miniworlds_actor_event_key_down = {
        init() {
          this.appendDummyInput()
            .appendField('event actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('on_key_down')
            .appendField(new Blockly.FieldDropdown([
              ['w', 'w'],
              ['a', 'a'],
              ['s', 's'],
              ['d', 'd'],
              ['space', 'space'],
            ]), 'KEY');
          this.appendStatementInput('BODY').appendField('do');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Registriert ein key-down-Event fuer eine Taste.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_actor_event_key_pressed) {
      Blockly.Blocks.miniworlds_actor_event_key_pressed = {
        init() {
          this.appendDummyInput()
            .appendField('event actor')
            .appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
            .appendField('on_key_pressed(keys)');
          this.appendStatementInput('BODY').appendField('do');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Registriert ein key-pressed-Event mit keys-Parameter.');
        },
      };
    }

    if (!Blockly.Blocks.miniworlds_world_event) {
      Blockly.Blocks.miniworlds_world_event = {
        init() {
          this.appendDummyInput()
            .appendField('event world')
            .appendField(objectDropdown('WORLD_VAR', 'world'), 'WORLD_VAR')
            .appendField(new Blockly.FieldDropdown([
              ['on_setup', 'on_setup'],
              ['act', 'act'],
            ]), 'EVENT_NAME');
          this.appendStatementInput('BODY').appendField('do');
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
          this.setTooltip('Registriert ein World-Event.');
        },
      };
    }

    const statementBlock = (type, label, fields = [], inputs = []) => {
      if (Blockly.Blocks[type]) return;
      Blockly.Blocks[type] = {
        init() {
          const row = this.appendDummyInput().appendField(label);
          fields.forEach(([caption, name, value]) => row.appendField(caption).appendField(
            ['WORLD_VAR', 'ACTOR_VAR', 'TARGET_VAR'].includes(name)
              ? objectDropdown(name === 'WORLD_VAR' ? 'WORLD_VAR' : 'ACTOR_VAR', value)
              : new Blockly.FieldTextInput(value),
            name
          ));
          inputs.forEach(([name, caption, check]) => this.appendValueInput(name).setCheck(check || null).appendField(caption));
          this.setInputsInline(true);
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
          this.setColour(MINIWORLDS_CATEGORY_COLOUR);
        },
      };
    };

    if (!Blockly.Blocks.miniworlds_rgba_color) {
      Blockly.Blocks.miniworlds_rgba_color = {
        init() {
          this.appendDummyInput().appendField('RGBA')
            .appendField(new Blockly.FieldNumber(255, 0, 255, 1), 'R')
            .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'G')
            .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'B')
            .appendField(new Blockly.FieldNumber(255, 0, 255, 1), 'A');
          this.setOutput(true, null); this.setColour(MINIWORLDS_CATEGORY_COLOUR);
        },
      };
    }
    statementBlock('miniworlds_actor_move_by', 'bewege Actor', [['', 'ACTOR_VAR', 'player']], [['DISTANCE', 'um', 'Number']]);
    statementBlock('miniworlds_actor_move_to', 'setze Actor', [['', 'ACTOR_VAR', 'player']], [['X', 'x', 'Number'], ['Y', 'y', 'Number']]);
    statementBlock('miniworlds_actor_move_towards', 'Actor', [['', 'ACTOR_VAR', 'player'], ['bewegt sich zu', 'TARGET_VAR', 'target']], [['SPEED', 'mit Geschwindigkeit', 'Number']]);
    statementBlock('miniworlds_actor_turn', 'drehe Actor', [['', 'ACTOR_VAR', 'player'], ['Richtung', 'DIRECTION', 'left']], [['DEGREES', 'um Grad', 'Number']]);
    statementBlock('miniworlds_actor_set_position', 'setze Position Actor', [['', 'ACTOR_VAR', 'player']], [['X', 'x', 'Number'], ['Y', 'y', 'Number']]);
    statementBlock('miniworlds_actor_set_visible', 'Actor sichtbar', [['', 'ACTOR_VAR', 'player'], ['Wert', 'VISIBLE', 'True']]);
    statementBlock('miniworlds_actor_remove', 'entferne Actor', [['', 'ACTOR_VAR', 'player']]);
    statementBlock('miniworlds_create_circle', 'Kreis', [['', 'ACTOR_VAR', 'ball']], [['X', 'x', 'Number'], ['Y', 'y', 'Number'], ['RADIUS', 'Radius', 'Number']]);
    statementBlock('miniworlds_create_rectangle', 'Rechteck', [['', 'ACTOR_VAR', 'wall']], [['X', 'x', 'Number'], ['Y', 'y', 'Number'], ['WIDTH', 'Breite', 'Number'], ['HEIGHT', 'Höhe', 'Number']]);
    statementBlock('miniworlds_create_tiled_world', 'Kachelwelt', [['', 'WORLD_VAR', 'world']], [['COLUMNS', 'Spalten', 'Number'], ['ROWS', 'Zeilen', 'Number']]);
    statementBlock('miniworlds_play_sound', 'World', [['', 'WORLD_VAR', 'world']], [['PATH', 'spiele Sound', null]]);
    statementBlock('miniworlds_actor_set_costume_option', 'Kostüm Actor', [['', 'ACTOR_VAR', 'player'], ['Option', 'OPTION', 'is_rotatable'], ['Wert', 'VALUE', 'False']]);
    statementBlock('miniworlds_actor_set_costume_index', 'Actor', [['', 'ACTOR_VAR', 'player']], [['INDEX', 'Kostüm Nummer', 'Number']]);
    if (!Blockly.Blocks.miniworlds_after_delay) {
      Blockly.Blocks.miniworlds_after_delay = { init() {
        this.appendValueInput('DELAY').setCheck('Number').appendField('nach Millisekunden');
        this.appendStatementInput('BODY').appendField('mache');
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(MINIWORLDS_CATEGORY_COLOUR);
      } };
    }

    if (!Blockly.Blocks.miniworlds_actor_event_key) {
      Blockly.Blocks.miniworlds_actor_event_key = { init() {
        this.appendDummyInput().appendField('Actor').appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
          .appendField(new Blockly.FieldDropdown([['Taste gedrückt', 'on_key_down'], ['Taste gehalten', 'on_key_pressed']]), 'EVENT')
          .appendField(new Blockly.FieldDropdown([['↑', 'up'], ['↓', 'down'], ['←', 'left'], ['→', 'right'], ['w', 'w'], ['a', 'a'], ['s', 's'], ['d', 'd'], ['Leertaste', 'space']]), 'KEY');
        this.appendStatementInput('BODY').appendField('mache'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(MINIWORLDS_CATEGORY_COLOUR);
      } };
    }
    if (!Blockly.Blocks.miniworlds_actor_event_mouse) {
      Blockly.Blocks.miniworlds_actor_event_mouse = { init() {
        this.appendDummyInput().appendField('Actor').appendField(objectDropdown('ACTOR_VAR', 'player'), 'ACTOR_VAR')
          .appendField(new Blockly.FieldDropdown([['linke Maustaste', 'on_mouse_left_down'], ['Maus losgelassen', 'on_mouse_left_released'], ['Maus bewegt', 'on_mouse_motion']]), 'EVENT');
        this.appendStatementInput('BODY').appendField('mache'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(MINIWORLDS_CATEGORY_COLOUR);
      } };
    }

    if (!pythonGenerator.forBlock.miniworlds_import_core) {
      pythonGenerator.forBlock.miniworlds_import_core = () => 'from miniworlds import World, Actor, Circle, Rectangle, TiledWorld, ActionTimer\n';
    }

    if (!pythonGenerator.forBlock.miniworlds_rgb_color) {
      pythonGenerator.forBlock.miniworlds_rgb_color = (block) => {
        const r = Number(block.getFieldValue('R') || 0);
        const g = Number(block.getFieldValue('G') || 0);
        const b = Number(block.getFieldValue('B') || 0);
        return [`(${r}, ${g}, ${b})`, pythonGenerator.ORDER_ATOMIC];
      };
    }
    pythonGenerator.forBlock.miniworlds_rgba_color ||= (block) => [
      `(${['R', 'G', 'B', 'A'].map((name) => Number(block.getFieldValue(name) || 0)).join(', ')})`,
      pythonGenerator.ORDER_ATOMIC,
    ];

    if (!pythonGenerator.forBlock.miniworlds_create_world) {
      pythonGenerator.forBlock.miniworlds_create_world = (block, generator) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        const width = getInputValue(block, generator, 'WIDTH', '400');
        const height = getInputValue(block, generator, 'HEIGHT', '400');
        return `${worldVar} = World(${width}, ${height})\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_add_background) {
      pythonGenerator.forBlock.miniworlds_add_background = (block, generator) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        const path = getInputValue(block, generator, 'PATH', '\'images/grass.jpg\'');
        return `${worldVar}.add_background(${path})\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_world_set_attribute) {
      pythonGenerator.forBlock.miniworlds_world_set_attribute = (block, generator) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        const attributeName = sanitizePythonIdentifier(block.getFieldValue('ATTRIBUTE_NAME'), 'color');
        const value = getInputValue(block, generator, 'VALUE', '(100, 100, 100)');
        return `${worldVar}.${attributeName} = ${value}\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_world_get_attribute) {
      pythonGenerator.forBlock.miniworlds_world_get_attribute = (block) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        const attributeName = sanitizePythonIdentifier(block.getFieldValue('ATTRIBUTE_NAME'), 'color');
        return [`${worldVar}.${attributeName}`, getPythonMemberOrder()];
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_world_call_method) {
      pythonGenerator.forBlock.miniworlds_world_call_method = (block, generator) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        const methodName = sanitizePythonIdentifier(block.getFieldValue('METHOD_NAME'), 'method_name');
        const arg1 = generator.valueToCode(block, 'ARG1', pythonGenerator.ORDER_NONE);
        const arg2 = generator.valueToCode(block, 'ARG2', pythonGenerator.ORDER_NONE);
        return `${buildMethodCall(worldVar, methodName, [arg1, arg2])}\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_create_actor) {
      pythonGenerator.forBlock.miniworlds_create_actor = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const x = getInputValue(block, generator, 'X', '90');
        const y = getInputValue(block, generator, 'Y', '90');
        return `${actorVar} = Actor((${x}, ${y}))\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_add_costume) {
      pythonGenerator.forBlock.miniworlds_actor_add_costume = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const path = getInputValue(block, generator, 'PATH', '\'images/player.png\'');
        return `${actorVar}.add_costume(${path})\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_move) {
      pythonGenerator.forBlock.miniworlds_actor_move = (block) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const direction = String(block.getFieldValue('DIRECTION') || 'move_right').trim();
        return `${actorVar}.${direction}()\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_detect) {
      pythonGenerator.forBlock.miniworlds_actor_detect = (block) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const targetVar = sanitizePythonIdentifier(block.getFieldValue('TARGET_VAR'), 'target');
        return [`${actorVar}.detect(${targetVar})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };
    }
    const actor = (block) => sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
    const value = (block, generator, name, fallback) => getInputValue(block, generator, name, fallback);
    pythonGenerator.forBlock.miniworlds_actor_move_by ||= (block, generator) => `${actor(block)}.move(${value(block, generator, 'DISTANCE', '10')})\n`;
    pythonGenerator.forBlock.miniworlds_actor_move_to ||= (block, generator) => `${actor(block)}.move_to(${value(block, generator, 'X', '0')}, ${value(block, generator, 'Y', '0')})\n`;
    pythonGenerator.forBlock.miniworlds_actor_move_towards ||= (block, generator) => `${actor(block)}.move_towards(${sanitizePythonIdentifier(block.getFieldValue('TARGET_VAR'), 'target')}, ${value(block, generator, 'SPEED', '1')})\n`;
    pythonGenerator.forBlock.miniworlds_actor_turn ||= (block, generator) => `${actor(block)}.turn_${block.getFieldValue('DIRECTION') === 'right' ? 'right' : 'left'}(${value(block, generator, 'DEGREES', '15')})\n`;
    pythonGenerator.forBlock.miniworlds_actor_set_position ||= (block, generator) => `${actor(block)}.position = (${value(block, generator, 'X', '0')}, ${value(block, generator, 'Y', '0')})\n`;
    pythonGenerator.forBlock.miniworlds_actor_set_visible ||= (block) => `${actor(block)}.is_visible = ${block.getFieldValue('VISIBLE') === 'False' ? 'False' : 'True'}\n`;
    pythonGenerator.forBlock.miniworlds_actor_remove ||= (block) => `${actor(block)}.remove()\n`;
    pythonGenerator.forBlock.miniworlds_create_circle ||= (block, generator) => `${actor(block)} = Circle((${value(block, generator, 'X', '0')}, ${value(block, generator, 'Y', '0')}), ${value(block, generator, 'RADIUS', '20')})\n`;
    pythonGenerator.forBlock.miniworlds_create_rectangle ||= (block, generator) => `${actor(block)} = Rectangle((${value(block, generator, 'X', '0')}, ${value(block, generator, 'Y', '0')}), ${value(block, generator, 'WIDTH', '20')}, ${value(block, generator, 'HEIGHT', '20')})\n`;
    pythonGenerator.forBlock.miniworlds_create_tiled_world ||= (block, generator) => `${sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world')} = TiledWorld(${value(block, generator, 'COLUMNS', '10')}, ${value(block, generator, 'ROWS', '10')})\n`;
    pythonGenerator.forBlock.miniworlds_play_sound ||= (block, generator) => `${sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world')}.sound.play(${value(block, generator, 'PATH', '\'sound.wav\'')})\n`;
    pythonGenerator.forBlock.miniworlds_actor_set_costume_option ||= (block) => `${actor(block)}.costume.${sanitizePythonIdentifier(block.getFieldValue('OPTION'), 'is_rotatable')} = ${block.getFieldValue('VALUE') === 'True' ? 'True' : 'False'}\n`;
    pythonGenerator.forBlock.miniworlds_actor_set_costume_index ||= (block, generator) => `${actor(block)}.costume_number = ${value(block, generator, 'INDEX', '0')}\n`;
    pythonGenerator.forBlock.miniworlds_after_delay ||= (block, generator) => {
      const callback = `__h5p_timer_${String(block.id || 'callback').replace(/[^A-Za-z0-9_]/g, '_')}`;
      const body = getEventBody(block, generator);
      return `def ${callback}():\n${body}ActionTimer(${value(block, generator, 'DELAY', '1000')}, ${callback}, None)\n`;
    };
    pythonGenerator.forBlock.miniworlds_actor_event_key ||= (block, generator) => `@${actor(block)}.register\ndef ${block.getFieldValue('EVENT')}_${sanitizePythonIdentifier(block.getFieldValue('KEY'), 'w')}(self):\n${getEventBody(block, generator)}`;
    pythonGenerator.forBlock.miniworlds_actor_event_mouse ||= (block, generator) => `@${actor(block)}.register\ndef ${block.getFieldValue('EVENT')}(self, position):\n${getEventBody(block, generator)}`;

    if (!pythonGenerator.forBlock.miniworlds_actor_set_attribute) {
      pythonGenerator.forBlock.miniworlds_actor_set_attribute = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const attributeName = sanitizePythonIdentifier(block.getFieldValue('ATTRIBUTE_NAME'), 'color');
        const value = getInputValue(block, generator, 'VALUE', '(255, 0, 0)');
        return `${actorVar}.${attributeName} = ${value}\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_get_attribute) {
      pythonGenerator.forBlock.miniworlds_actor_get_attribute = (block) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const attributeName = sanitizePythonIdentifier(block.getFieldValue('ATTRIBUTE_NAME'), 'color');
        return [`${actorVar}.${attributeName}`, getPythonMemberOrder()];
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_call_method) {
      pythonGenerator.forBlock.miniworlds_actor_call_method = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const methodName = sanitizePythonIdentifier(block.getFieldValue('METHOD_NAME'), 'move_to');
        const arg1 = generator.valueToCode(block, 'ARG1', pythonGenerator.ORDER_NONE);
        const arg2 = generator.valueToCode(block, 'ARG2', pythonGenerator.ORDER_NONE);
        return `${buildMethodCall(actorVar, methodName, [arg1, arg2])}\n`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_event_lifecycle) {
      pythonGenerator.forBlock.miniworlds_actor_event_lifecycle = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const eventName = String(block.getFieldValue('EVENT_NAME') || 'act').trim();
        const body = getEventBody(block, generator);
        return `@${actorVar}.register\ndef ${eventName}(self):\n${body}`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_event_key_down) {
      pythonGenerator.forBlock.miniworlds_actor_event_key_down = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const keySuffix = sanitizePythonIdentifier(block.getFieldValue('KEY'), 'w');
        const body = getEventBody(block, generator);
        return `@${actorVar}.register\ndef on_key_down_${keySuffix}(self):\n${body}`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_actor_event_key_pressed) {
      pythonGenerator.forBlock.miniworlds_actor_event_key_pressed = (block, generator) => {
        const actorVar = sanitizePythonIdentifier(block.getFieldValue('ACTOR_VAR'), 'player');
        const body = getEventBody(block, generator);
        return `@${actorVar}.register\ndef on_key_pressed(self, keys):\n${body}`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_world_event) {
      pythonGenerator.forBlock.miniworlds_world_event = (block, generator) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        const eventName = String(block.getFieldValue('EVENT_NAME') || 'act').trim();
        const body = getEventBody(block, generator);
        return `@${worldVar}.register\ndef ${eventName}(self):\n${body}`;
      };
    }

    if (!pythonGenerator.forBlock.miniworlds_world_run) {
      pythonGenerator.forBlock.miniworlds_world_run = (block) => {
        const worldVar = sanitizePythonIdentifier(block.getFieldValue('WORLD_VAR'), 'world');
        return `${worldVar}.run()\n`;
      };
    }
  }
}
