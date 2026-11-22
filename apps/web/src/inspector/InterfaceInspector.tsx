// Property inspector for interface nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { INTERFACE_PRESET_OPTIONS, InterfacePresetKey } from "../editorConstants";
import { buildInterfaceExpression, getDefaultInterfaceExtras } from "../nodeData";

export interface InterfaceInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  nodeMap: Record<string, GraphNode>;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function InterfaceInspector({ selectedNode, graph, nodeMap, setGraph }: InterfaceInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const currentExtras = {
    ...getDefaultInterfaceExtras(),
    ...(currentNode.data.extras ?? {}),
  };
  const connectedExecutor =
    currentGraph.edges
      .filter((edge) => edge.target === currentNode.id)
      .map((edge) => nodeMap[edge.source])
      .find((node): node is GraphNode => Boolean(node) && (node.type === "agent" || node.type === "team")) ?? null;
  const resolvedTargetType: "agent" | "team" = connectedExecutor?.type === "team" ? "team" : "agent";
  const selectedPreset =
    (fieldValueAsString(currentExtras.interfacePreset).trim() as InterfacePresetKey) ||
    "whatsapp";
  const normalizedPreset: InterfacePresetKey = INTERFACE_PRESET_OPTIONS.some((option) => option.key === selectedPreset)
    ? selectedPreset
    : "whatsapp";
  const generatedExpression = buildInterfaceExpression(normalizedPreset, resolvedTargetType, currentExtras);

  const updateInterfaceConfig = (patch: Record<string, unknown>) => {
    const nextExtras = {
      ...currentExtras,
      ...patch,
    };
    const nextPresetRaw = fieldValueAsString(nextExtras.interfacePreset).trim() as InterfacePresetKey;
    const nextPreset: InterfacePresetKey = INTERFACE_PRESET_OPTIONS.some((option) => option.key === nextPresetRaw)
      ? nextPresetRaw
      : "whatsapp";
    const nextTarget = connectedExecutor?.type === "team" ? "team" : "agent";
    nextExtras.interfaceTargetType = nextTarget;
    nextExtras.interfaceExpression = buildInterfaceExpression(nextPreset, nextTarget, nextExtras);
    setGraph(updateNodeData(currentGraph, currentNode.id, { extras: nextExtras }));
  };

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Name", "Display name used in the canvas and generated interface symbol.", true)}
        <input
          value={currentNode.data.name}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional interface description used in canvas metadata.")}
        <textarea
          value={fieldValueAsString(currentNode.data.description)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
        />
      </label>
      {connectedExecutor ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Connected Executor", "Agent or Team currently connected to this Interface node.")}
            <select value={connectedExecutor.data.name} disabled>
              <option value={connectedExecutor.data.name}>{connectedExecutor.data.name}</option>
            </select>
          </label>
          <p className="muted small-note">Read-only because it is connected from {connectedExecutor.data.name}.</p>
        </>
      ) : (
        <div className="info-note">
          <p>Connect this Interface node to an Agent or Team to generate a runnable interface expression.</p>
        </div>
      )}
      <label>
        {renderInspectorPropertyLabel("Interface Preset", "Select which Agno AgentOS interface class should be generated.")}
        <select
          value={normalizedPreset}
          onChange={(event) => updateInterfaceConfig({ interfacePreset: event.target.value })}
        >
          {INTERFACE_PRESET_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {renderInspectorPropertyLabel("Target Type", "Resolved automatically from the connected node (Agent or Team).")}
        <select value={resolvedTargetType} disabled>
          <option value="agent">agent</option>
          <option value="team">team</option>
        </select>
      </label>
      {normalizedPreset === "whatsapp" || normalizedPreset === "all" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("WhatsApp Phone Number ID Env", "Environment variable name used to resolve phone_number_id at runtime.")}
            <input
              value={fieldValueAsString(currentExtras.whatsappPhoneNumberIdEnv)}
              onChange={(event) => updateInterfaceConfig({ whatsappPhoneNumberIdEnv: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("WhatsApp Access Token Env", "Environment variable name used to resolve access_token at runtime.")}
            <input
              value={fieldValueAsString(currentExtras.whatsappAccessTokenEnv)}
              onChange={(event) => updateInterfaceConfig({ whatsappAccessTokenEnv: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("WhatsApp Verify Token Env", "Environment variable name used to resolve verify_token at runtime.")}
            <input
              value={fieldValueAsString(currentExtras.whatsappVerifyTokenEnv)}
              onChange={(event) => updateInterfaceConfig({ whatsappVerifyTokenEnv: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {normalizedPreset === "telegram" || normalizedPreset === "all" ? (
        <label>
          {renderInspectorPropertyLabel("Telegram Token Env", "Environment variable name used to resolve token at runtime.")}
          <input
            value={fieldValueAsString(currentExtras.telegramTokenEnv)}
            onChange={(event) => updateInterfaceConfig({ telegramTokenEnv: event.target.value })}
          />
        </label>
      ) : null}
      {normalizedPreset === "slack" || normalizedPreset === "all" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Slack Bot Token Env", "Environment variable name used to resolve Slack bot token at runtime.")}
            <input
              value={fieldValueAsString(currentExtras.slackTokenEnv)}
              onChange={(event) => updateInterfaceConfig({ slackTokenEnv: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Slack Signing Secret Env", "Environment variable name used to resolve Slack signing_secret at runtime.")}
            <input
              value={fieldValueAsString(currentExtras.slackSigningSecretEnv)}
              onChange={(event) => updateInterfaceConfig({ slackSigningSecretEnv: event.target.value })}
            />
          </label>
        </>
      ) : null}
      <label>
        {renderInspectorPropertyLabel("Generated Interface Expression", "Preview of the Agno interface expression generated from the selected preset and connected target.")}
        <textarea className="code-input" value={generatedExpression} readOnly />
      </label>
      <div className="info-note">
        <p>
          Imports used: <code>agno.os.interfaces.whatsapp</code>, <code>agno.os.interfaces.telegram</code>, <code>agno.os.interfaces.slack</code>,
          <code> agno.os.interfaces.a2a</code>, <code>agno.os.interfaces.agui</code>
        </p>
      </div>
    </>
  );
}
