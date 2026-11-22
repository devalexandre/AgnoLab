// Property inspector for tool nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { fieldValueAsString } from "../utils";
import { BUILT_IN_TOOLS, BUILT_IN_TOOL_CATEGORIES, getBuiltInTool } from "../toolCatalog";
import { BuiltInToolFunctionOption, CanvasGraph, GraphNode } from "../types";
import { getToolMode, updateToolConfig } from "../nodeData";

export interface ToolInspectorProps {
  selectedNode: GraphNode;
  builtInToolFunctionOptions: BuiltInToolFunctionOption[];
  builtInToolFunctionsError: string | null;
  graph: CanvasGraph | null;
  isLoadingBuiltInToolFunctions: boolean;
  saveCurrentFunctionTool: () => void;
  setEditingFunctionNodeId: Dispatch<SetStateAction<string | null>>;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function ToolInspector({ selectedNode, builtInToolFunctionOptions, builtInToolFunctionsError, graph, isLoadingBuiltInToolFunctions, saveCurrentFunctionTool, setEditingFunctionNodeId, setGraph }: ToolInspectorProps) {
  const toolMode = getToolMode(selectedNode.data);
  const selectedBuiltInTool = getBuiltInTool(selectedNode.data.extras?.builtinToolKey as string | undefined);
  const selectedBuiltInWorkflowFunctionName = fieldValueAsString(selectedNode.data.extras?.builtinWorkflowFunction).trim();
  const selectedBuiltInWorkflowFunction =
    builtInToolFunctionOptions.find((option) => option.name === selectedBuiltInWorkflowFunctionName) ?? null;

  return (
    <>
      <label>
        Name
        <span className="required-mark">*</span>
        <input
          value={selectedNode.data.name}
          onChange={(event) =>
            setGraph(updateNodeData(graph, selectedNode.id, { name: event.target.value }))
          }
        />
      </label>

      <label>
        Tool Mode
        <span className="required-mark">*</span>
        <select
          value={toolMode}
          onChange={(event) => {
            const nextMode = event.target.value as "builtin" | "function";
            setGraph(
              updateNodeData(
                graph,
                selectedNode.id,
                updateToolConfig(selectedNode.data, { toolMode: nextMode }),
              ),
            );
          }}
        >
          <option value="builtin">Built-in Tool</option>
          <option value="function">Function Tool</option>
        </select>
      </label>

      {toolMode === "builtin" ? (
        <>
          <label>
            Built-in Tool
            <span className="required-mark">*</span>
            <select
              value={fieldValueAsString(selectedNode.data.extras?.builtinToolKey)}
              onChange={(event) => {
                const tool = getBuiltInTool(event.target.value);
                if (!tool) {
                  return;
                }
                setGraph(
                  updateNodeData(graph, selectedNode.id, {
                    description: tool.description,
                    ...updateToolConfig(selectedNode.data, {
                      builtinToolKey: tool.key,
                      builtinImportPath: tool.importPath,
                      builtinClassName: tool.className,
                      builtinConfig: tool.configTemplate ?? "",
                      builtinWorkflowFunction: "",
                      builtinWorkflowExecutorArgs: "",
                    }),
                  }),
                );
              }}
            >
              {BUILT_IN_TOOL_CATEGORIES.map((category) => (
                <optgroup key={category} label={category}>
                  {BUILT_IN_TOOLS.filter((tool) => tool.category === category).map((tool) => (
                    <option key={tool.key} value={tool.key}>
                      {tool.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {selectedBuiltInTool ? (
            <div className="info-note">
              <p>{selectedBuiltInTool.description}</p>
              {selectedBuiltInTool.prerequisite ? <p>Prerequisite: {selectedBuiltInTool.prerequisite}</p> : null}
            </div>
          ) : null}

          <label>
            Tool Config JSON
            <textarea
              className="code-input"
              value={fieldValueAsString(selectedNode.data.extras?.builtinConfig)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(
                    graph,
                    selectedNode.id,
                    updateToolConfig(selectedNode.data, { builtinConfig: event.target.value }),
                  ),
                )
              }
            />
          </label>

          <label>
            Workflow Executor Function
            <select
              value={selectedBuiltInWorkflowFunctionName}
              onChange={(event) =>
                setGraph(
                  updateNodeData(
                    graph,
                    selectedNode.id,
                    updateToolConfig(selectedNode.data, { builtinWorkflowFunction: event.target.value }),
                  ),
                )
              }
              disabled={isLoadingBuiltInToolFunctions || builtInToolFunctionOptions.length === 0}
            >
              {builtInToolFunctionOptions.length === 0 ? <option value="">No callable functions found</option> : null}
              {builtInToolFunctionOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {isLoadingBuiltInToolFunctions ? (
            <div className="info-note">
              <p>Inspecting built-in tool functions...</p>
            </div>
          ) : null}

          {builtInToolFunctionsError ? (
            <div className="info-note">
              <p>{builtInToolFunctionsError}</p>
            </div>
          ) : null}

          {selectedBuiltInWorkflowFunction ? (
            <div className="info-note">
              <p>
                <strong>Workflow executor</strong>
              </p>
              <p>{selectedBuiltInWorkflowFunction.label}</p>
              {selectedBuiltInWorkflowFunction.description ? <p>{selectedBuiltInWorkflowFunction.description}</p> : null}
              {selectedBuiltInWorkflowFunction.required_params.length ? (
                <p>Required params: {selectedBuiltInWorkflowFunction.required_params.join(", ")}</p>
              ) : (
                <p>No required params.</p>
              )}
              {selectedBuiltInWorkflowFunction.optional_params.length ? (
                <p>Optional params: {selectedBuiltInWorkflowFunction.optional_params.join(", ")}</p>
              ) : null}
              <p>When this Tool is connected to a Workflow Step, the step input is bound to the first unsatisfied function parameter.</p>
            </div>
          ) : null}

          <label>
            Workflow Executor Args JSON
            <textarea
              className="code-input"
              value={fieldValueAsString(selectedNode.data.extras?.builtinWorkflowExecutorArgs)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(
                    graph,
                    selectedNode.id,
                    updateToolConfig(selectedNode.data, { builtinWorkflowExecutorArgs: event.target.value }),
                  ),
                )
              }
              placeholder={`{\n  "max_results": 3\n}`}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            Function Name
            <span className="required-mark">*</span>
            <input
              value={fieldValueAsString(selectedNode.data.extras?.functionName)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(
                    graph,
                    selectedNode.id,
                    updateToolConfig(selectedNode.data, { functionName: event.target.value }),
                  ),
                )
              }
            />
          </label>

          <div className="info-note">
            <p>Function tools use the Agno `@tool` decorator in codegen.</p>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="secondary-button code-button"
              onClick={() => setEditingFunctionNodeId(selectedNode.id)}
            >
              Open Code Editor
            </button>
            <button
              type="button"
              className="secondary-button save-button"
              onClick={saveCurrentFunctionTool}
            >
              Save Tool
            </button>
          </div>
        </>
      )}
    </>
  );
}
