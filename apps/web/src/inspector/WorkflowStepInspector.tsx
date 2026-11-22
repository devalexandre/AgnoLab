// Property inspector for workflow_step nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { NODE_CATALOG } from "../nodeCatalog";
import { CanvasGraph, GraphNode } from "../types";

export interface WorkflowStepInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  nodeMap: Record<string, GraphNode>;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function WorkflowStepInspector({ selectedNode, graph, nodeMap, setGraph }: WorkflowStepInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const connectedExecutors = currentGraph.edges
    .filter((edge) => edge.target === currentNode.id)
    .map((edge) => nodeMap[edge.source])
    .filter((node): node is GraphNode => Boolean(node) && (node.type === "agent" || node.type === "team" || node.type === "tool"));

  const currentExtras = {
    stepOrder: 1,
    maxRetries: 3,
    skipOnFailure: false,
    strictInputValidation: false,
    requiresConfirmation: false,
    confirmationMessage: "",
    onReject: "skip",
    requiresUserInput: false,
    userInputMessage: "",
    userInputSchema: "",
    requiresOutputReview: false,
    outputReviewMessage: "",
    reviewTimeout: "" as number | "",
    onTimeout: "cancel",
    onError: "skip",
    ...(currentNode.data.extras ?? {}),
  };

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Name", "Workflow step name used in the canvas and generated Step object.", true)}
        <input
          value={currentNode.data.name}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional step description passed to Agno.")}
        <textarea
          value={fieldValueAsString(currentNode.data.description)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
        />
      </label>
      {connectedExecutors.length ? (
        <div className="info-note">
          <p>
            <strong>Connected executor{connectedExecutors.length > 1 ? "s" : ""}</strong>
          </p>
          <p>{connectedExecutors.map((executor) => `${NODE_CATALOG[executor.type].label}: ${executor.data.name}`).join(" | ")}</p>
          {connectedExecutors.length > 1 ? <p>Connect exactly one executor per Workflow Step. The compiler uses the first supported connection and warns about the rest.</p> : null}
          <p>Built-in Tool nodes use the workflow executor function configured on the Tool node.</p>
        </div>
      ) : (
        <div className="info-note">
          <p>Connect exactly one Agent, Team, Function Tool, or Built-in Tool node to this Workflow Step.</p>
        </div>
      )}
      <label>
        {renderInspectorPropertyLabel("Step Order", "Controls the sequential order inside the connected Workflow. Lower numbers run first.")}
        <input
          type="number"
          min="1"
          value={fieldValueAsString(currentExtras.stepOrder)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  stepOrder: Number(event.target.value),
                },
              }),
            )
          }
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Max Retries", "How many times Agno should retry the step before considering it failed.")}
        <input
          type="number"
          min="0"
          value={fieldValueAsString(currentExtras.maxRetries)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  maxRetries: Number(event.target.value),
                },
              }),
            )
          }
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.skipOnFailure)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  skipOnFailure: event.target.checked,
                },
              }),
            )
          }
        />
        {renderInspectorPropertyLabel("Skip On Failure", "If enabled, the workflow continues to the next step after this step fails.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.strictInputValidation)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  strictInputValidation: event.target.checked,
                },
              }),
            )
          }
        />
        {renderInspectorPropertyLabel("Strict Input Validation", "Uses Agno strict input validation for this step.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.requiresConfirmation)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  requiresConfirmation: event.target.checked,
                },
              }),
            )
          }
        />
        {renderInspectorPropertyLabel("Requires Confirmation", "Pauses the step and requests human confirmation before execution.")}
      </label>
      {Boolean(currentExtras.requiresConfirmation) ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Confirmation Message", "Message shown when confirmation is required.")}
            <textarea
              value={fieldValueAsString(currentExtras.confirmationMessage)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(currentGraph, currentNode.id, {
                    extras: {
                      ...currentExtras,
                      confirmationMessage: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("On Reject", "Behavior when a human rejects the confirmation request.")}
            <select
              value={fieldValueAsString(currentExtras.onReject || "skip")}
              onChange={(event) =>
                setGraph(
                  updateNodeData(currentGraph, currentNode.id, {
                    extras: {
                      ...currentExtras,
                      onReject: event.target.value,
                    },
                  }),
                )
              }
            >
              <option value="skip">skip</option>
              <option value="cancel">cancel</option>
              <option value="retry">retry</option>
              <option value="else">else</option>
            </select>
          </label>
        </>
      ) : null}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.requiresUserInput)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  requiresUserInput: event.target.checked,
                },
              }),
            )
          }
        />
        {renderInspectorPropertyLabel("Requires User Input", "Requests user input before running this step.")}
      </label>
      {Boolean(currentExtras.requiresUserInput) ? (
        <>
          <label>
            {renderInspectorPropertyLabel("User Input Message", "Prompt shown to collect required user input for this step.")}
            <textarea
              value={fieldValueAsString(currentExtras.userInputMessage)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(currentGraph, currentNode.id, {
                    extras: {
                      ...currentExtras,
                      userInputMessage: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("User Input Schema (JSON)", "JSON list describing required user input fields.")}
            <textarea
              className="code-input"
              placeholder={'[\n  {"name": "approval_note", "type": "string", "required": false}\n]'}
              value={fieldValueAsString(currentExtras.userInputSchema)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(currentGraph, currentNode.id, {
                    extras: {
                      ...currentExtras,
                      userInputSchema: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>
        </>
      ) : null}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.requiresOutputReview)}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: { ...currentExtras, requiresOutputReview: event.target.checked },
              }),
            )
          }
        />
        {renderInspectorPropertyLabel("Requires Output Review", "Pauses after the step runs so a human can approve, reject, or retry its output (Agno 3 HumanReview).")}
      </label>
      {Boolean(currentExtras.requiresOutputReview) ? (
        <label>
          {renderInspectorPropertyLabel("Output Review Message", "Message shown when the step output is sent for review.")}
          <textarea
            value={fieldValueAsString(currentExtras.outputReviewMessage)}
            onChange={(event) =>
              setGraph(
                updateNodeData(currentGraph, currentNode.id, {
                  extras: { ...currentExtras, outputReviewMessage: event.target.value },
                }),
              )
            }
          />
        </label>
      ) : null}
      {Boolean(currentExtras.requiresConfirmation) || Boolean(currentExtras.requiresUserInput) || Boolean(currentExtras.requiresOutputReview) ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Review Timeout (seconds)", "How long a human-review pause waits before the timeout action applies. Empty waits forever.")}
            <input
              type="number"
              min={1}
              value={fieldValueAsString(currentExtras.reviewTimeout)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(currentGraph, currentNode.id, {
                    extras: {
                      ...currentExtras,
                      reviewTimeout: event.target.value === "" ? "" : Number(event.target.value),
                    },
                  }),
                )
              }
            />
          </label>
          {fieldValueAsString(currentExtras.reviewTimeout) ? (
            <label>
              {renderInspectorPropertyLabel("On Timeout", "What happens when the review pause times out.")}
              <select
                value={fieldValueAsString(currentExtras.onTimeout || "cancel")}
                onChange={(event) =>
                  setGraph(
                    updateNodeData(currentGraph, currentNode.id, {
                      extras: { ...currentExtras, onTimeout: event.target.value },
                    }),
                  )
                }
              >
                <option value="cancel">cancel</option>
                <option value="skip">skip</option>
                <option value="approve">approve</option>
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      <label>
        {renderInspectorPropertyLabel("On Error", "Behavior when this step raises an error.")}
        <select
          value={fieldValueAsString(currentExtras.onError || "skip")}
          onChange={(event) =>
            setGraph(
              updateNodeData(currentGraph, currentNode.id, {
                extras: {
                  ...currentExtras,
                  onError: event.target.value,
                },
              }),
            )
          }
        >
          <option value="fail">fail</option>
          <option value="skip">skip</option>
          <option value="pause">pause</option>
        </select>
      </label>
    </>
  );
}
