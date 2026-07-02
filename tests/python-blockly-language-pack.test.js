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

  it('creates Miniworlds blocks from a static actor starter program', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'from miniworlds import World, Actor\n'
      + 'world = World(320, 240)\n'
      + 'world.color = (35, 45, 55)\n'
      + 'player = Actor((80, 90))\n'
      + 'player.color = (240, 80, 60)\n'
      + 'world.run()\n',
    );
    const firstBlock = state.blocks.blocks[0];

    expect(firstBlock.type).toBe('miniworlds_import_core');
    expect(firstBlock.next.block.type).toBe('miniworlds_create_world');
    expect(firstBlock.next.block.next.block.type).toBe('miniworlds_world_set_attribute');
    expect(firstBlock.next.block.next.block.next.block.type).toBe('miniworlds_create_actor');
    expect(firstBlock.next.block.next.block.next.block.next.block.type).toBe('miniworlds_actor_set_attribute');
    expect(firstBlock.next.block.next.block.next.block.next.block.next.block.type).toBe('miniworlds_world_run');
  });

  it('creates Miniworlds event blocks from a key-down starter program', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'from miniworlds import World, Actor\n'
      + 'world = World(320, 240)\n'
      + 'player = Actor((140, 120))\n'
      + '@player.register\n'
      + 'def on_key_down_d(self):\n'
      + '  player.move_right()\n'
      + 'world.run()\n',
    );
    const eventBlock = state.blocks.blocks[0].next.block.next.block.next.block;

    expect(eventBlock.type).toBe('miniworlds_actor_event_key_down');
    expect(eventBlock.fields).toEqual({ ACTOR_VAR: 'player', KEY: 'd' });
    expect(eventBlock.inputs.BODY.block.type).toBe('miniworlds_actor_move');
  });

  it('parses module imports, assets and unknown statements without losing structured blocks', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'import miniworlds\n'
      + 'world = miniworlds.World()\n'
      + 'world.add_background("images/grass.png")\n'
      + 'player = miniworlds.Actor((20, 30))\n'
      + 'player.add_costume("images/player.png")\n'
      + 'score = 0\n'
      + 'world.run()\n',
    );
    const [first] = state.blocks.blocks;

    expect(first.type).toBe('miniworlds_import_core');
    expect(first.next.block.type).toBe('miniworlds_create_world');
    expect(first.next.block.next.block.type).toBe('miniworlds_add_background');
    expect(first.next.block.next.block.next.block.type).toBe('miniworlds_create_actor');
    expect(first.next.block.next.block.next.block.next.block.type).toBe('miniworlds_actor_add_costume');
    expect(first.next.block.next.block.next.block.next.block.next.block.type).toBe('python_raw_code');
    expect(first.next.block.next.block.next.block.next.block.next.block.next.block.type).toBe('miniworlds_world_run');
  });

  it('keeps complex event bodies local to their Miniworlds event block', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'from miniworlds import World, Actor\n'
      + 'world = World(320, 240)\n'
      + 'player = Actor((20, 30))\n'
      + '@player.register\n'
      + 'def on_key_pressed(self, keys):\n'
      + '    if "UP" in keys:\n'
      + '        self.move_up()\n'
      + 'world.run()\n',
    );
    const event = state.blocks.blocks[0].next.block.next.block.next.block;

    expect(event.type).toBe('miniworlds_actor_event_key_pressed');
    expect(event.inputs.BODY.block.type).toBe('python_raw_code');
    expect(event.inputs.BODY.block.fields.CODE).toContain('if "UP" in keys:');
  });

  it('imports Miniworlds shapes and actions as structured blocks', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'from miniworlds import World, Actor\n'
      + 'world = World(320, 240)\n'
      + 'ball = Circle((80, 120), 20)\n'
      + 'wall = Rectangle((160, 110), 80, 20)\n'
      + 'ball.move(5)\n'
      + 'ball.turn_right(15)\n'
      + 'world.sound.play("sounds/click.wav")\n'
      + 'world.run()\n',
    );
    const types = [];
    let block = state.blocks.blocks[0];
    while (block) {
      types.push(block.type);
      block = block.next?.block;
    }

    expect(types).toEqual([
      'miniworlds_import_core',
      'miniworlds_create_world',
      'miniworlds_create_circle',
      'miniworlds_create_rectangle',
      'miniworlds_actor_move_by',
      'miniworlds_actor_turn',
      'miniworlds_play_sound',
      'miniworlds_world_run',
    ]);
  });

  it('keeps signed and decimal Miniworlds coordinates as editable number blocks', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'from miniworlds import World, Actor\n'
      + 'world = World(320.5, 240)\n'
      + 'player = Actor((-10, 30.25))\n'
      + 'player.move(-5)\n'
      + 'player.move_to(-20.5, 3.25)\n'
      + 'player.turn_left(12.5)\n'
      + 'world.run()\n',
    );
    const blocks = [];
    let block = state.blocks.blocks[0];
    while (block) {
      blocks.push(block);
      block = block.next?.block;
    }

    expect(blocks.map(({ type }) => type)).toEqual([
      'miniworlds_import_core',
      'miniworlds_create_world',
      'miniworlds_create_actor',
      'miniworlds_actor_move_by',
      'miniworlds_actor_move_to',
      'miniworlds_actor_turn',
      'miniworlds_world_run',
    ]);
    expect(blocks[1].inputs.WIDTH.shadow.fields.NUM).toBe(320.5);
    expect(blocks[2].inputs.X.shadow.fields.NUM).toBe(-10);
    expect(blocks[4].inputs.X.shadow.fields.NUM).toBe(-20.5);
    expect(blocks[5].inputs.DEGREES.shadow.fields.NUM).toBe(12.5);
  });

  it('preserves named arguments and multiline calls in local raw-code blocks', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'from miniworlds import World\n'
      + 'world = World(width=320, height=240)\n'
      + 'world.add_background(\n'
      + '    "images/grass.png"\n'
      + ')\n'
      + 'world.run()\n',
    );
    const blocks = [];
    let block = state.blocks.blocks[0];
    while (block) {
      blocks.push(block);
      block = block.next?.block;
    }

    expect(blocks.map(({ type }) => type)).toEqual([
      'miniworlds_import_core',
      'python_raw_code',
      'python_raw_code',
      'python_raw_code',
      'python_raw_code',
      'miniworlds_world_run',
    ]);
    expect(blocks.slice(1, 5).map((item) => item.fields.CODE).join('\n')).toContain('width=320');
    expect(blocks.slice(1, 5).map((item) => item.fields.CODE).join('\n')).toContain('"images/grass.png"');
  });

  it('falls back to a raw Python block for unsupported Python code', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'print("Hello")\n',
    );

    expect(state.blocks.blocks[0].type).toBe('python_raw_code');
  });
});
