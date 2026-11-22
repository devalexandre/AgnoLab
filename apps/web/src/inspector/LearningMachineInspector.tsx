// Property inspector for learning_machine nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { AGNO_MODEL_PROVIDER_OPTIONS } from "../agentConfig";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { applyProviderPreset, buildLearningMachineExpressionFromExtras, getDefaultLearningMachineExtras, getProviderConfig, toPythonString } from "../nodeData";

export interface LearningMachineInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  nodeMap: Record<string, GraphNode>;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function LearningMachineInspector({ selectedNode, graph, nodeMap, setGraph }: LearningMachineInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const currentExtras = {
    ...getDefaultLearningMachineExtras(),
    ...(currentNode.data.extras ?? {}),
  };
  const connectedDatabase =
    currentGraph.edges
      .filter((edge) => edge.target === currentNode.id)
      .map((edge) => nodeMap[edge.source])
      .find((node): node is GraphNode => Boolean(node) && node.type === "database") ?? null;
  const connectedKnowledge =
    currentGraph.edges
      .filter((edge) => edge.target === currentNode.id)
      .map((edge) => nodeMap[edge.source])
      .find((node): node is GraphNode => Boolean(node) && node.type === "knowledge") ?? null;
  const connectedDbExpression = connectedDatabase ? fieldValueAsString(connectedDatabase.data.extras?.dbExpression) : undefined;
  const connectedKnowledgeExpression = connectedKnowledge ? fieldValueAsString(connectedKnowledge.data.extras?.knowledgeExpression) : undefined;
  const learningModelPreview = Boolean(currentExtras.useLearningModel)
    ? toPythonString(`${fieldValueAsString(currentNode.data.provider) || "openai"}:${fieldValueAsString(currentNode.data.model) || "gpt-4.1-mini"}`)
    : undefined;
  const generatedExpression = buildLearningMachineExpressionFromExtras(
    currentExtras,
    connectedDbExpression,
    connectedKnowledgeExpression,
    learningModelPreview,
  );
  const updateLearningMachineConfig = (patch: Record<string, unknown>) => {
    const nextExtras: Record<string, unknown> = {
      ...currentExtras,
      ...patch,
    };
    const nextLearningModelPreview = Boolean(nextExtras.useLearningModel)
      ? toPythonString(`${fieldValueAsString(currentNode.data.provider) || "openai"}:${fieldValueAsString(currentNode.data.model) || "gpt-4.1-mini"}`)
      : undefined;
    nextExtras.learningMachineExpression = buildLearningMachineExpressionFromExtras(
      nextExtras,
      connectedDbExpression,
      connectedKnowledgeExpression,
      nextLearningModelPreview,
    );
    setGraph(updateNodeData(currentGraph, currentNode.id, { extras: nextExtras }));
  };

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Name", "Display name used in the canvas and in connected component selectors.", true)}
        <input
          value={currentNode.data.name}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional description for the canvas and future docs/export surfaces.")}
        <textarea
          value={fieldValueAsString(currentNode.data.description)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
        />
      </label>
      {connectedDatabase ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Connected Database", "Database currently connected to this Learning Machine.")}
            <select value={connectedDatabase.data.name} disabled>
              <option value={connectedDatabase.data.name}>{connectedDatabase.data.name}</option>
            </select>
          </label>
          <p className="muted small-note">Read-only because it is connected from {connectedDatabase.data.name}.</p>
        </>
      ) : (
        <div className="info-note">
          <p>Connect a Database node if you want this Learning Machine to persist state outside the default runtime behavior.</p>
        </div>
      )}
      {connectedKnowledge ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Connected Knowledge", "Knowledge resource currently connected to this Learning Machine.")}
            <select value={connectedKnowledge.data.name} disabled>
              <option value={connectedKnowledge.data.name}>{connectedKnowledge.data.name}</option>
            </select>
          </label>
          <p className="muted small-note">Read-only because it is connected from {connectedKnowledge.data.name}.</p>
        </>
      ) : (
        <div className="info-note">
          <p>Connect a Knowledge node when you want learned knowledge to use a dedicated store.</p>
        </div>
      )}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.useLearningModel)}
          onChange={(event) => updateLearningMachineConfig({ useLearningModel: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Use Learning Model", "Enables a dedicated provider/model pair for learning operations instead of relying on Agno defaults.")}
      </label>
      {Boolean(currentExtras.useLearningModel) ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Provider Preset", "Applies the provider catalog defaults for this learning model.")}
            <select
              value={fieldValueAsString(getProviderConfig(currentNode.data).provider_profile)}
              onChange={(event) =>
                setGraph(updateNodeData(currentGraph, currentNode.id, applyProviderPreset(currentNode.data, event.target.value)))
              }
            >
              <option value="">Not set</option>
              {AGNO_MODEL_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label>
            {renderInspectorPropertyLabel("Provider", "Provider id used to build the learning model instance.")}
            <input
              value={fieldValueAsString(currentNode.data.provider)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { provider: event.target.value }))}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Model", "Model id used for the learning operations.")}
            <input
              value={fieldValueAsString(currentNode.data.model)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { model: event.target.value }))}
            />
          </label>
        </>
      ) : null}
      <label>
        {renderInspectorPropertyLabel("Namespace", "Logical namespace used by the Learning Machine to isolate tenants or environments.")}
        <input
          value={fieldValueAsString(currentExtras.learningNamespace)}
          onChange={(event) => updateLearningMachineConfig({ learningNamespace: event.target.value })}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningUserProfile)}
          onChange={(event) => updateLearningMachineConfig({ learningUserProfile: event.target.checked })}
        />
        {renderInspectorPropertyLabel("User Profile Store", "Tracks stable profile facts and long-lived user preferences.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningUserMemory)}
          onChange={(event) => updateLearningMachineConfig({ learningUserMemory: event.target.checked })}
        />
        {renderInspectorPropertyLabel("User Memory Store", "Stores user-specific memories that can be recalled across sessions.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningSessionContext)}
          onChange={(event) => updateLearningMachineConfig({ learningSessionContext: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Session Context Store", "Persists session-level context learned during execution.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningEntityMemory)}
          onChange={(event) => updateLearningMachineConfig({ learningEntityMemory: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Entity Memory Store", "Keeps memory about third-party entities, accounts, or external objects.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningLearnedKnowledge)}
          onChange={(event) => updateLearningMachineConfig({ learningLearnedKnowledge: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Learned Knowledge Store", "Stores knowledge synthesized from prior runs and observations.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningDecisionLog)}
          onChange={(event) => updateLearningMachineConfig({ learningDecisionLog: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Decision Log Store", "Tracks important decisions, rationale, and run-level outcomes.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.learningDebugMode)}
          onChange={(event) => updateLearningMachineConfig({ learningDebugMode: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Enable Debug Mode", "Turns on debug behavior for the Learning Machine runtime.")}
      </label>
      <label>
        {renderInspectorPropertyLabel("Generated Learning Machine Expression", "Preview of the Agno LearningMachine expression generated from the fields above.")}
        <textarea className="code-input" value={generatedExpression} readOnly />
      </label>
    </>
  );
}
