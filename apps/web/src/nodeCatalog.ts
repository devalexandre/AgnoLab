import { buildProviderConfig } from "./providerCatalog";
import { NodeData, NodeType } from "./types";

export interface NodeDefinition {
  type: NodeType;
  label: string;
  category: "Core" | "Logic" | "Integrations" | "Interfaces";
  showInLibraryCategory?: boolean;
  description: string;
  color: string;
  receivesFrom: NodeType[];
  sendsTo: NodeType[];
  createData: (index: number) => NodeData;
}

const AGNO_NODE_COLORS = {
  primary: "#ff4017",
  ember: "#ff562f",
  coral: "#ff6a45",
  salmon: "#ff8d75",
  peach: "#ffb19d",
  copper: "#ff9d6b",
  clay: "#c98772",
  sand: "#d5cfce",
  dune: "#a6a09f",
} as const;

export const NODE_CATALOG: Record<NodeType, NodeDefinition> = {
  input: {
    type: "input",
    label: "Input",
    category: "Core",
    description: "Flow starting point. Lets you send text, files, and metadata to agents and tools.",
    color: AGNO_NODE_COLORS.salmon,
    receivesFrom: [],
    sendsTo: ["agent", "team", "condition", "output", "output_api"],
    createData: (index) => ({
      name: `Input ${index}`,
      prompt: "Describe the goal of this flow.",
      extras: {
        inputSource: "manual",
        inputMode: "text",
        inputText: "Describe the goal of this flow.",
        attachedFileName: "",
        attachedFileAlias: "",
        attachedFileMimeType: "",
        attachedFileEncoding: "base64",
        attachedFileBase64: "",
        attachedFileContent: "",
        payloadJson: '{\n  "source": "canvas"\n}',
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
    }),
  },
  tool: {
    type: "tool",
    label: "Function Tool",
    category: "Integrations",
    description: "Custom Python tool using Agno's @tool decorator.",
    color: AGNO_NODE_COLORS.coral,
    receivesFrom: [],
    sendsTo: ["agent", "team", "workflow_step", "output", "output_api"],
    createData: (index) => ({
      name: `Tool ${index}`,
      description: "Utility tool for this flow.",
      extras: {
        toolMode: "function",
        builtinToolKey: "websearch",
        builtinImportPath: "agno.tools.websearch",
        builtinClassName: "WebSearchTools",
        builtinConfig: '{\n  "backend": "google"\n}',
        functionName: `tool_${index}`,
        functionCode: `def tool_${index}(value: str) -> str:\n    return f"Search stub: {value}"\n`,
      },
    }),
  },
  skills: {
    type: "skills",
    label: "Skills",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Loads local Agno skills from a skill folder or a directory of skill folders.",
    color: AGNO_NODE_COLORS.ember,
    receivesFrom: [],
    sendsTo: ["agent"],
    createData: (index) => ({
      name: `Skills ${index}`,
      description: "Local Agno skill pack for connected agents.",
      extras: {
        skillsPath: "examples/skills/support-response-style",
        skillsValidate: true,
        skillsExpression: 'Skills(loaders=[LocalSkills(path="examples/skills/support-response-style", validate=True)])',
      },
    }),
  },
  interface: {
    type: "interface",
    label: "Interface",
    category: "Interfaces",
    showInLibraryCategory: false,
    description: "AgentOS interface wrapper (WhatsApp, Telegram, Slack, A2A, AG-UI) for deployment channels.",
    color: AGNO_NODE_COLORS.coral,
    receivesFrom: ["agent", "team"],
    sendsTo: [],
    createData: (index) => ({
      name: `Interface ${index}`,
      description: "Deployment interface for AgentOS channels.",
      extras: {
        interfacePreset: "whatsapp",
        interfaceTargetType: "agent",
        interfaceExpression:
          'Whatsapp(agent=<agent_or_team>, phone_number_id=os.getenv("WHATSAPP_PHONE_NUMBER_ID"), access_token=os.getenv("WHATSAPP_ACCESS_TOKEN"), verify_token=os.getenv("WHATSAPP_VERIFY_TOKEN"))',
      },
    }),
  },
  database: {
    type: "database",
    label: "Database",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Agent storage backend for sessions, history, memory, and state.",
    color: AGNO_NODE_COLORS.sand,
    receivesFrom: [],
    sendsTo: ["agent", "team", "knowledge", "learning_machine", "memory_manager"],
    createData: (index) => ({
      name: `Database ${index}`,
      description: "Storage backend plugged into an Agent.",
      extras: {
        dbPreset: "sqlite-db",
        dbExpression: 'SqliteDb(db_file="tmp/agno.db")',
      },
    }),
  },
  vector_db: {
    type: "vector_db",
    label: "Vector DB",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Vector database backend used by a knowledge base.",
    color: AGNO_NODE_COLORS.copper,
    receivesFrom: [],
    sendsTo: ["agent", "team", "knowledge"],
    createData: (index) => ({
      name: `Vector DB ${index}`,
      description: "Vector store plugged into an Agent or Knowledge component.",
      extras: {
        vectorPreset: "pgvector",
        vectorTableName: "documents",
        vectorDbUrl: "postgresql+psycopg://ai:ai@localhost:5532/ai",
        vectorExpression: 'PgVector(table_name="documents", db_url="postgresql+psycopg://ai:ai@localhost:5532/ai")',
      },
    }),
  },
  knowledge: {
    type: "knowledge",
    label: "Knowledge",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Knowledge base resource for agentic RAG and retrieval at runtime.",
    color: AGNO_NODE_COLORS.peach,
    receivesFrom: ["vector_db", "database"],
    sendsTo: ["agent", "team", "learning_machine"],
    createData: (index) => ({
      name: `Knowledge ${index}`,
      description: "Knowledge resource plugged into an Agent.",
      extras: {
        knowledgeExpression: "Knowledge(vector_db=PgVector(table_name=\"documents\", db_url=\"postgresql+psycopg://ai:ai@localhost:5532/ai\"))",
        includeContentsDb: false,
        contentsDbExpression: 'PostgresDb(db_url="postgresql://ai:ai@localhost:5532/ai")',
      },
    }),
  },
  learning_machine: {
    type: "learning_machine",
    label: "Learning Machine",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Structured Agno learning resource for profiles, memories, session context, and decision logs.",
    color: AGNO_NODE_COLORS.clay,
    receivesFrom: ["database", "knowledge"],
    sendsTo: ["agent", "team"],
    createData: (index) => ({
      name: `Learning Machine ${index}`,
      description: "Shared learning resource for agent and team memory systems.",
      provider: "openai",
      model: "gpt-4.1-mini",
      extras: {
        providerConfig: buildProviderConfig("openai"),
        useLearningModel: false,
        learningNamespace: "global",
        learningDebugMode: false,
        learningUserProfile: true,
        learningUserMemory: true,
        learningSessionContext: true,
        learningEntityMemory: false,
        learningLearnedKnowledge: true,
        learningDecisionLog: true,
        learningMachineExpression:
          'LearningMachine(namespace="global", user_profile=True, user_memory=True, session_context=True, learned_knowledge=True, decision_log=True)',
      },
    }),
  },
  memory_manager: {
    type: "memory_manager",
    label: "Memory Manager",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Manager component that controls how user memories are created and optimized.",
    color: AGNO_NODE_COLORS.sand,
    receivesFrom: ["database"],
    sendsTo: ["agent", "team"],
    createData: (index) => ({
      name: `Memory Manager ${index}`,
      description: "Memory manager plugged into an Agent.",
      extras: {
        managerExpression: "MemoryManager()",
      },
    }),
  },
  session_summary_manager: {
    type: "session_summary_manager",
    label: "Session Summary Manager",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Manager component that generates session summaries for long-running conversations.",
    color: AGNO_NODE_COLORS.copper,
    receivesFrom: [],
    sendsTo: ["agent", "team"],
    createData: (index) => ({
      name: `Session Summary Manager ${index}`,
      description: "Session summary manager plugged into an Agent.",
      extras: {
        managerExpression: "SessionSummaryManager()",
      },
    }),
  },
  compression_manager: {
    type: "compression_manager",
    label: "Compression Manager",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Manager component that compresses tool results to save context window space.",
    color: AGNO_NODE_COLORS.dune,
    receivesFrom: [],
    sendsTo: ["agent", "team"],
    createData: (index) => ({
      name: `Compression Manager ${index}`,
      description: "Compression manager plugged into an Agent.",
      extras: {
        managerExpression: "CompressionManager()",
      },
    }),
  },
  agent: {
    type: "agent",
    label: "Agent",
    category: "Core",
    description: "Single agent with model, instructions, and connected tools.",
    color: AGNO_NODE_COLORS.primary,
    receivesFrom: ["input", "tool", "skills", "condition", "database", "vector_db", "knowledge", "learning_machine", "memory_manager", "session_summary_manager", "compression_manager"],
    sendsTo: ["team", "workflow_step", "condition", "output", "output_api", "interface"],
    createData: (index) => ({
      name: `Agent ${index}`,
      instructions: "Help the user with clarity and objectivity.",
      provider: "openai",
      model: "gpt-4.1-mini",
      extras: {
        providerConfig: buildProviderConfig("openai"),
        agentConfig: {
          markdown: true,
          add_datetime_to_context: true,
          debug_mode: true,
        },
      },
    }),
  },
  team: {
    type: "team",
    label: "Team",
    category: "Core",
    description: "Coordinates multiple agents to execute a task together.",
    color: AGNO_NODE_COLORS.coral,
    receivesFrom: [
      "agent",
      "team",
      "input",
      "tool",
      "condition",
      "database",
      "vector_db",
      "knowledge",
      "learning_machine",
      "memory_manager",
      "session_summary_manager",
      "compression_manager",
    ],
    sendsTo: ["workflow_step", "condition", "output", "output_api", "interface"],
    createData: (index) => ({
      name: `Team ${index}`,
      instructions: "Coordinate team members and consolidate the final answer.",
      provider: "openai",
      model: "gpt-4.1-mini",
      extras: {
        providerConfig: buildProviderConfig("openai"),
        teamConfig: {
          mode: "coordinate",
          markdown: true,
          add_datetime_to_context: true,
          debug_mode: true,
        },
      },
    }),
  },
  condition: {
    type: "condition",
    label: "Condition",
    category: "Logic",
    description: "Decision block to route execution based on a rule.",
    color: AGNO_NODE_COLORS.salmon,
    receivesFrom: ["input", "agent", "team"],
    sendsTo: ["agent", "team", "output", "output_api"],
    createData: (index) => ({
      name: `Condition ${index}`,
      condition: "resultado == 'ok'",
    }),
  },
  workflow_step: {
    type: "workflow_step",
    label: "Workflow Step",
    category: "Logic",
    description: "Ordered workflow step that wraps an Agent, Team, or Tool executor.",
    color: AGNO_NODE_COLORS.copper,
    receivesFrom: ["agent", "team", "tool"],
    sendsTo: ["workflow"],
    createData: (index) => ({
      name: `Workflow Step ${index}`,
      description: "Sequential workflow step.",
      extras: {
        stepOrder: index,
        maxRetries: 3,
        skipOnFailure: false,
        strictInputValidation: false,
        requiresConfirmation: false,
        confirmationMessage: "",
        onReject: "skip",
        requiresUserInput: false,
        userInputMessage: "",
        userInputSchema: "",
        onError: "skip",
      },
    }),
  },
  workflow: {
    type: "workflow",
    label: "Workflow",
    category: "Core",
    description: "Sequential workflow root that orchestrates ordered steps.",
    color: AGNO_NODE_COLORS.ember,
    receivesFrom: ["input", "database", "workflow_step"],
    sendsTo: ["output", "output_api"],
    createData: (index) => ({
      name: `Workflow ${index}`,
      description: "Sequential workflow root.",
      extras: {
        workflowConfig: {
          debug_mode: true,
          stream_events: true,
          stream_executor_events: true,
          store_executor_outputs: true,
          telemetry: true,
          num_history_runs: 3,
          cache_session: false,
          add_workflow_history_to_steps: false,
        },
      },
    }),
  },
  output: {
    type: "output",
    label: "Output",
    category: "Core",
    description: "Flow end point. Displays or returns the generated answer.",
    color: AGNO_NODE_COLORS.peach,
    receivesFrom: ["input", "tool", "agent", "team", "workflow", "condition"],
    sendsTo: [],
    createData: (index) => ({
      name: `Output ${index}`,
      output_format: "text",
    }),
  },
  output_api: {
    type: "output_api",
    label: "API Output",
    category: "Integrations",
    showInLibraryCategory: false,
    description: "Flow endpoint that POSTs the final result to an external API URL with optional Bearer token.",
    color: AGNO_NODE_COLORS.dune,
    receivesFrom: ["input", "tool", "agent", "team", "workflow", "condition"],
    sendsTo: [],
    createData: (index) => ({
      name: `API Output ${index}`,
      output_format: "json",
      extras: {
        apiUrl: "",
        apiBearerToken: "",
        apiTimeoutSeconds: 15,
        apiHeadersJson: '{\n  "X-Source": "agnolab"\n}',
        apiPayloadJson: '{\n  "event": "flow.completed",\n  "tenant": $tenant\n}',
      },
    }),
  },
};

export function canConnect(sourceType: NodeType, targetType: NodeType): boolean {
  return (
    NODE_CATALOG[sourceType].sendsTo.includes(targetType) &&
    NODE_CATALOG[targetType].receivesFrom.includes(sourceType)
  );
}

export function listNodeTypes(types: NodeType[]): string {
  if (types.length === 0) {
    return "none in this MVP";
  }

  return types.map((type) => NODE_CATALOG[type].label).join(", ");
}

export const NODE_CATEGORIES: Array<NodeDefinition["category"]> = ["Core", "Logic", "Integrations", "Interfaces"];
