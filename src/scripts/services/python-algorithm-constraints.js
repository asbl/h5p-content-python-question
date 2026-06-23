const RESULT_PREFIX = '__H5P_ALGORITHM_CONSTRAINTS__:';

/** Builds a Pyodide-only AST preflight check for the module-level target function. */
export const getAlgorithmConstraintHarness = (source, constraints, functionName) => {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const normalizeStructures = (values) => (Array.isArray(values) ? values
    .map((value) => value?.structure ?? value)
    .filter((value) => ['list', 'dict', 'set', 'tuple'].includes(value)) : []);
  const config = JSON.stringify({
    ...constraints,
    functionName,
    requiredDataStructures: normalizeStructures(constraints.requiredDataStructures),
    forbiddenDataStructures: normalizeStructures(constraints.forbiddenDataStructures),
  });
  const code = JSON.stringify(String(source || ''));
  return { token, code: `import ast, json
__h5p_constraints = ${config}
try:
    __h5p_tree = ast.parse(${code})
    __h5p_target = next((n for n in __h5p_tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == __h5p_constraints['functionName']), None)
    def __h5p_scope_nodes(node):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                continue
            yield child
            yield from __h5p_scope_nodes(child)
    __h5p_nodes = list(__h5p_scope_nodes(__h5p_target)) if __h5p_target else []
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
    if not __h5p_target: __h5p_violations.append('Required function not found')
    __h5p_recursive_calls = [n for n in __h5p_nodes if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == __h5p_constraints['functionName']]
    if __h5p_constraints.get('requireRecursion') and not __h5p_recursive_calls: __h5p_violations.append('Recursion required')
    if __h5p_constraints.get('requireBaseCase') and not any(isinstance(n, ast.If) and any(isinstance(c, ast.Return) for c in ast.walk(n)) for n in __h5p_nodes): __h5p_violations.append('Recursion base case required')
    if int(__h5p_constraints.get('maxRecursiveCalls') or 0) and len(__h5p_recursive_calls) > int(__h5p_constraints['maxRecursiveCalls']): __h5p_violations.append('Too many recursive calls')
    __h5p_loop = __h5p_constraints.get('requiredLoop')
    if __h5p_loop == 'any' and not any(isinstance(n, (ast.For, ast.While)) for n in __h5p_nodes): __h5p_violations.append('Loop required')
    if __h5p_loop == 'for' and not any(isinstance(n, ast.For) for n in __h5p_nodes): __h5p_violations.append('For loop required')
    if __h5p_loop == 'while' and not any(isinstance(n, ast.While) for n in __h5p_nodes): __h5p_violations.append('While loop required')
    __h5p_loops = [n for n in __h5p_nodes if isinstance(n, (ast.For, ast.While))]
    if int(__h5p_constraints.get('maxLoopCount') or 0) and len(__h5p_loops) > int(__h5p_constraints['maxLoopCount']): __h5p_violations.append('Too many loops')
    if int(__h5p_constraints.get('maxLoopNesting') or 0) and __h5p_loop_depth(__h5p_target) > int(__h5p_constraints['maxLoopNesting']): __h5p_violations.append('Loop nesting too deep')
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
    __h5p_result = {'passed': not __h5p_violations, 'violations': __h5p_violations}
except Exception as __h5p_error:
    __h5p_result = {'passed': False, 'violations': ['Constraint analysis failed: ' + type(__h5p_error).__name__]}
print('${RESULT_PREFIX}${token}:' + json.dumps(__h5p_result))
` };
};
export { RESULT_PREFIX };
