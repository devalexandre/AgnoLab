// Property inspector for workflow nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { WORKFLOW_CONTROL_TYPES } from "../nodeCatalog";
import { CanvasGraph, GraphNode } from "../types";
import { getWorkflowConfig, updateWorkflowConfig } from "../nodeData";

export interface WorkflowInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  nodeMap: Record<string, GraphNode>;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function WorkflowInspector({ selectedNode, graph, nodeMap, setGraph }: WorkflowInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const currentWorkflowConfig: Record<string, unknown> = {
    debug_mode: true,
    stream_events: true,
    stream_executor_events: true,
    store_executor_outputs: true,
    telemetry: true,
    num_history_runs: 3,
    cache_session: false,
    add_workflow_history_to_steps: false,
    ...(getWorkflowConfig(currentNode.data) ?? {}),
  };
  const connectedDatabase =
    currentGraph.edges
      .filter((edge) => edge.target === currentNode.id)
      .map((edge) => nodeMap[edge.source])
      .find((node): node is GraphNode => Boolean(node) && node.type === "database") ?? null;
  const connectedSteps = currentGraph.edges
    .filter((edge) => edge.target === currentNode.id)
    .map((edge) => nodeMap[edge.source])
    .filter((node): node is GraphNode => Boolean(node) && (node.type === "workflow_step" || WORKFLOW_CONTROL_TYPES.includes(node.type)))
    .sort((left, right) => {
      const leftOrder = Number(fieldValueAsString(left.data.extras?.stepOrder) || "9999");
      const rightOrder = Number(fieldValueAsString(right.data.extras?.stepOrder) || "9999");
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (left.position.x !== right.position.x) {
        return left.position.x - right.position.x;
      }
      if (left.position.y !== right.position.y) {
        return left.position.y - right.position.y;
      }
      return left.data.name.localeCompare(right.data.name);
    });

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Name", "Workflow display name used in the canvas and generated code.", true)}
        <input
          value={currentNode.data.name}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional workflow description passed to Agno and shown in the canvas.")}
        <textarea
          value={fieldValueAsString(currentNode.data.description)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
        />
      </label>
      {connectedSteps.length ? (
        <div className="info-note">
          <p>
            <strong>Ordered steps</strong>
          </p>
          <p>{connectedSteps.map((step) => `${fieldValueAsString(step.data.extras?.stepOrder) || "?"}. ${step.data.name}`).join(" | ")}</p>
        </div>
      ) : (
        <div className="info-note">
          <p>Connect one or more Workflow Step nodes to this Workflow to build the execution order.</p>
        </div>
      )}
      {connectedDatabase ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Connected Database", "Database currently connected to this Workflow for persisted session state.")}
            <select value={connectedDatabase.data.name} disabled>
              <option value={connectedDatabase.data.name}>{connectedDatabase.data.name}</option>
            </select>
          </label>
          <p className="muted small-note">Read-only because it is connected from {connectedDatabase.data.name}.</p>
        </>
      ) : (
        <div className="info-note">
          <p>Connect a Database node if you want persisted workflow session state and history.</p>
        </div>
      )}
      <label>
        {renderInspectorPropertyLabel("User ID", "Optional user id forwarded to the workflow runtime.")}
        <input
          value={fieldValueAsString(currentWorkflowConfig.user_id)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "user_id", event.target.value)))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Session ID", "Optional workflow session id.")}
        <input
          value={fieldValueAsString(currentWorkflowConfig.session_id)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "session_id", event.target.value)))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Session State", "Optional initial workflow session state JSON.")}
        <textarea
          className="code-input"
          value={fieldValueAsString(currentWorkflowConfig.session_state)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "session_state", event.target.value)))}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.add_session_state_to_context)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "add_session_state_to_context", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Add Session State To Context", "Makes workflow session state available to the steps during execution.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.overwrite_db_session_state)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "overwrite_db_session_state", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Overwrite DB Session State", "Overwrites persisted session state with the configured session state when the workflow starts.")}
      </label>
      <label>
        {renderInspectorPropertyLabel("Dependencies", "Optional dependency JSON shared with workflow steps.")}
        <textarea
          className="code-input"
          value={fieldValueAsString(currentWorkflowConfig.dependencies)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "dependencies", event.target.value)))}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.add_dependencies_to_context)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "add_dependencies_to_context", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Add Dependencies To Context", "Injects workflow dependencies into step execution context.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.cache_session)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "cache_session", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Cache Session", "Caches workflow session data between runs when supported by Agno.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.add_workflow_history_to_steps)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "add_workflow_history_to_steps", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Add Workflow History To Steps", "Makes previous workflow history available to step executors.")}
      </label>
      <label>
        {renderInspectorPropertyLabel("Workflow History Runs", "How many previous workflow runs should be available when history is enabled.")}
        <input
          type="number"
          min="1"
          value={fieldValueAsString(currentWorkflowConfig.num_history_runs)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "num_history_runs", Number(event.target.value))))}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.stream)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "stream", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Stream", "Enables streaming mode for the workflow run output.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.stream_events)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "stream_events", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Stream Events", "Streams workflow events during execution.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={currentWorkflowConfig.stream_executor_events !== false}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "stream_executor_events", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Stream Executor Events", "Includes agent and team executor events in the workflow event stream.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.store_events)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "store_events", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Store Events", "Stores emitted workflow events in the run output.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={currentWorkflowConfig.store_executor_outputs !== false}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "store_executor_outputs", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Store Executor Outputs", "Stores the raw outputs produced by each step executor.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentWorkflowConfig.debug_mode)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "debug_mode", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Debug Mode", "Enables Agno workflow debug mode.")}
      </label>
      <label>
        {renderInspectorPropertyLabel("Debug Level", "Workflow debug verbosity level.")}
        <select
          value={fieldValueAsString(currentWorkflowConfig.debug_level)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "debug_level", Number(event.target.value))))}
        >
          <option value="">Default</option>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={currentWorkflowConfig.telemetry !== false}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "telemetry", event.target.checked)))}
        />
        {renderInspectorPropertyLabel("Telemetry", "Keeps Agno workflow telemetry enabled.")}
      </label>
    </>
  );
}
