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

function runConstraintHarnessWithoutFunctionName(source, constraints = {}) {
  const { token, code } = getAlgorithmConstraintHarness(source, constraints, undefined);
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

  it('also accepts forbiddenCalls as an array instead of a comma-separated string', () => {
    const result = runConstraintHarness([
      'def answer(values):',
      '    print(values)',
      '    return values',
    ].join('\n'), {
      forbiddenCalls: ['print', 'eval'],
    });

    expect(result.violations).toContain('Forbidden call: print');
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

  it('checks top-level OOP constraints without requiring a configured function name', () => {
    const result = runConstraintHarnessWithoutFunctionName([
      'class Person:',
      '    def __init__(self, name):',
      '        self.name = name',
      '',
      'class Team:',
      '    def __init__(self, name):',
      '        self.name = name',
      '        self.mitglieder = []',
      '    def aufnehmen(self, person):',
      '        self.mitglieder.append(person)',
      '    def anzahl(self):',
      '        return len(self.mitglieder)',
      '',
      'team = Team(input())',
      'anzahl = int(input())',
      'for i in range(anzahl):',
      '    person = Person(input())',
      '    team.aufnehmen(person)',
      'print(team.name)',
      'print(team.anzahl())',
    ].join('\n'), {
      requiredClassNames: 'Person, Team',
      requiredMethodNames: 'Person.__init__, Team.__init__, Team.aufnehmen, Team.anzahl',
      requiredInstanceAttributes: 'Person.name, Team.name, Team.mitglieder',
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

  it('strips cls from classmethod parameters just like self on instance methods', () => {
    const result = runConstraintHarness([
      'class BankAccount:',
      '    @classmethod',
      '    def from_owner(cls, owner):',
      '        return cls(owner)',
      '    def __init__(self, owner):',
      '        self.owner = owner',
      '',
      'def answer():',
      '    return BankAccount.from_owner("Ada")',
    ].join('\n'), {
      requiredMethods: [
        { className: 'BankAccount', methodName: 'from_owner', parameters: ['owner'] },
      ],
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

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatch(/^Constraint analysis failed: SyntaxError: /);
  });

  it('requires parameter and return type hints on every function and method', () => {
    const result = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, owner):',
      '        self.owner = owner',
      '    def deposit(self, amount):',
      '        return amount',
    ].join('\n'), {
      requireParameterAnnotations: true,
      requireReturnAnnotation: true,
    });

    expect(result.violations).toEqual(expect.arrayContaining([
      'Missing parameter type hint: __init__(owner)',
      'Missing parameter type hint: deposit(amount)',
      'Missing return type hint: deposit',
    ]));
    // __init__ is exempt from the return-annotation requirement.
    expect(result.violations).not.toContain('Missing return type hint: __init__');
  });

  it('passes when every parameter and return type is annotated', () => {
    const result = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, owner: str) -> None:',
      '        self.owner = owner',
      '    def deposit(self, amount: float) -> float:',
      '        return amount',
    ].join('\n'), {
      requireParameterAnnotations: true,
      requireReturnAnnotation: true,
    });

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it('checks exact parameter and return types for required typed methods', () => {
    const passing = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def deposit(self, amount: float) -> float:',
      '        return amount',
    ].join('\n'), {
      requiredTypedMethods: [{
        className: 'BankAccount',
        methodName: 'deposit',
        parameters: [{ name: 'amount', type: 'float' }],
        returnType: 'float',
      }],
    });
    expect(passing).toEqual({ passed: true, violations: [] });

    const wrongType = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def deposit(self, amount: int) -> float:',
      '        return amount',
    ].join('\n'), {
      requiredTypedMethods: [{
        className: 'BankAccount',
        methodName: 'deposit',
        parameters: [{ name: 'amount', type: 'float' }],
        returnType: 'float',
      }],
    });
    expect(wrongType.violations).toContain('Required typed method: BankAccount.deposit(amount: float) -> float');

    const missingMethod = runConstraintHarnessWithoutFunctionName('class BankAccount:\n    pass', {
      requiredTypedMethods: [{ className: 'BankAccount', methodName: 'deposit' }],
    });
    expect(missingMethod.violations).toContain('Required method: BankAccount.deposit');
  });

  it('checks required attribute annotations in methods or class declarations', () => {
    const constraints = { requiredAttributes: [{ className: 'Tuerschloss', attributeName: '_offen', type: 'bool' }] };
    for (const source of [
      'class Tuerschloss:\n    def __init__(self):\n        self._offen: bool = False',
      'class Tuerschloss:\n    _offen: bool\n    def __init__(self):\n        self._offen = False',
    ]) {
      expect(runConstraintHarnessWithoutFunctionName(source, constraints)).toEqual({ passed: true, violations: [] });
    }
  });

  it('rejects missing or incorrect attribute annotations and annotations in another class', () => {
    const constraints = { requiredAttributes: [{ className: 'Tuerschloss', attributeName: '_offen', type: 'bool' }] };
    for (const source of [
      'class Tuerschloss:\n    def __init__(self):\n        self._offen = False',
      'class Tuerschloss:\n    def __init__(self):\n        self._offen: str = False',
      'class AndereKlasse:\n    _offen: bool\nclass Tuerschloss:\n    def __init__(self):\n        self._offen = False',
    ]) {
      expect(runConstraintHarnessWithoutFunctionName(source, constraints).violations)
        .toContain('Required typed attribute: Tuerschloss._offen: bool');
    }
  });

  it('supports parameterized attribute annotations without requiring a class name', () => {
    const source = 'class Berechtigungsliste:\n    def __init__(self):\n        self._namen: list[str] = []';
    expect(runConstraintHarnessWithoutFunctionName(source, {
      requiredAttributes: [{ attributeName: '_namen', type: 'list[str]' }],
    })).toEqual({ passed: true, violations: [] });
    expect(runConstraintHarnessWithoutFunctionName(source.replace('list[str]', 'list[int]'), {
      requiredAttributes: [{ attributeName: '_namen', type: 'list[str]' }],
    }).passed).toBe(false);
  });

  it('requires a leading-underscore attribute name and rejects a public duplicate', () => {
    const passing = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
    ].join('\n'), {
      requiredPrivateAttributes: [{ className: 'BankAccount', attributeName: 'balance' }],
    });
    expect(passing).toEqual({ passed: true, violations: [] });

    const stillPublic = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self.balance = balance',
    ].join('\n'), {
      requiredPrivateAttributes: [{ className: 'BankAccount', attributeName: 'balance' }],
    });
    expect(stillPublic.violations).toContain('Required private attribute: BankAccount.balance');

    const both = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '        self.balance = balance',
    ].join('\n'), {
      requiredPrivateAttributes: [{ className: 'BankAccount', attributeName: 'balance' }],
    });
    expect(both.violations).toContain('Attribute must not also be public: BankAccount.balance');
  });

  it('requires an @property getter and optionally a matching setter', () => {
    const passing = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '    @property',
      '    def balance(self):',
      '        return self._balance',
      '    @balance.setter',
      '    def balance(self, value):',
      '        self._balance = value',
    ].join('\n'), {
      requiredProperties: [{ className: 'BankAccount', attributeName: 'balance', requireSetter: true }],
    });
    expect(passing).toEqual({ passed: true, violations: [] });

    const getterOnly = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '    @property',
      '    def balance(self):',
      '        return self._balance',
    ].join('\n'), {
      requiredProperties: [{ className: 'BankAccount', attributeName: 'balance', requireSetter: true }],
    });
    expect(getterOnly.violations).toContain('Required property setter: BankAccount.balance');

    const noProperty = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '    def get_balance(self):',
      '        return self._balance',
    ].join('\n'), {
      requiredProperties: [{ className: 'BankAccount', attributeName: 'balance' }],
    });
    expect(noProperty.violations).toContain('Required property getter: BankAccount.balance');
  });

  it('flags external direct access to protected attributes but allows self access', () => {
    const result = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '    def deposit(self, amount):',
      '        self._balance += amount',
      '        return self._balance',
      '',
      'account = BankAccount(10)',
      'print(account._balance)',
    ].join('\n'), {
      protectedAttributeNames: '_balance',
    });

    expect(result.violations).toContain('External access to protected attribute: _balance');
    expect(result.violations.filter((v) => v.includes('_balance')).length).toBe(1);
  });

  it('does not flag protected attributes when accessed only through self', () => {
    const result = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '    def deposit(self, amount):',
      '        self._balance += amount',
      '        return self._balance',
      '',
      'account = BankAccount(10)',
      'print(account.deposit(5))',
    ].join('\n'), {
      protectedAttributeNames: '_balance',
    });

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it('also accepts protectedAttributeNames as an array instead of a comma-separated string', () => {
    const result = runConstraintHarnessWithoutFunctionName([
      'class BankAccount:',
      '    def __init__(self, balance):',
      '        self._balance = balance',
      '',
      'account = BankAccount(10)',
      'print(account._balance)',
    ].join('\n'), {
      protectedAttributeNames: ['_balance'],
    });

    expect(result.violations).toContain('External access to protected attribute: _balance');
  });
});
