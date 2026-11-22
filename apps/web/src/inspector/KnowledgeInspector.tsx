// Property inspector for knowledge nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { KNOWLEDGE_READER_OPTIONS, KnowledgeReaderKey } from "../editorConstants";
import { buildKnowledgeExpressionFromExtras, buildVectorDbExpression, getDefaultKnowledgeExtras } from "../nodeData";

export interface KnowledgeInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  nodeMap: Record<string, GraphNode>;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function KnowledgeInspector({ selectedNode, graph, nodeMap, setGraph }: KnowledgeInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const currentExtras = {
    ...getDefaultKnowledgeExtras("knowledge"),
    ...(currentNode.data.extras ?? {}),
  };
  const connectedVectorDb =
    currentGraph.edges
      .filter((edge) => edge.target === currentNode.id)
      .map((edge) => nodeMap[edge.source])
      .find((node): node is GraphNode => Boolean(node) && node.type === "vector_db") ?? null;
  const connectedDatabase =
    currentGraph.edges
      .filter((edge) => edge.target === currentNode.id)
      .map((edge) => nodeMap[edge.source])
      .find((node): node is GraphNode => Boolean(node) && node.type === "database") ?? null;
  const resolvedVectorExpression = connectedVectorDb
    ? fieldValueAsString(connectedVectorDb.data.extras?.vectorExpression)
    : buildVectorDbExpression("pgvector");
  const generatedExpression = buildKnowledgeExpressionFromExtras(
    currentExtras,
    resolvedVectorExpression,
    currentNode.data.name,
    currentNode.data.description,
  );
  const hasLegacyExpression =
    Boolean(fieldValueAsString(currentNode.data.extras?.knowledgeExpression).trim()) &&
    fieldValueAsString(currentNode.data.extras?.knowledgeExpression).trim() !== generatedExpression &&
    currentNode.data.extras?.knowledgeReader === undefined &&
    currentNode.data.extras?.ingestAttachedFiles === undefined &&
    currentNode.data.extras?.knowledgeMaxResults === undefined;
  const updateKnowledgeConfig = (patch: Record<string, unknown>) => {
    const nextExtras: Record<string, unknown> = {
      ...currentExtras,
      ...patch,
    };
    nextExtras.knowledgeExpression = buildKnowledgeExpressionFromExtras(
      nextExtras,
      resolvedVectorExpression,
      currentNode.data.name,
      currentNode.data.description,
    );
    setGraph(updateNodeData(currentGraph, currentNode.id, { extras: nextExtras }));
  };
  const selectedKnowledgeReader = fieldValueAsString(currentExtras.knowledgeReader || "auto") as KnowledgeReaderKey;

  return (
    <>
      <label>
        {renderInspectorPropertyLabel("Name", "Display name used in the canvas and in connected component selectors.", true)}
        <input
          value={currentNode.data.name}
          onChange={(event) => setGraph(updateNodeData(graph, currentNode.id, { name: event.target.value }))}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Description", "Optional description stored on the generated Knowledge object.")}
        <textarea
          value={fieldValueAsString(currentNode.data.description)}
          onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
        />
      </label>
      {connectedVectorDb ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Connected Vector DB", "Vector DB currently connected to this Knowledge node.")}
            <select value={connectedVectorDb.data.name} disabled>
              <option value={connectedVectorDb.data.name}>{connectedVectorDb.data.name}</option>
            </select>
          </label>
          <p className="muted small-note">Read-only because it is connected from {connectedVectorDb.data.name}.</p>
        </>
      ) : (
        <div className="info-note">
          <p>Connect a Vector DB node to control the knowledge storage visually.</p>
        </div>
      )}
      {hasLegacyExpression ? (
        <div className="info-note">
          <p>Legacy expression detected</p>
          <p>Editing the structured fields below will replace the previous custom Knowledge expression.</p>
        </div>
      ) : null}
      <label>
        {renderInspectorPropertyLabel("Max Results", "Default number of retrieved chunks returned by this Knowledge base.")}
        <input
          type="number"
          min="1"
          value={fieldValueAsString(currentExtras.knowledgeMaxResults)}
          onChange={(event) => updateKnowledgeConfig({ knowledgeMaxResults: event.target.value })}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.knowledgeIsolateVectorSearch)}
          onChange={(event) => updateKnowledgeConfig({ knowledgeIsolateVectorSearch: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Isolate Vector Search", "Adds isolation metadata so this knowledge only searches its own linked content when multiple knowledge bases share the same vector DB.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.includeContentsDb)}
          onChange={(event) => updateKnowledgeConfig({ includeContentsDb: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Enable Contents DB", "Adds a contents database layer to the Knowledge node for tracking, filtering, and deletion workflows.")}
      </label>
      {Boolean(currentExtras.includeContentsDb) ? (
        connectedDatabase ? (
          <>
            <label>
              {renderInspectorPropertyLabel("Connected Contents DB", "Database currently connected as the contents DB for this Knowledge node.")}
              <select value={connectedDatabase.data.name} disabled>
                <option value={connectedDatabase.data.name}>{connectedDatabase.data.name}</option>
              </select>
            </label>
            <p className="muted small-note">Read-only because it is connected from {connectedDatabase.data.name}.</p>
          </>
        ) : (
          <label>
            {renderInspectorPropertyLabel("Contents DB Expression", "Fallback contents DB expression used when there is no Database node connected.")}
            <textarea
              className="code-input"
              value={fieldValueAsString(currentExtras.contentsDbExpression)}
              onChange={(event) => updateKnowledgeConfig({ contentsDbExpression: event.target.value })}
            />
          </label>
        )
      ) : null}
      <label>
        {renderInspectorPropertyLabel("Reader", "Choose how attached knowledge files should be parsed before indexing. Auto Detect follows Agno's default selection by extension and MIME type.")}
        <select
          value={selectedKnowledgeReader}
          onChange={(event) => updateKnowledgeConfig({ knowledgeReader: event.target.value })}
        >
          {KNOWLEDGE_READER_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small-note">
        {KNOWLEDGE_READER_OPTIONS.find((option) => option.key === selectedKnowledgeReader)?.description}
      </p>
      {selectedKnowledgeReader === "pdf" ? (
        <>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={currentExtras.knowledgeSplitOnPages !== false}
              onChange={(event) => updateKnowledgeConfig({ knowledgeSplitOnPages: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Split PDF On Pages", "Keeps page boundaries when the PDF reader builds documents.")}
          </label>
          <label>
            {renderInspectorPropertyLabel("PDF Password", "Optional password for protected PDF files.")}
            <input
              type="password"
              value={fieldValueAsString(currentExtras.knowledgePassword)}
              onChange={(event) => updateKnowledgeConfig({ knowledgePassword: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {selectedKnowledgeReader === "excel" ? (
        <label>
          {renderInspectorPropertyLabel("Excel Sheets", "Optional comma-separated list of sheet names or 1-based indexes to ingest. Leave empty to include all sheets.")}
          <input
            value={fieldValueAsString(currentExtras.knowledgeExcelSheets)}
            onChange={(event) => updateKnowledgeConfig({ knowledgeExcelSheets: event.target.value })}
          />
        </label>
      ) : null}
      {selectedKnowledgeReader === "field_labeled_csv" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("CSV Chunk Title", "Optional heading added before each field-labeled CSV row.")}
            <input
              value={fieldValueAsString(currentExtras.knowledgeCsvChunkTitle)}
              onChange={(event) => updateKnowledgeConfig({ knowledgeCsvChunkTitle: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("CSV Field Names", "Optional comma-separated field names used instead of the CSV headers.")}
            <input
              value={fieldValueAsString(currentExtras.knowledgeCsvFieldNames)}
              onChange={(event) => updateKnowledgeConfig({ knowledgeCsvFieldNames: event.target.value })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={currentExtras.knowledgeCsvFormatHeaders !== false}
              onChange={(event) => updateKnowledgeConfig({ knowledgeCsvFormatHeaders: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Format CSV Headers", "Turns raw CSV headers into friendlier labels when field-labeled CSV mode is used.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={currentExtras.knowledgeCsvSkipEmptyFields !== false}
              onChange={(event) => updateKnowledgeConfig({ knowledgeCsvSkipEmptyFields: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Skip Empty CSV Fields", "Skips blank values when building field-labeled CSV documents.")}
          </label>
        </>
      ) : null}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={currentExtras.ingestAttachedFiles !== false}
          onChange={(event) => updateKnowledgeConfig({ ingestAttachedFiles: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Ingest Attached Files", "Indexes supported attached files from the Input node into this Knowledge base before the Agent or Team runs.")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(currentExtras.ingestInputText)}
          onChange={(event) => updateKnowledgeConfig({ ingestInputText: event.target.checked })}
        />
        {renderInspectorPropertyLabel("Ingest Input Text", "Also indexes the plain text input as knowledge before runtime retrieval.")}
      </label>
      <label>
        {renderInspectorPropertyLabel("Static Text", "Optional static text that should always be inserted into this Knowledge base at runtime.")}
        <textarea
          value={fieldValueAsString(currentExtras.staticText)}
          onChange={(event) => updateKnowledgeConfig({ staticText: event.target.value })}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Static URLs", "Optional URLs, one per line, that should be inserted into this Knowledge base at runtime.")}
        <textarea
          className="code-input"
          value={fieldValueAsString(currentExtras.staticUrls)}
          onChange={(event) => updateKnowledgeConfig({ staticUrls: event.target.value })}
        />
      </label>
      <label>
        {renderInspectorPropertyLabel("Generated Knowledge Expression", "Preview of the Agno Knowledge expression generated from the structured fields above.")}
        <textarea className="code-input" value={generatedExpression} readOnly />
      </label>
    </>
  );
}
