import { buildProviderConfig } from "./providerCatalog";
import { NodeData, NodeType } from "./types";

export interface NodeDefinition {
  type: NodeType;
  label: string;
  category: "Core" | "Logic" | "Integrations";
  description: string;
  color: string;
  receivesFrom: NodeType[];
  sendsTo: NodeType[];
  createData: (index: number) => NodeData;
}

export const NODE_CATALOG: Record<NodeType, NodeDefinition> = {
  input: {
    type: "input",
    label: "Input",
    category: "Core",
    description: "Flow starting point. Lets you send text, files, and metadata to agents and tools.",
    color: "#63b3ed",
    receivesFrom: [],
    sendsTo: ["agent", "team", "condition", "output", "output_api"],
    createData: (index) => ({
      name: `Input ${index}`,
      prompt: "Describe the goal of this flow.",
      extras: {
        inputMode: "text",
        inputText: "Describe the goal of this flow.",
        attachedFileName: "",
        attachedFileAlias: "",
        attachedFileMimeType: "",
        attachedFileEncoding: "base64",
        attachedFileBase64: "",
        attachedFileContent: "",
        payloadJson: '{\n  "source": "canvas"\n}',
      },
    }),
  },
  tool: {
    type: "tool",
    label: "Function Tool",
    category: "Integrations",
    description: "Custom Python tool using Agno's @tool decorator.",
    color: "#f6ad55",
    receivesFrom: [],
    sendsTo: ["agent", "team", "output", "output_api"],
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
  agent: {
    type: "agent",
    label: "Agent",
    category: "Core",
    description: "Single agent with model, instructions, and connected tools.",
    color: "#68d391",
    receivesFrom: ["input", "tool", "condition"],
    sendsTo: ["team", "condition", "output", "output_api"],
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
    color: "#f687b3",
    receivesFrom: ["agent", "team", "input", "tool", "condition"],
    sendsTo: ["condition", "output", "output_api"],
    createData: (index) => ({
      name: `Team ${index}`,
      instructions: "Coordinate team members and consolidate the final answer.",
    }),
  },
  condition: {
    type: "condition",
    label: "Condition",
    category: "Logic",
    description: "Decision block to route execution based on a rule.",
    color: "#fc8181",
    receivesFrom: ["input", "agent", "team"],
    sendsTo: ["agent", "team", "output", "output_api"],
    createData: (index) => ({
      name: `Condition ${index}`,
      condition: "resultado == 'ok'",
    }),
  },
  output: {
    type: "output",
    label: "Output",
    category: "Core",
    description: "Flow end point. Displays or returns the generated answer.",
    color: "#b794f4",
    receivesFrom: ["input", "tool", "agent", "team", "condition"],
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
    description: "Flow endpoint that POSTs the final result to an external API URL with optional Bearer token.",
    color: "#60a5fa",
    receivesFrom: ["input", "tool", "agent", "team", "condition"],
    sendsTo: [],
    createData: (index) => ({
      name: `API Output ${index}`,
      output_format: "json",
      extras: {
        apiUrl: "",
        apiBearerToken: "",
        apiTimeoutSeconds: 15,
        apiHeadersJson: '{\n  "X-Source": "agnolab"\n}',
        apiPayloadJson: '{\n  "event": "flow.completed"\n}',
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

export const NODE_CATEGORIES: Array<NodeDefinition["category"]> = ["Core", "Logic", "Integrations"];
