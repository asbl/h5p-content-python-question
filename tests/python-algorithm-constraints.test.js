import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  getAlgorithmConstraintHarness,
  RESULT_PREFIX,
} from '../src/scripts/services/python-algorithm-constraints.js';

function runConstraintHarness(source, constraints = {}, functionName = 'answer') {
  const { token, code } = getAlgorithmConstraintHarness(source, constraints, functionName);
  const marker = `${RESULT_PREFIX}${token}:`;
  const output = execFileSync('python3', ['-c', code], { encoding: 'utf8' });
  const resultLine = output
    .trim()
    .split('\n')
    .find((line) => line.startsWith(marker));

  if (!resultLine) {
    throw new Error(`Missing constraint result marker: ${marker}`);
  }

  return JSON.parse(resultLine.slice(marker.length));
}

describe('algorithm constraint harness', () => {
  it('passes recursive solutions with a base case and required return', () => {
    const result = runConstraintHarness([
      'def factorial(n):',
      '    if n <= 1:',
      '        return 1',
      '    return n * factorial(n - 1)',
    ].join('\n'), {
      requireRecursion: true,
      requireBaseCase: true,
      requireReturn: true,
      maxRecursiveCalls: 1,
    }, 'factorial');

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it('reports missing function, loop and return constraints', () => {
    const result = runConstraintHarness('def other():\n    pass', {
      requiredLoop: 'for',
      requireReturn: true,
    }, 'answer');

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([
      'Required function not found',
      'For loop required',
      'Return statement required',
    ]));
  });

  it('checks loop nesting, forbidden calls and top-level assignments only in the target scope', () => {
    const result = runConstraintHarness([
      'total = 0',
      'def answer(values):',
      '    def helper():',
      '        eval("1")',
      '    for value in values:',
      '        while value > 0:',
      '            print(value)',
      '            value -= 1',
      '    return total',
    ].join('\n'), {
      maxLoopNesting: 1,
      forbidTopLevelAssignments: true,
      forbiddenCalls: 'print, eval',
    });

    expect(result.violations).toEqual(expect.arrayContaining([
      'Loop nesting too deep',
      'Top-level assignments are not allowed',
      'Forbidden call: print',
    ]));
    expect(result.violations).not.toContain('Forbidden call: eval');
  });

  it('normalizes required and forbidden data-structure configuration entries', () => {
    const result = runConstraintHarness([
      'def answer(values):',
      '    seen = set(values)',
      '    pairs = (1, 2)',
      '    return seen',
    ].join('\n'), {
      requiredDataStructures: [{ structure: 'set' }, { structure: 'list' }],
      forbiddenDataStructures: [{ structure: 'tuple' }, { structure: 'queue' }],
    });

    expect(result.violations).toEqual(expect.arrayContaining([
      'Required data structure: list',
      'Forbidden data structure: tuple',
    ]));
    expect(result.violations).not.toContain('Required data structure: queue');
  });

  it('also accepts comma-separated data-structure configuration entries', () => {
    const result = runConstraintHarness([
      'def answer(values):',
      '    items = list(values)',
      '    return items',
    ].join('\n'), {
      requiredDataStructures: 'list, dict',
      forbiddenDataStructures: 'set, tuple',
    });

    expect(result.violations).toEqual(['Required data structure: dict']);
  });

  it('checks required OOP class, constructor, methods, attributes and instantiation', () => {
    const result = runConstraintHarness([
      'class Person:',
      '    def __init__(self, name):',
      '        self.name = name',
      '    def greet(self):',
      '        return "Hallo " + self.name',
      '',
      'def answer():',
      '    person = Person("Ada")',
      '    return person.greet()',
    ].join('\n'), {
      requiredClassNames: 'Person',
      requiredMethodNames: 'Person.__init__, greet',
      requiredInstanceAttributes: 'Person.name',
      requireConstructor: true,
      requireObjectInstantiation: true,
    });

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it('reports missing OOP structures and forbidden classes', () => {
    const result = runConstraintHarness([
      'class Helper:',
      '    def answer(self):',
      '        return 1',
      '',
      'def answer():',
      '    return 1',
    ].join('\n'), {
      requiredClassNames: 'Person',
      forbiddenClassNames: 'Helper',
      requiredMethodNames: 'Person.greet',
      requiredInstanceAttributes: 'name',
      requireConstructor: true,
      requireObjectInstantiation: true,
      requireInheritance: true,
    });

    expect(result.violations).toEqual(expect.arrayContaining([
      'Required class: Person',
      'Forbidden class: Helper',
      'Required method: Person.greet',
      'Required instance attribute: name',
      'Constructor required',
      'Object instantiation required',
      'Inheritance required',
    ]));
  });

  it('checks structured OOP constraints including method parameters', () => {
    const result = runConstraintHarness([
      'class BankAccount:',
      '    def __init__(self, owner, balance):',
      '        self.owner = owner',
      '        self.balance = balance',
      '    def deposit(self, amount):',
      '        self.balance += amount',
      '        return self.balance',
      '',
      'def answer():',
      '    account = BankAccount("Ada", 10)',
      '    return account.deposit(5)',
    ].join('\n'), {
      requiredClasses: [{ className: 'BankAccount' }],
      requiredMethods: [
        { className: 'BankAccount', methodName: '__init__', parameters: 'owner, balance' },
        { className: 'BankAccount', methodName: 'deposit', parameters: ['amount'] },
      ],
      requiredAttributes: [
        { className: 'BankAccount', attributeName: 'owner' },
        { className: 'BankAccount', attributeName: 'balance' },
      ],
      requireObjectInstantiation: true,
    });

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it('reports structured OOP parameter and attribute mismatches', () => {
    const result = runConstraintHarness([
      'class Other:',
      '    def __init__(self):',
      '        self.balance = 0',
      'class BankAccount:',
      '    def __init__(self, owner):',
      '        self.owner = owner',
      '    def deposit(self, value):',
      '        return value',
      '',
      'def answer():',
      '    return BankAccount("Ada")',
    ].join('\n'), {
      requiredMethods: [
        { className: 'BankAccount', methodName: '__init__', parameters: 'owner, balance' },
        { className: 'BankAccount', methodName: 'withdraw', parameters: 'amount' },
      ],
      requiredAttributes: [
        { className: 'BankAccount', attributeName: 'balance' },
      ],
    });

    expect(result.violations).toEqual(expect.arrayContaining([
      'Required method parameters: BankAccount.__init__(owner, balance)',
      'Required method: BankAccount.withdraw',
      'Required instance attribute: BankAccount.balance',
    ]));
  });

  it('can forbid inheritance', () => {
    const result = runConstraintHarness([
      'class Animal:',
      '    pass',
      'class Dog(Animal):',
      '    pass',
      'def answer():',
      '    return Dog()',
    ].join('\n'), {
      forbidInheritance: true,
    });

    expect(result.violations).toContain('Inheritance is not allowed');
  });

  it('counts instantiation of configured class names even if the class is imported', () => {
    const result = runConstraintHarness([
      'from models import Person',
      'def answer():',
      '    person = Person("Ada")',
      '    return person',
    ].join('\n'), {
      requiredClassNames: '',
      requireObjectInstantiation: true,
    });

    expect(result.violations).toContain('Object instantiation required');

    const configuredResult = runConstraintHarness([
      'from models import Person',
      'def answer():',
      '    person = Person("Ada")',
      '    return person',
    ].join('\n'), {
      requiredClassNames: 'Person',
      requireObjectInstantiation: true,
    });

    expect(configuredResult.violations).not.toContain('Object instantiation required');
  });

  it('surfaces syntax failures as constraint analysis failures', () => {
    const result = runConstraintHarness('def answer(:\n    return 1', {
      requireReturn: true,
    });

    expect(result).toEqual({
      passed: false,
      violations: ['Constraint analysis failed: SyntaxError'],
    });
  });
});
