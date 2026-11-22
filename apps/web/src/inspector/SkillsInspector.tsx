// Property inspector for skills nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode, SkillPathOption } from "../types";
import { buildSkillsExpressionFromExtras, getDefaultSkillsExtras } from "../nodeData";

export interface SkillsInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  isLoadingSkillPaths: boolean;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
  setSkillPathsRefreshKey: Dispatch<SetStateAction<number>>;
  skillPathOptions: SkillPathOption[];
}

export default function SkillsInspector({ selectedNode, graph, isLoadingSkillPaths, setGraph, setSkillPathsRefreshKey, skillPathOptions }: SkillsInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }

  const currentExtras = {
    ...getDefaultSkillsExtras(),
    ...(currentNode.data.extras ?? {}),
  };
  const currentSkillsPath = fieldValueAsString(currentExtras.skillsPath).trim();
  const selectedSkillPathOption = skillPathOptions.find((option) => option.path === currentSkillsPath) ?? null;
  const hasCurrentSkillsPathOption = skillPathOptions.some((option) => option.path === currentSkillsPath);
  const resolvedSkillPathOptions = hasCurrentSkillsPathOption || !currentSkillsPath
    ? skillPathOptions
    : [
        {
          path: currentSkillsPath,
          label: `Current path (${currentSkillsPath})`,
          source: "saved",
          validates: currentExtras.skillsValidate !== false,
          validation_error: null,
        },
        ...skillPathOptions,
      ];
  const generatedExpression = buildSkillsExpressionFromExtras(currentExtras);
  const hasLegacyExpression =
    Boolean(fieldValueAsString(currentNode.data.extras?.skillsExpression).trim()) &&
    fieldValueAsString(currentNode.data.extras?.skillsExpression).trim() !== generatedExpression &&
    currentNode.data.extras?.skillsPath === undefined;
  const updateSkillsConfig = (patch: Record<string, unknown>) => {
    const nextExtras: Record<string, unknown> = {
      ...currentExtras,
      ...patch,
    };
    nextExtras.skillsExpression = buildSkillsExpressionFromExtras(nextExtras);
    setGraph(updateNodeData(currentGraph, currentNode.id, { extras: nextExtras }));
  };

  return (
    <>
      <div className="info-note">
        <p>This node loads local Agno skills for connected Agents. The installed SDK exposes `skills` on `Agent`, not on `Team`, so this first slice is Agent-only.</p>
      </div>
      <label>
        {renderInspectorPropertyLabel("Name", "Display name used in the canvas and in connected component selectors.", true)}
        <input
          value={currentNode.data.name}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional description stored only in the canvas for this Skills resource.")}
        <textarea
          value={fieldValueAsString(currentNode.data.description)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
        />
      </label>
      {hasLegacyExpression ? (
        <div className="info-note">
          <p>Legacy expression detected</p>
          <p>Editing the structured fields below will replace the previous custom Skills expression.</p>
        </div>
      ) : null}
      <label>
        {renderInspectorPropertyLabel("Skills Path", "Select a detected local skill folder. The picker lists repo skills and installed user skills discovered by the API.")}
        <select
          value={currentSkillsPath}
          disabled={!resolvedSkillPathOptions.length}
          onChange={(event) => {
            const nextPath = event.target.value;
            const nextOption = resolvedSkillPathOptions.find((option) => option.path === nextPath);
            updateSkillsConfig({
              skillsPath: nextPath,
              skillsValidate: nextOption ? nextOption.validates : currentExtras.skillsValidate,
            });
          }}
        >
          {!currentSkillsPath ? <option value="">Select a detected skills path</option> : null}
          {resolvedSkillPathOptions.map((option) => (
            <option key={`${option.source}:${option.path}`} value={option.path}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setSkillPathsRefreshKey((current) => current + 1)}
          disabled={isLoadingSkillPaths}
        >
          {isLoadingSkillPaths ? "Refreshing paths..." : "Refresh paths"}
        </button>
      </div>
      <p className="muted small-note">
        {resolvedSkillPathOptions.length
          ? "Detected from `examples/skills` and `~/.agents/skills`. Starter example available at `examples/skills/support-response-style`."
          : "No local skill folders were detected yet. Add one under `examples/skills` or `~/.agents/skills` and refresh the picker."}
      </p>
      {selectedSkillPathOption && !selectedSkillPathOption.validates ? (
        <div className="info-note">
          <p>This skill does not fully match Agno's Agent Skills spec.</p>
          <p>{selectedSkillPathOption.validation_error || "Validation was automatically disabled so the skill can still load."}</p>
        </div>
      ) : null}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={currentExtras.skillsValidate !== false}
          onChange={(event) => updateSkillsConfig({ skillsValidate: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Validate Skills", "Validates the local skill directory against Agno's Agent Skills spec before loading it.")}
      </label>
      <label>
        {renderInspectorPropertyLabel("Generated Skills Expression", "Preview of the Agno Skills expression generated from the fields above.")}
        <textarea className="code-input" value={generatedExpression} readOnly />
      </label>
    </>
  );
}
