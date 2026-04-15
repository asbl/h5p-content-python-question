import { describe, expect, it } from 'vitest';

import {
  createPythonCompletionSource,
  detectPythonCompletionContext,
  inferPythonBindings,
} from '../src/scripts/services/python-autocomplete.js';

function createCompletionContext(code, pos = code.length, explicit = true) {
  return {
    pos,
    explicit,
    state: {
      doc: {
        toString: () => code,
      },
    },
    matchBefore(pattern) {
      const before = code.slice(0, pos);
      const match = before.match(new RegExp(`${pattern.source}$`, pattern.flags));

      if (!match) {
        return null;
      }

      const text = match[0];
      return {
        from: pos - text.length,
        to: pos,
        text,
      };
    },
  };
}

describe('Python autocomplete', () => {
  it('detects import, from-import and attribute contexts', () => {
    expect(detectPythonCompletionContext('import mini', 'import mini'.length)).toEqual({
      type: 'import',
      prefix: 'mini',
      from: 7,
    });
    expect(detectPythonCompletionContext('from miniworlds import Wo', 'from miniworlds import Wo'.length)).toEqual({
      type: 'from-import',
      moduleName: 'miniworlds',
      prefix: 'Wo',
      from: 23,
    });
    expect(detectPythonCompletionContext('world.mo', 'world.mo'.length)).toEqual({
      type: 'attribute',
      expression: 'world',
      prefix: 'mo',
      from: 6,
    });
  });

  it('infers miniworlds world, actor and costume bindings', () => {
    const bindings = inferPythonBindings([
      'import miniworlds as mw',
      'from miniworlds import Costume',
      'world = mw.World(400, 300)',
      'player = mw.Circle((20, 20), 20)',
      'costume = Costume()',
    ].join('\n'));

    expect(bindings.importedModules.get('mw')).toBe('miniworlds');
    expect(bindings.variableTypes.get('world')).toBe('world');
    expect(bindings.variableTypes.get('player')).toBe('actor');
    expect(bindings.variableTypes.get('costume')).toBe('costume');
  });

  it('suggests package and local module imports', () => {
    const source = createPythonCompletionSource({
      packageNames: ['miniworlds', 'pygame-ce'],
      workspaceFiles: [{ name: 'helper.py' }, { name: 'main.py' }],
    });
    const localModuleResult = source(createCompletionContext('import he'));

    expect(localModuleResult.options[0]).toEqual(expect.objectContaining({
      label: 'helper',
      type: 'module',
    }));

    const packageResult = source(createCompletionContext('import mi'));
    expect(packageResult.options[0]).toEqual(expect.objectContaining({
      label: 'miniworlds',
      type: 'module',
    }));
  });

  it('suggests miniworlds symbols for from-import statements', () => {
    const source = createPythonCompletionSource({ packageNames: ['miniworlds'] });
    const result = source(createCompletionContext('from miniworlds import Wo'));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'World',
      type: 'class',
    }));
  });

  it('suggests world members and mouse manager helpers', () => {
    const source = createPythonCompletionSource({ packageNames: ['miniworlds'] });
    const code = [
      'import miniworlds',
      'world = miniworlds.World(400, 300)',
      'world.mo',
    ].join('\n');
    const worldResult = source(createCompletionContext(code));

    expect(worldResult.options[0]).toEqual(expect.objectContaining({
      label: 'mouse',
      type: 'property',
    }));

    const mouseCode = [
      'import miniworlds',
      'world = miniworlds.World(400, 300)',
      'world.mouse.get_',
    ].join('\n');
    const mouseResult = source(createCompletionContext(mouseCode));

    expect(mouseResult.options[0]).toEqual(expect.objectContaining({
      label: 'get_position',
      type: 'method',
    }));
  });

  it('suggests actor members for self inside registered miniworlds handlers', () => {
    const source = createPythonCompletionSource({ packageNames: ['miniworlds'] });
    const code = [
      'import miniworlds',
      'player = miniworlds.Actor((20, 20))',
      '@player.register',
      'def act(self):',
      '    self.move_t',
    ].join('\n');
    const result = source(createCompletionContext(code));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'move_towards',
      type: 'method',
    }));
  });

  it('suggests p5 module members and event hooks', () => {
    const source = createPythonCompletionSource({ packageNames: ['p5'] });
    const moduleResult = source(createCompletionContext('import p5\np5.cr'));

    expect(moduleResult.options[0]).toEqual(expect.objectContaining({
      label: 'createCanvas',
      type: 'function',
    }));

    const eventResult = source(createCompletionContext('import p5\n\ndr'));
    expect(eventResult.options[0]).toEqual(expect.objectContaining({
      label: 'draw',
      type: 'function',
    }));
  });

  it('suggests turtle module members and turtle object methods', () => {
    const source = createPythonCompletionSource();
    const moduleResult = source(createCompletionContext('import turtle\nturtle.fo'));

    expect(moduleResult.options[0]).toEqual(expect.objectContaining({
      label: 'forward',
      type: 'function',
    }));

    const objectResult = source(createCompletionContext([
      'import turtle',
      't = turtle.Turtle()',
      't.fo',
    ].join('\n')));
    expect(objectResult.options[0]).toEqual(expect.objectContaining({
      label: 'forward',
      type: 'method',
    }));
  });
});