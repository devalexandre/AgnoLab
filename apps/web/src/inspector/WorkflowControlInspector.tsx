import { BRANCH_ELSE_HANDLE, NODE_CATALOG } from "../nodeCatalog";
import type { CanvasGraph, GraphNode, NodeData } from "../types";
import { fieldValueAsString } from "../utils";
import { renderInspectorPropertyLabel } from "./fields";

export interface WorkflowControlInspectorProps {
  node: GraphNode;
  graph: CanvasGraph;
  onChange: (patch: Partial<NodeData>) => void;
}

const RULE_HELP = {
  workflow_loop:
    "Python expression checked after each pass. `outputs` is the list of step outputs from that pass and `last` is the text of the last one. True stops the loop. Example: 'APPROVED' in last",
  workflow_router:
    "Python expression that returns the name of the step to run (or a list of names). `text` is the workflow input and `previous` the previous step's output. Example: 'Billing Step' if 'invoice' in text.lower() else 'Support Step'",
  workflow_branch:
    "Python expression. True runs the steps on the if port, false the steps on the else port. `text` is the workflow input and `previous` the previous step's output. Example: 'urgent' in text.lower()",
} as const;

/** Inspector for Parallel / Loop / Router / Branch workflow control nodes. */
export default function WorkflowControlInspector({ node, graph, onChange }: WorkflowControlInspectorProps) {
  const extras = node.data.extras ?? {};
  const setExtra = (key: string, value: unknown) => onChange({ extras: { ...extras, [key]: value } });
  const nodeById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const childrenOn = (elsePort: boolean) =>
    incoming
      .filter((edge) => (edge.target_handle === BRANCH_ELSE_HANDLE) === elsePort)
      .map((edge) => nodeById.get(edge.source))
      .filter((child): child is GraphNode => Boolean(child))
      .sort((left, right) => Number(left.data.extras?.stepOrder ?? 9999) - Number(right.data.extras?.stepOrder ?? 9999));
  const mainChildren = childrenOn(false);
  const elseChildren = node.type === "workflow_branch" ? childrenOn(true) : [];
  const describe = (children: GraphNode[]) => children.map((child) => `${child.data.name} (${NODE_CATALOG[child.type].label})`).join(", ");

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Name", `${NODE_CATALOG[node.type].label} name; Router rules refer to steps by name.`, true)}
        <input value={node.data.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional description passed to Agno.")}
        <textarea value={fieldValueAsString(node.data.description)} onChange={(event) => onChange({ description: event.target.value })} />
      </label>
      <label>
        {renderInspectorPropertyLabel("Step Order", "Position of this node in the parent workflow's (or control node's) step list.")}
        <input
          type="number"
          min={1}
          value={fieldValueAsString(extras.stepOrder)}
          onChange={(event) => setExtra("stepOrder", event.target.value === "" ? "" : Number(event.target.value))}
        />
      </label>

      <div className="info-note">
        <p>
          <strong>{node.type === "workflow_router" ? "Routes" : node.type === "workflow_branch" ? "If steps" : "Steps"}</strong>
        </p>
        <p>{mainChildren.length ? describe(mainChildren) : "Connect Workflow Steps (or other control nodes) into this node."}</p>
        {node.type === "workflow_branch" ? (
          <>
            <p>
              <strong>Else steps</strong>
            </p>
            <p>{elseChildren.length ? describe(elseChildren) : "Optional: connect steps to the else port."}</p>
          </>
        ) : null}
      </div>

      {node.type === "workflow_loop" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Max Iterations", "Hard limit on passes, even if the end condition never holds.")}
            <input
              type="number"
              min={1}
              value={fieldValueAsString(extras.maxIterations)}
              onChange={(event) => setExtra("maxIterations", event.target.value === "" ? "" : Number(event.target.value))}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("End Condition", RULE_HELP.workflow_loop)}
            <textarea
              className="code-input rule-input"
              placeholder="'APPROVED' in last"
              value={fieldValueAsString(extras.endCondition)}
              onChange={(event) => setExtra("endCondition", event.target.value)}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(extras.forwardIterationOutput)}
              onChange={(event) => setExtra("forwardIterationOutput", event.target.checked)}
            />
            {renderInspectorPropertyLabel("Forward Iteration Output", "Feed each pass's output into the next pass instead of the original input.")}
          </label>
        </>
      ) : null}

      {node.type === "workflow_router" ? (
        <label>
          {renderInspectorPropertyLabel("Route Rule", RULE_HELP.workflow_router)}
          <textarea
            className="code-input rule-input"
            placeholder={mainChildren[0] ? `'${mainChildren[0].data.name}'` : "'Step name'"}
            value={fieldValueAsString(extras.selector)}
            onChange={(event) => setExtra("selector", event.target.value)}
          />
          <span className="muted small-note">Empty rule: always the first route.</span>
        </label>
      ) : null}

      {node.type === "workflow_branch" ? (
        <label>
          {renderInspectorPropertyLabel("Rule", RULE_HELP.workflow_branch)}
          <textarea
            className="code-input rule-input"
            placeholder="'urgent' in text.lower()"
            value={fieldValueAsString(extras.evaluator)}
            onChange={(event) => setExtra("evaluator", event.target.value)}
          />
        </label>
      ) : null}
    </>
  );
}
