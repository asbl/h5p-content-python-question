const PYTHON_KEYWORDS = Object.freeze([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for',
  'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try',
  'while', 'with', 'yield',
]);

const PYTHON_BUILTINS = Object.freeze([
  'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'float', 'int', 'len',
  'list', 'max', 'min', 'open', 'print', 'range', 'set', 'sorted', 'str',
  'sum', 'tuple', 'zip',
]);

const COMMON_IMPORT_MODULES = Object.freeze([
  'math', 'random', 'time', 'json', 'turtle', 'p5', 'miniworlds', 'numpy', 'sqlite3', 'pygame',
]);

const PACKAGE_IMPORT_NAMES = Object.freeze({
  'pygame-ce': 'pygame',
  miniworlds: 'miniworlds',
  numpy: 'numpy',
  sqlite3: 'sqlite3',
  p5: 'p5',
});

const TURTLE_SYMBOLS = Object.freeze([
  createCompletionOption('Turtle', { type: 'class', detail: 'turtle drawing cursor class', boost: 200 }),
  createCompletionOption('done', { type: 'function', detail: 'finish turtle session', boost: 190 }),
  createCompletionOption('forward', { type: 'function', detail: 'move forward', boost: 180 }),
  createCompletionOption('back', { type: 'function', detail: 'move backward', boost: 170 }),
  createCompletionOption('backward', { type: 'function', detail: 'move backward', boost: 165 }),
  createCompletionOption('left', { type: 'function', detail: 'turn left', boost: 175 }),
  createCompletionOption('right', { type: 'function', detail: 'turn right', boost: 175 }),
  createCompletionOption('circle', { type: 'function', detail: 'draw circle', boost: 170 }),
  createCompletionOption('dot', { type: 'function', detail: 'draw dot', boost: 165 }),
  createCompletionOption('color', { type: 'function', detail: 'set pen and fill color', boost: 165 }),
  createCompletionOption('penup', { type: 'function', detail: 'lift pen', boost: 160 }),
  createCompletionOption('pendown', { type: 'function', detail: 'lower pen', boost: 160 }),
  createCompletionOption('speed', { type: 'function', detail: 'set turtle speed', boost: 160 }),
  createCompletionOption('shape', { type: 'function', detail: 'set turtle shape', boost: 150 }),
  createCompletionOption('hideturtle', { type: 'function', detail: 'hide turtle cursor', boost: 150 }),
]);

const MINIWORLDS_SYMBOLS = Object.freeze([
  createCompletionOption('World', { type: 'class', detail: 'miniworlds world class', boost: 180 }),
  createCompletionOption('Actor', { type: 'class', detail: 'miniworlds actor class', boost: 170 }),
  createCompletionOption('Circle', { type: 'class', detail: 'miniworlds circle actor', boost: 170 }),
  createCompletionOption('Rectangle', { type: 'class', detail: 'miniworlds rectangle actor', boost: 160 }),
  createCompletionOption('Text', { type: 'class', detail: 'miniworlds text actor', boost: 160 }),
  createCompletionOption('Costume', { type: 'class', detail: 'miniworlds costume helper', boost: 150 }),
  createCompletionOption('App', { type: 'class', detail: 'miniworlds app class', boost: 120 }),
  createCompletionOption('world', { type: 'function', detail: 'legacy miniworlds world factory', boost: 110 }),
  createCompletionOption('actor', { type: 'function', detail: 'legacy miniworlds actor factory', boost: 110 }),
]);

const MINIWORLDS_WORLD_MEMBERS = Object.freeze([
  createCompletionOption('add_background', { type: 'method', detail: 'set RGB color or image background', boost: 190 }),
  createCompletionOption('register', { type: 'method', detail: 'register world event handler', boost: 220 }),
  createCompletionOption('run', { type: 'method', detail: 'start miniworlds loop', boost: 210 }),
  createCompletionOption('mouse', { type: 'property', detail: 'mouse manager for current world', boost: 180 }),
  createCompletionOption('color', { type: 'property', detail: 'world background color', boost: 150 }),
  createCompletionOption('width', { type: 'property', detail: 'world width in pixels', boost: 140 }),
  createCompletionOption('height', { type: 'property', detail: 'world height in pixels', boost: 140 }),
]);

const MINIWORLDS_ACTOR_MEMBERS = Object.freeze([
  createCompletionOption('register', { type: 'method', detail: 'register actor event handler', boost: 220 }),
  createCompletionOption('add_costume', { type: 'method', detail: 'attach image or costume', boost: 200 }),
  createCompletionOption('move', { type: 'method', detail: 'move in current direction', boost: 190 }),
  createCompletionOption('move_towards', { type: 'method', detail: 'move towards actor, mouse or position', boost: 210 }),
  createCompletionOption('turn_left', { type: 'method', detail: 'turn left by degrees', boost: 180 }),
  createCompletionOption('turn_right', { type: 'method', detail: 'turn right by degrees', boost: 180 }),
  createCompletionOption('detect', { type: 'method', detail: 'detect collision with another actor', boost: 170 }),
  createCompletionOption('color', { type: 'property', detail: 'actor fill color', boost: 170 }),
  createCompletionOption('x', { type: 'property', detail: 'x position', boost: 190 }),
  createCompletionOption('y', { type: 'property', detail: 'y position', boost: 190 }),
  createCompletionOption('direction', { type: 'property', detail: 'heading in degrees', boost: 160 }),
  createCompletionOption('is_following', { type: 'property', detail: 'custom flag example', boost: 120 }),
]);

const MINIWORLDS_MOUSE_MEMBERS = Object.freeze([
  createCompletionOption('get_position', { type: 'method', detail: 'current mouse position in world', boost: 220 }),
  createCompletionOption('position', { type: 'property', detail: 'current mouse position', boost: 170 }),
]);

const MINIWORLDS_COSTUME_MEMBERS = Object.freeze([
  createCompletionOption('add_image', { type: 'method', detail: 'append image frame to costume', boost: 220 }),
  createCompletionOption('animate', { type: 'method', detail: 'animate costume frames', boost: 210 }),
]);

const MINIWORLDS_EVENT_NAMES = Object.freeze([
  createCompletionOption('act', { type: 'function', detail: 'called every frame', boost: 180 }),
  createCompletionOption('on_key_pressed', { type: 'function', detail: 'keys currently pressed', boost: 210 }),
  createCompletionOption('on_key_pressed_w', { type: 'function', detail: 'single-key event handler', boost: 160 }),
  createCompletionOption('on_key_down_a', { type: 'function', detail: 'single-key down event handler', boost: 150 }),
  createCompletionOption('on_key_down_d', { type: 'function', detail: 'single-key down event handler', boost: 150 }),
  createCompletionOption('on_clicked_left', { type: 'function', detail: 'left click on actor', boost: 190 }),
  createCompletionOption('on_clicked_right', { type: 'function', detail: 'right click on actor', boost: 150 }),
  createCompletionOption('on_mouse_left_down', { type: 'function', detail: 'mouse button pressed', boost: 200 }),
  createCompletionOption('on_mouse_left_released', { type: 'function', detail: 'mouse button released', boost: 150 }),
  createCompletionOption('on_mouse_motion', { type: 'function', detail: 'mouse moved over actor', boost: 150 }),
  createCompletionOption('on_detecting', { type: 'function', detail: 'collision callback', boost: 180 }),
]);

const P5_SYMBOLS = Object.freeze([
  createCompletionOption('createCanvas', { type: 'function', detail: 'create drawing canvas', boost: 180 }),
  createCompletionOption('background', { type: 'function', detail: 'set background', boost: 170 }),
  createCompletionOption('circle', { type: 'function', detail: 'draw circle', boost: 170 }),
  createCompletionOption('ellipse', { type: 'function', detail: 'draw ellipse', boost: 165 }),
  createCompletionOption('rect', { type: 'function', detail: 'draw rectangle', boost: 160 }),
  createCompletionOption('line', { type: 'function', detail: 'draw line', boost: 160 }),
  createCompletionOption('fill', { type: 'function', detail: 'set fill color', boost: 165 }),
  createCompletionOption('stroke', { type: 'function', detail: 'set stroke color', boost: 160 }),
  createCompletionOption('strokeWeight', { type: 'function', detail: 'set stroke width', boost: 150 }),
  createCompletionOption('noLoop', { type: 'function', detail: 'disable continuous redraw', boost: 175 }),
  createCompletionOption('redraw', { type: 'function', detail: 'request one frame redraw', boost: 175 }),
  createCompletionOption('clear', { type: 'function', detail: 'clear canvas', boost: 160 }),
  createCompletionOption('run', { type: 'function', detail: 'start p5 loop', boost: 190 }),
  createCompletionOption('sin', { type: 'function', detail: 'sine helper', boost: 140 }),
  createCompletionOption('width', { type: 'property', detail: 'canvas width', boost: 150 }),
  createCompletionOption('height', { type: 'property', detail: 'canvas height', boost: 150 }),
  createCompletionOption('key', { type: 'property', detail: 'last key value', boost: 140 }),
]);

const P5_EVENT_NAMES = Object.freeze([
  createCompletionOption('setup', { type: 'function', detail: 'initialization hook', boost: 200 }),
  createCompletionOption('draw', { type: 'function', detail: 'frame draw hook', boost: 210 }),
  createCompletionOption('keyPressed', { type: 'function', detail: 'keyboard callback', boost: 185 }),
  createCompletionOption('mousePressed', { type: 'function', detail: 'mouse callback', boost: 180 }),
]);

const TURTLE_OBJECT_MEMBERS = Object.freeze([
  createCompletionOption('forward', { type: 'method', detail: 'move forward', boost: 210 }),
  createCompletionOption('back', { type: 'method', detail: 'move backward', boost: 180 }),
  createCompletionOption('backward', { type: 'method', detail: 'move backward', boost: 175 }),
  createCompletionOption('left', { type: 'method', detail: 'turn left', boost: 190 }),
  createCompletionOption('right', { type: 'method', detail: 'turn right', boost: 190 }),
  createCompletionOption('circle', { type: 'method', detail: 'draw circle', boost: 180 }),
  createCompletionOption('dot', { type: 'method', detail: 'draw dot', boost: 170 }),
  createCompletionOption('color', { type: 'method', detail: 'set color', boost: 175 }),
  createCompletionOption('penup', { type: 'method', detail: 'lift pen', boost: 165 }),
  createCompletionOption('pendown', { type: 'method', detail: 'lower pen', boost: 165 }),
  createCompletionOption('speed', { type: 'method', detail: 'set turtle speed', boost: 165 }),
  createCompletionOption('shape', { type: 'method', detail: 'set turtle shape', boost: 150 }),
  createCompletionOption('hideturtle', { type: 'method', detail: 'hide turtle cursor', boost: 155 }),
]);

const TYPE_TO_MEMBER_OPTIONS = Object.freeze({
  world: MINIWORLDS_WORLD_MEMBERS,
  actor: MINIWORLDS_ACTOR_MEMBERS,
  mouse: MINIWORLDS_MOUSE_MEMBERS,
  costume: MINIWORLDS_COSTUME_MEMBERS,
  'miniworlds-module': MINIWORLDS_SYMBOLS,
  'p5-module': P5_SYMBOLS,
  'turtle-module': TURTLE_SYMBOLS,
  'turtle-object': TURTLE_OBJECT_MEMBERS,
});

const MINIWORLDS_TYPE_BY_FACTORY = Object.freeze({
  World: 'world',
  world: 'world',
  Actor: 'actor',
  actor: 'actor',
  Circle: 'actor',
  Rectangle: 'actor',
  Text: 'actor',
  Costume: 'costume',
});

const TURTLE_TYPE_BY_FACTORY = Object.freeze({
  Turtle: 'turtle-object',
});

function createCompletionOption(label, settings = {}) {
  return {
    label,
    apply: settings.apply || label,
    type: settings.type || 'variable',
    detail: settings.detail || '',
    boost: Number.isFinite(settings.boost) ? settings.boost : 0,
  };
}

function normalizePackageImportNames(packageNames = []) {
  return Array.from(new Set((Array.isArray(packageNames) ? packageNames : [])
    .map((packageName) => PACKAGE_IMPORT_NAMES[String(packageName || '').trim()] || String(packageName || '').trim())
    .filter((packageName) => packageName !== '')));
}

function getWorkspaceModuleNames(files = []) {
  return Array.from(new Set((Array.isArray(files) ? files : [])
    .map((file) => String(file?.name || ''))
    .filter((fileName) => fileName.endsWith('.py') && fileName !== 'main.py')
    .map((fileName) => fileName.replace(/\.py$/i, ''))
    .filter((moduleName) => moduleName !== '')));
}

function getLineBeforePosition(code = '', pos = code.length) {
  const before = code.slice(0, pos);
  return before.split(/\r?\n/).pop() || '';
}

function getCurrentPrefix(context) {
  return context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
}

export function detectPythonCompletionContext(code = '', pos = code.length) {
  const line = getLineBeforePosition(code, pos);
  const attributeMatch = line.match(/([A-Za-z_][A-Za-z0-9_\.]*)\.([A-Za-z0-9_]*)$/);

  if (attributeMatch) {
    return {
      type: 'attribute',
      expression: attributeMatch[1],
      prefix: attributeMatch[2] || '',
      from: pos - (attributeMatch[2] || '').length,
    };
  }

  const fromImportMatch = line.match(/^\s*from\s+([A-Za-z_][A-Za-z0-9_\.]*)\s+import\s+([A-Za-z0-9_, ]*)$/);
  if (fromImportMatch) {
    const rawSegment = fromImportMatch[2] || '';
    const prefix = rawSegment.split(',').pop()?.trim() || '';

    return {
      type: 'from-import',
      moduleName: fromImportMatch[1],
      prefix,
      from: pos - prefix.length,
    };
  }

  const importMatch = line.match(/^\s*import\s+([A-Za-z0-9_, ]*)$/);
  if (importMatch) {
    const rawSegment = importMatch[1] || '';
    const prefix = rawSegment.split(',').pop()?.trim() || '';

    return {
      type: 'import',
      prefix,
      from: pos - prefix.length,
    };
  }

  const wordMatch = line.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
  return {
    type: 'global',
    prefix: wordMatch?.[1] || '',
    from: pos - (wordMatch?.[1]?.length || 0),
  };
}

export function inferPythonBindings(code = '') {
  const importedModules = new Map();
  const importedSymbols = new Map();
  const variableTypes = new Map();

  code.split(/\r?\n/).forEach((line) => {
    const importMatch = line.match(/^\s*import\s+(.+)$/);
    if (importMatch) {
      importMatch[1].split(',').forEach((entry) => {
        const trimmedEntry = entry.trim();
        if (trimmedEntry === '') {
          return;
        }

        const aliasMatch = trimmedEntry.match(/^([A-Za-z_][A-Za-z0-9_\.]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        if (aliasMatch) {
          importedModules.set(aliasMatch[2], aliasMatch[1]);
          return;
        }

        const moduleName = trimmedEntry;
        const rootModule = moduleName.split('.')[0];
        importedModules.set(rootModule, rootModule);
      });
      return;
    }

    const fromImportMatch = line.match(/^\s*from\s+([A-Za-z_][A-Za-z0-9_\.]*)\s+import\s+(.+)$/);
    if (fromImportMatch) {
      const moduleName = fromImportMatch[1];
      fromImportMatch[2].split(',').forEach((entry) => {
        const trimmedEntry = entry.trim();
        if (trimmedEntry === '') {
          return;
        }

        const aliasMatch = trimmedEntry.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        if (aliasMatch) {
          importedSymbols.set(aliasMatch[2], `${moduleName}.${aliasMatch[1]}`);
          return;
        }

        importedSymbols.set(trimmedEntry, `${moduleName}.${trimmedEntry}`);
      });
      return;
    }

    const assignmentMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:(?:([A-Za-z_][A-Za-z0-9_]*)\.)?([A-Za-z_][A-Za-z0-9_]*))\s*\(/);
    if (!assignmentMatch) {
      return;
    }

    const variableName = assignmentMatch[1];
    const objectName = assignmentMatch[2] || '';
    const callableName = assignmentMatch[3];
    const resolvedType = resolveFactoryType(callableName, objectName, importedModules, importedSymbols);

    if (resolvedType) {
      variableTypes.set(variableName, resolvedType);
    }
  });

  return {
    importedModules,
    importedSymbols,
    variableTypes,
  };
}

function resolveFactoryType(callableName, objectName, importedModules, importedSymbols) {
  if (objectName) {
    const resolvedModule = importedModules.get(objectName) || objectName;
    if (resolvedModule === 'miniworlds') {
      return MINIWORLDS_TYPE_BY_FACTORY[callableName] || null;
    }
    if (resolvedModule === 'turtle') {
      return TURTLE_TYPE_BY_FACTORY[callableName] || null;
    }

    return null;
  }

  const importedSymbol = importedSymbols.get(callableName) || '';
  if (importedSymbol.startsWith('miniworlds.')) {
    return MINIWORLDS_TYPE_BY_FACTORY[callableName] || null;
  }
  if (importedSymbol.startsWith('turtle.')) {
    return TURTLE_TYPE_BY_FACTORY[callableName] || null;
  }

  return null;
}

function detectSelfBindingType(code = '', pos = code.length, bindings = inferPythonBindings(code)) {
  const lines = code.slice(0, pos).split(/\r?\n/);
  let seenFunctionDefinition = false;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();

    if (line === '') {
      continue;
    }

    const decoratorMatch = line.match(/^@([A-Za-z_][A-Za-z0-9_]*)\.register\b/);
    if (decoratorMatch) {
      return bindings.variableTypes.get(decoratorMatch[1]) || null;
    }

    if (line.startsWith('def ')) {
      seenFunctionDefinition = true;
      continue;
    }

    if (seenFunctionDefinition && line.startsWith('class ')) {
      break;
    }
  }

  return null;
}

function resolveExpressionType(expression = '', code = '', pos = code.length, bindings = inferPythonBindings(code)) {
  const normalizedExpression = String(expression || '').trim();
  if (normalizedExpression === '') {
    return null;
  }

  if (normalizedExpression.includes('.')) {
    const parts = normalizedExpression.split('.');
    const lastPart = parts.pop();
    const parentExpression = parts.join('.');
    const parentType = resolveExpressionType(parentExpression, code, pos, bindings);

    if (parentType === 'world' && lastPart === 'mouse') {
      return 'mouse';
    }

    return null;
  }

  if (normalizedExpression === 'self') {
    return detectSelfBindingType(code, pos, bindings);
  }

  if (bindings.variableTypes.has(normalizedExpression)) {
    return bindings.variableTypes.get(normalizedExpression);
  }

  const importedModule = bindings.importedModules.get(normalizedExpression) || normalizedExpression;
  if (importedModule === 'miniworlds') {
    return 'miniworlds-module';
  }
  if (importedModule === 'p5') {
    return 'p5-module';
  }
  if (importedModule === 'turtle') {
    return 'turtle-module';
  }

  return null;
}

function getModuleSymbolOptions(moduleName = '') {
  if (moduleName === 'miniworlds') {
    return MINIWORLDS_SYMBOLS;
  }

  if (moduleName === 'p5') {
    return P5_SYMBOLS;
  }

  if (moduleName === 'turtle') {
    return TURTLE_SYMBOLS;
  }

  return [];
}

function buildGlobalOptions({ packageNames = [], workspaceFiles = [], bindings }) {
  const importedModuleNames = Array.from(bindings.importedModules.keys())
    .map((moduleName) => createCompletionOption(moduleName, { type: 'module', detail: 'imported module', boost: 100 }));
  const importedSymbolNames = Array.from(bindings.importedSymbols.keys())
    .map((symbolName) => createCompletionOption(symbolName, { type: 'class', detail: 'imported symbol', boost: 110 }));
  const variableNames = Array.from(bindings.variableTypes.keys())
    .map((name) => createCompletionOption(name, { type: 'variable', detail: `${bindings.variableTypes.get(name)} variable`, boost: 130 }));
  const keywordOptions = PYTHON_KEYWORDS
    .map((keyword) => createCompletionOption(keyword, { type: 'keyword', boost: 80 }));
  const builtinOptions = PYTHON_BUILTINS
    .map((builtinName) => createCompletionOption(builtinName, { type: 'function', detail: 'Python built-in', boost: 70 }));
  const moduleOptions = Array.from(new Set([
    ...COMMON_IMPORT_MODULES,
    ...normalizePackageImportNames(packageNames),
    ...getWorkspaceModuleNames(workspaceFiles),
  ])).map((moduleName) => createCompletionOption(moduleName, { type: 'module', detail: 'importable module', boost: 90 }));
  const eventOptions = packageNames.includes('miniworlds') || bindings.importedModules.has('miniworlds')
    ? MINIWORLDS_EVENT_NAMES
    : [];
  const p5EventOptions = packageNames.includes('p5') || bindings.importedModules.has('p5')
    ? P5_EVENT_NAMES
    : [];

  return dedupeCompletionOptions([
    ...variableNames,
    ...importedModuleNames,
    ...importedSymbolNames,
    ...eventOptions,
    ...p5EventOptions,
    ...moduleOptions,
    ...builtinOptions,
    ...keywordOptions,
  ]);
}

function dedupeCompletionOptions(options = []) {
  const seen = new Set();

  return options.filter((option) => {
    const key = `${option.label}:${option.type}:${option.detail}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function scoreCompletionOption(option, prefix = '') {
  const normalizedPrefix = String(prefix || '').toLowerCase();
  const normalizedLabel = String(option?.label || '').toLowerCase();
  let score = Number.isFinite(option?.boost) ? option.boost : 0;

  if (normalizedPrefix === '') {
    return score;
  }

  if (normalizedLabel === normalizedPrefix) {
    return score + 500;
  }

  if (normalizedLabel.startsWith(normalizedPrefix)) {
    return score + 300;
  }

  if (normalizedLabel.includes(normalizedPrefix)) {
    return score + 120;
  }

  return -1;
}

function filterCompletionOptions(options = [], prefix = '') {
  return [...options]
    .map((option) => ({ option, score: scoreCompletionOption(option, prefix) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.option.label.localeCompare(right.option.label);
    })
    .map(({ option }) => option);
}

export function createPythonCompletionSource(settings = {}) {
  return (context) => {
    const code = context.state?.doc?.toString?.() || '';
    const completionContext = detectPythonCompletionContext(code, context.pos);
    const bindings = inferPythonBindings(code);
    const workspaceFiles = typeof settings.getWorkspaceFiles === 'function'
      ? settings.getWorkspaceFiles()
      : (settings.workspaceFiles || []);
    const packageNames = Array.isArray(settings.packageNames)
      ? settings.packageNames
      : [];

    if (!context.explicit && completionContext.prefix === '' && completionContext.type === 'global') {
      return null;
    }

    let options = [];

    if (completionContext.type === 'attribute') {
      const expressionType = resolveExpressionType(
        completionContext.expression,
        code,
        context.pos,
        bindings,
      );
      options = TYPE_TO_MEMBER_OPTIONS[expressionType] || [];
    }
    else if (completionContext.type === 'from-import') {
      const resolvedModuleName = bindings.importedModules.get(completionContext.moduleName)
        || completionContext.moduleName;
      options = getModuleSymbolOptions(resolvedModuleName);
    }
    else if (completionContext.type === 'import') {
      options = Array.from(new Set([
        ...COMMON_IMPORT_MODULES,
        ...normalizePackageImportNames(packageNames),
        ...getWorkspaceModuleNames(workspaceFiles),
      ])).map((moduleName) => createCompletionOption(moduleName, {
        type: 'module',
        detail: getWorkspaceModuleNames(workspaceFiles).includes(moduleName)
          ? 'workspace module'
          : 'importable module',
        boost: getWorkspaceModuleNames(workspaceFiles).includes(moduleName) ? 180 : 100,
      }));
    }
    else {
      options = buildGlobalOptions({ packageNames, workspaceFiles, bindings });
    }

    const filteredOptions = filterCompletionOptions(options, completionContext.prefix);
    if (!filteredOptions.length) {
      return null;
    }

    return {
      from: completionContext.from,
      options: filteredOptions,
      validFor: /^[A-Za-z0-9_]*$/,
    };
  };
}