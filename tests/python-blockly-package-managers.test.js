import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import {
  buildPackageToolbox,
} from '../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/managers/blockly-language-manager.js';
import MatplotlibPackageManager from '../src/scripts/blockly/packages/matplotlib-package-manager.js';
import MiniworldsPackageManager from '../src/scripts/blockly/packages/miniworlds-package-manager.js';
import NumpyPackageManager from '../src/scripts/blockly/packages/numpy-package-manager.js';
import ScipyPackageManager from '../src/scripts/blockly/packages/scipy-package-manager.js';

const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Variablen', custom: 'VARIABLE' },
    { kind: 'category', name: 'Logik', contents: [{ kind: 'block', type: 'logic_boolean' }] },
    { kind: 'category', name: 'Schleifen', contents: [{ kind: 'block', type: 'controls_if' }] },
    { kind: 'category', name: 'Mathematik', contents: [{ kind: 'block', type: 'math_number' }] },
    { kind: 'category', name: 'Text', contents: [{ kind: 'block', type: 'text' }] },
    { kind: 'category', name: 'Listen', contents: [{ kind: 'block', type: 'lists_create_empty' }] },
    { kind: 'category', name: 'Funktionen', custom: 'PROCEDURE' },
  ],
};

describe('buildPackageToolbox (Python package managers)', () => {
  const toolbox = TOOLBOX;
  const packageManagers = [
    new NumpyPackageManager(),
    new MatplotlibPackageManager(),
    new MiniworldsPackageManager(),
    new ScipyPackageManager(),
  ];

  it('returns the original toolbox when no supported package is selected', () => {
    expect(buildPackageToolbox(toolbox, 'python', ['packaging'], packageManagers)).toBe(toolbox);
  });

  it('adds a NumPy category when numpy is selected', () => {
    const packageToolbox = buildPackageToolbox(toolbox, 'python', ['NumPy', 'numpy'], packageManagers);

    expect(packageToolbox).not.toBe(toolbox);

    const numpyCategories = packageToolbox.contents.filter((category) => category.name === 'NumPy');
    expect(numpyCategories).toHaveLength(1);
    expect(numpyCategories[0].contents.map((item) => item.type)).toEqual([
      'numpy_import_as',
      'numpy_array_create',
      'numpy_linspace',
      'numpy_mean',
    ]);
  });

  it('registers Blockly block types required by the NumPy category', () => {
    buildPackageToolbox(toolbox, 'python', ['numpy'], packageManagers);

    expect(Blockly.Blocks.numpy_import_as).toBeDefined();
    expect(Blockly.Blocks.numpy_array_create).toBeDefined();
    expect(Blockly.Blocks.numpy_linspace).toBeDefined();
    expect(Blockly.Blocks.numpy_mean).toBeDefined();
  });

  it('adds a Matplotlib category when matplotlib is selected', () => {
    const packageToolbox = buildPackageToolbox(toolbox, 'python', ['matplotlib'], packageManagers);

    const matplotlibCategories = packageToolbox.contents.filter((category) => category.name === 'Matplotlib');
    expect(matplotlibCategories).toHaveLength(1);
    expect(matplotlibCategories[0].contents.map((item) => item.type)).toEqual([
      'matplotlib_import_pyplot',
      'matplotlib_create_figure',
      'matplotlib_plot_line',
      'matplotlib_set_title',
      'matplotlib_show_plot',
    ]);
  });

  it('adds a SciPy category when scipy is selected', () => {
    const packageToolbox = buildPackageToolbox(toolbox, 'python', ['scipy'], packageManagers);

    const scipyCategories = packageToolbox.contents.filter((category) => category.name === 'SciPy');
    expect(scipyCategories).toHaveLength(1);
    expect(scipyCategories[0].contents.map((item) => item.type)).toEqual([
      'scipy_import_linalg',
      'scipy_linalg_solve',
    ]);
  });

  it('adds a Miniworlds category when miniworlds is selected', () => {
    const packageToolbox = buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const miniworldsCategories = packageToolbox.contents.filter((category) => (
      ['Miniworlds', 'World', 'Actor'].includes(category.name)
    ));
    expect(miniworldsCategories.map((category) => category.name)).toEqual([
      'Miniworlds',
      'World',
      'Actor',
    ]);
    expect(miniworldsCategories[0].contents.map((item) => item.type)).toEqual([
      'miniworlds_import_core',
      'miniworlds_rgb_color',
      'miniworlds_rgba_color',
      'miniworlds_play_sound',
    ]);
    expect(miniworldsCategories[1].contents.map((item) => item.type)).toEqual([
      'miniworlds_create_world',
      'miniworlds_add_background',
      'miniworlds_world_set_attribute',
      'miniworlds_world_get_attribute',
      'miniworlds_world_call_method',
      'miniworlds_world_event',
      'miniworlds_world_run',
      'miniworlds_create_tiled_world',
    ]);
    expect(miniworldsCategories[2].contents.map((item) => item.type)).toEqual([
      'miniworlds_create_actor',
      'miniworlds_actor_add_costume',
      'miniworlds_actor_set_costume_option',
      'miniworlds_actor_set_costume_index',
      'miniworlds_actor_move',
      'miniworlds_actor_move_by',
      'miniworlds_actor_move_to',
      'miniworlds_actor_move_towards',
      'miniworlds_actor_turn',
      'miniworlds_actor_detect',
      'miniworlds_actor_set_position',
      'miniworlds_actor_set_visible',
      'miniworlds_actor_remove',
      'miniworlds_create_circle',
      'miniworlds_create_rectangle',
      'miniworlds_actor_set_attribute',
      'miniworlds_actor_get_attribute',
      'miniworlds_actor_call_method',
      'miniworlds_actor_event_lifecycle',
      'miniworlds_actor_event_key_down',
      'miniworlds_actor_event_key_pressed',
      'miniworlds_actor_event_key',
      'miniworlds_actor_event_mouse',
      'miniworlds_after_delay',
    ]);
  });

  it('adds Miniworlds categories only for Miniworlds package variants', () => {
    ['miniworlds-data', 'miniworlds-robot', 'miniworlds-turtle'].forEach((packageName) => {
      const packageToolbox = buildPackageToolbox(toolbox, 'python', [packageName], packageManagers);

      expect(packageToolbox.contents.filter((category) => (
        ['Miniworlds', 'World', 'Actor'].includes(category.name)
      )).map((category) => category.name)).toEqual([
        'Miniworlds',
        'World',
        'Actor',
      ]);
    });

    expect(buildPackageToolbox(toolbox, 'python', ['numpy'], packageManagers).contents.some((category) => (
      ['Miniworlds', 'World', 'Actor'].includes(category.name)
    ))).toBe(false);
  });

  it('registers Blockly block types required by the Matplotlib category', () => {
    buildPackageToolbox(toolbox, 'python', ['matplotlib'], packageManagers);

    expect(Blockly.Blocks.matplotlib_import_pyplot).toBeDefined();
    expect(Blockly.Blocks.matplotlib_create_figure).toBeDefined();
    expect(Blockly.Blocks.matplotlib_plot_line).toBeDefined();
    expect(Blockly.Blocks.matplotlib_set_title).toBeDefined();
    expect(Blockly.Blocks.matplotlib_show_plot).toBeDefined();
  });

  it('registers Blockly block types required by the Miniworlds category', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    expect(Blockly.Blocks.miniworlds_import_core).toBeDefined();
    expect(Blockly.Blocks.miniworlds_rgb_color).toBeDefined();
    expect(Blockly.Blocks.miniworlds_create_world).toBeDefined();
    expect(Blockly.Blocks.miniworlds_add_background).toBeDefined();
    expect(Blockly.Blocks.miniworlds_world_set_attribute).toBeDefined();
    expect(Blockly.Blocks.miniworlds_world_get_attribute).toBeDefined();
    expect(Blockly.Blocks.miniworlds_world_call_method).toBeDefined();
    expect(Blockly.Blocks.miniworlds_create_actor).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_add_costume).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_move).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_detect).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_set_attribute).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_get_attribute).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_call_method).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_event_lifecycle).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_event_key_down).toBeDefined();
    expect(Blockly.Blocks.miniworlds_actor_event_key_pressed).toBeDefined();
    expect(Blockly.Blocks.miniworlds_world_event).toBeDefined();
    expect(Blockly.Blocks.miniworlds_world_run).toBeDefined();
  });

  it('generates Miniworlds actor key-down event handlers with body fallback', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const block = {
      getFieldValue: (fieldName) => ({
        ACTOR_VAR: 'player',
        KEY: 'w',
      })[fieldName],
    };
    const generatorWithBody = {
      statementToCode: () => '    player.move_up()\n',
    };
    const generatorWithoutBody = {
      statementToCode: () => '',
    };

    const handlerCode = pythonGenerator.forBlock.miniworlds_actor_event_key_down(
      block,
      generatorWithBody,
    );
    const fallbackCode = pythonGenerator.forBlock.miniworlds_actor_event_key_down(
      block,
      generatorWithoutBody,
    );

    expect(handlerCode).toBe('@player.register\ndef on_key_down_w(self):\n    player.move_up()\n');
    expect(fallbackCode).toBe('@player.register\ndef on_key_down_w(self):\n    pass\n');
  });

  it('generates a Miniworlds collision expression', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);
    const block = {
      getFieldValue: (fieldName) => ({ ACTOR_VAR: 'player', TARGET_VAR: 'coin' })[fieldName],
    };

    expect(pythonGenerator.forBlock.miniworlds_actor_detect(block)).toEqual([
      'player.detect(coin)',
      pythonGenerator.ORDER_FUNCTION_CALL,
    ]);
  });

  it('generates a callback body for delayed Miniworlds actions', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);
    const block = { id: 'timer-1' };
    const generator = {
      valueToCode: () => '500',
      statementToCode: () => '    player.move_right()\n',
    };

    expect(pythonGenerator.forBlock.miniworlds_after_delay(block, generator)).toBe(
      'def __h5p_timer_timer_1():\n    player.move_right()\nActionTimer(500, __h5p_timer_timer_1, None)\n'
    );
  });

  it('generates Miniworlds world events using selected event name', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const block = {
      getFieldValue: (fieldName) => ({
        WORLD_VAR: 'world',
        EVENT_NAME: 'act',
      })[fieldName],
    };
    const generator = {
      statementToCode: () => '    print("tick")\n',
    };

    const code = pythonGenerator.forBlock.miniworlds_world_event(block, generator);

    expect(code).toBe('@world.register\ndef act(self):\n    print("tick")\n');
  });

  it('generates Miniworlds world attribute assignments and reads', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const setterBlock = {
      getFieldValue: (fieldName) => ({
        WORLD_VAR: 'world',
        ATTRIBUTE_NAME: 'color',
      })[fieldName],
    };
    const getterBlock = {
      getFieldValue: (fieldName) => ({
        WORLD_VAR: 'world',
        ATTRIBUTE_NAME: 'color',
      })[fieldName],
    };
    const generator = {
      valueToCode: () => '(100, 100, 100)',
    };

    const setterCode = pythonGenerator.forBlock.miniworlds_world_set_attribute(setterBlock, generator);
    const getterCode = pythonGenerator.forBlock.miniworlds_world_get_attribute(getterBlock);
    const colorCode = pythonGenerator.forBlock.miniworlds_rgb_color({
      getFieldValue: (fieldName) => ({ R: 12, G: 34, B: 56 })[fieldName],
    });

    expect(setterCode).toBe('world.color = (100, 100, 100)\n');
    expect(getterCode).toEqual(['world.color', expect.any(Number)]);
    expect(colorCode).toEqual(['(12, 34, 56)', expect.any(Number)]);
  });

  it('generates Miniworlds actor method calls with optional arguments', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const block = {
      getFieldValue: (fieldName) => ({
        ACTOR_VAR: 'player',
        METHOD_NAME: 'move_to',
      })[fieldName],
    };
    const generator = {
      valueToCode: (currentBlock, inputName) => ({
        ARG1: '10',
        ARG2: '20',
      })[inputName] || '',
    };

    const code = pythonGenerator.forBlock.miniworlds_actor_call_method(block, generator);

    expect(code).toBe('player.move_to(10, 20)\n');
  });

  it('generates a runnable Miniworlds static actor example from serialized blocks', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'miniworlds_import_core',
            next: {
              block: {
                type: 'miniworlds_create_world',
                fields: { WORLD_VAR: 'world' },
                inputs: {
                  WIDTH: { shadow: { type: 'math_number', fields: { NUM: 320 } } },
                  HEIGHT: { shadow: { type: 'math_number', fields: { NUM: 240 } } },
                },
                next: {
                  block: {
                    type: 'miniworlds_world_set_attribute',
                    fields: { WORLD_VAR: 'world', ATTRIBUTE_NAME: 'color' },
                    inputs: {
                      VALUE: {
                        block: {
                          type: 'miniworlds_rgb_color',
                          fields: {
                            R: 35,
                            G: 45,
                            B: 55,
                          },
                        },
                      },
                    },
                    next: {
                      block: {
                        type: 'miniworlds_create_actor',
                        fields: { ACTOR_VAR: 'player' },
                        inputs: {
                          X: { shadow: { type: 'math_number', fields: { NUM: 80 } } },
                          Y: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
                        },
                        next: {
                          block: {
                            type: 'miniworlds_actor_set_attribute',
                            fields: { ACTOR_VAR: 'player', ATTRIBUTE_NAME: 'color' },
                            inputs: {
                              VALUE: {
                                block: {
                                  type: 'miniworlds_rgb_color',
                                  fields: {
                                    R: 240,
                                    G: 80,
                                    B: 60,
                                  },
                                },
                              },
                            },
                            next: {
                              block: {
                                type: 'miniworlds_world_run',
                                fields: { WORLD_VAR: 'world' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }, workspace);

    expect(pythonGenerator.workspaceToCode(workspace)).toBe(
      'from miniworlds import World, Actor, Circle, Rectangle, TiledWorld, ActionTimer\n'
      + 'world = World(320, 240)\n'
      + 'world.color = (35, 45, 55)\n'
      + 'player = Actor((80, 90))\n'
      + 'player.color = (240, 80, 60)\n'
      + 'world.run()\n',
    );
  });

  it('generates a runnable Miniworlds key-event movement example from serialized blocks', () => {
    buildPackageToolbox(toolbox, 'python', ['miniworlds'], packageManagers);

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'miniworlds_import_core',
            next: {
              block: {
                type: 'miniworlds_create_world',
                fields: { WORLD_VAR: 'world' },
                inputs: {
                  WIDTH: { shadow: { type: 'math_number', fields: { NUM: 320 } } },
                  HEIGHT: { shadow: { type: 'math_number', fields: { NUM: 240 } } },
                },
                next: {
                  block: {
                    type: 'miniworlds_create_actor',
                    fields: { ACTOR_VAR: 'player' },
                    inputs: {
                      X: { shadow: { type: 'math_number', fields: { NUM: 140 } } },
                      Y: { shadow: { type: 'math_number', fields: { NUM: 120 } } },
                    },
                    next: {
                      block: {
                        type: 'miniworlds_actor_event_key_down',
                        fields: { ACTOR_VAR: 'player', KEY: 'd' },
                        inputs: {
                          BODY: {
                            block: {
                              type: 'miniworlds_actor_move',
                              fields: { ACTOR_VAR: 'player', DIRECTION: 'move_right' },
                            },
                          },
                        },
                        next: {
                          block: {
                            type: 'miniworlds_world_run',
                            fields: { WORLD_VAR: 'world' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }, workspace);

    expect(pythonGenerator.workspaceToCode(workspace)).toBe(
      'from miniworlds import World, Actor, Circle, Rectangle, TiledWorld, ActionTimer\n'
      + 'world = World(320, 240)\n'
      + 'player = Actor((140, 120))\n'
      + '@player.register\n'
      + 'def on_key_down_d(self):\n'
      + '  player.move_right()\n'
      + 'world.run()\n',
    );
  });
});
