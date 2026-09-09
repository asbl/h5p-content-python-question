import { blocklyProjectClassRegistry } from '../../../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/project-symbols';

function getPythonGenerator() {
  return H5P.getBlocklyPythonGenerator();
}

function safeName(value, fallback = 'value') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^([^A-Za-z_]+)/, '')
    .replace(/^$/, fallback);

  return normalized || fallback;
}

function safeParameterList(value) {
  return String(value || '')
    .split(',')
    .map((name) => safeName(name, ''))
    .filter((name) => name && name !== 'self')
    .join(', ');
}

function getClassOptions() {
  const classes = blocklyProjectClassRegistry.get('python');
  const options = classes.length ? classes : ['Helper'];

  return options.map((name) => [safeName(name, 'Helper'), safeName(name, 'Helper')]);
}

function registerBlock(Blockly, blockType, definition) {
  if (Blockly.Blocks[blockType]) {
    return;
  }

  Blockly.Blocks[blockType] = definition;
}

export function registerPythonOopBlocks(Blockly) {
  if (!Blockly?.Blocks || Blockly.__h5pPythonOopBlocksRegistered) {
    return;
  }

  registerBlock(Blockly, 'python_class_definition', {
    init() {
      this.appendDummyInput()
        .appendField('Klasse')
        .appendField(new Blockly.FieldTextInput('Helper'), 'CLASS_NAME');
      this.appendStatementInput('MEMBERS').appendField('Inhalt');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(25);
      this.setTooltip('Erzeugt eine Python-Klasse.');
    },
  });

  registerBlock(Blockly, 'python_method_definition', {
    init() {
      this.appendDummyInput()
        .appendField('Methode')
        .appendField(new Blockly.FieldTextInput('answer'), 'METHOD_NAME')
        .appendField('(self')
        .appendField(new Blockly.FieldTextInput(''), 'PARAMS')
        .appendField(')');
      this.appendStatementInput('BODY').appendField('mache');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(290);
      this.setTooltip('Erzeugt eine Methode mit self und optionalen Parametern.');
    },
  });

  registerBlock(Blockly, 'python_constructor_definition', {
    init() {
      this.appendDummyInput()
        .appendField('Konstruktor')
        .appendField('(self')
        .appendField(new Blockly.FieldTextInput(''), 'PARAMS')
        .appendField(')');
      this.appendStatementInput('BODY').appendField('mache');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(290);
      this.setTooltip('Erzeugt den Konstruktor __init__.');
    },
  });

  registerBlock(Blockly, 'python_set_attribute', {
    init() {
      this.appendValueInput('VALUE')
        .appendField('Attribut')
        .appendField('self.')
        .appendField(new Blockly.FieldTextInput('name'), 'ATTRIBUTE_NAME')
        .appendField('=');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip('Setzt ein Objektattribut.');
    },
  });

  registerBlock(Blockly, 'python_return', {
    init() {
      this.appendValueInput('VALUE').appendField('gib zurück');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(290);
      this.setTooltip('Return-Anweisung.');
    },
  });

  registerBlock(Blockly, 'python_declare_object', {
    init() {
      this.appendDummyInput()
        .appendField('Objekt')
        .appendField(new Blockly.FieldTextInput('helper'), 'VAR_NAME')
        .appendField('=')
        .appendField('neue')
        .appendField(new Blockly.FieldDropdown(getClassOptions), 'CLASS_NAME');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip('Erzeugt ein Objekt aus einer anderen Klasse.');
    },
  });

  registerBlock(Blockly, 'python_new_object', {
    init() {
      this.appendDummyInput()
        .appendField('neue')
        .appendField(new Blockly.FieldDropdown(getClassOptions), 'CLASS_NAME');
      this.setOutput(true);
      this.setColour(210);
      this.setTooltip('Erzeugt ein neues Objekt.');
    },
  });

  registerBlock(Blockly, 'python_method_call_statement', {
    init() {
      this.appendDummyInput()
        .appendField('rufe')
        .appendField(new Blockly.FieldTextInput('helper'), 'OBJECT_NAME')
        .appendField('.')
        .appendField(new Blockly.FieldTextInput('answer'), 'METHOD_NAME')
        .appendField('(')
        .appendField(new Blockly.FieldTextInput(''), 'ARGS')
        .appendField(')');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(210);
      this.setTooltip('Ruft eine Objektmethode auf.');
    },
  });

  registerBlock(Blockly, 'python_method_call_value', {
    init() {
      this.appendDummyInput()
        .appendField('Wert von')
        .appendField(new Blockly.FieldTextInput('helper'), 'OBJECT_NAME')
        .appendField('.')
        .appendField(new Blockly.FieldTextInput('answer'), 'METHOD_NAME')
        .appendField('(')
        .appendField(new Blockly.FieldTextInput(''), 'ARGS')
        .appendField(')');
      this.setOutput(true);
      this.setColour(210);
      this.setTooltip('Verwendet den Rückgabewert einer Objektmethode.');
    },
  });

  const pythonGenerator = getPythonGenerator();

  pythonGenerator.forBlock.python_class_definition = (block, generator) => {
    const className = safeName(block.getFieldValue('CLASS_NAME'), 'Helper');
    const members = generator.statementToCode(block, 'MEMBERS') || '    pass\n';
    return `class ${className}:\n${members}\n`;
  };

  pythonGenerator.forBlock.python_method_definition = (block, generator) => {
    const methodName = safeName(block.getFieldValue('METHOD_NAME'), 'method');
    const params = safeParameterList(block.getFieldValue('PARAMS'));
    const body = generator.statementToCode(block, 'BODY') || '    pass\n';
    const signature = params ? `self, ${params}` : 'self';
    return `def ${methodName}(${signature}):\n${body}`;
  };

  pythonGenerator.forBlock.python_constructor_definition = (block, generator) => {
    const params = safeParameterList(block.getFieldValue('PARAMS'));
    const body = generator.statementToCode(block, 'BODY') || '    pass\n';
    const signature = params ? `self, ${params}` : 'self';
    return `def __init__(${signature}):\n${body}`;
  };

  pythonGenerator.forBlock.python_set_attribute = (block, generator) => {
    const attributeName = safeName(block.getFieldValue('ATTRIBUTE_NAME'), 'attribute');
    const value = generator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
    return `self.${attributeName} = ${value}\n`;
  };

  pythonGenerator.forBlock.python_return = (block, generator) => {
    const value = generator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
    return `return ${value}\n`;
  };

  pythonGenerator.forBlock.python_declare_object = (block) => {
    const varName = safeName(block.getFieldValue('VAR_NAME'), 'helper');
    const className = safeName(block.getFieldValue('CLASS_NAME'), 'Helper');
    return `${varName} = ${className}()\n`;
  };

  pythonGenerator.forBlock.python_new_object = (block) => {
    const className = safeName(block.getFieldValue('CLASS_NAME'), 'Helper');
    return [`${className}()`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  pythonGenerator.forBlock.python_method_call_statement = (block) => {
    const objectName = safeName(block.getFieldValue('OBJECT_NAME'), 'object');
    const methodName = safeName(block.getFieldValue('METHOD_NAME'), 'method');
    const args = block.getFieldValue('ARGS') || '';
    return `${objectName}.${methodName}(${args})\n`;
  };

  pythonGenerator.forBlock.python_method_call_value = (block) => {
    const objectName = safeName(block.getFieldValue('OBJECT_NAME'), 'object');
    const methodName = safeName(block.getFieldValue('METHOD_NAME'), 'method');
    const args = block.getFieldValue('ARGS') || '';
    return [`${objectName}.${methodName}(${args})`, pythonGenerator.ORDER_FUNCTION_CALL];
  };

  Blockly.__h5pPythonOopBlocksRegistered = true;
}
