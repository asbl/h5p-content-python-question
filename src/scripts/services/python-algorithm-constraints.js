const RESULT_PREFIX = '__H5P_ALGORITHM_CONSTRAINTS__:';

/** Builds a Pyodide-only AST preflight check for the module-level target function. */
export const getAlgorithmConstraintHarness = (source, constraints = {}, functionName) => {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const normalizedFunctionName = String(functionName || '').trim();
  const normalizeList = (values, allowedValues = null) => {
    const entries = Array.isArray(values)
      ? values.map((value) => value?.structure ?? value?.name ?? value)
      : String(values || '').split(',');

    return entries
      .map((value) => String(value || '').trim())
      .filter((value) => value !== '')
      .filter((value) => !allowedValues || allowedValues.includes(value));
  };
  const normalizeClassEntries = (values) => (Array.isArray(values) ? values : [])
    .map((value) => String(value?.className ?? value?.name ?? value ?? '').trim())
    .filter(Boolean);
  const normalizeParameterList = (value) => (Array.isArray(value)
    ? value
    : String(value || '').split(',')
  )
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry && entry !== 'self');
  const normalizeMethodEntries = (values) => (Array.isArray(values) ? values : [])
    .map((value) => ({
      className: String(value?.className || '').trim(),
      methodName: String(value?.methodName ?? value?.name ?? value ?? '').trim(),
      parameters: normalizeParameterList(value?.parameters),
    }))
    .filter((entry) => entry.methodName);
  const normalizeAttributeEntries = (values) => (Array.isArray(values) ? values : [])
    .map((value) => ({
      className: String(value?.className || '').trim(),
      attributeName: String(value?.attributeName ?? value?.name ?? value ?? '').trim(),
    }))
    .filter((entry) => entry.attributeName);
  const config = JSON.stringify({
    ...constraints,
    functionName: normalizedFunctionName,
    requiredDataStructures: normalizeList(constraints.requiredDataStructures, ['list', 'dict', 'set', 'tuple']),
    forbiddenDataStructures: normalizeList(constraints.forbiddenDataStructures, ['list', 'dict', 'set', 'tuple']),
    requiredClassNames: [
      ...normalizeList(constraints.requiredClassNames),
      ...normalizeClassEntries(constraints.requiredClasses),
    ],
    forbiddenClassNames: normalizeList(constraints.forbiddenClassNames),
    requiredMethodNames: normalizeList(constraints.requiredMethodNames),
    requiredInstanceAttributes: normalizeList(constraints.requiredInstanceAttributes),
    requiredMethods: normalizeMethodEntries(constraints.requiredMethods),
    requiredAttributes: normalizeAttributeEntries(constraints.requiredAttributes),
  });
  const code = JSON.stringify(String(source || ''));
  return { token, code: `import ast, json
__h5p_constraints = json.loads(${JSON.stringify(config)})
try:
    __h5p_tree = ast.parse(${code})
    __h5p_function_name = __h5p_constraints.get('functionName') or ''
    __h5p_target = next((n for n in __h5p_tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == __h5p_function_name), None) if __h5p_function_name else None
    def __h5p_scope_nodes(node):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                continue
            yield child
            yield from __h5p_scope_nodes(child)
    __h5p_nodes = list(__h5p_scope_nodes(__h5p_target or __h5p_tree))
    def __h5p_loop_depth(node, depth=0):
        __h5p_max = depth
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                continue
            __h5p_max = max(__h5p_max, __h5p_loop_depth(child, depth + (1 if isinstance(child, (ast.For, ast.While)) else 0)))
        return __h5p_max
    def __h5p_used_structures(nodes):
        __h5p_used = set()
        for node in nodes:
            if isinstance(node, ast.List): __h5p_used.add('list')
            elif isinstance(node, ast.Dict): __h5p_used.add('dict')
            elif isinstance(node, ast.Set): __h5p_used.add('set')
            elif isinstance(node, ast.Tuple): __h5p_used.add('tuple')
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ('list', 'dict', 'set', 'tuple'):
                __h5p_used.add(node.func.id)
        return __h5p_used
    __h5p_violations = []
    if __h5p_function_name and not __h5p_target: __h5p_violations.append('Required function not found')
    __h5p_recursive_calls = [n for n in __h5p_nodes if __h5p_function_name and isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == __h5p_function_name]
    if __h5p_constraints.get('requireRecursion') and not __h5p_recursive_calls: __h5p_violations.append('Recursion required')
    if __h5p_constraints.get('requireBaseCase') and not any(isinstance(n, ast.If) and any(isinstance(c, ast.Return) for c in ast.walk(n)) for n in __h5p_nodes): __h5p_violations.append('Recursion base case required')
    if int(__h5p_constraints.get('maxRecursiveCalls') or 0) and len(__h5p_recursive_calls) > int(__h5p_constraints['maxRecursiveCalls']): __h5p_violations.append('Too many recursive calls')
    __h5p_loop = __h5p_constraints.get('requiredLoop')
    if __h5p_loop == 'any' and not any(isinstance(n, (ast.For, ast.While)) for n in __h5p_nodes): __h5p_violations.append('Loop required')
    if __h5p_loop == 'for' and not any(isinstance(n, ast.For) for n in __h5p_nodes): __h5p_violations.append('For loop required')
    if __h5p_loop == 'while' and not any(isinstance(n, ast.While) for n in __h5p_nodes): __h5p_violations.append('While loop required')
    __h5p_loops = [n for n in __h5p_nodes if isinstance(n, (ast.For, ast.While))]
    if int(__h5p_constraints.get('maxLoopCount') or 0) and len(__h5p_loops) > int(__h5p_constraints['maxLoopCount']): __h5p_violations.append('Too many loops')
    if int(__h5p_constraints.get('maxLoopNesting') or 0) and __h5p_loop_depth(__h5p_target or __h5p_tree) > int(__h5p_constraints['maxLoopNesting']): __h5p_violations.append('Loop nesting too deep')
    if __h5p_constraints.get('requireConditional') and not any(isinstance(n, ast.If) for n in __h5p_nodes): __h5p_violations.append('Conditional required')
    if __h5p_constraints.get('requireReturn') and not any(isinstance(n, ast.Return) for n in __h5p_nodes): __h5p_violations.append('Return statement required')
    if __h5p_constraints.get('forbidTopLevelAssignments') and any(isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)) for n in __h5p_tree.body): __h5p_violations.append('Top-level assignments are not allowed')
    __h5p_forbidden = [x.strip() for x in __h5p_constraints.get('forbiddenCalls', '').split(',') if x.strip()]
    for __h5p_node in __h5p_nodes:
        if isinstance(__h5p_node, ast.Call):
            __h5p_name = __h5p_node.func.id if isinstance(__h5p_node.func, ast.Name) else (__h5p_node.func.attr if isinstance(__h5p_node.func, ast.Attribute) else '')
            if __h5p_name in __h5p_forbidden: __h5p_violations.append('Forbidden call: ' + __h5p_name)
    __h5p_used = __h5p_used_structures(__h5p_nodes)
    for __h5p_structure in __h5p_constraints.get('requiredDataStructures', []):
        if __h5p_structure not in __h5p_used: __h5p_violations.append('Required data structure: ' + __h5p_structure)
    for __h5p_structure in __h5p_constraints.get('forbiddenDataStructures', []):
        if __h5p_structure in __h5p_used: __h5p_violations.append('Forbidden data structure: ' + __h5p_structure)
    __h5p_classes = [n for n in ast.walk(__h5p_tree) if isinstance(n, ast.ClassDef)]
    __h5p_class_names = {n.name for n in __h5p_classes}
    __h5p_instantiable_class_names = __h5p_class_names | set(__h5p_constraints.get('requiredClassNames', []))
    __h5p_methods = set()
    __h5p_method_specs = []
    __h5p_instance_attrs = set()
    __h5p_instantiated_classes = set()
    for __h5p_class in __h5p_classes:
        for __h5p_member in __h5p_class.body:
            if isinstance(__h5p_member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                __h5p_methods.add(__h5p_member.name)
                __h5p_methods.add(__h5p_class.name + '.' + __h5p_member.name)
                __h5p_args = [a.arg for a in __h5p_member.args.args]
                if __h5p_args and __h5p_args[0] == 'self':
                    __h5p_args = __h5p_args[1:]
                __h5p_method_specs.append({'className': __h5p_class.name, 'methodName': __h5p_member.name, 'parameters': __h5p_args})
                for __h5p_node in ast.walk(__h5p_member):
                    __h5p_targets = []
                    if isinstance(__h5p_node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                        if isinstance(__h5p_node, ast.Assign):
                            __h5p_targets = list(__h5p_node.targets)
                        else:
                            __h5p_targets = [__h5p_node.target]
                    for __h5p_target_node in __h5p_targets:
                        for __h5p_target_child in ast.walk(__h5p_target_node):
                            if isinstance(__h5p_target_child, ast.Attribute) and isinstance(__h5p_target_child.value, ast.Name) and __h5p_target_child.value.id == 'self':
                                __h5p_instance_attrs.add(__h5p_target_child.attr)
                                __h5p_instance_attrs.add(__h5p_class.name + '.' + __h5p_target_child.attr)
    for __h5p_node in ast.walk(__h5p_tree):
        if isinstance(__h5p_node, ast.Call):
            if isinstance(__h5p_node.func, ast.Name) and __h5p_node.func.id in __h5p_instantiable_class_names:
                __h5p_instantiated_classes.add(__h5p_node.func.id)
            elif isinstance(__h5p_node.func, ast.Attribute) and __h5p_node.func.attr in __h5p_instantiable_class_names:
                __h5p_instantiated_classes.add(__h5p_node.func.attr)
    for __h5p_class_name in __h5p_constraints.get('requiredClassNames', []):
        if __h5p_class_name not in __h5p_class_names: __h5p_violations.append('Required class: ' + __h5p_class_name)
    for __h5p_class_name in __h5p_constraints.get('forbiddenClassNames', []):
        if __h5p_class_name in __h5p_class_names: __h5p_violations.append('Forbidden class: ' + __h5p_class_name)
    for __h5p_method_name in __h5p_constraints.get('requiredMethodNames', []):
        if __h5p_method_name not in __h5p_methods: __h5p_violations.append('Required method: ' + __h5p_method_name)
    for __h5p_attribute_name in __h5p_constraints.get('requiredInstanceAttributes', []):
        if __h5p_attribute_name not in __h5p_instance_attrs: __h5p_violations.append('Required instance attribute: ' + __h5p_attribute_name)
    for __h5p_required_method in __h5p_constraints.get('requiredMethods', []):
        __h5p_required_class = __h5p_required_method.get('className') or ''
        __h5p_required_name = __h5p_required_method.get('methodName') or ''
        __h5p_required_params = __h5p_required_method.get('parameters') or []
        __h5p_matching_methods = [
            m for m in __h5p_method_specs
            if m['methodName'] == __h5p_required_name and (not __h5p_required_class or m['className'] == __h5p_required_class)
        ]
        __h5p_label = (__h5p_required_class + '.' if __h5p_required_class else '') + __h5p_required_name
        if not __h5p_matching_methods:
            __h5p_violations.append('Required method: ' + __h5p_label)
        elif __h5p_required_params and not any(m['parameters'] == __h5p_required_params for m in __h5p_matching_methods):
            __h5p_violations.append('Required method parameters: ' + __h5p_label + '(' + ', '.join(__h5p_required_params) + ')')
    for __h5p_required_attribute in __h5p_constraints.get('requiredAttributes', []):
        __h5p_required_class = __h5p_required_attribute.get('className') or ''
        __h5p_required_name = __h5p_required_attribute.get('attributeName') or ''
        __h5p_label = (__h5p_required_class + '.' if __h5p_required_class else '') + __h5p_required_name
        if (__h5p_required_class and __h5p_label not in __h5p_instance_attrs) or (not __h5p_required_class and __h5p_required_name not in __h5p_instance_attrs):
            __h5p_violations.append('Required instance attribute: ' + __h5p_label)
    if __h5p_constraints.get('requireConstructor') and '__init__' not in __h5p_methods: __h5p_violations.append('Constructor required')
    if __h5p_constraints.get('requireObjectInstantiation') and not __h5p_instantiated_classes: __h5p_violations.append('Object instantiation required')
    __h5p_has_inheritance = any(len(n.bases) > 0 for n in __h5p_classes)
    if __h5p_constraints.get('requireInheritance') and not __h5p_has_inheritance: __h5p_violations.append('Inheritance required')
    if __h5p_constraints.get('forbidInheritance') and __h5p_has_inheritance: __h5p_violations.append('Inheritance is not allowed')
    __h5p_result = {'passed': not __h5p_violations, 'violations': __h5p_violations}
except Exception as __h5p_error:
    __h5p_result = {'passed': False, 'violations': ['Constraint analysis failed: ' + type(__h5p_error).__name__]}
print('${RESULT_PREFIX}${token}:' + json.dumps(__h5p_result))
` };
};
export { RESULT_PREFIX };
