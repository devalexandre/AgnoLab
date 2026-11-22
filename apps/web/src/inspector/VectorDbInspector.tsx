// Property inspector for vector_db nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { VECTOR_DB_LIBRARY_ITEMS, VectorDbPresetKey } from "../editorConstants";
import { buildVectorDbExpressionFromExtras, hasStructuredVectorDbConfig, resolveVectorDbConfig } from "../nodeData";

export interface VectorDbInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function VectorDbInspector({ selectedNode, graph, setGraph }: VectorDbInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const currentPreset = fieldValueAsString(currentNode.data.extras?.vectorPreset) as VectorDbPresetKey;
  const currentExtras = currentNode.data.extras ?? {};
  const resolvedVectorConfig = resolveVectorDbConfig(currentPreset, currentExtras);
  const generatedExpression = buildVectorDbExpressionFromExtras(currentPreset, resolvedVectorConfig);
  const hasLegacyExpression =
    !hasStructuredVectorDbConfig(currentPreset, currentExtras) &&
    Boolean(fieldValueAsString(currentExtras.vectorExpression).trim()) &&
    fieldValueAsString(currentExtras.vectorExpression).trim() !== generatedExpression;
  const updateVectorDbConfig = (patch: Record<string, unknown>) => {
    const nextExtras = {
      ...currentExtras,
      ...resolvedVectorConfig,
      ...patch,
    };
    nextExtras.vectorExpression = buildVectorDbExpressionFromExtras(currentPreset, nextExtras);
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
        {renderInspectorPropertyLabel("Vector DB Preset", "Defines the vector store type for this node. The store type is fixed after creation.")}
        <select value={currentPreset} disabled>
          {VECTOR_DB_LIBRARY_ITEMS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small-note">This preset is fixed by the component type. Create a new Vector DB node to switch stores.</p>
      {hasLegacyExpression ? (
        <div className="info-note">
          <p>Legacy expression detected</p>
          <p>Editing the fields below will replace the previous custom expression with the generated configuration.</p>
        </div>
      ) : null}
      {currentPreset === "pgvector" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Table Name", "Table used to store the document embeddings in PostgreSQL.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorTableName)}
              onChange={(event) => updateVectorDbConfig({ vectorTableName: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Database URL", "Full PostgreSQL connection URL used by PgVector.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorDbUrl)}
              onChange={(event) => updateVectorDbConfig({ vectorDbUrl: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {currentPreset === "qdrant" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Collection", "Qdrant collection name used to store the vectors.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorCollection)}
              onChange={(event) => updateVectorDbConfig({ vectorCollection: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("URL", "Base URL of the Qdrant instance.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorUrl)}
              onChange={(event) => updateVectorDbConfig({ vectorUrl: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {currentPreset === "chroma" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Collection", "Chroma collection name used to group the vectors.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorCollection)}
              onChange={(event) => updateVectorDbConfig({ vectorCollection: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Path", "Local path where Chroma persists its data.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorPath)}
              onChange={(event) => updateVectorDbConfig({ vectorPath: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {currentPreset === "pinecone" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Index Name", "Pinecone index name used for vector storage.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorName)}
              onChange={(event) => updateVectorDbConfig({ vectorName: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Dimension", "Embedding dimension expected by the Pinecone index.")}
            <input
              type="number"
              value={fieldValueAsString(resolvedVectorConfig.vectorDimension)}
              onChange={(event) => updateVectorDbConfig({ vectorDimension: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Metric", "Distance metric used by the Pinecone index.")}
            <select
              value={fieldValueAsString(resolvedVectorConfig.vectorMetric)}
              onChange={(event) => updateVectorDbConfig({ vectorMetric: event.target.value })}
            >
              <option value="cosine">cosine</option>
              <option value="dotproduct">dotproduct</option>
              <option value="euclidean">euclidean</option>
            </select>
          </label>
        </>
      ) : null}
      {currentPreset === "lancedb" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("URI", "Filesystem path or URI used by LanceDB.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorUri)}
              onChange={(event) => updateVectorDbConfig({ vectorUri: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Table Name", "Table used by LanceDB to store vectors.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorTableName)}
              onChange={(event) => updateVectorDbConfig({ vectorTableName: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {currentPreset === "weaviate" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Collection", "Weaviate collection name used to store the vectors.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorCollection)}
              onChange={(event) => updateVectorDbConfig({ vectorCollection: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("URL", "Base URL of the Weaviate instance.")}
            <input
              value={fieldValueAsString(resolvedVectorConfig.vectorUrl)}
              onChange={(event) => updateVectorDbConfig({ vectorUrl: event.target.value })}
            />
          </label>
        </>
      ) : null}
      <label>
        {renderInspectorPropertyLabel("Generated Vector DB Expression", "Preview of the Agno expression generated from the fields above.")}
        <textarea className="code-input" value={generatedExpression} readOnly />
      </label>
    </>
  );
}
