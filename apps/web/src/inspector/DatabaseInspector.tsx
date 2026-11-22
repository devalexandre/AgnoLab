// Property inspector for database nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { DATABASE_LIBRARY_ITEMS, DatabasePresetKey } from "../editorConstants";
import { buildDatabaseExpressionFromExtras, buildSqliteDbFilePath } from "../nodeData";

export interface DatabaseInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function DatabaseInspector({ selectedNode, graph, setGraph }: DatabaseInspectorProps) {
  const currentNode = selectedNode;
  const currentGraph = graph;
  if (!currentGraph) {
    return null;
  }
  const currentPreset = fieldValueAsString(currentNode.data.extras?.dbPreset) as DatabasePresetKey;
  const currentExtras = currentNode.data.extras ?? {};
  const updateDatabaseConfig = (patch: Record<string, unknown>) =>
    setGraph(
      updateNodeData(currentGraph, currentNode.id, {
        extras: {
          ...currentExtras,
          ...patch,
          dbExpression: buildDatabaseExpressionFromExtras(currentPreset, {
            ...currentExtras,
            ...patch,
          }),
        },
      }),
    );

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
        {renderInspectorPropertyLabel("Database Preset", "Defines the database backend type for this node. The backend type is fixed after creation.")}
        <select value={currentPreset} disabled>
          {DATABASE_LIBRARY_ITEMS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small-note">This preset is fixed by the component type. Create a new Database node to switch backends.</p>
      {currentPreset === "sqlite-db" ? (
        <>
          <label>
            {renderInspectorPropertyLabel("Directory Path", "Folder where the SQLite database file will be created or reused.")}
            <input
              value={fieldValueAsString(currentExtras.dbDirectory)}
              onChange={(event) => updateDatabaseConfig({ dbDirectory: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Database Name", "File name used for the SQLite database, without the .db suffix.")}
            <input
              value={fieldValueAsString(currentExtras.dbName)}
              onChange={(event) => updateDatabaseConfig({ dbName: event.target.value })}
            />
          </label>
          <div className="info-note">
            <p>SQLite file</p>
            <p>{buildSqliteDbFilePath(fieldValueAsString(currentExtras.dbDirectory), fieldValueAsString(currentExtras.dbName))}</p>
          </div>
        </>
      ) : (
        <>
          <label>
            {renderInspectorPropertyLabel("Host", "Hostname or IP address of the database server.")}
            <input
              value={fieldValueAsString(currentExtras.dbHost)}
              onChange={(event) => updateDatabaseConfig({ dbHost: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Port", "Port used by the database server.")}
            <input
              value={fieldValueAsString(currentExtras.dbPort)}
              onChange={(event) => updateDatabaseConfig({ dbPort: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Database Name", "Logical database name to connect to on the server.")}
            <input
              value={fieldValueAsString(currentExtras.dbName)}
              onChange={(event) => updateDatabaseConfig({ dbName: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Username", "Database user name used for the connection string.")}
            <input
              value={fieldValueAsString(currentExtras.dbUsername)}
              onChange={(event) => updateDatabaseConfig({ dbUsername: event.target.value })}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Password", "Database password used for the connection string.")}
            <input
              type="password"
              value={fieldValueAsString(currentExtras.dbPassword)}
              onChange={(event) => updateDatabaseConfig({ dbPassword: event.target.value })}
            />
          </label>
        </>
      )}
    </>
  );
}
