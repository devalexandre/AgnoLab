"""Workflow control-flow nodes: Parallel, Loop, Router and Branch (if/else).

These nodes behave like workflow steps: they connect into a Workflow (or into another
control node) and are ordered by ``stepOrder`` like steps. Their children are the steps or
control nodes connected into them. A Branch node routes children that arrive on its ``else``
port into ``else_steps``.

User rules are short Python expressions. Loop end conditions see ``outputs`` (the step outputs
of the iteration that just ran) and ``last`` (the text of its last output); Router and Branch
rules see ``text`` (the workflow input), ``previous`` (the previous step's output) and
``step_input``. They are syntax-checked here and compiled into
small functions in the generated code; a rule that fails at runtime is reported and falls
back to a safe default instead of crashing the workflow.
"""

from __future__ import annotations

import ast
from collections.abc import Callable

from .models import CanvasGraph, GraphNode, NodeType

WORKFLOW_CONTROL_TYPES = {
    NodeType.WORKFLOW_PARALLEL,
    NodeType.WORKFLOW_LOOP,
    NodeType.WORKFLOW_ROUTER,
    NodeType.WORKFLOW_BRANCH,
}

# Everything that can sit in a workflow's (or a control node's) list of steps.
WORKFLOW_STEP_LIKE_TYPES = {NodeType.WORKFLOW_STEP, *WORKFLOW_CONTROL_TYPES}

# Agno class emitted for each control node.
WORKFLOW_CONTROL_CLASSES = {
    NodeType.WORKFLOW_PARALLEL: "Parallel",
    NodeType.WORKFLOW_LOOP: "Loop",
    NodeType.WORKFLOW_ROUTER: "Router",
    NodeType.WORKFLOW_BRANCH: "Condition",
}

ELSE_HANDLE = "else"


def is_valid_expression(expression: str) -> bool:
    try:
        ast.parse(expression, mode="eval")
    except SyntaxError:
        return False
    return True


def ordered_children(
    node: GraphNode,
    graph: CanvasGraph,
    node_map: dict[str, GraphNode],
    symbol_map: dict[str, str],
    order_key: Callable[[GraphNode], tuple],
) -> tuple[list[GraphNode], list[GraphNode]]:
    """Return (main children, else children) connected into a control node, in step order."""
    main: list[GraphNode] = []
    otherwise: list[GraphNode] = []
    for edge in graph.edges:
        if edge.target != node.id:
            continue
        child = node_map.get(edge.source)
        if not child or child.type not in WORKFLOW_STEP_LIKE_TYPES or child.id not in symbol_map:
            continue
        (otherwise if edge.target_handle == ELSE_HANDLE else main).append(child)
    return sorted(main, key=order_key), sorted(otherwise, key=order_key)


def _expression(node: GraphNode, key: str) -> str:
    return str((node.data.extras or {}).get(key) or "").strip()


def _common_kwargs(node: GraphNode) -> list[tuple[str, str]]:
    pairs = [("name", repr(node.data.name))]
    if node.data.description:
        pairs.append(("description", repr(node.data.description)))
    return pairs


def _render_call(var_name: str, class_name: str, positional: list[str], pairs: list[tuple[str, str]]) -> list[str]:
    lines = [f"{var_name} = {class_name}("]
    lines.extend(f"    {value}," for value in positional)
    lines.extend(f"    {key}={value}," for key, value in pairs)
    lines.append(")")
    return lines


def _rule_function(
    function_name: str,
    signature: str,
    preamble: list[str],
    expression: str,
    fallback: str,
    label: str,
) -> list[str]:
    """A generated helper that evaluates a user rule, reporting errors instead of raising."""
    lines = [f"def {function_name}({signature}):"]
    lines.extend(f"    {line}" for line in preamble)
    lines.extend(
        [
            "    try:",
            f"        return {expression}",
            "    except Exception as _agnolab_rule_error:",
            f"        print(f'[{label}] rule failed: {{_agnolab_rule_error}}')",
            f"        return {fallback}",
            "",
        ]
    )
    return lines


# Names available to Router / Branch rules.
STEP_INPUT_PREAMBLE = [
    "text = str(step_input.get_input_as_string() or '')",
    "previous = str(step_input.previous_step_content or '')",
]


def render_workflow_control_node(
    node: GraphNode,
    var_name: str,
    graph: CanvasGraph,
    node_map: dict[str, GraphNode],
    symbol_map: dict[str, str],
    order_key: Callable[[GraphNode], tuple],
) -> tuple[list[str], list[str]]:
    """Emit the definition of one control-flow node (plus any rule helper it needs)."""
    extras = node.data.extras or {}
    warnings: list[str] = []
    class_name = WORKFLOW_CONTROL_CLASSES[node.type]
    label = f"{class_name.lower()} {node.data.name}"
    main, otherwise = ordered_children(node, graph, node_map, symbol_map, order_key)
    main_symbols = [symbol_map[child.id] for child in main]
    lines: list[str] = []

    if not main:
        warnings.append(f"{class_name} '{node.data.name}' has no connected workflow steps.")
    if otherwise and node.type != NodeType.WORKFLOW_BRANCH:
        warnings.append(f"{class_name} '{node.data.name}' only uses its else port on Branch nodes; those steps were ignored.")

    if node.type == NodeType.WORKFLOW_PARALLEL:
        lines.extend(_render_call(var_name, class_name, main_symbols, _common_kwargs(node)))

    elif node.type == NodeType.WORKFLOW_LOOP:
        pairs = [("steps", f"[{', '.join(main_symbols)}]"), *_common_kwargs(node)]
        try:
            max_iterations = max(1, int(extras.get("maxIterations") or 3))
        except (TypeError, ValueError):
            max_iterations = 3
            warnings.append(f"Loop '{node.data.name}' has an invalid max iterations value; using 3.")
        pairs.append(("max_iterations", repr(max_iterations)))
        end_condition = _expression(node, "endCondition")
        if end_condition:
            if is_valid_expression(end_condition):
                function_name = f"{var_name}_end_condition"
                lines.extend(
                    _rule_function(
                        function_name,
                        "outputs",
                        ["last = str(outputs[-1].content or '') if outputs else ''"],
                        f"bool({end_condition})",
                        "False",
                        label,
                    )
                )
                pairs.append(("end_condition", function_name))
            else:
                warnings.append(f"Loop '{node.data.name}' end condition is not a valid Python expression; it was ignored.")
        if extras.get("forwardIterationOutput"):
            pairs.append(("forward_iteration_output", "True"))
        lines.extend(_render_call(var_name, class_name, [], pairs))

    elif node.type == NodeType.WORKFLOW_ROUTER:
        selector = _expression(node, "selector")
        first_choice = repr(main[0].data.name) if main else "None"
        if selector and not is_valid_expression(selector):
            warnings.append(f"Router '{node.data.name}' selector is not a valid Python expression; routing to the first choice.")
            selector = ""
        function_name = f"{var_name}_selector"
        lines.extend(
            _rule_function(
                function_name,
                "step_input",
                STEP_INPUT_PREAMBLE,
                # The rule returns a choice name (or a list of names); empty means the first choice.
                f"({selector}) or {first_choice}" if selector else first_choice,
                first_choice,
                label,
            )
        )
        pairs = [("choices", f"[{', '.join(main_symbols)}]"), ("selector", function_name), *_common_kwargs(node)]
        lines.extend(_render_call(var_name, class_name, [], pairs))

    elif node.type == NodeType.WORKFLOW_BRANCH:
        evaluator = _expression(node, "evaluator")
        pairs = [("steps", f"[{', '.join(main_symbols)}]")]
        if evaluator:
            if is_valid_expression(evaluator):
                function_name = f"{var_name}_evaluator"
                lines.extend(
                    _rule_function(function_name, "step_input", STEP_INPUT_PREAMBLE, f"bool({evaluator})", "False", label)
                )
                pairs.append(("evaluator", function_name))
            else:
                warnings.append(f"Branch '{node.data.name}' rule is not a valid Python expression; it always takes the if path.")
        else:
            warnings.append(f"Branch '{node.data.name}' has no rule; it always takes the if path.")
        if otherwise:
            pairs.append(("else_steps", f"[{', '.join(symbol_map[child.id] for child in otherwise)}]"))
        pairs.extend(_common_kwargs(node))
        lines.extend(_render_call(var_name, class_name, [], pairs))

    lines.append("")
    return lines, warnings
