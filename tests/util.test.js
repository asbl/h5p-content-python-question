import { describe, expect, it } from 'vitest';

import Util from '../src/scripts/services/util.js';

describe('Util', () => {
  it('deep-merges own enumerable object properties into the target', () => {
    const inherited = { inherited: true };
    const source = Object.create(inherited);
    source.nested = { b: 2 };
    source.value = 'new';

    const target = {
      nested: { a: 1 },
      value: 'old',
    };

    expect(Util.extend(target, source, { extra: true })).toBe(target);
    expect(target).toEqual({
      nested: { a: 1, b: 2 },
      value: 'new',
      extra: true,
    });
    expect(target.inherited).toBeUndefined();
  });
});
