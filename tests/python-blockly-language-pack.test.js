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

  it('falls back to a raw Python block for unsupported Python code', () => {
    const state = PYTHON_BLOCKLY_LANGUAGE_PACK.createWorkspaceStateFromCode(
      'print("Hello")\n',
    );

    expect(state.blocks.blocks[0].type).toBe('python_raw_code');
  });
});
