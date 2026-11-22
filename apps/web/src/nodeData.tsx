// Node data helpers: config getters/updaters, Python expression builders, node factories and canvas labels.
// Moved out of App.tsx; App.tsx keeps the editor component itself.

import { type AgentFieldDefinition } from "./agentConfig";
import { createClientSecret } from "./flowNormalize";
import { fieldValueAsString } from "./utils";
import { NODE_CATALOG, WORKFLOW_CONTROL_TYPES } from "./nodeCatalog";
import { buildProviderConfig, getProviderDefinition } from "./providerCatalog";
import { getBuiltInTool, type BuiltInToolDefinition } from "./toolCatalog";
import { ToolIcon, toolIconColor } from "./toolIcons";
import { CanvasGraph, NodeData, SavedUserTool, StarterToolTemplate } from "./types";
import { ChatDraft, DATABASE_LIBRARY_ITEMS, DatabasePresetKey, INTERFACE_LIBRARY_ITEMS, InterfacePresetKey, VECTOR_DB_LIBRARY_ITEMS, VectorDbPresetKey } from "./editorConstants";
import { NodeIcon } from "./NodeIcon";

export function getAgentConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.agentConfig as Record<string, unknown> | undefined) ?? {};
}

export function updateAgentConfig(data: NodeData, key: string, value: unknown): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      agentConfig: {
        ...getAgentConfig(data),
        [key]: value,
      },
    },
  };
}

export function getTeamConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.teamConfig as Record<string, unknown> | undefined) ?? {};
}

export function updateTeamConfig(data: NodeData, key: string, value: unknown): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      teamConfig: {
        ...getTeamConfig(data),
        [key]: value,
      },
    },
  };
}

export function getWorkflowConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.workflowConfig as Record<string, unknown> | undefined) ?? {};
}

export function updateWorkflowConfig(data: NodeData, key: string, value: unknown): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      workflowConfig: {
        ...getWorkflowConfig(data),
        [key]: value,
      },
    },
  };
}

export function getProviderConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.providerConfig as Record<string, unknown> | undefined) ?? {};
}

export function updateProviderConfig(data: NodeData, key: string, value: unknown): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      providerConfig: {
        ...getProviderConfig(data),
        [key]: value,
      },
    },
  };
}

export function applyProviderPreset(data: NodeData, providerPresetId: string): NodeData {
  const normalizedPreset = providerPresetId.trim().toLowerCase();
  if (!normalizedPreset) {
    return updateProviderConfig(data, "provider_profile", "");
  }

  const providerDefinition = getProviderDefinition(normalizedPreset);
  if (!providerDefinition) {
    return updateProviderConfig(data, "provider_profile", normalizedPreset);
  }

  const nextProviderConfig = {
    ...buildProviderConfig(providerDefinition.id),
    ...getProviderConfig(data),
    provider_profile: providerDefinition.id,
    provider_api_key_env: providerDefinition.key,
    provider_api_key: "",
    provider_base_url_env: providerDefinition.baseUrlEnv ?? "",
    provider_base_url: providerDefinition.url,
    provider_execution_timeout_seconds: providerDefinition.supportsLocalModels ? "120" : "",
  };

  return {
    ...data,
    provider: providerDefinition.id,
    model: providerDefinition.model,
    extras: {
      ...(data.extras ?? {}),
      providerConfig: nextProviderConfig,
    },
  };
}

export function updateToolConfig(data: NodeData, patch: Record<string, unknown>): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      ...patch,
    },
  };
}

export function createBuiltInToolData(tool: BuiltInToolDefinition, index: number): NodeData {
  return {
    name: tool.label,
    description: tool.description,
    extras: {
      toolMode: "builtin",
      builtinToolKey: tool.key,
      builtinImportPath: tool.importPath,
      builtinClassName: tool.className,
      builtinConfig: tool.configTemplate ?? "",
      builtinWorkflowFunction: "",
      builtinWorkflowExecutorArgs: "",
      functionName: `tool_${index}`,
      functionCode: `def tool_${index}(value: str) -> str:\n    return value\n`,
    },
  };
}

export function createSavedToolNodeData(tool: SavedUserTool): NodeData {
  return {
    name: tool.name,
    description: tool.description,
    extras: {
      toolMode: "function",
      functionName: tool.functionName,
      functionCode: tool.functionCode,
    },
  };
}

export function createStarterToolNodeData(tool: StarterToolTemplate): NodeData {
  return {
    name: tool.name,
    description: tool.description,
    extras: {
      toolMode: "function",
      functionName: tool.functionName,
      functionCode: tool.functionCode,
    },
  };
}

export function toPythonString(value: string): string {
  return JSON.stringify(value);
}

export function buildSqliteDbFilePath(directory: string, dbName: string): string {
  const normalizedDirectory = fieldValueAsString(directory).trim().replace(/[\\/]+$/, "");
  const normalizedName = fieldValueAsString(dbName).trim() || "agno";
  return normalizedDirectory ? `${normalizedDirectory}/${normalizedName}.db` : `${normalizedName}.db`;
}

export function getDefaultVectorDbExtras(vectorPreset: VectorDbPresetKey): Record<string, unknown> {
  switch (vectorPreset) {
    case "pgvector":
      return {
        vectorTableName: "documents",
        vectorDbUrl: "postgresql+psycopg://ai:ai@localhost:5532/ai",
      };
    case "qdrant":
      return {
        vectorCollection: "documents",
        vectorUrl: "http://localhost:6333",
      };
    case "chroma":
      return {
        vectorCollection: "documents",
        vectorPath: "tmp/chroma",
      };
    case "pinecone":
      return {
        vectorName: "documents",
        vectorDimension: "1536",
        vectorMetric: "cosine",
      };
    case "lancedb":
      return {
        vectorUri: "tmp/lancedb",
        vectorTableName: "documents",
      };
    case "weaviate":
      return {
        vectorCollection: "documents",
        vectorUrl: "http://localhost:8080",
      };
    default:
      return {
        vectorTableName: "documents",
        vectorDbUrl: "postgresql+psycopg://ai:ai@localhost:5532/ai",
      };
  }
}

export function buildVectorDbExpressionFromExtras(vectorPreset: VectorDbPresetKey, extras: Record<string, unknown> | undefined): string {
  const safeExtras = {
    ...getDefaultVectorDbExtras(vectorPreset),
    ...(extras ?? {}),
  };

  switch (vectorPreset) {
    case "pgvector": {
      const tableName = fieldValueAsString(safeExtras.vectorTableName) || "documents";
      const dbUrl = fieldValueAsString(safeExtras.vectorDbUrl) || "postgresql+psycopg://ai:ai@localhost:5532/ai";
      return `PgVector(table_name=${toPythonString(tableName)}, db_url=${toPythonString(dbUrl)})`;
    }
    case "qdrant": {
      const collection = fieldValueAsString(safeExtras.vectorCollection) || "documents";
      const url = fieldValueAsString(safeExtras.vectorUrl) || "http://localhost:6333";
      return `Qdrant(collection=${toPythonString(collection)}, url=${toPythonString(url)})`;
    }
    case "chroma": {
      const collection = fieldValueAsString(safeExtras.vectorCollection) || "documents";
      const path = fieldValueAsString(safeExtras.vectorPath) || "tmp/chroma";
      return `ChromaDb(collection=${toPythonString(collection)}, path=${toPythonString(path)})`;
    }
    case "pinecone": {
      const name = fieldValueAsString(safeExtras.vectorName) || "documents";
      const dimension = Number(fieldValueAsString(safeExtras.vectorDimension) || "1536");
      const metric = fieldValueAsString(safeExtras.vectorMetric) || "cosine";
      return `PineconeDb(name=${toPythonString(name)}, dimension=${Number.isFinite(dimension) ? dimension : 1536}, metric=${toPythonString(metric)})`;
    }
    case "lancedb": {
      const uri = fieldValueAsString(safeExtras.vectorUri) || "tmp/lancedb";
      const tableName = fieldValueAsString(safeExtras.vectorTableName) || "documents";
      return `LanceDb(uri=${toPythonString(uri)}, table_name=${toPythonString(tableName)})`;
    }
    case "weaviate": {
      const collection = fieldValueAsString(safeExtras.vectorCollection) || "documents";
      const url = fieldValueAsString(safeExtras.vectorUrl) || "http://localhost:8080";
      return `Weaviate(collection=${toPythonString(collection)}, url=${toPythonString(url)})`;
    }
    default:
      return 'PgVector(table_name="documents", db_url="postgresql+psycopg://ai:ai@localhost:5532/ai")';
  }
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePythonStringKwarg(expression: string, key: string): string | null {
  const match = expression.match(new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')`));
  if (!match) {
    return null;
  }
  const raw = match[1];
  return raw.slice(1, -1).replace(/\\\\/g, "\\").replace(/\\"/g, "\"").replace(/\\'/g, "'");
}

export function parsePythonNumberKwarg(expression: string, key: string): string | null {
  const match = expression.match(new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match?.[1] ?? null;
}

export function resolveVectorDbConfig(vectorPreset: VectorDbPresetKey, extras: Record<string, unknown> | undefined): Record<string, unknown> {
  const safeExtras = extras ?? {};
  const defaults = getDefaultVectorDbExtras(vectorPreset);
  const currentExpression = fieldValueAsString(safeExtras.vectorExpression);
  const resolveString = (fieldKey: string, kwargKey: string) =>
    fieldValueAsString(safeExtras[fieldKey]) || parsePythonStringKwarg(currentExpression, kwargKey) || fieldValueAsString(defaults[fieldKey]);
  const resolveNumber = (fieldKey: string, kwargKey: string) =>
    fieldValueAsString(safeExtras[fieldKey]) || parsePythonNumberKwarg(currentExpression, kwargKey) || fieldValueAsString(defaults[fieldKey]);

  switch (vectorPreset) {
    case "pgvector":
      return {
        vectorTableName: resolveString("vectorTableName", "table_name"),
        vectorDbUrl: resolveString("vectorDbUrl", "db_url"),
      };
    case "qdrant":
      return {
        vectorCollection: resolveString("vectorCollection", "collection"),
        vectorUrl: resolveString("vectorUrl", "url"),
      };
    case "chroma":
      return {
        vectorCollection: resolveString("vectorCollection", "collection"),
        vectorPath: resolveString("vectorPath", "path"),
      };
    case "pinecone":
      return {
        vectorName: resolveString("vectorName", "name"),
        vectorDimension: resolveNumber("vectorDimension", "dimension"),
        vectorMetric: resolveString("vectorMetric", "metric"),
      };
    case "lancedb":
      return {
        vectorUri: resolveString("vectorUri", "uri"),
        vectorTableName: resolveString("vectorTableName", "table_name"),
      };
    case "weaviate":
      return {
        vectorCollection: resolveString("vectorCollection", "collection"),
        vectorUrl: resolveString("vectorUrl", "url"),
      };
    default:
      return getDefaultVectorDbExtras("pgvector");
  }
}

export function hasStructuredVectorDbConfig(vectorPreset: VectorDbPresetKey, extras: Record<string, unknown> | undefined): boolean {
  const safeExtras = extras ?? {};
  switch (vectorPreset) {
    case "pgvector":
      return safeExtras.vectorTableName !== undefined || safeExtras.vectorDbUrl !== undefined;
    case "qdrant":
    case "weaviate":
      return safeExtras.vectorCollection !== undefined || safeExtras.vectorUrl !== undefined;
    case "chroma":
      return safeExtras.vectorCollection !== undefined || safeExtras.vectorPath !== undefined;
    case "pinecone":
      return safeExtras.vectorName !== undefined || safeExtras.vectorDimension !== undefined || safeExtras.vectorMetric !== undefined;
    case "lancedb":
      return safeExtras.vectorUri !== undefined || safeExtras.vectorTableName !== undefined;
    default:
      return false;
  }
}

export function getDefaultKnowledgeExtras(variant: "knowledge" | "knowledge_contents"): Record<string, unknown> {
  return {
    knowledgeName: "",
    knowledgeDescription: "",
    knowledgeMaxResults: "10",
    knowledgeIsolateVectorSearch: false,
    knowledgeReader: "auto",
    knowledgeSplitOnPages: true,
    knowledgePassword: "",
    knowledgeExcelSheets: "",
    knowledgeCsvChunkTitle: "",
    knowledgeCsvFieldNames: "",
    knowledgeCsvFormatHeaders: true,
    knowledgeCsvSkipEmptyFields: true,
    ingestAttachedFiles: true,
    ingestInputText: false,
    staticText: "",
    staticUrls: "",
    includeContentsDb: variant === "knowledge_contents",
    contentsDbExpression: 'PostgresDb(db_url="postgresql://ai:ai@localhost:5532/ai")',
  };
}

export function getDefaultSkillsExtras(): Record<string, unknown> {
  return {
    skillsPath: "examples/skills/support-response-style",
    skillsValidate: true,
  };
}

export function buildSkillsExpressionFromExtras(extras: Record<string, unknown> | undefined): string {
  const safeExtras = {
    ...getDefaultSkillsExtras(),
    ...(extras ?? {}),
  };
  const path = fieldValueAsString(safeExtras.skillsPath).trim();
  const validate = safeExtras.skillsValidate !== false;
  return `Skills(loaders=[LocalSkills(path=${toPythonString(path)}, validate=${validate ? "True" : "False"})])`;
}

export function buildKnowledgeExpressionFromExtras(
  extras: Record<string, unknown> | undefined,
  vectorExpression?: string,
  nodeName?: string,
  nodeDescription?: string | null,
): string {
  const safeExtras = {
    ...getDefaultKnowledgeExtras("knowledge"),
    ...(extras ?? {}),
  };
  const args: string[] = [];
  const knowledgeName = (nodeName || fieldValueAsString(safeExtras.knowledgeName)).trim();
  const knowledgeDescription = (nodeDescription || fieldValueAsString(safeExtras.knowledgeDescription)).trim();
  const maxResults = Number(fieldValueAsString(safeExtras.knowledgeMaxResults) || "10");
  const isolateVectorSearch = Boolean(safeExtras.knowledgeIsolateVectorSearch);
  const resolvedVectorExpression = vectorExpression || fieldValueAsString(safeExtras.vectorExpression) || buildVectorDbExpression("pgvector");

  if (knowledgeName) {
    args.push(`name=${toPythonString(knowledgeName)}`);
  }
  if (knowledgeDescription) {
    args.push(`description=${toPythonString(knowledgeDescription)}`);
  }
  args.push(`vector_db=${resolvedVectorExpression}`);
  if (Boolean(safeExtras.includeContentsDb)) {
    const contentsExpression =
      fieldValueAsString(safeExtras.contentsDbExpression).trim() || 'PostgresDb(db_url="postgresql://ai:ai@localhost:5532/ai")';
    args.push(`contents_db=${contentsExpression}`);
  }
  args.push(`max_results=${Number.isFinite(maxResults) && maxResults > 0 ? Math.round(maxResults) : 10}`);
  if (isolateVectorSearch) {
    args.push("isolate_vector_search=True");
  }

  return `Knowledge(${args.join(", ")})`;
}

export function buildKnowledgeExpression(vectorPreset: VectorDbPresetKey): string {
  return buildKnowledgeExpressionFromExtras(
    {
      ...getDefaultKnowledgeExtras("knowledge"),
      vectorExpression: buildVectorDbExpression(vectorPreset),
    },
    buildVectorDbExpression(vectorPreset),
  );
}

export function buildVectorDbExpression(vectorPreset: VectorDbPresetKey): string {
  return buildVectorDbExpressionFromExtras(vectorPreset, getDefaultVectorDbExtras(vectorPreset));
}

export function buildDatabaseExpression(preset: DatabasePresetKey): string {
  switch (preset) {
    case "sqlite-db":
      return 'SqliteDb(db_file="tmp/agno.db")';
    case "postgres-db":
      return 'PostgresDb(db_url="postgresql://ai:ai@localhost:5532/ai")';
    case "mongo-db":
      return 'MongoDb(db_url="mongodb://localhost:27017/agno")';
    case "async-postgres-db":
      return 'AsyncPostgresDb(db_url="postgresql+psycopg_async://ai:ai@localhost:5532/ai")';
    default:
      return 'SqliteDb(db_file="tmp/agno.db")';
  }
}

export function buildDatabaseExpressionFromExtras(preset: DatabasePresetKey, extras: Record<string, unknown> | undefined): string {
  const safeExtras = extras ?? {};

  if (preset === "sqlite-db") {
    const directory = fieldValueAsString(safeExtras.dbDirectory) || "tmp";
    const dbName = fieldValueAsString(safeExtras.dbName) || "agno";
    return `SqliteDb(db_file=${toPythonString(buildSqliteDbFilePath(directory, dbName))})`;
  }

  if (preset === "postgres-db" || preset === "async-postgres-db") {
    const username = fieldValueAsString(safeExtras.dbUsername) || "ai";
    const password = fieldValueAsString(safeExtras.dbPassword) || "ai";
    const host = fieldValueAsString(safeExtras.dbHost) || "localhost";
    const port = fieldValueAsString(safeExtras.dbPort) || "5532";
    const dbName = fieldValueAsString(safeExtras.dbName) || "ai";
    const scheme = preset === "async-postgres-db" ? "postgresql+psycopg_async" : "postgresql";
    return `${preset === "async-postgres-db" ? "AsyncPostgresDb" : "PostgresDb"}(db_url=${toPythonString(`${scheme}://${username}:${password}@${host}:${port}/${dbName}`)})`;
  }

  if (preset === "mongo-db") {
    const username = fieldValueAsString(safeExtras.dbUsername);
    const password = fieldValueAsString(safeExtras.dbPassword);
    const host = fieldValueAsString(safeExtras.dbHost) || "localhost";
    const port = fieldValueAsString(safeExtras.dbPort) || "27017";
    const dbName = fieldValueAsString(safeExtras.dbName) || "agno";
    const auth = username ? `${username}${password ? `:${password}` : ""}@` : "";
    return `MongoDb(db_url=${toPythonString(`mongodb://${auth}${host}:${port}/${dbName}`)})`;
  }

  return buildDatabaseExpression(preset);
}

export function buildManagerExpressionFromExtras(
  type: "memory_manager" | "session_summary_manager" | "compression_manager",
  extras: Record<string, unknown> | undefined,
): string {
  const safeExtras = extras ?? {};

  if (type === "memory_manager") {
    const args: string[] = [];
    const systemMessage = fieldValueAsString(safeExtras.systemMessage);
    const memoryCaptureInstructions = fieldValueAsString(safeExtras.memoryCaptureInstructions);
    const additionalInstructions = fieldValueAsString(safeExtras.additionalInstructions);
    const debugMode = Boolean(safeExtras.debugMode);

    if (systemMessage) {
      args.push(`system_message=${toPythonString(systemMessage)}`);
    }
    if (memoryCaptureInstructions) {
      args.push(`memory_capture_instructions=${toPythonString(memoryCaptureInstructions)}`);
    }
    if (additionalInstructions) {
      args.push(`additional_instructions=${toPythonString(additionalInstructions)}`);
    }
    if (debugMode) {
      args.push("debug_mode=True");
    }

    return `MemoryManager(${args.join(", ")})`;
  }

  if (type === "session_summary_manager") {
    const args: string[] = [];
    const sessionSummaryPrompt = fieldValueAsString(safeExtras.sessionSummaryPrompt);
    const summaryRequestMessage = fieldValueAsString(safeExtras.summaryRequestMessage);

    if (sessionSummaryPrompt) {
      args.push(`session_summary_prompt=${toPythonString(sessionSummaryPrompt)}`);
    }
    if (summaryRequestMessage) {
      args.push(`summary_request_message=${toPythonString(summaryRequestMessage)}`);
    }

    return `SessionSummaryManager(${args.join(", ")})`;
  }

  const args: string[] = [];
  const compressToolResults = safeExtras.compressToolResults;
  const compressToolResultsLimit = fieldValueAsString(safeExtras.compressToolResultsLimit);
  const compressTokenLimit = fieldValueAsString(safeExtras.compressTokenLimit);
  const compressToolCallInstructions = fieldValueAsString(safeExtras.compressToolCallInstructions);

  if (compressToolResults === false) {
    args.push("compress_tool_results=False");
  }
  if (compressToolResultsLimit) {
    args.push(`compress_tool_results_limit=${Number(compressToolResultsLimit)}`);
  }
  if (compressTokenLimit) {
    args.push(`compress_token_limit=${Number(compressTokenLimit)}`);
  }
  if (compressToolCallInstructions) {
    args.push(`compress_tool_call_instructions=${toPythonString(compressToolCallInstructions)}`);
  }

  return `CompressionManager(${args.join(", ")})`;
}

export function getDefaultLearningMachineExtras(): Record<string, unknown> {
  return {
    useLearningModel: false,
    learningNamespace: "global",
    learningDebugMode: false,
    learningUserProfile: true,
    learningUserMemory: true,
    learningSessionContext: true,
    learningEntityMemory: false,
    learningLearnedKnowledge: true,
    learningDecisionLog: true,
  };
}

export function buildLearningMachineExpressionFromExtras(
  extras: Record<string, unknown> | undefined,
  connectedDbExpression?: string,
  connectedKnowledgeExpression?: string,
  learningModelPreview?: string,
): string {
  const safeExtras = {
    ...getDefaultLearningMachineExtras(),
    ...(extras ?? {}),
  };
  const args: string[] = [];

  if (connectedDbExpression) {
    args.push(`db=${connectedDbExpression}`);
  }
  if (connectedKnowledgeExpression) {
    args.push(`knowledge=${connectedKnowledgeExpression}`);
  }
  if (learningModelPreview) {
    args.push(`model=${learningModelPreview}`);
  }

  const namespace = fieldValueAsString(safeExtras.learningNamespace).trim() || "global";
  args.push(`namespace=${toPythonString(namespace)}`);

  if (Boolean(safeExtras.learningUserProfile)) {
    args.push("user_profile=True");
  }
  if (Boolean(safeExtras.learningUserMemory)) {
    args.push("user_memory=True");
  }
  if (Boolean(safeExtras.learningSessionContext)) {
    args.push("session_context=True");
  }
  if (Boolean(safeExtras.learningEntityMemory)) {
    args.push("entity_memory=True");
  }
  if (Boolean(safeExtras.learningLearnedKnowledge)) {
    args.push("learned_knowledge=True");
  }
  if (Boolean(safeExtras.learningDecisionLog)) {
    args.push("decision_log=True");
  }
  if (Boolean(safeExtras.learningDebugMode)) {
    args.push("debug_mode=True");
  }

  return `LearningMachine(${args.join(", ")})`;
}

export function listSupportedTimeZones(): string[] {
  const intlWithSupportedValues = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };

  if (typeof intlWithSupportedValues.supportedValuesOf === "function") {
    return intlWithSupportedValues.supportedValuesOf("timeZone");
  }

  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Dubai",
    "Australia/Sydney",
  ];
}

export function getDefaultInterfaceExtras(): Record<string, unknown> {
  return {
    interfacePreset: "whatsapp",
    interfaceTargetType: "agent",
    whatsappPhoneNumberIdEnv: "WHATSAPP_PHONE_NUMBER_ID",
    whatsappAccessTokenEnv: "WHATSAPP_ACCESS_TOKEN",
    whatsappVerifyTokenEnv: "WHATSAPP_VERIFY_TOKEN",
    telegramTokenEnv: "TELEGRAM_BOT_TOKEN",
    slackTokenEnv: "SLACK_BOT_TOKEN",
    slackSigningSecretEnv: "SLACK_SIGNING_SECRET",
  };
}

export function resolveInterfaceEnvName(rawValue: unknown, fallback: string): string {
  const candidate = fieldValueAsString(rawValue).trim();
  return candidate || fallback;
}

export function buildInterfaceExpression(
  preset: InterfacePresetKey,
  targetType: "agent" | "team" = "agent",
  extras?: Record<string, unknown>,
): string {
  const targetRef = `<${targetType}>`;
  const collectionTargetRef = targetType === "team" ? `[<team>]` : `[<agent>]`;
  const safeExtras = extras ?? {};
  const whatsappPhoneNumberIdEnv = resolveInterfaceEnvName(safeExtras.whatsappPhoneNumberIdEnv, "WHATSAPP_PHONE_NUMBER_ID");
  const whatsappAccessTokenEnv = resolveInterfaceEnvName(safeExtras.whatsappAccessTokenEnv, "WHATSAPP_ACCESS_TOKEN");
  const whatsappVerifyTokenEnv = resolveInterfaceEnvName(safeExtras.whatsappVerifyTokenEnv, "WHATSAPP_VERIFY_TOKEN");
  const telegramTokenEnv = resolveInterfaceEnvName(safeExtras.telegramTokenEnv, "TELEGRAM_BOT_TOKEN");
  const slackTokenEnv = resolveInterfaceEnvName(safeExtras.slackTokenEnv, "SLACK_BOT_TOKEN");
  const slackSigningSecretEnv = resolveInterfaceEnvName(safeExtras.slackSigningSecretEnv, "SLACK_SIGNING_SECRET");

  if (preset === "whatsapp") {
    return `Whatsapp(${targetType}=${targetRef}, phone_number_id=os.getenv(${toPythonString(whatsappPhoneNumberIdEnv)}), access_token=os.getenv(${toPythonString(whatsappAccessTokenEnv)}), verify_token=os.getenv(${toPythonString(whatsappVerifyTokenEnv)}))`;
  }

  if (preset === "telegram") {
    return `Telegram(${targetType}=${targetRef}, token=os.getenv(${toPythonString(telegramTokenEnv)}))`;
  }

  if (preset === "slack") {
    return `Slack(${targetType}=${targetRef}, token=os.getenv(${toPythonString(slackTokenEnv)}), signing_secret=os.getenv(${toPythonString(slackSigningSecretEnv)}))`;
  }

  if (preset === "a2a") {
    return `A2A(${targetType === "team" ? "teams" : "agents"}=${collectionTargetRef})`;
  }

  if (preset === "ag_ui") {
    return `AGUI(${targetType}=${targetRef})`;
  }

  return [
    `Whatsapp(${targetType}=${targetRef}, phone_number_id=os.getenv(${toPythonString(whatsappPhoneNumberIdEnv)}), access_token=os.getenv(${toPythonString(whatsappAccessTokenEnv)}), verify_token=os.getenv(${toPythonString(whatsappVerifyTokenEnv)}))`,
    `Telegram(${targetType}=${targetRef}, token=os.getenv(${toPythonString(telegramTokenEnv)}))`,
    `Slack(${targetType}=${targetRef}, token=os.getenv(${toPythonString(slackTokenEnv)}), signing_secret=os.getenv(${toPythonString(slackSigningSecretEnv)}))`,
    `A2A(${targetType === "team" ? "teams" : "agents"}=${collectionTargetRef})`,
    `AGUI(${targetType}=${targetRef})`,
  ].join("\n");
}

export function createInterfaceNodeData(preset: InterfacePresetKey): NodeData {
  const item = INTERFACE_LIBRARY_ITEMS.find((candidate) => candidate.key === preset);
  const name = item?.label ?? "Interface";
  const description = item?.description ?? "AgentOS interface node.";
  const targetType: "agent" | "team" = "agent";

  const extras: Record<string, unknown> = {
    ...getDefaultInterfaceExtras(),
    interfacePreset: preset,
    interfaceTargetType: targetType,
  };
  extras.interfaceExpression = buildInterfaceExpression(preset, targetType, extras);

  return {
    name,
    description,
    extras,
  };
}

export function createDatabaseNodeData(preset: DatabasePresetKey): NodeData {
  const label = DATABASE_LIBRARY_ITEMS.find((item) => item.key === preset)?.label ?? "Database";
  const extras: Record<string, unknown> = {
    dbPreset: preset,
  };

  if (preset === "sqlite-db") {
    extras.dbDirectory = "tmp";
    extras.dbName = "agno";
  } else if (preset === "mongo-db") {
    extras.dbHost = "localhost";
    extras.dbPort = "27017";
    extras.dbName = "agno";
    extras.dbUsername = "";
    extras.dbPassword = "";
  } else {
    extras.dbHost = "localhost";
    extras.dbPort = "5532";
    extras.dbName = "ai";
    extras.dbUsername = "ai";
    extras.dbPassword = "ai";
  }

  extras.dbExpression = buildDatabaseExpressionFromExtras(preset, extras);

  return {
    name: label,
    description: "Agent storage backend.",
    extras,
  };
}

export function createVectorDbNodeData(preset: VectorDbPresetKey): NodeData {
  const label = VECTOR_DB_LIBRARY_ITEMS.find((item) => item.key === preset)?.label ?? "Vector DB";
  const extras: Record<string, unknown> = {
    vectorPreset: preset,
    ...getDefaultVectorDbExtras(preset),
  };
  extras.vectorExpression = buildVectorDbExpressionFromExtras(preset, extras);
  return {
    name: label,
    description: "Vector store backend.",
    extras,
  };
}

export function createKnowledgeNodeData(variant: "knowledge" | "knowledge_contents"): NodeData {
  const extras: Record<string, unknown> = {
    ...getDefaultKnowledgeExtras(variant),
  };
  extras.knowledgeExpression = buildKnowledgeExpressionFromExtras(
    extras,
    buildVectorDbExpression("pgvector"),
    variant === "knowledge" ? "Knowledge" : "Knowledge + Contents DB",
    "Knowledge resource for Agentic RAG.",
  );
  return {
    name: variant === "knowledge" ? "Knowledge" : "Knowledge + Contents DB",
    description: "Knowledge resource for Agentic RAG.",
    extras,
  };
}

export function createSkillsNodeData(): NodeData {
  const extras: Record<string, unknown> = {
    ...getDefaultSkillsExtras(),
  };
  extras.skillsExpression = buildSkillsExpressionFromExtras(extras);
  return {
    name: "Skills",
    description: "Local Agno skill pack for connected agents.",
    extras,
  };
}

export function createLearningMachineNodeData(): NodeData {
  const extras: Record<string, unknown> = {
    ...getDefaultLearningMachineExtras(),
    providerConfig: buildProviderConfig("openai"),
  };
  extras.learningMachineExpression = buildLearningMachineExpressionFromExtras(extras);
  return {
    name: "Learning Machine",
    description: "Shared learning resource for Agno agents and teams.",
    provider: "openai",
    model: "gpt-4.1-mini",
    extras,
  };
}

export function createScheduleInputNodeData(index: number): NodeData {
  return {
    name: `Schedule ${index}`,
    description: "Runs the saved flow on a cron schedule.",
    prompt: "",
    extras: {
      inputSource: "schedule",
      inputMode: "text",
      inputText: "Run the scheduled task.",
      payloadJson: '{\n  "source": "schedule"\n}',
      scheduleCron: "0 9 * * 1-5",
      scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      scheduleEnabled: true,
      hitlAutoApprove: "",
      hitlUserInputJson: "",
    },
  };
}

export function createEmailInputNodeData(index: number): NodeData {
  return {
    name: `Email Inbox ${index}`,
    description: "Starts a background mailbox monitor after save and feeds the first matching email into the flow runtime.",
    prompt: "",
    extras: {
      inputSource: "email",
      inputMode: "text",
      inputText: "",
      attachedFileName: "",
      attachedFileAlias: "",
      attachedFileMimeType: "",
      attachedFileEncoding: "base64",
      attachedFileBase64: "",
      attachedFileContent: "",
      payloadJson: '{\n  "source": "email_inbox"\n}',
      hitlAutoApprove: "",
      hitlUserInputJson: "",
      emailProtocol: "imap",
      emailSecurity: "ssl",
      emailHost: "",
      emailPort: "993",
      emailMailbox: "INBOX",
      emailUsername: "",
      emailPassword: "",
      emailMaxMessages: "20",
      emailUnreadOnly: true,
      emailListenerEnabled: true,
      emailPollIntervalSeconds: "15",
      emailSubjectFilter: "",
      emailFromFilter: "",
      emailToFilter: "",
      emailBodyKeywords: "",
    },
  };
}

export function createWebhookInputNodeData(index: number): NodeData {
  return {
    name: `Webhook Input ${index}`,
    description: "Accepts inbound HTTP requests and maps the payload into the flow runtime.",
    prompt: "Webhook event received.",
    extras: {
      inputSource: "webhook",
      inputMode: "text",
      inputText: "Webhook event received.",
      attachedFileName: "",
      attachedFileAlias: "",
      attachedFileMimeType: "",
      attachedFileEncoding: "base64",
      attachedFileBase64: "",
      attachedFileContent: "",
      payloadJson: '{\n  "source": "webhook"\n}',
      hitlAutoApprove: "",
      hitlUserInputJson: "",
      webhookSecret: "",
      webhookSecretHeader: "X-AgnoLab-Secret",
      webhookTextField: "message",
    },
  };
}

export function createWhatsappInputNodeData(index: number): NodeData {
  return {
    name: `WhatsApp Input ${index}`,
    description: "Receives WhatsApp messages from a connected session and can auto-reply with the flow result.",
    prompt: "WhatsApp message received.",
    extras: {
      inputSource: "whatsapp",
      inputMode: "text",
      inputText: "WhatsApp message received.",
      attachedFileName: "",
      attachedFileAlias: "",
      attachedFileMimeType: "",
      attachedFileEncoding: "base64",
      attachedFileBase64: "",
      attachedFileContent: "",
      payloadJson: '{\n  "source": "whatsapp"\n}',
      hitlAutoApprove: "",
      hitlUserInputJson: "",
      whatsappSessionId: `agnolab_whatsapp_${index}`,
      whatsappWebhookSecret: createClientSecret("wa"),
      whatsappIgnoreGroups: true,
      whatsappSenderFilter: "",
      whatsappBodyKeywords: "",
      whatsappReplyEnabled: true,
      whatsappReplyTemplate: "$result_text",
    },
  };
}

export function createFormInputNodeData(index: number): NodeData {
  return {
    name: `Form Input ${index}`,
    description: "Receives form submissions with fields and uploaded files, then runs the flow automatically.",
    prompt: "New form submission received.",
    extras: {
      inputSource: "form",
      inputMode: "mixed",
      inputText: "New form submission received.",
      attachedFileName: "",
      attachedFileAlias: "",
      attachedFileMimeType: "",
      attachedFileEncoding: "base64",
      attachedFileBase64: "",
      attachedFileContent: "",
      payloadJson: '{\n  "source": "form_submission"\n}',
      hitlAutoApprove: "",
      hitlUserInputJson: "",
      formSecret: "",
      formSecretHeader: "X-AgnoLab-Secret",
      formSecretField: "_secret",
      formTextField: "message",
      formMetadataField: "metadata_json",
      formPrimaryFileField: "",
    },
  };
}

export function createEmailOutputNodeData(index: number): NodeData {
  return {
    name: `Email Send Output ${index}`,
    output_format: "text",
    extras: {
      ...NODE_CATALOG.output_api.createData(index).extras,
      outputMode: "email",
    },
  };
}

export function createChatOutputNodeData(index: number): NodeData {
  return {
    name: `Chat Message Output ${index}`,
    output_format: "json",
    extras: {
      ...NODE_CATALOG.output_api.createData(index).extras,
      outputMode: "chat",
    },
  };
}

export function createSpreadsheetOutputNodeData(index: number): NodeData {
  return {
    name: `Spreadsheet Output ${index}`,
    output_format: "json",
    extras: {
      ...NODE_CATALOG.output_api.createData(index).extras,
      outputMode: "spreadsheet",
    },
  };
}

export function createManagerNodeData(type: "memory_manager" | "session_summary_manager" | "compression_manager"): NodeData {
  const label = NODE_CATALOG[type].label;
  const extras: Record<string, unknown> = {};
  extras.useManagerModel = false;
  extras.providerConfig = buildProviderConfig("openai");
  if (type === "memory_manager") {
    extras.systemMessage = "";
    extras.memoryCaptureInstructions = "";
    extras.additionalInstructions = "";
    extras.debugMode = false;
  } else if (type === "session_summary_manager") {
    extras.sessionSummaryPrompt = "";
    extras.summaryRequestMessage = "Provide the summary of the conversation.";
  } else {
    extras.compressToolResults = true;
    extras.compressToolResultsLimit = "3";
    extras.compressTokenLimit = "";
    extras.compressToolCallInstructions = "";
  }
  extras.managerExpression = buildManagerExpressionFromExtras(type, extras);
  return {
    name: label,
    description: NODE_CATALOG[type].description,
    provider: "openai",
    model: "gpt-4.1-mini",
    extras,
  };
}


export function getToolMode(data: NodeData): "builtin" | "function" {
  return (data.extras?.toolMode as "builtin" | "function" | undefined) ?? "builtin";
}

export function getInputSource(data: NodeData): "manual" | "email" | "webhook" | "whatsapp" | "form" | "schedule" {
  return (data.extras?.inputSource as "manual" | "email" | "webhook" | "whatsapp" | "form" | "schedule" | undefined) ?? "manual";
}

export function getInputMode(data: NodeData): "text" | "file" | "mixed" {
  return (data.extras?.inputMode as "text" | "file" | "mixed" | undefined) ?? "text";
}

export function getOutputMode(data: NodeData): "api" | "email" | "chat" | "spreadsheet" {
  return (data.extras?.outputMode as "api" | "email" | "chat" | "spreadsheet" | undefined) ?? "api";
}

export function getChatProvider(data: NodeData): "slack" | "discord" | "telegram" | "generic" | "whatsapp" {
  return (data.extras?.chatProvider as "slack" | "discord" | "telegram" | "generic" | "whatsapp" | undefined) ?? "slack";
}

export function getEmailProtocol(data: NodeData): "imap" | "pop" {
  return (data.extras?.emailProtocol as "imap" | "pop" | undefined) ?? "imap";
}

export function getEmailSecurity(data: NodeData): "ssl" | "starttls" | "none" {
  return (data.extras?.emailSecurity as "ssl" | "starttls" | "none" | undefined) ?? "ssl";
}

export function getDefaultEmailPort(protocol: "imap" | "pop", security: "ssl" | "starttls" | "none"): string {
  if (protocol === "pop") {
    return security === "ssl" ? "995" : "110";
  }
  return security === "ssl" ? "993" : "143";
}


export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function getInputText(data: NodeData): string {
  return fieldValueAsString(data.extras?.inputText ?? data.prompt);
}

export function getAttachedFileName(data: NodeData): string {
  return fieldValueAsString(data.extras?.attachedFileName);
}

export function updateInputNodePayload(graph: CanvasGraph, payload: ChatDraft): CanvasGraph {
  const inputNode = graph.nodes.find((node) => node.type === "input");
  if (!inputNode) {
    return graph;
  }

  const currentExtras = inputNode.data.extras ?? {};
  const inputSource = getInputSource(inputNode.data);
  const inputMode = getInputMode(inputNode.data);
  if (inputSource === "email") {
    const nextExtras = {
      ...currentExtras,
      payloadJson: payload.metadata,
    };

    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === inputNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                extras: nextExtras,
              },
            }
          : node,
      ),
    };
  }
  const nextText = inputMode === "file" ? getInputText(inputNode.data) : payload.text;
  const nextPrompt = inputMode === "file" ? inputNode.data.prompt : payload.text;

  const nextExtras = {
    ...currentExtras,
    inputText: nextText,
    payloadJson: payload.metadata,
    attachedFileName: payload.fileName,
    attachedFileAlias: payload.fileAlias || payload.fileName,
    attachedFileMimeType: payload.fileMimeType,
    attachedFileEncoding: payload.fileEncoding || "base64",
    attachedFileBase64: payload.fileBase64,
    attachedFileContent: payload.fileContent,
  };

  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === inputNode.id
        ? {
            ...node,
            data: {
              ...node.data,
              prompt: nextPrompt,
              extras: nextExtras,
            },
          }
        : node,
    ),
  };
}

export function getPrimaryInputNode(graph: CanvasGraph | null): { id: string; data: NodeData } | null {
  if (!graph) {
    return null;
  }
  const node = graph.nodes.find((candidate) => candidate.type === "input");
  if (!node) {
    return null;
  }
  return { id: node.id, data: node.data };
}

export function getCanvasNodeLabel(data: NodeData, type: keyof typeof NODE_CATALOG): string {
  if (type === "tool") {
    const mode = getToolMode(data);
    if (mode === "builtin") {
      return fieldValueAsString(data.extras?.builtinClassName) || "Built-in Tool";
    }
    return "Function Tool";
  }

  return NODE_CATALOG[type].label;
}

export function getCanvasNodeMeta(node: { type: keyof typeof NODE_CATALOG; data: NodeData }): string {
  if (
    node.type === "rabbitmq_input"
    || node.type === "rabbitmq_output"
    || node.type === "kafka_input"
    || node.type === "kafka_output"
    || node.type === "redis_input"
    || node.type === "redis_output"
    || node.type === "nats_input"
    || node.type === "nats_output"
    || node.type === "sqs_input"
    || node.type === "sqs_output"
    || node.type === "pubsub_input"
    || node.type === "pubsub_output"
  ) {
    const provider = fieldValueAsString(node.data.extras?.queueProvider).trim().toLowerCase();

    if (provider === "rabbitmq") {
      const queue = fieldValueAsString(node.data.extras?.rabbitmqQueue).trim() || "queue not configured";
      return `RabbitMQ · ${queue}`;
    }
    if (provider === "kafka") {
      const topic = fieldValueAsString(node.data.extras?.kafkaTopic).trim() || "topic not configured";
      return `Kafka · ${topic}`;
    }
    if (provider === "redis") {
      const channel = fieldValueAsString(node.data.extras?.redisChannel).trim() || "channel not configured";
      return `Redis · ${channel}`;
    }
    if (provider === "nats") {
      const subject = fieldValueAsString(node.data.extras?.natsSubject).trim() || "subject not configured";
      return `NATS · ${subject}`;
    }
    if (provider === "sqs") {
      const queueUrl = fieldValueAsString(node.data.extras?.sqsQueueUrl).trim() || "queue URL not configured";
      return `SQS · ${queueUrl}`;
    }
    if (provider === "pubsub") {
      const name = node.type.endsWith("_input")
        ? fieldValueAsString(node.data.extras?.pubsubSubscription).trim()
        : fieldValueAsString(node.data.extras?.pubsubTopic).trim();
      return `Pub/Sub · ${name || "resource not configured"}`;
    }

    return "Queue endpoint";
  }

  if (node.type === "database") {
    return fieldValueAsString(node.data.extras?.dbPreset) || "Database backend";
  }

  if (node.type === "vector_db") {
    return fieldValueAsString(node.data.extras?.vectorPreset) || "Vector store";
  }

  if (node.type === "knowledge") {
    return Boolean(node.data.extras?.includeContentsDb) ? "Knowledge + Contents DB" : "Knowledge base";
  }

  if (node.type === "skills") {
    const rawPath = fieldValueAsString(node.data.extras?.skillsPath).trim();
    const label = rawPath ? rawPath.split(/[\\/]/).filter(Boolean).pop() || rawPath : "No path configured";
    return `${label} · ${node.data.extras?.skillsValidate === false ? "no validation" : "validated"}`;
  }

  if (node.type === "interface") {
    const preset = fieldValueAsString(node.data.extras?.interfacePreset).trim() || "whatsapp";
    const targetType = fieldValueAsString(node.data.extras?.interfaceTargetType).trim() || "agent";
    return `${preset.toUpperCase()} · ${targetType}`;
  }

  if (node.type === "learning_machine") {
    const namespace = fieldValueAsString(node.data.extras?.learningNamespace) || "global";
    const enabledStores = [
      node.data.extras?.learningUserProfile,
      node.data.extras?.learningUserMemory,
      node.data.extras?.learningSessionContext,
      node.data.extras?.learningEntityMemory,
      node.data.extras?.learningLearnedKnowledge,
      node.data.extras?.learningDecisionLog,
    ].filter(Boolean).length;
    return `${namespace} · ${enabledStores} stores`;
  }

  if (node.type === "memory_manager" || node.type === "session_summary_manager" || node.type === "compression_manager") {
    return fieldValueAsString(node.data.extras?.managerExpression) || "Manager component";
  }

  if (node.type === "agent") {
    const providerConfig = getProviderConfig(node.data);
    const provider = fieldValueAsString(node.data.provider) || fieldValueAsString(providerConfig.provider_profile);
    if (provider && node.data.model) {
      return `${provider}:${node.data.model}`;
    }
  }

  if (node.type === "team") {
    const providerConfig = getProviderConfig(node.data);
    const provider = fieldValueAsString(node.data.provider) || fieldValueAsString(providerConfig.provider_profile);
    if (provider && node.data.model) {
      return `${provider}:${node.data.model}`;
    }
  }

  if (node.type === "workflow") {
    const workflowConfig = getWorkflowConfig(node.data);
    const historyRuns = fieldValueAsString(workflowConfig.num_history_runs) || "3";
    return `Sequential workflow · ${historyRuns} history`;
  }

  if (node.type === "workflow_step") {
    const stepOrder = fieldValueAsString(node.data.extras?.stepOrder) || "1";
    return `Step ${stepOrder}`;
  }

  if (WORKFLOW_CONTROL_TYPES.includes(node.type)) {
    const stepOrder = fieldValueAsString(node.data.extras?.stepOrder) || "1";
    if (node.type === "workflow_loop") {
      const maxIterations = fieldValueAsString(node.data.extras?.maxIterations) || "3";
      return `Step ${stepOrder} · up to ${maxIterations}×`;
    }
    if (node.type === "workflow_parallel") return `Step ${stepOrder} · runs in parallel`;
    if (node.type === "workflow_router") return `Step ${stepOrder} · picks one route`;
    return `Step ${stepOrder} · if / else`;
  }

  if (node.type === "input") {
    const inputSource = getInputSource(node.data);
    if (inputSource === "schedule") {
      const cron = fieldValueAsString(node.data.extras?.scheduleCron) || "no cron";
      const timezone = fieldValueAsString(node.data.extras?.scheduleTimezone) || "UTC";
      return node.data.extras?.scheduleEnabled === false ? `Paused · ${cron}` : `Cron ${cron} · ${timezone}`;
    }
    if (inputSource === "email") {
      const protocol = getEmailProtocol(node.data).toUpperCase();
      const host = fieldValueAsString(node.data.extras?.emailHost).trim();
      const subjectFilter = fieldValueAsString(node.data.extras?.emailSubjectFilter).trim();
      if (host && subjectFilter) {
        return `${protocol} · ${host} · ${subjectFilter}`;
      }
      if (host) {
        return `${protocol} · ${host}`;
      }
      return `${protocol} inbox`;
    }

    if (inputSource === "webhook") {
      const textField = fieldValueAsString(node.data.extras?.webhookTextField).trim() || "message";
      return `Webhook · ${textField}`;
    }

    if (inputSource === "whatsapp") {
      const sessionId = fieldValueAsString(node.data.extras?.whatsappSessionId).trim() || "session not configured";
      const senderFilter = fieldValueAsString(node.data.extras?.whatsappSenderFilter).trim();
      return senderFilter ? `WhatsApp · ${sessionId} · ${senderFilter}` : `WhatsApp · ${sessionId}`;
    }

    if (inputSource === "form") {
      const textField = fieldValueAsString(node.data.extras?.formTextField).trim() || "message";
      const fileField = fieldValueAsString(node.data.extras?.formPrimaryFileField).trim();
      return fileField ? `Form · ${textField} · ${fileField}` : `Form · ${textField}`;
    }

    const inputMode = getInputMode(node.data);
    const inputText = getInputText(node.data);
    const attachedFileName = getAttachedFileName(node.data);

    if (inputMode === "file" && attachedFileName) {
      return `File: ${attachedFileName}`;
    }

    if (inputMode === "mixed" && attachedFileName) {
      return inputText || `Text + file: ${attachedFileName}`;
    }

    return inputText || attachedFileName || "Configured in panel";
  }

  if (node.type === "output_api") {
    const outputMode = getOutputMode(node.data);
    if (outputMode === "email") {
      const recipients = fieldValueAsString(node.data.extras?.emailTo).trim();
      return recipients || "SMTP recipients not configured";
    }
    if (outputMode === "chat") {
      const provider = getChatProvider(node.data);
      if (provider === "telegram") {
        const channel = fieldValueAsString(node.data.extras?.chatChannelId).trim();
        return channel ? `Telegram · ${channel}` : "Telegram target not configured";
      }
      if (provider === "whatsapp") {
        const sessionId = fieldValueAsString(node.data.extras?.chatWhatsappSessionId).trim();
        const target = fieldValueAsString(node.data.extras?.chatChannelId).trim();
        if (sessionId && target) {
          return `WhatsApp · ${sessionId} · ${target}`;
        }
        if (sessionId) {
          return `WhatsApp · ${sessionId}`;
        }
        return "WhatsApp target not configured";
      }
      const webhookUrl = fieldValueAsString(node.data.extras?.chatWebhookUrl).trim();
      return webhookUrl || `${provider} webhook not configured`;
    }
    if (outputMode === "spreadsheet") {
      const sheetFilePath = fieldValueAsString(node.data.extras?.sheetFilePath).trim();
      return sheetFilePath || "CSV path not configured";
    }
    const apiUrl = fieldValueAsString(node.data.extras?.apiUrl).trim();
    return apiUrl || "POST URL not configured";
  }

  return node.data.model || node.data.prompt || node.data.output_format || "Configured in panel";
}

export function getNodeVisualIcon(node: { type: keyof typeof NODE_CATALOG; data: NodeData }) {
  if (node.type === "tool" && getToolMode(node.data) === "builtin") {
    const tool = getBuiltInTool(fieldValueAsString(node.data.extras?.builtinToolKey));
    if (tool) {
      return {
        color: toolIconColor(tool),
        icon: <ToolIcon toolKey={tool.key} category={tool.category} />,
      };
    }
  }

  return {
    color: NODE_CATALOG[node.type].color,
    icon: <NodeIcon type={node.type} />,
  };
}

export function parseFieldValue(field: AgentFieldDefinition, rawValue: string, checked: boolean): unknown {
  if (field.type === "checkbox") {
    return checked;
  }

  if (field.type === "number") {
    return rawValue === "" ? undefined : Number(rawValue);
  }

  return rawValue;
}
