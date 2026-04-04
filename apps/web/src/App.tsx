import { type ChangeEvent, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, fetchCanvasTemplate, fetchDefaultGraph, fetchFlowByName, fetchQueueSubscriberStatus, fetchWhatsappSessionStatus, listBuiltInToolFunctions, listCanvasTemplates, listFlowRuntimeStatuses, listFlows, listOllamaModels, listSkillPaths, previewCode, runFlowByName, runGraph, saveFlow, startQueueSubscriber, startWhatsappSession, stopQueueSubscriber, stopWhatsappSession } from "./api";
import { AGENT_FIELDS, AGENT_FIELD_GROUPS, AGNO_MODEL_PROVIDER_OPTIONS, type AgentFieldDefinition } from "./agentConfig";
import MonacoToolEditor from "./MonacoToolEditor";
import { NODE_CATALOG, NODE_CATEGORIES, canConnect, listNodeTypes } from "./nodeCatalog";
import { buildProviderConfig, getProviderDefinition, normalizeProviderId } from "./providerCatalog";
import { TEAM_FIELDS, TEAM_FIELD_GROUPS } from "./teamConfig";
import { STARTER_TOOLS } from "./starterTools";
import { BUILT_IN_TOOLS, BUILT_IN_TOOL_CATEGORIES, getBuiltInTool, type BuiltInToolDefinition } from "./toolCatalog";
import { ToolIcon, toolIconColor } from "./toolIcons";
import { BuiltInToolFunctionOption, CanvasGraph, CanvasTemplateSummary, FlowRuntimeStatus, FlowSummary, GraphEdge, GraphNode, NodeData, NodeType, ProjectRuntimeConfig, ProjectRuntimeEnvVar, QueueSubscriberStatus, RunResult, SaveFlowResponse, SavedUserTool, SkillPathOption, StarterToolTemplate, WhatsappSessionStatus } from "./types";

const MY_TOOLS_STORAGE_KEY = "agnolab.my_tools";
const FLOW_DRAFT_STORAGE_KEY_PREFIX = "agnolab.flow_draft.v1:";
const FLOW_AUTOSAVE_DELAY_MS = 1200;
const NODE_WIDTH = 180;
const NODE_MIN_HEIGHT = 80;
const CANVAS_WORLD_MIN = -4000;
const CANVAS_WORLD_MAX = 8000;
const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 2.5;
const CANVAS_ZOOM_STEP = 0.1;
const DEFAULT_SECTION_OPEN = false;
const FLOW_INPUT_FILE_ACCEPT = [
  ".pdf",
  "application/pdf",
  ".csv",
  "text/csv",
  ".json",
  "application/json",
  ".md",
  ".markdown",
  "text/markdown",
  "text/x-markdown",
  ".txt",
  ".text",
  "text/plain",
  ".doc",
  ".docx",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls",
  ".xlsx",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".tsv",
  ".xml",
  ".yaml",
  ".yml",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  "image/*",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  "audio/*",
  ".mp4",
  ".mov",
  ".avi",
  ".webm",
  "video/*",
].join(",");
const FLOW_INPUT_FILE_SUPPORT_NOTE =
  "Input accepts docs, images, audio, and video. Knowledge ingestion only indexes supported document formats and skips pure multimodal media files.";

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
}

interface CanvasPanState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface DebugObservation {
  agentStatuses: Map<string, "running" | "completed">;
  toolStatuses: Map<string, "running" | "completed">;
  hasDebugLogs: boolean;
}

interface NodeRunBadge {
  text: string;
  variant: "running" | "completed" | "tool-completed";
  title: string;
}

interface ChatDraft {
  text: string;
  metadata: string;
  fileAlias: string;
  fileName: string;
  fileMimeType: string;
  fileEncoding: string;
  fileBase64: string;
  fileContent: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  attachmentName?: string;
}

interface FlowDraftStorageRecord {
  flowName: string;
  graph: CanvasGraph;
  updatedAt: string;
}

function buildFlowDraftRouteKey(routeFlowName: string | null, routeTemplateId: string | null): string | null {
  if (!routeFlowName) {
    return null;
  }
  if (routeFlowName === "new" && routeTemplateId) {
    return `new::template:${routeTemplateId}`;
  }
  return routeFlowName;
}

function buildFlowDraftStorageKey(routeKey: string): string {
  return `${FLOW_DRAFT_STORAGE_KEY_PREFIX}${routeKey}`;
}

function isCanvasGraph(value: unknown): value is CanvasGraph {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CanvasGraph>;
  return Boolean(candidate.project) && Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function loadFlowDraftFromStorage(routeKey: string | null): FlowDraftStorageRecord | null {
  if (!routeKey) {
    return null;
  }
  try {
    const rawValue = window.localStorage.getItem(buildFlowDraftStorageKey(routeKey));
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as Partial<FlowDraftStorageRecord>;
    if (!parsed || typeof parsed.flowName !== "string" || !isCanvasGraph(parsed.graph)) {
      return null;
    }
    return {
      flowName: parsed.flowName,
      graph: parsed.graph,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function saveFlowDraftToStorage(routeKey: string | null, draft: FlowDraftStorageRecord) {
  if (!routeKey) {
    return;
  }
  try {
    window.localStorage.setItem(buildFlowDraftStorageKey(routeKey), JSON.stringify(draft));
  } catch (error) {
    console.error(error);
  }
}

function clearFlowDraftFromStorage(routeKey: string | null) {
  if (!routeKey) {
    return;
  }
  try {
    window.localStorage.removeItem(buildFlowDraftStorageKey(routeKey));
  } catch (error) {
    console.error(error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function parseMarkdownTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return [];
  }

  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = parseMarkdownTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function getMarkdownTableAlignment(cell: string): "left" | "center" | "right" {
  const normalized = cell.replace(/\s+/g, "");
  const startsWithColon = normalized.startsWith(":");
  const endsWithColon = normalized.endsWith(":");

  if (startsWithColon && endsWithColon) {
    return "center";
  }
  if (endsWithColon) {
    return "right";
  }
  return "left";
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeLines: string[] = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length || !listType) {
      return;
    }
    blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
    listType = null;
  };

  const flushCode = () => {
    if (!codeLines.length) {
      return;
    }
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const nextLine = lines[index + 1] ?? "";
    const headerCells = parseMarkdownTableCells(line);
    if (
      headerCells.length > 0 &&
      headerCells.every(Boolean) &&
      isMarkdownTableSeparator(nextLine) &&
      parseMarkdownTableCells(nextLine).length === headerCells.length
    ) {
      flushParagraph();
      flushList();

      const alignments = parseMarkdownTableCells(nextLine).map(getMarkdownTableAlignment);
      const bodyRows: string[] = [];
      let bodyIndex = index + 2;

      while (bodyIndex < lines.length) {
        const bodyLine = lines[bodyIndex];
        if (!bodyLine.trim()) {
          break;
        }

        const bodyCells = parseMarkdownTableCells(bodyLine);
        if (bodyCells.length !== headerCells.length) {
          break;
        }

        bodyRows.push(
          `<tr>${bodyCells
            .map(
              (cell, cellIndex) =>
                `<td style="text-align:${alignments[cellIndex] ?? "left"}">${renderInlineMarkdown(cell)}</td>`,
            )
            .join("")}</tr>`,
        );
        bodyIndex += 1;
      }
      index = bodyIndex - 1;

      blocks.push(
        `<div class="markdown-table-wrap"><table><thead><tr>${headerCells
          .map(
            (cell, cellIndex) =>
              `<th style="text-align:${alignments[cellIndex] ?? "left"}">${renderInlineMarkdown(cell)}</th>`,
          )
          .join("")}</tr></thead>${bodyRows.length ? `<tbody>${bodyRows.join("")}</tbody>` : ""}</table></div>`,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    if (listType) {
      flushList();
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();
  return blocks.join("");
}

function MarkdownRenderer({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}

interface LibraryFeatureCard {
  key: string;
  label: string;
  description: string;
  helper?: string;
  badge?: string;
}

interface IntegrationLibraryItem extends LibraryFeatureCard {
  status: "available" | "planned";
}

interface ManagerLibraryItem {
  key: "memory_manager" | "session_summary_manager" | "compression_manager";
  label: string;
  description: string;
  helper: string;
}

interface InterfaceLibraryItem {
  key: "whatsapp" | "telegram" | "slack" | "a2a" | "ag_ui" | "all";
  label: string;
  description: string;
  helper: string;
  badge?: string;
}

interface InterfacePresetOption {
  key: InterfacePresetKey;
  label: string;
}

interface LibrarySearchResult {
  key: string;
  label: string;
  description: string;
  badge?: string;
  color: string;
  icon: JSX.Element;
  onSelect: () => void;
}

interface SavedFlowIntegrationModalState {
  name: string;
  authToken?: string | null;
}

interface WebhookCurlModalState {
  title: string;
  endpoint: string;
  command: string;
}

interface WhatsappSessionModalState {
  flowName: string;
  nodeId: string;
  nodeName: string;
  session?: WhatsappSessionStatus | null;
}

type QueueNodeType =
  | "rabbitmq_input"
  | "rabbitmq_output"
  | "kafka_input"
  | "kafka_output"
  | "redis_input"
  | "redis_output"
  | "nats_input"
  | "nats_output"
  | "sqs_input"
  | "sqs_output"
  | "pubsub_input"
  | "pubsub_output";

const QUEUE_INPUT_NODE_TYPES = new Set<QueueNodeType>([
  "rabbitmq_input",
  "kafka_input",
  "redis_input",
  "nats_input",
  "sqs_input",
  "pubsub_input",
]);

function isQueueInputNodeType(type: NodeType): type is QueueNodeType {
  return QUEUE_INPUT_NODE_TYPES.has(type as QueueNodeType);
}

function isQueueNodeType(type: NodeType): type is QueueNodeType {
  return (
    type === "rabbitmq_input"
    || type === "rabbitmq_output"
    || type === "kafka_input"
    || type === "kafka_output"
    || type === "redis_input"
    || type === "redis_output"
    || type === "nats_input"
    || type === "nats_output"
    || type === "sqs_input"
    || type === "sqs_output"
    || type === "pubsub_input"
    || type === "pubsub_output"
  );
}

function matchesLibrarySearch(query: string, ...parts: Array<string | undefined | null>): boolean {
  if (!query) {
    return true;
  }
  return parts.some((part) => (part ?? "").toLowerCase().includes(query));
}

const VECTOR_DB_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "pgvector",
    label: "PgVector",
    description: "PostgreSQL extension for vector similarity search.",
    helper: "from agno.vectordb.pgvector import PgVector",
    badge: "Production",
  },
  {
    key: "qdrant",
    label: "Qdrant",
    description: "High-performance vector database with strong filtering support.",
    helper: "from agno.vectordb.qdrant import Qdrant",
    badge: "Filtering",
  },
  {
    key: "chroma",
    label: "Chroma",
    description: "Local development vector store for prototyping and experiments.",
    helper: "from agno.vectordb.chroma import ChromaDb",
    badge: "Local",
  },
  {
    key: "pinecone",
    label: "Pinecone",
    description: "Managed serverless vector database for production retrieval workloads.",
    helper: "from agno.vectordb.pineconedb import PineconeDb",
    badge: "Managed",
  },
  {
    key: "lancedb",
    label: "LanceDB",
    description: "Embedded vector store for local-first and serverless workflows.",
    helper: "from agno.vectordb.lancedb import LanceDb",
    badge: "Embedded",
  },
  {
    key: "weaviate",
    label: "Weaviate",
    description: "Hybrid search vector database with GraphQL support.",
    helper: "from agno.vectordb.weaviate import Weaviate",
    badge: "Hybrid",
  },
];

const KNOWLEDGE_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "knowledge-base",
    label: "Knowledge Base",
    description: "Knowledge gives agents access to files, URLs, raw text, and domain-specific content at runtime.",
    helper: "Knowledge(vector_db=...) + Agent(knowledge=knowledge, search_knowledge=True)",
    badge: "Core",
  },
  {
    key: "contents-db",
    label: "Contents DB",
    description: "Optional content tracking layer for visibility, deletion, metadata updates, and filtering.",
    helper: "Knowledge(vector_db=..., contents_db=PostgresDb(...) )",
    badge: "Optional",
  },
];

const LEARNING_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "learning-machine",
    label: "Learning Machine",
    description: "Centralizes user profile, memory, session context, learned knowledge, and decision history in a reusable Agno resource.",
    helper: "LearningMachine(db=..., knowledge=..., user_memory=True, session_context=True)",
    badge: "Core",
  },
];

const SKILLS_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "local-skills",
    label: "Local Skills",
    description: "Loads a single Agno skill folder or a directory containing multiple skill folders.",
    helper: "Skills(loaders=[LocalSkills(path=..., validate=True)])",
    badge: "Agent",
  },
];

const DATABASE_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "sqlite-db",
    label: "SqliteDb",
    description: "Recommended for development and quick local persistence.",
    helper: "from agno.db.sqlite import SqliteDb",
    badge: "Dev",
  },
  {
    key: "postgres-db",
    label: "PostgresDb",
    description: "Recommended by Agno for production session, context, memory, and knowledge storage.",
    helper: "from agno.db.postgres import PostgresDb",
    badge: "Prod",
  },
  {
    key: "mongo-db",
    label: "MongoDb",
    description: "Supported backend for content and persistence use cases.",
    helper: "from agno.db.mongo import MongoDb",
    badge: "Supported",
  },
  {
    key: "async-postgres-db",
    label: "AsyncPostgresDb",
    description: "Async database backend for async Agno applications.",
    helper: "from agno.db.postgres import AsyncPostgresDb",
    badge: "Async",
  },
];

const MANAGER_LIBRARY_ITEMS: ManagerLibraryItem[] = [
  {
    key: "memory_manager",
    label: "Memory Manager",
    description: "Controls how memories are extracted, optimized, and written for the agent.",
    helper: "from agno.memory import MemoryManager",
  },
  {
    key: "session_summary_manager",
    label: "Session Summary Manager",
    description: "Builds concise summaries for long session history and summary-based context.",
    helper: "from agno.session.summary import SessionSummaryManager",
  },
  {
    key: "compression_manager",
    label: "Compression Manager",
    description: "Compresses tool results to keep context usage smaller over long runs.",
    helper: "from agno.compression.manager import CompressionManager",
  },
];

const INTERFACE_LIBRARY_ITEMS: InterfaceLibraryItem[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Serve Agent/Team via WhatsApp webhook.",
    helper: 'from agno.os.interfaces.whatsapp import Whatsapp\nWhatsapp(agent=agent, phone_number_id=os.getenv("WHATSAPP_PHONE_NUMBER_ID"), access_token=os.getenv("WHATSAPP_ACCESS_TOKEN"), verify_token=os.getenv("WHATSAPP_VERIFY_TOKEN"))',
    badge: "Template",
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Serve Agent/Team via Telegram bot updates.",
    helper: 'from agno.os.interfaces.telegram import Telegram\nTelegram(agent=agent, token=os.getenv("TELEGRAM_BOT_TOKEN"))',
  },
  {
    key: "slack",
    label: "Slack",
    description: "Serve Agent/Team via Slack events.",
    helper: 'from agno.os.interfaces.slack import Slack\nSlack(agent=agent, token=os.getenv("SLACK_BOT_TOKEN"), signing_secret=os.getenv("SLACK_SIGNING_SECRET"))',
  },
  {
    key: "a2a",
    label: "A2A",
    description: "Expose Agent/Team over Agent-to-Agent interface.",
    helper: "from agno.os.interfaces.a2a import A2A\nA2A(agents=[agent])",
  },
  {
    key: "ag_ui",
    label: "AG-UI",
    description: "Interface for AG-UI clients.",
    helper: "from agno.os.interfaces.agui import AGUI\nAGUI(agent=agent)",
  },
  {
    key: "all",
    label: "All Interfaces",
    description: "Register multiple interfaces at once.",
    helper: "Use multiple interface nodes connected to the same Agent/Team.",
    badge: "Bundle",
  },
];

const INTEGRATION_INPUT_LIBRARY_ITEMS: IntegrationLibraryItem[] = [
  {
    key: "email-inbox",
    label: "Email Inbox Input",
    description: "Starts a background inbox monitor after save and runs the flow with the newest email that matches the configured filters.",
    helper: "Supports IMAP/POP, host, port, security, mailbox, unread-only, subject, sender, recipient, and body keyword filters.",
    badge: "IMAP/POP",
    status: "available",
  },
  {
    key: "webhook-input",
    label: "Webhook Input",
    description: "Accept inbound HTTP requests as flow triggers with headers, payload parsing, and optional shared-secret validation.",
    helper: "Useful for Stripe, GitHub, WhatsApp, and custom app callbacks.",
    badge: "HTTP",
    status: "available",
  },
  {
    key: "whatsapp-input",
    label: "WhatsApp Input",
    description: "Connect a WhatsApp session with QR scan, listen to incoming messages, and feed each matching message into the flow.",
    helper: "Uses a WPPConnect gateway session plus webhook callbacks for real-time trigger and auto-reply.",
    badge: "QR + Listen",
    status: "available",
  },
  {
    key: "queue-input",
    label: "Queue Input",
    description: "Consume messages from SQS, RabbitMQ, Kafka, or Redis streams and map them to flow input.",
    helper: "Designed for background jobs and event-driven pipelines.",
    badge: "Planned",
    status: "planned",
  },
  {
    key: "form-input",
    label: "Form Submission Input",
    description: "Receive structured form fields and uploaded files from a multipart or URL-encoded form endpoint.",
    helper: "Good fit for intake workflows, onboarding, and support requests.",
    badge: "FormData",
    status: "available",
  },
];

const INTEGRATION_OUTPUT_LIBRARY_ITEMS: IntegrationLibraryItem[] = [
  {
    key: "api-output",
    label: "API Output",
    description: "POST the final result to an external API with custom headers and payload placeholders.",
    helper: 'Supports metadata placeholders like "tenant": $tenant in Additional Payload JSON.',
    badge: "POST",
    status: "available",
  },
  {
    key: "smtp-output",
    label: "Email Send Output",
    description: "Send an email summary, reply, or alert when the flow finishes.",
    helper: "Supports SMTP, recipients, template placeholders, and optional forwarding of input files as attachments.",
    badge: "SMTP",
    status: "available",
  },
  {
    key: "chat-output",
    label: "Chat Message Output",
    description: "Push a completion message to Slack, Discord, Telegram, or a generic webhook endpoint.",
    helper: "Useful for approvals, alerts, and operational updates.",
    badge: "Chat",
    status: "available",
  },
  {
    key: "sheet-output",
    label: "Spreadsheet Output",
    description: "Append structured rows to a local CSV spreadsheet file after each run.",
    helper: "Great for ops logs, CRM updates, and lightweight audit trails.",
    badge: "CSV",
    status: "available",
  },
];

const AGNO_OUTPUT_FORMAT_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "XML" },
  { value: "csv", label: "CSV" },
  { value: "html", label: "HTML" },
] as const;

type VectorDbPresetKey = "pgvector" | "qdrant" | "chroma" | "pinecone" | "lancedb" | "weaviate";
type DatabasePresetKey = "sqlite-db" | "postgres-db" | "mongo-db" | "async-postgres-db";
type InterfacePresetKey = "whatsapp" | "telegram" | "slack" | "a2a" | "ag_ui" | "all";
const INTERFACE_PRESET_OPTIONS: InterfacePresetOption[] = INTERFACE_LIBRARY_ITEMS.map((item) => ({
  key: item.key,
  label: item.label,
}));
type KnowledgeReaderKey = "auto" | "pdf" | "csv" | "field_labeled_csv" | "excel" | "docx" | "pptx" | "json" | "markdown" | "text";

const DATABASE_DEPENDENT_AGENT_FIELDS = new Set([
  "db",
  "overwrite_db_session_state",
  "search_session_history",
  "num_history_sessions",
  "add_history_to_context",
  "num_history_runs",
  "num_history_messages",
  "read_chat_history",
  "read_tool_call_history",
  "store_history_messages",
  "memory_manager",
  "enable_agentic_memory",
  "update_memory_on_run",
  "add_memories_to_context",
  "enable_session_summaries",
  "add_session_summary_to_context",
  "session_summary_manager",
  "compress_tool_results",
  "learning",
]);

const KNOWLEDGE_DEPENDENT_AGENT_FIELDS = new Set([
  "knowledge",
  "knowledge_filters",
  "enable_agentic_knowledge_filters",
  "add_knowledge_to_context",
  "knowledge_retriever",
  "references_format",
  "search_knowledge",
  "update_knowledge",
]);

const COMPONENT_SELECT_AGENT_FIELDS = new Set([
  "db",
  "knowledge",
  "skills",
  "learning_machine",
  "memory_manager",
  "session_summary_manager",
  "compression_manager",
]);

const DATABASE_DEPENDENT_TEAM_FIELDS = new Set([
  "db",
  "overwrite_db_session_state",
  "search_session_history",
  "num_history_sessions",
  "add_history_to_context",
  "num_history_runs",
  "num_history_messages",
  "read_chat_history",
  "store_history_messages",
  "memory_manager",
  "enable_agentic_memory",
  "update_memory_on_run",
  "add_memories_to_context",
  "enable_session_summaries",
  "add_session_summary_to_context",
  "session_summary_manager",
  "compress_tool_results",
  "learning",
]);

const KNOWLEDGE_DEPENDENT_TEAM_FIELDS = new Set([
  "knowledge",
  "knowledge_filters",
  "enable_agentic_knowledge_filters",
  "add_knowledge_to_context",
  "knowledge_retriever",
  "references_format",
  "search_knowledge",
  "update_knowledge",
]);

const COMPONENT_SELECT_TEAM_FIELDS = new Set([
  "db",
  "knowledge",
  "learning_machine",
  "memory_manager",
  "session_summary_manager",
  "compression_manager",
]);

const KNOWLEDGE_READER_OPTIONS: Array<{ key: KnowledgeReaderKey; label: string; description: string }> = [
  { key: "auto", label: "Auto Detect", description: "Use Agno's default reader selection based on file extension and MIME type." },
  { key: "pdf", label: "PDF Reader", description: "For PDF documents with optional page splitting and password support." },
  { key: "csv", label: "CSV Reader", description: "For standard CSV files and tabular ingestion." },
  { key: "field_labeled_csv", label: "Field-Labeled CSV", description: "Turns CSV rows into labeled text for better retrieval context." },
  { key: "excel", label: "Excel Reader", description: "For `.xlsx` and `.xls` workbooks." },
  { key: "docx", label: "Word Reader", description: "For `.doc` and `.docx` documents." },
  { key: "pptx", label: "PowerPoint Reader", description: "For `.pptx` slide decks." },
  { key: "json", label: "JSON Reader", description: "For JSON files and structured payloads." },
  { key: "markdown", label: "Markdown Reader", description: "For `.md` and `.markdown` files." },
  { key: "text", label: "Text Reader", description: "For plain text ingestion or forcing text mode." },
];

function hasConfiguredValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return Boolean(value);
}

function shouldShowAgentField(
  field: AgentFieldDefinition,
  agentConfig: Record<string, unknown>,
  hasConnectedTools: boolean,
  hasConnectedLearningMachine: boolean,
): boolean {
  switch (field.key) {
    case "add_session_state_to_context":
      return (
        hasConfiguredValue(agentConfig.session_state) ||
        Boolean(agentConfig.enable_agentic_state) ||
        Boolean(agentConfig.add_session_state_to_context)
      );
    case "overwrite_db_session_state":
      return Boolean(agentConfig.enable_agentic_state) || Boolean(agentConfig.overwrite_db_session_state);
    case "num_history_sessions":
      return Boolean(agentConfig.search_session_history) || hasConfiguredValue(agentConfig.num_history_sessions);
    case "num_history_runs":
    case "num_history_messages":
      return Boolean(agentConfig.add_history_to_context) || hasConfiguredValue(agentConfig[field.key]);
    case "read_tool_call_history":
      return Boolean(agentConfig.read_chat_history) || hasConfiguredValue(agentConfig.read_tool_call_history);
    case "add_dependencies_to_context":
      return hasConfiguredValue(agentConfig.dependencies) || Boolean(agentConfig.add_dependencies_to_context);
    case "update_memory_on_run":
    case "add_memories_to_context":
      return Boolean(agentConfig.enable_agentic_memory) || hasConfiguredValue(agentConfig[field.key]);
    case "add_session_summary_to_context":
      return Boolean(agentConfig.enable_session_summaries) || hasConfiguredValue(agentConfig.add_session_summary_to_context);
    case "add_learnings_to_context":
      return Boolean(agentConfig.learning) || hasConnectedLearningMachine || hasConfiguredValue(agentConfig.add_learnings_to_context);
    case "enable_agentic_knowledge_filters":
      return hasConfiguredValue(agentConfig.knowledge_filters) || Boolean(agentConfig.enable_agentic_knowledge_filters);
    case "references_format":
      return Boolean(agentConfig.add_knowledge_to_context) || hasConfiguredValue(agentConfig.references_format);
    case "tool_hooks":
    case "pre_hooks":
    case "post_hooks":
      return hasConnectedTools || hasConfiguredValue(agentConfig[field.key]);
    case "reasoning_model":
    case "reasoning_agent":
    case "reasoning_min_steps":
    case "reasoning_max_steps":
      return Boolean(agentConfig.reasoning) || hasConfiguredValue(agentConfig[field.key]);
    case "store_media":
      return Boolean(agentConfig.send_media_to_model) || hasConfiguredValue(agentConfig.store_media);
    case "parser_model_prompt":
      return hasConfiguredValue(agentConfig.parser_model) || hasConfiguredValue(agentConfig.parser_model_prompt);
    case "output_model_prompt":
      return hasConfiguredValue(agentConfig.output_model) || hasConfiguredValue(agentConfig.output_model_prompt);
    default:
      return true;
  }
}

function shouldShowTeamField(
  field: AgentFieldDefinition,
  teamConfig: Record<string, unknown>,
  hasConnectedTools: boolean,
  hasConnectedLearningMachine: boolean,
): boolean {
  switch (field.key) {
    case "add_session_state_to_context":
      return (
        hasConfiguredValue(teamConfig.session_state) ||
        Boolean(teamConfig.enable_agentic_state) ||
        Boolean(teamConfig.add_session_state_to_context)
      );
    case "overwrite_db_session_state":
      return Boolean(teamConfig.enable_agentic_state) || Boolean(teamConfig.overwrite_db_session_state);
    case "num_past_sessions_to_search":
    case "num_past_session_runs_in_search":
      return Boolean(teamConfig.search_past_sessions) || hasConfiguredValue(teamConfig[field.key]);
    case "num_history_sessions":
      return Boolean(teamConfig.search_session_history) || hasConfiguredValue(teamConfig.num_history_sessions);
    case "num_team_history_runs":
      return Boolean(teamConfig.add_team_history_to_members) || hasConfiguredValue(teamConfig.num_team_history_runs);
    case "num_history_runs":
    case "num_history_messages":
      return Boolean(teamConfig.add_history_to_context) || hasConfiguredValue(teamConfig[field.key]);
    case "add_dependencies_to_context":
      return hasConfiguredValue(teamConfig.dependencies) || Boolean(teamConfig.add_dependencies_to_context);
    case "update_memory_on_run":
    case "add_memories_to_context":
      return Boolean(teamConfig.enable_agentic_memory) || hasConfiguredValue(teamConfig[field.key]);
    case "add_session_summary_to_context":
      return Boolean(teamConfig.enable_session_summaries) || hasConfiguredValue(teamConfig.add_session_summary_to_context);
    case "add_learnings_to_context":
      return Boolean(teamConfig.learning) || hasConnectedLearningMachine || hasConfiguredValue(teamConfig.add_learnings_to_context);
    case "enable_agentic_knowledge_filters":
      return hasConfiguredValue(teamConfig.knowledge_filters) || Boolean(teamConfig.enable_agentic_knowledge_filters);
    case "references_format":
      return Boolean(teamConfig.add_knowledge_to_context) || hasConfiguredValue(teamConfig.references_format);
    case "tool_hooks":
    case "pre_hooks":
    case "post_hooks":
      return hasConnectedTools || hasConfiguredValue(teamConfig[field.key]);
    case "reasoning_model":
    case "reasoning_agent":
    case "reasoning_min_steps":
    case "reasoning_max_steps":
      return Boolean(teamConfig.reasoning) || hasConfiguredValue(teamConfig[field.key]);
    case "store_media":
      return Boolean(teamConfig.send_media_to_model) || hasConfiguredValue(teamConfig.store_media);
    case "num_followups":
      return Boolean(teamConfig.followups) || hasConfiguredValue(teamConfig.num_followups);
    default:
      return true;
  }
}

function getAgentGroupNote(group: AgentFieldDefinition["group"]): string | null {
  switch (group) {
    case "Session":
      return "State and history controls expand as you enable them, so the session setup stays easier to scan.";
    case "Memory":
      return "Dependencies, memory, summaries, compression, and learning live here. Connect Database, manager, and Learning Machine nodes to unlock the managed pieces.";
    case "Knowledge":
      return "Connect a Knowledge or Vector DB node to drive retrieval visually. Advanced retrieval fields appear when filters or references are in use.";
    case "Tools":
      return "Tool policy, local Skills, and lifecycle hooks live here. Hook inputs stay hidden until tools are connected or a saved config already uses them.";
    case "Input/Output":
      return "Reasoning, multimodal delivery, retries, and structured outputs are grouped here. Reasoning details expand only when enabled.";
    default:
      return null;
  }
}

function getTeamGroupNote(group: AgentFieldDefinition["group"]): string | null {
  switch (group) {
    case "Session":
      return "Team session memory, past-session search, and shared history expand as you enable each capability.";
    case "Memory":
      return "This section controls shared dependencies, memory managers, summaries, compression, and learning for the whole team, including connected Learning Machines.";
    case "Knowledge":
      return "Teams can use the same connected Knowledge and Vector DB resources as agents, including retrieval controls and references.";
    case "Tools":
      return "Leader tool policy, member tool exposure, and hook lifecycle controls are grouped here.";
    case "Input/Output":
      return "Team mode, reasoning, multimodal input, direct-response behavior, and followups are configured in one place.";
    default:
      return null;
  }
}

function extractAgentResponse(stdout: string): string {
  const filteredLines = stdout
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("[debug]") && !line.startsWith("DEBUG"));

  const compacted: string[] = [];
  for (const line of filteredLines) {
    const isBlank = line.trim() === "";
    const previousIsBlank = compacted.length > 0 && compacted[compacted.length - 1].trim() === "";
    if (isBlank && previousIsBlank) {
      continue;
    }
    compacted.push(line);
  }

  let cleaned = compacted.join("\n").trim();
  cleaned = cleaned.replace(/<additional_information>[\s\S]*?<\/additional_information>/gi, "").trim();
  cleaned = cleaned.replace(
    /Runtime input context available to this flow:[\s\S]*?(?=(You have the capability to retain memories|$))/i,
    "",
  ).trim();
  cleaned = cleaned.replace(/You have the capability to retain memories[\s\S]*$/i, "").trim();
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function sanitizeGeneratedCode(code: string): string {
  return code
    .replace(
      /(_input_file_base64\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview; injected only at runtime>'",
    )
    .replace(
      /('password'\s*:\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    )
    .replace(
      /(_agnolab_[a-z_]*password\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    )
    .replace(
      /(_agnolab_[a-z_]*secret\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    )
    .replace(
      /(_agnolab_[a-z_]*token\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    );
}

function slugifyFlowName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

type HitlAutoApproveSelection = "" | "true" | "false";

function normalizeHitlAutoApproveSelection(rawValue: unknown): HitlAutoApproveSelection {
  if (rawValue === true) {
    return "true";
  }
  if (rawValue === false) {
    return "false";
  }
  const normalized = fieldValueAsString(rawValue).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return "true";
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return "false";
  }
  return "";
}

function parseHitlUserInput(rawValue: unknown): Record<string, unknown> | null {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue as Record<string, unknown>;
  }

  const text = fieldValueAsString(rawValue).trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function buildInputMetadataFromExtras(extras: Record<string, unknown> | undefined): Record<string, unknown> {
  const normalizedExtras = extras ?? {};
  const metadata = parseJsonObject(fieldValueAsString(normalizedExtras.payloadJson)) ?? {};

  if (Object.prototype.hasOwnProperty.call(normalizedExtras, "hitlAutoApprove")) {
    const hitlAutoApprove = normalizeHitlAutoApproveSelection(normalizedExtras.hitlAutoApprove);
    if (hitlAutoApprove !== "") {
      metadata.hitl_auto_approve = hitlAutoApprove === "true";
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalizedExtras, "hitlUserInputJson")) {
    const rawHitlUserInput = normalizedExtras.hitlUserInputJson;
    const hitlUserInput = parseHitlUserInput(rawHitlUserInput);
    if (hitlUserInput) {
      metadata.hitl_user_input = hitlUserInput;
    }
  }

  return metadata;
}

function stringifyJsonObject(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function graphHasHitlConfirmationGate(graph: CanvasGraph): boolean {
  return graph.nodes.some((node) => node.type === "workflow_step" && Boolean(node.data.extras?.requiresConfirmation));
}

function getHitlConfirmationStepNames(graph: CanvasGraph): Set<string> {
  return new Set(
    graph.nodes
      .filter((node) => node.type === "workflow_step" && Boolean(node.data.extras?.requiresConfirmation))
      .map((node) => fieldValueAsString(node.data.name).trim())
      .filter(Boolean),
  );
}

function extractPausedWorkflowStepName(text: string): string | null {
  const match = text.match(/Workflow paused at '([^']+)'/);
  return match?.[1] ?? null;
}

function shouldPromptHitlConfirmationFromRunResult(graph: CanvasGraph, result: RunResult | null): boolean {
  if (!result) {
    return false;
  }
  const pausedStepName = extractPausedWorkflowStepName(result.clean_stdout || result.stdout || "");
  if (!pausedStepName) {
    return false;
  }
  return getHitlConfirmationStepNames(graph).has(pausedStepName);
}

function shouldPromptHitlConfirmation(graph: CanvasGraph): boolean {
  if (!graphHasHitlConfirmationGate(graph)) {
    return false;
  }
  const inputNode = graph.nodes.find((node) => node.type === "input");
  if (!inputNode) {
    return false;
  }
  const metadata = buildInputMetadataFromExtras(inputNode.data.extras);
  return metadata.hitl_auto_approve !== true;
}

function prepareGraphWithResolvedInputMetadata(
  graph: CanvasGraph,
  options?: {
    forceHitlAutoApprove?: boolean;
  },
): CanvasGraph {
  const inputNode = graph.nodes.find((node) => node.type === "input");
  if (!inputNode) {
    return graph;
  }

  const currentExtras = inputNode.data.extras ?? {};
  const metadata = buildInputMetadataFromExtras(currentExtras);
  if (options?.forceHitlAutoApprove) {
    metadata.hitl_auto_approve = true;
  }

  const nextExtras = {
    ...currentExtras,
    payloadJson: stringifyJsonObject(metadata),
    hitlAutoApprove:
      typeof metadata.hitl_auto_approve === "boolean"
        ? metadata.hitl_auto_approve
          ? "true"
          : "false"
        : "",
    hitlUserInputJson:
      metadata.hitl_user_input && typeof metadata.hitl_user_input === "object" && !Array.isArray(metadata.hitl_user_input)
        ? stringifyJsonObject(metadata.hitl_user_input as Record<string, unknown>)
        : "",
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

function downloadAsFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

type IntegrationLanguage = "curl" | "go" | "python" | "javascript";

function escapeDoubleQuotedShell(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

function buildJsonCurlPayload(payload: Record<string, unknown>): string[] {
  const jsonLines = JSON.stringify(payload, null, 2).split("\n");
  return jsonLines.map((line, index) => {
    if (index === 0) {
      return `  -d '${line}`;
    }
    if (index === jsonLines.length - 1) {
      return `${line}'`;
    }
    return line;
  });
}

function buildRunFlowCurlCommand(flowName: string, authToken?: string | null): string {
  const lines = [
    `curl -X POST "${API_BASE}/api/flows/run" \\`,
    "  -H \"Content-Type: application/json\" \\",
  ];

  if (authToken?.trim()) {
    lines.push(`  -H "Authorization: Bearer ${escapeDoubleQuotedShell(authToken.trim())}" \\`);
  }

  return [
    ...lines,
    ...buildJsonCurlPayload({
      name: flowName,
      debug: false,
      input_text: "Hello from POST",
      input_metadata: {
        tenant: "acme",
      },
    }),
  ].join("\n");
}

function buildRunFlowGoExample(flowName: string, authToken?: string | null): string {
  const authLine = authToken?.trim()
    ? `    req.Header.Set("Authorization", "Bearer ${authToken.trim().replace(/"/g, '\\"')}")`
    : "";
  return [
    "package main",
    "",
    "import (",
    '    "bytes"',
    '    "fmt"',
    '    "io"',
    '    "net/http"',
    ")",
    "",
    "func main() {",
    `    payload := []byte(\`{"name":"${flowName}","debug":false,"input_text":"Hello from POST","input_metadata":{"tenant":"acme"}}\`)`,
    `    req, err := http.NewRequest("POST", "${API_BASE}/api/flows/run", bytes.NewBuffer(payload))`,
    "    if err != nil {",
    "        panic(err)",
    "    }",
    '    req.Header.Set("Content-Type", "application/json")',
    authLine,
    "",
    "    resp, err := http.DefaultClient.Do(req)",
    "    if err != nil {",
    "        panic(err)",
    "    }",
    "    defer resp.Body.Close()",
    "",
    "    body, err := io.ReadAll(resp.Body)",
    "    if err != nil {",
    "        panic(err)",
    "    }",
    "",
    '    fmt.Println(string(body))',
    "}",
  ].join("\n");
}

function buildRunFlowPythonExample(flowName: string, authToken?: string | null): string {
  const headerLines = ['headers = {"Content-Type": "application/json"}'];
  if (authToken?.trim()) {
    headerLines.push(`headers["Authorization"] = "Bearer ${authToken.trim().replace(/"/g, '\\"')}"`);
  }
  return [
    "import requests",
    "",
    ...headerLines,
    "",
    `response = requests.post("${API_BASE}/api/flows/run", json={`,
    `    "name": "${flowName}",`,
    '    "debug": False,',
    '    "input_text": "Hello from POST",',
    '    "input_metadata": {',
    '        "tenant": "acme",',
    "    },",
    "}, headers=headers)",
    "",
    "print(response.status_code)",
    "print(response.text)",
  ].join("\n");
}

function buildRunFlowJavaScriptExample(flowName: string, authToken?: string | null): string {
  const authLine = authToken?.trim()
    ? `    Authorization: "Bearer ${authToken.trim().replace(/"/g, '\\"')}",`
    : "";
  return [
    `const response = await fetch("${API_BASE}/api/flows/run", {`,
    '  method: "POST",',
    "  headers: {",
    '    "Content-Type": "application/json",',
    authLine,
    "  },",
    "  body: JSON.stringify({",
    `    name: "${flowName}",`,
    "    debug: false,",
    '    input_text: "Hello from POST",',
    "    input_metadata: {",
    '      tenant: "acme",',
    "    },",
    "  }),",
    "});",
    "",
    "const data = await response.json();",
    "console.log(data);",
  ].join("\n");
}

function buildIntegrationSnippet(flowName: string, language: IntegrationLanguage, authToken?: string | null): string {
  if (language === "go") {
    return buildRunFlowGoExample(flowName, authToken);
  }
  if (language === "python") {
    return buildRunFlowPythonExample(flowName, authToken);
  }
  if (language === "javascript") {
    return buildRunFlowJavaScriptExample(flowName, authToken);
  }
  return buildRunFlowCurlCommand(flowName, authToken);
}

function buildWebhookCurlCommand(
  endpoint: string,
  options: {
    textField?: unknown;
    secretHeader?: unknown;
    secretValue?: unknown;
    authToken?: unknown;
  },
): string {
  const resolvedTextField = fieldValueAsString(options.textField).trim() || "message";
  const secretHeader = fieldValueAsString(options.secretHeader).trim() || "X-AgnoLab-Secret";
  const secretValue = fieldValueAsString(options.secretValue);
  const authToken = fieldValueAsString(options.authToken).trim();
  const lines = [
    `curl -X POST "${endpoint}" \\`,
    "  -H \"Content-Type: application/json\" \\",
  ];

  if (authToken) {
    lines.push(`  -H "Authorization: Bearer ${escapeDoubleQuotedShell(authToken)}" \\`);
  }
  if (secretValue.trim()) {
    lines.push(`  -H "${escapeDoubleQuotedShell(secretHeader)}: ${escapeDoubleQuotedShell(secretValue.trim())}" \\`);
  }

  return [
    ...lines,
    ...buildJsonCurlPayload({
      [resolvedTextField]: "Hello from webhook",
      tenant: "acme",
      source: "curl",
    }),
  ].join("\n");
}

function getIntegrationEditorLanguage(language: IntegrationLanguage): string {
  if (language === "go") {
    return "go";
  }
  if (language === "python") {
    return "python";
  }
  if (language === "javascript") {
    return "javascript";
  }
  return "shell";
}

function getFlowNameFromPath(pathname: string): string | null {
  const prefix = "/flow/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const raw = pathname.slice(prefix.length).trim();
  if (!raw) {
    return null;
  }
  return decodeURIComponent(raw);
}

function buildFlowPath(flowName: string): string {
  return `/flow/${encodeURIComponent(flowName)}`;
}

function buildPersistedFlowSnapshot(flowName: string, graph: CanvasGraph | null): string {
  if (!graph) {
    return "";
  }
  const normalizedName = slugifyFlowName(flowName) || flowName.trim();
  return JSON.stringify({
    flowName: normalizedName,
    graph,
  });
}

function clampCanvasZoom(value: number): number {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Number(value.toFixed(2))));
}

function isCanvasBackgroundTarget(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(".canvas-node, .canvas-brand, .run-cta, .flow-actions, .canvas-hint, .edge-hit-area")) {
    return false;
  }

  if (currentTarget instanceof Element && target === currentTarget) {
    return true;
  }

  return target.classList.contains("canvas-viewport") || target.classList.contains("edges");
}

function getTemplateIdFromSearch(search: string): string | null {
  const templateId = new URLSearchParams(search).get("template")?.trim();
  return templateId ? templateId : null;
}

function buildBlankGraph(): CanvasGraph {
  return {
    project: {
      name: "Blank Flow",
      target: "agno-python",
      runtime: {
        envVars: [],
        authEnabled: false,
        authToken: null,
      },
    },
    nodes: [],
    edges: [],
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createDefaultProjectRuntime(): ProjectRuntimeConfig {
  return {
    envVars: [],
    authEnabled: false,
    authToken: null,
  };
}

function normalizeProjectRuntime(value: unknown): ProjectRuntimeConfig {
  const runtime = isObjectRecord(value) ? value : {};
  const rawEnvVars = Array.isArray(runtime.envVars) ? runtime.envVars : [];

  return {
    envVars: rawEnvVars.map((item) => ({
      key: isObjectRecord(item) ? fieldValueAsString(item.key) : "",
      value: isObjectRecord(item) ? fieldValueAsString(item.value) : "",
    })),
    authEnabled: Boolean(runtime.authEnabled),
    authToken: runtime.authToken == null ? null : fieldValueAsString(runtime.authToken),
  };
}

function getGraphProjectRuntime(graph: CanvasGraph | null): ProjectRuntimeConfig {
  return normalizeProjectRuntime(graph?.project?.runtime);
}

function getGraphAuthToken(graph: CanvasGraph | null): string {
  const runtime = getGraphProjectRuntime(graph);
  return runtime.authEnabled ? fieldValueAsString(runtime.authToken).trim() : "";
}

function createClientSecret(prefix: string): string {
  const rawToken =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${rawToken.slice(0, 24)}`;
}

function normalizeImportedNodeData(value: unknown, fallbackName: string): NodeData {
  const rawData = isObjectRecord(value) ? value : {};
  const temperatureValue =
    typeof rawData.temperature === "number"
      ? rawData.temperature
      : typeof rawData.temperature === "string"
        ? Number(rawData.temperature)
        : null;

  return {
    name: fieldValueAsString(rawData.name) || fallbackName,
    description: rawData.description == null ? null : fieldValueAsString(rawData.description),
    instructions: rawData.instructions == null ? null : fieldValueAsString(rawData.instructions),
    provider: rawData.provider == null ? null : fieldValueAsString(rawData.provider),
    model: rawData.model == null ? null : fieldValueAsString(rawData.model),
    temperature: Number.isFinite(temperatureValue) ? temperatureValue : null,
    tools: Array.isArray(rawData.tools) ? rawData.tools.map((item) => fieldValueAsString(item)).filter(Boolean) : [],
    prompt: rawData.prompt == null ? null : fieldValueAsString(rawData.prompt),
    condition: rawData.condition == null ? null : fieldValueAsString(rawData.condition),
    output_format: rawData.output_format == null ? null : fieldValueAsString(rawData.output_format),
    extras: isObjectRecord(rawData.extras) ? rawData.extras : {},
  };
}

function normalizeImportedFlowPayload(rawValue: unknown): { graph: CanvasGraph; flowName: string } | null {
  const root = isObjectRecord(rawValue) ? rawValue : null;
  const graphCandidate = root && isObjectRecord(root.graph) ? root.graph : root;
  if (!graphCandidate || !isObjectRecord(graphCandidate)) {
    return null;
  }

  const rawNodes = Array.isArray(graphCandidate.nodes) ? graphCandidate.nodes : null;
  const rawEdges = Array.isArray(graphCandidate.edges) ? graphCandidate.edges : null;
  if (!rawNodes || !rawEdges) {
    return null;
  }

  const nodes: GraphNode[] = rawNodes.map((rawNode, index) => {
    if (!isObjectRecord(rawNode)) {
      throw new Error("Invalid node entry in imported flow.");
    }

    const type = fieldValueAsString(rawNode.type) as NodeType;
    if (!type || !(type in NODE_CATALOG)) {
      throw new Error(`Unsupported node type in imported flow: ${fieldValueAsString(rawNode.type) || "(empty)"}`);
    }

    const rawPosition = isObjectRecord(rawNode.position) ? rawNode.position : {};
    const positionX = typeof rawPosition.x === "number" ? rawPosition.x : Number(rawPosition.x ?? 0);
    const positionY = typeof rawPosition.y === "number" ? rawPosition.y : Number(rawPosition.y ?? 0);

    return {
      id: fieldValueAsString(rawNode.id) || `${type}_${index + 1}`,
      type,
      position: {
        x: Number.isFinite(positionX) ? positionX : 0,
        y: Number.isFinite(positionY) ? positionY : 0,
      },
      data: normalizeImportedNodeData(rawNode.data, `${NODE_CATALOG[type].label} ${index + 1}`),
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GraphEdge[] = rawEdges.map((rawEdge, index) => {
    if (!isObjectRecord(rawEdge)) {
      throw new Error("Invalid edge entry in imported flow.");
    }

    const source = fieldValueAsString(rawEdge.source);
    const target = fieldValueAsString(rawEdge.target);
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
      throw new Error("Imported flow contains an edge with missing source or target nodes.");
    }

    return {
      id: fieldValueAsString(rawEdge.id) || `edge_${index + 1}`,
      source,
      target,
      source_handle: rawEdge.source_handle == null ? null : fieldValueAsString(rawEdge.source_handle),
      target_handle: rawEdge.target_handle == null ? null : fieldValueAsString(rawEdge.target_handle),
    };
  });

  const rawProject = isObjectRecord(graphCandidate.project) ? graphCandidate.project : {};
  const projectName =
    fieldValueAsString(rawProject.name) ||
    fieldValueAsString(root?.project_name) ||
    fieldValueAsString(root?.name) ||
    "Imported Flow";
  const targetValue = fieldValueAsString(rawProject.target);
  const graph: CanvasGraph = {
    project: {
      name: projectName,
      target: targetValue === "agnogo" ? "agnogo" : "agno-python",
      runtime: normalizeProjectRuntime(rawProject.runtime),
    },
    nodes,
    edges,
  };

  const flowName =
    slugifyFlowName(fieldValueAsString(root?.flow_name) || fieldValueAsString(root?.name) || projectName) ||
    "imported_flow";

  return { graph, flowName };
}

function normalizeDebugToken(value: unknown): string {
  return fieldValueAsString(value).trim().toLowerCase();
}

function toSnakeCase(value: unknown): string {
  return fieldValueAsString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractFunctionNameFromCode(code: unknown): string {
  const text = fieldValueAsString(code);
  const match = text.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  return match?.[1]?.toLowerCase() ?? "";
}

function parseDebugObservation(runResult: RunResult | null): DebugObservation {
  const agentStatuses = new Map<string, "running" | "completed">();
  const toolStatuses = new Map<string, "running" | "completed">();
  const stdout = runResult?.stdout ?? "";
  let hasDebugLogs = false;
  let insideToolCallsSection = false;
  let currentRunnerToken = "";

  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("[debug]")) {
      hasDebugLogs = true;

      const genericAgentMatch = line.match(/^\[debug\]\[(.+?)\]/);
      if (genericAgentMatch) {
        const agentName = normalizeDebugToken(genericAgentMatch[1]);
        if (!agentStatuses.has(agentName)) {
          agentStatuses.set(agentName, "running");
        }
      }

      const runStartedMatch = line.match(/^\[debug\]\[(.+?)\]\s+RunStarted\b/);
      if (runStartedMatch) {
        agentStatuses.set(normalizeDebugToken(runStartedMatch[1]), "running");
      }

      const runCompletedMatch = line.match(/^\[debug\]\[(.+?)\]\s+RunCompleted\b/);
      if (runCompletedMatch) {
        agentStatuses.set(normalizeDebugToken(runCompletedMatch[1]), "completed");
      }

      const agentMatch = line.match(/^\[debug\]\[(.+?)\]\s+ToolCall(?:Started|Completed|Error)\b/);
      if (agentMatch) {
        const agentName = normalizeDebugToken(agentMatch[1]);
        if (!agentStatuses.has(agentName)) {
          agentStatuses.set(agentName, "running");
        }
      }

      const toolStartedMatch = line.match(/ToolCallStarted\b.*\btool=([^\s]+)/);
      if (toolStartedMatch) {
        toolStatuses.set(normalizeDebugToken(toolStartedMatch[1]), "running");
      }

      const toolCompletedMatch = line.match(/ToolCall(?:Completed|Error)\b.*\btool=([^\s]+)/);
      if (toolCompletedMatch) {
        toolStatuses.set(normalizeDebugToken(toolCompletedMatch[1]), "completed");
      }

      continue;
    }

    if (!line.startsWith("DEBUG")) {
      if (insideToolCallsSection && line.trim() === "") {
        insideToolCallsSection = false;
      }
      continue;
    }

    hasDebugLogs = true;

    const agnoRunnerIdMatch = line.match(/^DEBUG\s+\*+\s+(Agent|Team) ID:\s+(.+?)\s+\*+/);
    if (agnoRunnerIdMatch) {
      currentRunnerToken = toSnakeCase(agnoRunnerIdMatch[2]);
      if (currentRunnerToken) {
        agentStatuses.set(currentRunnerToken, "running");
      }
      continue;
    }

    if (/^DEBUG Tool Calls:/.test(line)) {
      insideToolCallsSection = true;
      continue;
    }

    if (/^DEBUG ======================== assistant =========================/.test(line)) {
      insideToolCallsSection = false;
    }

    const agnoRunStartMatch = line.match(/(?:Agent|Team) Run Start:/);
    if (agnoRunStartMatch && currentRunnerToken) {
      agentStatuses.set(currentRunnerToken, "running");
      continue;
    }

    const agnoRunEndMatch = line.match(/(?:Agent|Team) Run End:/);
    if (agnoRunEndMatch && currentRunnerToken) {
      agentStatuses.set(currentRunnerToken, "completed");
      continue;
    }

    const agnoAssistantMatch = line.match(/^DEBUG O total|^DEBUG [^\s].+/);
    if (agnoAssistantMatch && currentRunnerToken && !agentStatuses.has(currentRunnerToken)) {
      agentStatuses.set(currentRunnerToken, "running");
    }

    const agnoToolAddedMatch = line.match(/^DEBUG Added tool\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (agnoToolAddedMatch) {
      const toolName = normalizeDebugToken(agnoToolAddedMatch[1]);
      if (!toolStatuses.has(toolName)) {
        toolStatuses.set(toolName, "running");
      }
    }

    const agnoToolRunningMatch = line.match(/^DEBUG Running:\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (agnoToolRunningMatch) {
      toolStatuses.set(normalizeDebugToken(agnoToolRunningMatch[1]), "completed");
      continue;
    }

    if (insideToolCallsSection) {
      const toolNameMatch = line.match(/^\s*Name:\s+'([^']+)'/);
      if (toolNameMatch) {
        toolStatuses.set(normalizeDebugToken(toolNameMatch[1]), "completed");
        continue;
      }
    }
  }

  return {
    agentStatuses,
    toolStatuses,
    hasDebugLogs,
  };
}

function deriveNodeRunBadges(graph: CanvasGraph | null, observation: DebugObservation): Record<string, NodeRunBadge> {
  if (!graph || !observation.hasDebugLogs) {
    return {};
  }

  const badges: Record<string, NodeRunBadge> = {};
  const propagatedStatuses = new Map<string, "running" | "completed">();
  const incomingByNode = new Map<string, string[]>();
  const outgoingByNode = new Map<string, string[]>();

  for (const node of graph.nodes) {
    incomingByNode.set(node.id, []);
    outgoingByNode.set(node.id, []);
  }

  for (const edge of graph.edges) {
    incomingByNode.get(edge.target)?.push(edge.source);
    outgoingByNode.get(edge.source)?.push(edge.target);
  }

  for (const node of graph.nodes) {
    if (node.type === "agent" || node.type === "team") {
      const agentConfig = (node.data.extras?.agentConfig as Record<string, unknown> | undefined) ?? {};
      const candidates = [
        normalizeDebugToken(node.data.name),
        toSnakeCase(node.data.name),
        normalizeDebugToken(agentConfig.id),
        toSnakeCase(agentConfig.id),
      ].filter(Boolean);
      const status = candidates
        .map((candidate) => observation.agentStatuses.get(candidate))
        .find(Boolean);
      if (status) {
        propagatedStatuses.set(node.id, status);
        badges[node.id] = {
          text: status === "completed" ? "Completed" : "Running",
          variant: status === "completed" ? "completed" : "running",
          title: `${node.data.name} appeared in the latest run logs.`,
        };
      }
      continue;
    }

    if (node.type === "tool") {
      const candidates = [
        normalizeDebugToken(node.data.extras?.functionName),
        toSnakeCase(node.data.extras?.functionName),
        extractFunctionNameFromCode(node.data.extras?.functionCode),
        normalizeDebugToken(node.data.extras?.builtinClassName),
        toSnakeCase(node.data.extras?.builtinClassName),
        normalizeDebugToken(node.data.extras?.builtinToolKey),
        toSnakeCase(node.data.extras?.builtinToolKey),
        normalizeDebugToken(node.data.name),
        toSnakeCase(node.data.name),
      ].filter(Boolean);

      const matchedStatus = candidates
        .map((candidate) => observation.toolStatuses.get(candidate))
        .find(Boolean);

      if (matchedStatus) {
        badges[node.id] = {
          text: matchedStatus === "completed" ? "Completed" : "Running",
          variant: matchedStatus === "completed" ? "tool-completed" : "running",
          title: `${node.data.name} appeared in the latest tool logs.`,
        };
      }
    }
  }

  if (propagatedStatuses.size === 0) {
    return badges;
  }

  const queue = [...propagatedStatuses.entries()];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    const [nodeId, status] = next;
    const neighbors = [...(incomingByNode.get(nodeId) ?? []), ...(outgoingByNode.get(nodeId) ?? [])];
    for (const neighborId of neighbors) {
      const neighborNode = graph.nodes.find((node) => node.id === neighborId);
      if (!neighborNode || neighborNode.type === "tool") {
        continue;
      }

      const currentStatus = propagatedStatuses.get(neighborId);
      if (currentStatus === "completed" || currentStatus === status) {
        continue;
      }

      propagatedStatuses.set(neighborId, status);
      queue.push([neighborId, status]);
    }
  }

  for (const node of graph.nodes) {
    const propagatedStatus = propagatedStatuses.get(node.id);
    if (badges[node.id] || !propagatedStatus) {
      continue;
    }

    badges[node.id] = {
      text: propagatedStatus === "completed" ? "Completed" : "Running",
      variant: propagatedStatus === "completed" ? "completed" : "running",
      title: `${node.data.name} is part of the connected path from the latest run.`,
    };
  }

  return badges;
}

function updateNodeData(graph: CanvasGraph | null, nodeId: string, patch: Partial<NodeData>): CanvasGraph | null {
  if (!graph) {
    return graph;
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              ...patch,
            },
          }
        : node,
    ),
  };
}

function createNodeId(graph: CanvasGraph, type: keyof typeof NODE_CATALOG): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now()}_${graph.nodes.length + 1}`;

  return `${type}_${randomPart}`;
}

function createNodePosition(graph: CanvasGraph): { x: number; y: number } {
  const baseX = 280;
  const baseY = 240;
  const perRow = 3;
  const index = graph.nodes.length;
  return {
    x: baseX + (index % perRow) * 230,
    y: baseY + Math.floor(index / perRow) * 170,
  };
}

function centerGraphInCanvas(graph: CanvasGraph, canvasWidth: number, canvasHeight: number): CanvasGraph {
  if (graph.nodes.length === 0) {
    return graph;
  }

  const minX = Math.min(...graph.nodes.map((node) => node.position.x));
  const minY = Math.min(...graph.nodes.map((node) => node.position.y));
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x + NODE_WIDTH));
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y + NODE_MIN_HEIGHT));

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;

  const usableLeft = 60;
  const usableRight = 60;
  const usableTop = 210;
  const usableBottom = 60;
  const usableWidth = Math.max(320, canvasWidth - usableLeft - usableRight);
  const usableHeight = Math.max(240, canvasHeight - usableTop - usableBottom);

  const targetMinX = usableLeft + Math.max(0, (usableWidth - graphWidth) / 2);
  const targetMinY = usableTop + Math.max(0, (usableHeight - graphHeight) / 2);
  const offsetX = targetMinX - minX;
  const offsetY = targetMinY - minY;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: {
        x: Math.max(24, node.position.x + offsetX),
        y: Math.max(24, node.position.y + offsetY),
      },
    })),
  };
}

function getAgentConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.agentConfig as Record<string, unknown> | undefined) ?? {};
}

function updateAgentConfig(data: NodeData, key: string, value: unknown): NodeData {
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

function getTeamConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.teamConfig as Record<string, unknown> | undefined) ?? {};
}

function updateTeamConfig(data: NodeData, key: string, value: unknown): NodeData {
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

function getWorkflowConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.workflowConfig as Record<string, unknown> | undefined) ?? {};
}

function updateWorkflowConfig(data: NodeData, key: string, value: unknown): NodeData {
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

function getProviderConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.providerConfig as Record<string, unknown> | undefined) ?? {};
}

function updateProviderConfig(data: NodeData, key: string, value: unknown): NodeData {
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

function applyProviderPreset(data: NodeData, providerPresetId: string): NodeData {
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

function updateToolConfig(data: NodeData, patch: Record<string, unknown>): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      ...patch,
    },
  };
}

function createBuiltInToolData(tool: BuiltInToolDefinition, index: number): NodeData {
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

function createSavedToolNodeData(tool: SavedUserTool): NodeData {
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

function createStarterToolNodeData(tool: StarterToolTemplate): NodeData {
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

function toPythonString(value: string): string {
  return JSON.stringify(value);
}

function buildSqliteDbFilePath(directory: string, dbName: string): string {
  const normalizedDirectory = fieldValueAsString(directory).trim().replace(/[\\/]+$/, "");
  const normalizedName = fieldValueAsString(dbName).trim() || "agno";
  return normalizedDirectory ? `${normalizedDirectory}/${normalizedName}.db` : `${normalizedName}.db`;
}

function getDefaultVectorDbExtras(vectorPreset: VectorDbPresetKey): Record<string, unknown> {
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

function buildVectorDbExpressionFromExtras(vectorPreset: VectorDbPresetKey, extras: Record<string, unknown> | undefined): string {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePythonStringKwarg(expression: string, key: string): string | null {
  const match = expression.match(new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')`));
  if (!match) {
    return null;
  }
  const raw = match[1];
  return raw.slice(1, -1).replace(/\\\\/g, "\\").replace(/\\"/g, "\"").replace(/\\'/g, "'");
}

function parsePythonNumberKwarg(expression: string, key: string): string | null {
  const match = expression.match(new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match?.[1] ?? null;
}

function resolveVectorDbConfig(vectorPreset: VectorDbPresetKey, extras: Record<string, unknown> | undefined): Record<string, unknown> {
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

function hasStructuredVectorDbConfig(vectorPreset: VectorDbPresetKey, extras: Record<string, unknown> | undefined): boolean {
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

function getDefaultKnowledgeExtras(variant: "knowledge" | "knowledge_contents"): Record<string, unknown> {
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

function getDefaultSkillsExtras(): Record<string, unknown> {
  return {
    skillsPath: "examples/skills/support-response-style",
    skillsValidate: true,
  };
}

function buildSkillsExpressionFromExtras(extras: Record<string, unknown> | undefined): string {
  const safeExtras = {
    ...getDefaultSkillsExtras(),
    ...(extras ?? {}),
  };
  const path = fieldValueAsString(safeExtras.skillsPath).trim();
  const validate = safeExtras.skillsValidate !== false;
  return `Skills(loaders=[LocalSkills(path=${toPythonString(path)}, validate=${validate ? "True" : "False"})])`;
}

function buildKnowledgeExpressionFromExtras(
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

function buildKnowledgeExpression(vectorPreset: VectorDbPresetKey): string {
  return buildKnowledgeExpressionFromExtras(
    {
      ...getDefaultKnowledgeExtras("knowledge"),
      vectorExpression: buildVectorDbExpression(vectorPreset),
    },
    buildVectorDbExpression(vectorPreset),
  );
}

function buildVectorDbExpression(vectorPreset: VectorDbPresetKey): string {
  return buildVectorDbExpressionFromExtras(vectorPreset, getDefaultVectorDbExtras(vectorPreset));
}

function buildDatabaseExpression(preset: DatabasePresetKey): string {
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

function buildDatabaseExpressionFromExtras(preset: DatabasePresetKey, extras: Record<string, unknown> | undefined): string {
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

function buildManagerExpressionFromExtras(
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

function getDefaultLearningMachineExtras(): Record<string, unknown> {
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

function buildLearningMachineExpressionFromExtras(
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

function listSupportedTimeZones(): string[] {
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

function getDefaultInterfaceExtras(): Record<string, unknown> {
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

function resolveInterfaceEnvName(rawValue: unknown, fallback: string): string {
  const candidate = fieldValueAsString(rawValue).trim();
  return candidate || fallback;
}

function buildInterfaceExpression(
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

function createInterfaceNodeData(preset: InterfacePresetKey): NodeData {
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

function createDatabaseNodeData(preset: DatabasePresetKey): NodeData {
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

function createVectorDbNodeData(preset: VectorDbPresetKey): NodeData {
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

function createKnowledgeNodeData(variant: "knowledge" | "knowledge_contents"): NodeData {
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

function createSkillsNodeData(): NodeData {
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

function createLearningMachineNodeData(): NodeData {
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

function createEmailInputNodeData(index: number): NodeData {
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

function createWebhookInputNodeData(index: number): NodeData {
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

function createWhatsappInputNodeData(index: number): NodeData {
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

function createFormInputNodeData(index: number): NodeData {
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

function createEmailOutputNodeData(index: number): NodeData {
  return {
    name: `Email Send Output ${index}`,
    output_format: "text",
    extras: {
      ...NODE_CATALOG.output_api.createData(index).extras,
      outputMode: "email",
    },
  };
}

function createChatOutputNodeData(index: number): NodeData {
  return {
    name: `Chat Message Output ${index}`,
    output_format: "json",
    extras: {
      ...NODE_CATALOG.output_api.createData(index).extras,
      outputMode: "chat",
    },
  };
}

function createSpreadsheetOutputNodeData(index: number): NodeData {
  return {
    name: `Spreadsheet Output ${index}`,
    output_format: "json",
    extras: {
      ...NODE_CATALOG.output_api.createData(index).extras,
      outputMode: "spreadsheet",
    },
  };
}

function createManagerNodeData(type: "memory_manager" | "session_summary_manager" | "compression_manager"): NodeData {
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


function getToolMode(data: NodeData): "builtin" | "function" {
  return (data.extras?.toolMode as "builtin" | "function" | undefined) ?? "builtin";
}

function getInputSource(data: NodeData): "manual" | "email" | "webhook" | "whatsapp" | "form" {
  return (data.extras?.inputSource as "manual" | "email" | "webhook" | "whatsapp" | "form" | undefined) ?? "manual";
}

function getInputMode(data: NodeData): "text" | "file" | "mixed" {
  return (data.extras?.inputMode as "text" | "file" | "mixed" | undefined) ?? "text";
}

function getOutputMode(data: NodeData): "api" | "email" | "chat" | "spreadsheet" {
  return (data.extras?.outputMode as "api" | "email" | "chat" | "spreadsheet" | undefined) ?? "api";
}

function getChatProvider(data: NodeData): "slack" | "discord" | "telegram" | "generic" | "whatsapp" {
  return (data.extras?.chatProvider as "slack" | "discord" | "telegram" | "generic" | "whatsapp" | undefined) ?? "slack";
}

function getEmailProtocol(data: NodeData): "imap" | "pop" {
  return (data.extras?.emailProtocol as "imap" | "pop" | undefined) ?? "imap";
}

function getEmailSecurity(data: NodeData): "ssl" | "starttls" | "none" {
  return (data.extras?.emailSecurity as "ssl" | "starttls" | "none" | undefined) ?? "ssl";
}

function getDefaultEmailPort(protocol: "imap" | "pop", security: "ssl" | "starttls" | "none"): string {
  if (protocol === "pop") {
    return security === "ssl" ? "995" : "110";
  }
  return security === "ssl" ? "993" : "143";
}

function fieldValueAsString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getInputText(data: NodeData): string {
  return fieldValueAsString(data.extras?.inputText ?? data.prompt);
}

function getAttachedFileName(data: NodeData): string {
  return fieldValueAsString(data.extras?.attachedFileName);
}

function updateInputNodePayload(graph: CanvasGraph, payload: ChatDraft): CanvasGraph {
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

function getPrimaryInputNode(graph: CanvasGraph | null): { id: string; data: NodeData } | null {
  if (!graph) {
    return null;
  }
  const node = graph.nodes.find((candidate) => candidate.type === "input");
  if (!node) {
    return null;
  }
  return { id: node.id, data: node.data };
}

function getCanvasNodeLabel(data: NodeData, type: keyof typeof NODE_CATALOG): string {
  if (type === "tool") {
    const mode = getToolMode(data);
    if (mode === "builtin") {
      return fieldValueAsString(data.extras?.builtinClassName) || "Built-in Tool";
    }
    return "Function Tool";
  }

  return NODE_CATALOG[type].label;
}

function getCanvasNodeMeta(node: { type: keyof typeof NODE_CATALOG; data: NodeData }): string {
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

  if (node.type === "input") {
    const inputSource = getInputSource(node.data);
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

function getNodeVisualIcon(node: { type: keyof typeof NODE_CATALOG; data: NodeData }) {
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

function parseFieldValue(field: AgentFieldDefinition, rawValue: string, checked: boolean): unknown {
  if (field.type === "checkbox") {
    return checked;
  }

  if (field.type === "number") {
    return rawValue === "" ? undefined : Number(rawValue);
  }

  return rawValue;
}

function renderInspectorPropertyLabel(label: string, helper: string, required = false) {
  return (
    <span className="field-label-row">
      <span>
        {label}
        {required ? <span className="required-mark">*</span> : null}
      </span>
      <div className="property-help">
        <button type="button" className="help-button" onClick={(event) => event.preventDefault()}>
          ?
        </button>
        <div className="help-tooltip">
          <strong>{label}</strong>
          <p>{helper}</p>
        </div>
      </div>
    </span>
  );
}

function NodeIcon({ type }: { type: keyof typeof NODE_CATALOG }) {
  if (type === "input") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h10" />
        <path d="M10 6l6 6-6 6" />
      </svg>
    );
  }

  if (
    type === "rabbitmq_input"
    || type === "kafka_input"
    || type === "redis_input"
    || type === "nats_input"
    || type === "sqs_input"
    || type === "pubsub_input"
  ) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M6 12h8" />
        <path d="M12 9l4 3-4 3" />
      </svg>
    );
  }

  if (
    type === "rabbitmq_output"
    || type === "kafka_output"
    || type === "redis_output"
    || type === "nats_output"
    || type === "sqs_output"
    || type === "pubsub_output"
  ) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M10 9l-4 3 4 3" />
        <path d="M10 12h8" />
      </svg>
    );
  }

  if (type === "agent") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6.5 19c1.2-3 3.1-4.5 5.5-4.5S16.3 16 17.5 19" />
      </svg>
    );
  }

  if (type === "database") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
        <path d="M5.5 6.5v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-8" />
        <path d="M5.5 10.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
      </svg>
    );
  }

  if (type === "vector_db") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
        <path d="M5.5 6.5v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-8" />
        <path d="M8 12h8" />
        <path d="M12 10v4" />
      </svg>
    );
  }

  if (type === "knowledge") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5h12v14H6z" />
        <path d="M9 9h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }

  if (type === "skills") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7h10v10H7z" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M5 12h2" />
        <path d="M17 12h2" />
      </svg>
    );
  }

  if (type === "interface") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="12" rx="2" />
        <path d="M8 9h8" />
        <path d="M12 17v3" />
        <path d="M9 20h6" />
      </svg>
    );
  }

  if (type === "learning_machine") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="8" r="2.25" />
        <circle cx="16" cy="8" r="2.25" />
        <circle cx="12" cy="16" r="2.25" />
        <path d="M9.8 9.2l1.4 4.2" />
        <path d="M14.2 9.2l-1.4 4.2" />
        <path d="M10.2 8h3.6" />
      </svg>
    );
  }

  if (type === "memory_manager") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="6" width="14" height="12" rx="2" />
        <path d="M9 10h6" />
        <path d="M12 10v4" />
        <path d="M10 14h4" />
      </svg>
    );
  }

  if (type === "session_summary_manager") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5h10v12H7z" />
        <path d="M10 9h4" />
        <path d="M9 13h6" />
        <path d="M12 17v2" />
      </svg>
    );
  }

  if (type === "compression_manager") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="6" width="14" height="12" rx="2" />
        <path d="M9 10h6" />
        <path d="M9 14h4" />
        <path d="M17 9l-2 3 2 3" />
      </svg>
    );
  }

  if (type === "team") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="9" r="2.5" />
        <circle cx="16" cy="9" r="2.5" />
        <path d="M4.5 18c.9-2.4 2.3-3.6 3.5-3.6S10.6 15.6 11.5 18" />
        <path d="M12.5 18c.9-2.4 2.3-3.6 3.5-3.6s2.6 1.2 3.5 3.6" />
      </svg>
    );
  }

  if (type === "workflow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="14" rx="2" />
        <path d="M8 9h8" />
        <path d="M8 12h5" />
        <path d="M8 15h8" />
      </svg>
    );
  }

  if (type === "workflow_step") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7.5" cy="12" r="2" />
        <rect x="11" y="8" width="8" height="8" rx="1.5" />
        <path d="M9.5 12H11" />
      </svg>
    );
  }

  if (type === "condition") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l8 9-8 9-8-9 8-9z" />
      </svg>
    );
  }

  if (type === "tool") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.5 5.5a4 4 0 0 0-5 5L5 15l4 4 4.5-4.5a4 4 0 0 0 5-5l-2.5 2.5-3-3L14.5 5.5z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9 10h6" />
      <path d="M9 14h4" />
    </svg>
  );
}

export default function App() {
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const flowImportInputRef = useRef<HTMLInputElement | null>(null);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const hasAutoCenteredRef = useRef(false);
  const ignoreCanvasClickRef = useRef(false);
  const pendingImportedGraphRef = useRef<CanvasGraph | null>(null);
  const pendingImportedFlowNameRef = useRef("imported_flow");
  const hitlRunConfirmResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const lastPersistedFlowSnapshotRef = useRef("");
  const autosaveTimeoutRef = useRef<number | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [currentSearch, setCurrentSearch] = useState<string>(() => window.location.search);
  const [graph, setGraph] = useState<CanvasGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"properties" | "code" | "runtime">("properties");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [canvasPanState, setCanvasPanState] = useState<CanvasPanState | null>(null);
  const [canvasOffset, setCanvasOffset] = useState<PointerPosition>({ x: 0, y: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [editingFunctionNodeId, setEditingFunctionNodeId] = useState<string | null>(null);
  const [myTools, setMyTools] = useState<SavedUserTool[]>([]);
  const [connectionPointer, setConnectionPointer] = useState<PointerPosition | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [librarySearchInput, setLibrarySearchInput] = useState("");
  const [outputResponseOnly, setOutputResponseOnly] = useState(false);
  const [flowName, setFlowName] = useState("support_agent_flow");
  const [savedFlows, setSavedFlows] = useState<FlowSummary[]>([]);
  const [runByNameInputText, setRunByNameInputText] = useState("");
  const [runByNameMetadata, setRunByNameMetadata] = useState("{}\n");
  const [isSavingFlow, setIsSavingFlow] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [isRunningSavedFlow, setIsRunningSavedFlow] = useState(false);
  const [savedFlowIntegrationModal, setSavedFlowIntegrationModal] = useState<SavedFlowIntegrationModalState | null>(null);
  const [activeIntegrationLanguage, setActiveIntegrationLanguage] = useState<IntegrationLanguage>("curl");
  const [didCopyIntegration, setDidCopyIntegration] = useState(false);
  const [webhookCurlModal, setWebhookCurlModal] = useState<WebhookCurlModalState | null>(null);
  const [didCopyWebhookCurl, setDidCopyWebhookCurl] = useState(false);
  const [whatsappSessionModal, setWhatsappSessionModal] = useState<WhatsappSessionModalState | null>(null);
  const [isUpdatingWhatsappSession, setIsUpdatingWhatsappSession] = useState(false);
  const [queueSubscriberStatusByNodeId, setQueueSubscriberStatusByNodeId] = useState<Record<string, QueueSubscriberStatus>>({});
  const [flowRuntimeStatusByName, setFlowRuntimeStatusByName] = useState<Record<string, FlowRuntimeStatus>>({});
  const [isUpdatingQueueSubscriber, setIsUpdatingQueueSubscriber] = useState(false);
  const [isLoadingRouteFlow, setIsLoadingRouteFlow] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCodePreviewOpen, setIsCodePreviewOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState<ChatDraft>({
    text: "",
    metadata: "{}\n",
    fileAlias: "",
    fileName: "",
    fileMimeType: "",
    fileEncoding: "base64",
    fileBase64: "",
    fileContent: "",
  });
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);
  const [ollamaModelOptions, setOllamaModelOptions] = useState<string[]>([]);
  const [ollamaModelsRefreshKey, setOllamaModelsRefreshKey] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [homeSection, setHomeSection] = useState<"flows" | "models">("flows");
  const [canvasTemplates, setCanvasTemplates] = useState<CanvasTemplateSummary[]>([]);
  const [skillPathOptions, setSkillPathOptions] = useState<SkillPathOption[]>([]);
  const [isLoadingSkillPaths, setIsLoadingSkillPaths] = useState(false);
  const [skillPathsRefreshKey, setSkillPathsRefreshKey] = useState(0);
  const [builtInToolFunctionOptions, setBuiltInToolFunctionOptions] = useState<BuiltInToolFunctionOption[]>([]);
  const [isLoadingBuiltInToolFunctions, setIsLoadingBuiltInToolFunctions] = useState(false);
  const [builtInToolFunctionsError, setBuiltInToolFunctionsError] = useState<string | null>(null);
  const [isHitlRunConfirmOpen, setIsHitlRunConfirmOpen] = useState(false);
  const [hitlRunConfirmMessage, setHitlRunConfirmMessage] = useState("");
  const previousRuntimeActiveRunsRef = useRef(0);

  const isHomeRoute = currentPath === "/";
  const routeFlowName = useMemo(() => getFlowNameFromPath(currentPath), [currentPath]);
  const routeTemplateId = useMemo(() => getTemplateIdFromSearch(currentSearch), [currentSearch]);
  const flowDraftRouteKey = useMemo(() => buildFlowDraftRouteKey(routeFlowName, routeTemplateId), [routeFlowName, routeTemplateId]);
  const projectRuntime = getGraphProjectRuntime(graph);
  const projectRuntimeEnvVars = projectRuntime.envVars;
  const projectAuthEnabled = projectRuntime.authEnabled;
  const projectAuthToken = fieldValueAsString(projectRuntime.authToken);
  const currentFlowSnapshot = useMemo(() => buildPersistedFlowSnapshot(flowName, graph), [flowName, graph]);
  const normalizedActiveFlowName = useMemo(() => slugifyFlowName(flowName), [flowName]);
  const currentFlowRuntimeStatus = normalizedActiveFlowName ? flowRuntimeStatusByName[normalizedActiveFlowName] : undefined;

  useEffect(() => {
    listFlows()
      .then((flows) => {
        setSavedFlows(flows);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (isHomeRoute) {
      previousRuntimeActiveRunsRef.current = 0;
      return;
    }

    const normalizedFlowName = slugifyFlowName(flowName);
    if (!normalizedFlowName) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const statuses = await listFlowRuntimeStatuses(normalizedFlowName);
        if (cancelled) {
          return;
        }
        const status = statuses[0];
        if (status) {
          setFlowRuntimeStatusByName((current) => ({
            ...current,
            [normalizedFlowName]: status,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, 2000);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [flowName, isHomeRoute]);

  useEffect(() => {
    if (!currentFlowRuntimeStatus) {
      return;
    }
    const previousActiveRuns = previousRuntimeActiveRunsRef.current;
    const activeRuns = currentFlowRuntimeStatus.active_runs;
    if (previousActiveRuns === 0 && activeRuns > 0) {
      setConnectionMessage(`Flow '${flowName}' is processing external requests (${activeRuns} active).`);
    } else if (previousActiveRuns > 0 && activeRuns === 0) {
      setConnectionMessage(`Flow '${flowName}' finished processing queued external requests.`);
    }
    previousRuntimeActiveRunsRef.current = activeRuns;
  }, [currentFlowRuntimeStatus?.active_runs, flowName]);

  useEffect(() => {
    listCanvasTemplates()
      .then((templates) => {
        setCanvasTemplates(templates);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSkillPaths(true);
    listSkillPaths()
      .then((paths) => {
        if (!cancelled) {
          setSkillPathOptions(paths);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSkillPaths(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [skillPathsRefreshKey]);

  useEffect(() => {
    if (!graph || !skillPathOptions.length) {
      return;
    }

    const optionMap = new Map(skillPathOptions.map((option) => [option.path, option]));
    let hasUpdates = false;
    const nextNodes = graph.nodes.map((node) => {
      if (node.type !== "skills") {
        return node;
      }

      const extras = node.data.extras ?? {};
      const skillPath = fieldValueAsString(extras.skillsPath).trim();
      const selectedOption = optionMap.get(skillPath);
      if (!selectedOption || selectedOption.validates || extras.skillsValidate === false) {
        return node;
      }

      hasUpdates = true;
      return {
        ...node,
        data: {
          ...node.data,
          extras: {
            ...extras,
            skillsValidate: false,
            skillsExpression: buildSkillsExpressionFromExtras({
              ...extras,
              skillsValidate: false,
            }),
          },
        },
      };
    });

    if (!hasUpdates) {
      return;
    }

    setGraph({
      ...graph,
      nodes: nextNodes,
    });
  }, [graph, skillPathOptions]);

  useEffect(() => {
    if (!isChatOpen || !chatHistoryRef.current) {
      return;
    }

    chatHistoryRef.current.scrollTo({
      top: chatHistoryRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, isChatOpen]);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
      setCurrentSearch(window.location.search);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (isHomeRoute) {
      setGraph(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      setCanvasPanState(null);
      setCanvasOffset({ x: 0, y: 0 });
      setCanvasZoom(1);
      ignoreCanvasClickRef.current = false;
      pendingImportedGraphRef.current = null;
      pendingImportedFlowNameRef.current = "imported_flow";
      return;
    }

    const targetFlowName = routeFlowName ?? "";
    const targetDraftRouteKey = buildFlowDraftRouteKey(routeFlowName, routeTemplateId);
    if (!targetFlowName) {
      window.history.replaceState({}, "", "/");
      setCurrentPath("/");
      return;
    }

    let cancelled = false;

    async function loadFlowForRoute() {
      setIsLoadingRouteFlow(true);
      try {
        if (targetFlowName === "new") {
          if (pendingImportedGraphRef.current) {
            const importedGraph = pendingImportedGraphRef.current;
            const importedFlowName = pendingImportedFlowNameRef.current;
            pendingImportedGraphRef.current = null;
            pendingImportedFlowNameRef.current = "imported_flow";
            if (cancelled) {
              return;
            }
            hasAutoCenteredRef.current = false;
            setCanvasPanState(null);
            setCanvasOffset({ x: 0, y: 0 });
            setCanvasZoom(1);
            ignoreCanvasClickRef.current = false;
            lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot(importedFlowName || slugifyFlowName(importedGraph.project.name) || "imported_flow", importedGraph);
            setGraph(importedGraph);
            setFlowName(importedFlowName || slugifyFlowName(importedGraph.project.name) || "imported_flow");
            setAutosaveState("idle");
            setAutosaveError(null);
            setHomeError(null);
            setConnectionMessage(`Flow '${importedFlowName || importedGraph.project.name}' imported. Save to persist it.`);
            return;
          }

          const localDraft = loadFlowDraftFromStorage(targetDraftRouteKey);
          if (localDraft) {
            if (cancelled) {
              return;
            }
            hasAutoCenteredRef.current = false;
            setCanvasPanState(null);
            setCanvasOffset({ x: 0, y: 0 });
            setCanvasZoom(1);
            ignoreCanvasClickRef.current = false;
            lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot(localDraft.flowName || "new_flow", localDraft.graph);
            setGraph(localDraft.graph);
            setFlowName(localDraft.flowName || "new_flow");
            setAutosaveState("idle");
            setAutosaveError(null);
            setHomeError(null);
            setConnectionMessage("Local draft restored after reload.");
            return;
          }

          const defaultGraph = routeTemplateId ? await fetchCanvasTemplate(routeTemplateId) : await fetchDefaultGraph();
          if (cancelled) {
            return;
          }
          hasAutoCenteredRef.current = false;
          setCanvasPanState(null);
          setCanvasOffset({ x: 0, y: 0 });
          setCanvasZoom(1);
          ignoreCanvasClickRef.current = false;
          lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot(slugifyFlowName(defaultGraph.project.name) || "new_flow", defaultGraph);
          setGraph(defaultGraph);
          setFlowName(slugifyFlowName(defaultGraph.project.name) || "new_flow");
          setAutosaveState("idle");
          setAutosaveError(null);
          setHomeError(null);
          return;
        }

        if (targetFlowName === "blank") {
          const localDraft = loadFlowDraftFromStorage(targetDraftRouteKey);
          if (localDraft) {
            if (cancelled) {
              return;
            }
            hasAutoCenteredRef.current = false;
            setCanvasPanState(null);
            setCanvasOffset({ x: 0, y: 0 });
            setCanvasZoom(1);
            ignoreCanvasClickRef.current = false;
            lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot(localDraft.flowName || "blank_flow", localDraft.graph);
            setGraph(localDraft.graph);
            setFlowName(localDraft.flowName || "blank_flow");
            setAutosaveState("idle");
            setAutosaveError(null);
            setHomeError(null);
            setConnectionMessage("Local draft restored after reload.");
            return;
          }
          if (cancelled) {
            return;
          }
          hasAutoCenteredRef.current = false;
          setCanvasPanState(null);
          setCanvasOffset({ x: 0, y: 0 });
          setCanvasZoom(1);
          ignoreCanvasClickRef.current = false;
          const blankGraph = buildBlankGraph();
          lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot("blank_flow", blankGraph);
          setGraph(blankGraph);
          setFlowName("blank_flow");
          setAutosaveState("idle");
          setAutosaveError(null);
          setHomeError(null);
          return;
        }

        const record = await fetchFlowByName(targetFlowName);
        if (cancelled) {
          return;
        }
        const localDraft = loadFlowDraftFromStorage(targetDraftRouteKey);
        const nextGraph = localDraft?.graph ?? record.graph;
        const nextFlowName = localDraft?.flowName || slugifyFlowName(record.name) || record.name;
        hasAutoCenteredRef.current = false;
        setCanvasPanState(null);
        setCanvasOffset({ x: 0, y: 0 });
        setCanvasZoom(1);
        ignoreCanvasClickRef.current = false;
        lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot(slugifyFlowName(record.name) || record.name, record.graph);
        setGraph(nextGraph);
        setFlowName(nextFlowName);
        setAutosaveState("idle");
        setAutosaveError(null);
        setHomeError(null);
        if (localDraft) {
          setConnectionMessage("Local draft restored after reload.");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setHomeError(error instanceof Error ? error.message : "Failed to load flow from route.");
      } finally {
        if (!cancelled) {
          setIsLoadingRouteFlow(false);
        }
      }
    }

    loadFlowForRoute().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [isHomeRoute, routeFlowName, routeTemplateId]);

  useEffect(() => {
    const savedTools = window.localStorage.getItem(MY_TOOLS_STORAGE_KEY);
    if (!savedTools) {
      return;
    }
    try {
      setMyTools(JSON.parse(savedTools));
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MY_TOOLS_STORAGE_KEY, JSON.stringify(myTools));
  }, [myTools]);

  useEffect(() => {
    if (isHomeRoute || !graph || !flowDraftRouteKey) {
      return;
    }
    saveFlowDraftToStorage(flowDraftRouteKey, {
      flowName,
      graph,
      updatedAt: new Date().toISOString(),
    });
  }, [flowDraftRouteKey, flowName, graph, isHomeRoute]);

  useEffect(() => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    if (isHomeRoute || !graph || isLoadingRouteFlow) {
      return;
    }

    const normalizedName = slugifyFlowName(flowName);
    if (!normalizedName) {
      setAutosaveState("idle");
      return;
    }

    if (currentFlowSnapshot === lastPersistedFlowSnapshotRef.current) {
      if (autosaveState !== "error") {
        setAutosaveState("saved");
      }
      return;
    }

    if (isSavingFlow) {
      return;
    }

    setAutosaveState("pending");
    autosaveTimeoutRef.current = window.setTimeout(() => {
      saveCurrentFlow({
        openIntegrationModal: false,
        suppressSuccessMessage: true,
        source: "autosave",
      }).catch(console.error);
    }, FLOW_AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [autosaveState, currentFlowSnapshot, flowName, graph, isHomeRoute, isLoadingRouteFlow, isSavingFlow]);

  useEffect(() => {
    if (!whatsappSessionModal) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      const session = await loadWhatsappSessionState(whatsappSessionModal.flowName, whatsappSessionModal.nodeId);
      if (!cancelled && session) {
        setWhatsappSessionModal((current) =>
          current && current.flowName === whatsappSessionModal.flowName && current.nodeId === whatsappSessionModal.nodeId
            ? {
                ...current,
                session,
              }
            : current,
        );
      }
      if (!cancelled) {
        timeoutId = window.setTimeout(poll, 3000);
      }
    };

    timeoutId = window.setTimeout(poll, 3000);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [whatsappSessionModal?.flowName, whatsappSessionModal?.nodeId]);

  useEffect(() => {
    if (!graph) {
      return;
    }
    previewCode(graph)
      .then((response) => {
        setCode(response.code);
        setWarnings(response.warnings);
      })
      .catch(console.error);
  }, [graph]);

  useEffect(() => {
    if (!graph || !canvasRef.current || hasAutoCenteredRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) {
      return;
    }

    hasAutoCenteredRef.current = true;
    setGraph(centerGraphInCanvas(graph, rect.width, rect.height));
  }, [graph]);

  useEffect(() => {
    if (!dragState || !graph || !canvasRef.current) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) {
        return;
      }

      const nextX = Math.max(
        CANVAS_WORLD_MIN,
        Math.min(CANVAS_WORLD_MAX, (event.clientX - canvasRect.left - canvasOffset.x) / canvasZoom - dragState.offsetX),
      );
      const nextY = Math.max(
        CANVAS_WORLD_MIN,
        Math.min(CANVAS_WORLD_MAX, (event.clientY - canvasRect.top - canvasOffset.y) / canvasZoom - dragState.offsetY),
      );

      setGraph((currentGraph) => {
        if (!currentGraph) {
          return currentGraph;
        }

        return {
          ...currentGraph,
          nodes: currentGraph.nodes.map((node) =>
            node.id === dragState.nodeId
              ? {
                  ...node,
                  position: {
                    x: nextX,
                    y: nextY,
                  },
                }
              : node,
          ),
        };
      });
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [canvasOffset.x, canvasOffset.y, canvasZoom, dragState, graph]);

  useEffect(() => {
    if (!canvasPanState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - canvasPanState.startX;
      const deltaY = event.clientY - canvasPanState.startY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        ignoreCanvasClickRef.current = true;
      }

      setCanvasOffset({
        x: canvasPanState.originX + deltaX,
        y: canvasPanState.originY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setCanvasPanState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [canvasPanState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedNodeId && !selectedEdgeId) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.closest(".monaco-editor"));

      if (isEditableTarget) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selectedEdgeId) {
          deleteSelectedEdge();
          return;
        }
        deleteSelectedNode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNodeId, selectedEdgeId, graph, pendingConnectionSourceId, editingFunctionNodeId]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = graph?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedQueueNode = selectedNode && isQueueNodeType(selectedNode.type) ? selectedNode : null;
  const selectedQueueSubscriberStatus = selectedQueueNode ? queueSubscriberStatusByNodeId[selectedQueueNode.id] : undefined;
  const editingFunctionNode = graph?.nodes.find((node) => node.id === editingFunctionNodeId) ?? null;
  const nodeMap = useMemo(
    () => Object.fromEntries((graph?.nodes ?? []).map((node) => [node.id, node])),
    [graph],
  );

  useEffect(() => {
    if (!selectedQueueNode || !isQueueInputNodeType(selectedQueueNode.type)) {
      return;
    }

    const flowRouteName = slugifyFlowName(flowName);
    if (!flowRouteName || !savedFlows.some((flow) => flow.name === flowRouteName)) {
      return;
    }

    void loadQueueSubscriberStatus(flowRouteName, selectedQueueNode.id);
  }, [selectedQueueNode?.id, selectedQueueNode?.type, flowName, savedFlows]);

  useEffect(() => {
    if (!selectedNode || selectedNode.type !== "tool" || getToolMode(selectedNode.data) !== "builtin") {
      setBuiltInToolFunctionOptions([]);
      setBuiltInToolFunctionsError(null);
      setIsLoadingBuiltInToolFunctions(false);
      return;
    }

    const importPath = fieldValueAsString(selectedNode.data.extras?.builtinImportPath).trim();
    const className = fieldValueAsString(selectedNode.data.extras?.builtinClassName).trim();
    const config = fieldValueAsString(selectedNode.data.extras?.builtinConfig);

    if (!importPath || !className) {
      setBuiltInToolFunctionOptions([]);
      setBuiltInToolFunctionsError("Select a valid built-in tool to inspect its workflow functions.");
      setIsLoadingBuiltInToolFunctions(false);
      return;
    }

    let cancelled = false;
    setIsLoadingBuiltInToolFunctions(true);
    listBuiltInToolFunctions({ importPath, className, config })
      .then(({ functions, error }) => {
        if (cancelled) {
          return;
        }
        setBuiltInToolFunctionOptions(functions);
        setBuiltInToolFunctionsError(error ?? null);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          setBuiltInToolFunctionOptions([]);
          setBuiltInToolFunctionsError("Failed to inspect built-in tool functions.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBuiltInToolFunctions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedNode?.id,
    selectedNode?.type,
    selectedNode && selectedNode.type === "tool" ? getToolMode(selectedNode.data) : "",
    selectedNode && selectedNode.type === "tool" ? fieldValueAsString(selectedNode.data.extras?.builtinImportPath) : "",
    selectedNode && selectedNode.type === "tool" ? fieldValueAsString(selectedNode.data.extras?.builtinClassName) : "",
    selectedNode && selectedNode.type === "tool" ? fieldValueAsString(selectedNode.data.extras?.builtinConfig) : "",
  ]);

  useEffect(() => {
    if (!graph || !selectedNode || selectedNode.type !== "tool" || getToolMode(selectedNode.data) !== "builtin") {
      return;
    }
    if (!builtInToolFunctionOptions.length) {
      return;
    }

    const currentFunctionName = fieldValueAsString(selectedNode.data.extras?.builtinWorkflowFunction).trim();
    const hasCurrentFunction = builtInToolFunctionOptions.some((option) => option.name === currentFunctionName);
    if (hasCurrentFunction) {
      return;
    }

    setGraph(
      updateNodeData(
        graph,
        selectedNode.id,
        updateToolConfig(selectedNode.data, { builtinWorkflowFunction: builtInToolFunctionOptions[0].name }),
      ),
    );
  }, [builtInToolFunctionOptions, graph, selectedNode]);

  const selectedAgentResources = useMemo(() => {
    if (!graph || !selectedNode || selectedNode.type !== "agent") {
      return {
        database: null as GraphNode | null,
        vectorDb: null as GraphNode | null,
        knowledge: null as GraphNode | null,
        skills: null as GraphNode | null,
        learningMachine: null as GraphNode | null,
        memoryManager: null as GraphNode | null,
        sessionSummaryManager: null as GraphNode | null,
        compressionManager: null as GraphNode | null,
      };
    }

    const incomingNodes = graph.edges
      .filter((edge) => edge.target === selectedNode.id)
      .map((edge) => nodeMap[edge.source])
      .filter((node): node is GraphNode => Boolean(node));

    return {
      database: incomingNodes.find((node) => node.type === "database") ?? null,
      vectorDb: incomingNodes.find((node) => node.type === "vector_db") ?? null,
      knowledge: incomingNodes.find((node) => node.type === "knowledge") ?? null,
      skills: incomingNodes.find((node) => node.type === "skills") ?? null,
      learningMachine: incomingNodes.find((node) => node.type === "learning_machine") ?? null,
      memoryManager: incomingNodes.find((node) => node.type === "memory_manager") ?? null,
      sessionSummaryManager: incomingNodes.find((node) => node.type === "session_summary_manager") ?? null,
      compressionManager: incomingNodes.find((node) => node.type === "compression_manager") ?? null,
    };
  }, [graph, nodeMap, selectedNode]);
  const selectedTeamResources = useMemo(() => {
    if (!graph || !selectedNode || selectedNode.type !== "team") {
      return {
        database: null as GraphNode | null,
        vectorDb: null as GraphNode | null,
        knowledge: null as GraphNode | null,
        learningMachine: null as GraphNode | null,
        memoryManager: null as GraphNode | null,
        sessionSummaryManager: null as GraphNode | null,
        compressionManager: null as GraphNode | null,
      };
    }

    const incomingNodes = graph.edges
      .filter((edge) => edge.target === selectedNode.id)
      .map((edge) => nodeMap[edge.source])
      .filter((node): node is GraphNode => Boolean(node));

    return {
      database: incomingNodes.find((node) => node.type === "database") ?? null,
      vectorDb: incomingNodes.find((node) => node.type === "vector_db") ?? null,
      knowledge: incomingNodes.find((node) => node.type === "knowledge") ?? null,
      learningMachine: incomingNodes.find((node) => node.type === "learning_machine") ?? null,
      memoryManager: incomingNodes.find((node) => node.type === "memory_manager") ?? null,
      sessionSummaryManager: incomingNodes.find((node) => node.type === "session_summary_manager") ?? null,
      compressionManager: incomingNodes.find((node) => node.type === "compression_manager") ?? null,
    };
  }, [graph, nodeMap, selectedNode]);
  const displayedCode = useMemo(() => sanitizeGeneratedCode(code), [code]);
  const debugObservation = useMemo(() => parseDebugObservation(runResult), [runResult]);
  const nodeRunBadges = useMemo(() => deriveNodeRunBadges(graph, debugObservation), [graph, debugObservation]);
  const displayedStdout = useMemo(() => {
    if (outputResponseOnly && runResult?.clean_stdout) {
      return runResult.clean_stdout;
    }

    if (!runResult?.stdout) {
      return "";
    }
    if (!outputResponseOnly) {
      return runResult.stdout;
    }
    return extractAgentResponse(runResult.stdout);
  }, [runResult, outputResponseOnly]);
  const pendingSourceNode = pendingConnectionSourceId ? nodeMap[pendingConnectionSourceId] : null;
  const inputNode = useMemo(() => getPrimaryInputNode(graph), [graph]);
  const inputSource = useMemo(() => (inputNode ? getInputSource(inputNode.data) : "manual"), [inputNode]);
  const inputMode = useMemo(() => (inputNode ? getInputMode(inputNode.data) : "text"), [inputNode]);
  const chatSupportsFileUpload = inputSource !== "email" && (inputMode === "mixed" || inputMode === "file");
  const selectedAgentProvider = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      return "";
    }
    const providerConfig = getProviderConfig(selectedNode.data);
    const providerValue =
      fieldValueAsString(selectedNode.data.provider) || fieldValueAsString(providerConfig.provider_profile);
    return normalizeProviderId(providerValue);
  }, [selectedNode]);
  const timezoneOptions = useMemo(() => listSupportedTimeZones(), []);
  const selectedAgentProviderDefinition = useMemo(() => getProviderDefinition(selectedAgentProvider), [selectedAgentProvider]);
  const selectedAgentBaseUrl = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      return "";
    }
    const providerConfig = getProviderConfig(selectedNode.data);
    return fieldValueAsString(providerConfig.provider_base_url || selectedAgentProviderDefinition?.url || "");
  }, [selectedNode, selectedAgentProviderDefinition]);
  const chatHasText = chatDraft.text.trim().length > 0;
  const chatHasFile = Boolean(chatDraft.fileName);
  const canSendChatMessage =
    inputSource === "email"
      ? true
      : inputMode === "file"
      ? chatHasFile
      : inputMode === "mixed"
        ? chatHasText || chatHasFile
        : chatHasText;

  useEffect(() => {
    if (!inputNode) {
      return;
    }

    setChatDraft((current) => ({
      ...current,
      text: getInputText(inputNode.data),
      metadata: stringifyJsonObject(buildInputMetadataFromExtras(inputNode.data.extras)),
      fileAlias: fieldValueAsString(inputNode.data.extras?.attachedFileAlias),
      fileName: fieldValueAsString(inputNode.data.extras?.attachedFileName),
      fileMimeType: fieldValueAsString(inputNode.data.extras?.attachedFileMimeType),
      fileEncoding: fieldValueAsString(inputNode.data.extras?.attachedFileEncoding) || "base64",
      fileBase64: fieldValueAsString(inputNode.data.extras?.attachedFileBase64),
      fileContent: fieldValueAsString(inputNode.data.extras?.attachedFileContent),
    }));
  }, [inputNode?.id, inputNode?.data]);

  useEffect(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      setOllamaModelOptions([]);
      setIsLoadingOllamaModels(false);
      return;
    }

    if (!selectedAgentProviderDefinition?.supportsLocalModels || !selectedAgentProvider.startsWith("ollama")) {
      setOllamaModelOptions([]);
      setIsLoadingOllamaModels(false);
      return;
    }

    const targetNodeId = selectedNode.id;
    let cancelled = false;

    setIsLoadingOllamaModels(true);
    listOllamaModels(selectedAgentBaseUrl)
      .then((models) => {
        if (cancelled) {
          return;
        }
        setOllamaModelOptions(models);

        if (!models.length) {
          return;
        }

        setGraph((currentGraph) => {
          if (!currentGraph) {
            return currentGraph;
          }

          const targetNode = currentGraph.nodes.find((node) => node.id === targetNodeId && node.type === "agent");
          if (!targetNode) {
            return currentGraph;
          }

          const providerConfig = getProviderConfig(targetNode.data);
          const provider = normalizeProviderId(
            fieldValueAsString(targetNode.data.provider) || fieldValueAsString(providerConfig.provider_profile),
          );
          if (!provider.startsWith("ollama")) {
            return currentGraph;
          }

          const currentModel = fieldValueAsString(targetNode.data.model).trim();
          if (currentModel) {
            return currentGraph;
          }

          return {
            ...currentGraph,
            nodes: currentGraph.nodes.map((node) =>
              node.id === targetNodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      model: models[0],
                    },
                  }
                : node,
            ),
          };
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setOllamaModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOllamaModels(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode?.id, selectedAgentProvider, selectedAgentProviderDefinition, selectedAgentBaseUrl, ollamaModelsRefreshKey]);

  function isSectionOpen(sectionKey: string, defaultOpen = DEFAULT_SECTION_OPEN) {
    return openSections[sectionKey] ?? defaultOpen;
  }

  function toggleSection(sectionKey: string, defaultOpen = DEFAULT_SECTION_OPEN) {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? defaultOpen),
    }));
  }

  function formatToolLibraryTitle(tool: BuiltInToolDefinition) {
    return `${tool.description}\n\nPrerequisite: ${tool.prerequisite ?? "Check the tool setup before running."}`;
  }

  function addNode(type: keyof typeof NODE_CATALOG) {
    if (!graph) {
      return;
    }

    const definition = NODE_CATALOG[type];
    const nodeId = createNodeId(graph, type);
    const nextIndex = graph.nodes.filter((node) => node.type === type).length + 1;

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, type);
      const safeNextIndex = currentGraph.nodes.filter((node) => node.type === type).length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type,
            position: createNodePosition(currentGraph),
            data: definition.createData(safeNextIndex),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${definition.label} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addConfiguredInputNode(createData: (index: number) => NodeData, message: string) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "input");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "input");
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "input").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "input",
            position: createNodePosition(currentGraph),
            data: createData(nextIndex),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(message);
    setActiveRightTab("properties");
  }

  function addEmailInputNode() {
    addConfiguredInputNode(createEmailInputNodeData, "Email Inbox Input added to canvas.");
  }

  function addWebhookInputNode() {
    addConfiguredInputNode(createWebhookInputNodeData, "Webhook Input added to canvas.");
  }

  function addWhatsappInputNode() {
    addConfiguredInputNode(createWhatsappInputNodeData, "WhatsApp Input added to canvas.");
  }

  function addFormInputNode() {
    addConfiguredInputNode(createFormInputNodeData, "Form Submission Input added to canvas.");
  }

  function addConfiguredOutputNode(createData: (index: number) => NodeData, message: string) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "output_api");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "output_api");
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "output_api").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "output_api",
            position: createNodePosition(currentGraph),
            data: createData(nextIndex),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(message);
    setActiveRightTab("properties");
  }

  function addEmailOutputNode() {
    addConfiguredOutputNode(createEmailOutputNodeData, "Email Send Output added to canvas.");
  }

  function addChatOutputNode() {
    addConfiguredOutputNode(createChatOutputNodeData, "Chat Message Output added to canvas.");
  }

  function addSpreadsheetOutputNode() {
    addConfiguredOutputNode(createSpreadsheetOutputNodeData, "Spreadsheet Output added to canvas.");
  }

  function handleIntegrationInputLibrarySelect(itemKey: string) {
    if (itemKey === "email-inbox") {
      addEmailInputNode();
      return;
    }
    if (itemKey === "webhook-input") {
      addWebhookInputNode();
      return;
    }
    if (itemKey === "whatsapp-input") {
      addWhatsappInputNode();
      return;
    }
    if (itemKey === "form-input") {
      addFormInputNode();
      return;
    }
  }

  function handleIntegrationOutputLibrarySelect(itemKey: string) {
    if (itemKey === "api-output") {
      addNode("output_api");
      return;
    }
    if (itemKey === "smtp-output") {
      addEmailOutputNode();
      return;
    }
    if (itemKey === "chat-output") {
      addChatOutputNode();
      return;
    }
    if (itemKey === "sheet-output") {
      addSpreadsheetOutputNode();
    }
  }

  function addBuiltInToolNode(tool: BuiltInToolDefinition) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "tool");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "tool");
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "tool").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: createNodePosition(currentGraph),
            data: createBuiltInToolData(tool, nextIndex),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${tool.label} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addMyToolNode(tool: SavedUserTool) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "tool");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "tool");

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: createNodePosition(currentGraph),
            data: createSavedToolNodeData(tool),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${tool.name} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addStarterToolNode(tool: StarterToolTemplate) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "tool");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "tool");

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: createNodePosition(currentGraph),
            data: createStarterToolNodeData(tool),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${tool.name} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addResourceNode(
    type: "database" | "vector_db" | "knowledge" | "skills" | "interface" | "learning_machine" | "memory_manager" | "session_summary_manager" | "compression_manager",
    data: NodeData,
    message: string,
  ) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, type);
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, type);
      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type,
            position: createNodePosition(currentGraph),
            data,
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(message);
    setActiveRightTab("properties");
  }

  function addKnowledgeNode(variant: "knowledge" | "knowledge_contents") {
    addResourceNode(
      "knowledge",
      createKnowledgeNodeData(variant),
      variant === "knowledge" ? "Knowledge node added to canvas." : "Knowledge + Contents DB node added to canvas.",
    );
  }

  function addSkillsNode() {
    addResourceNode("skills", createSkillsNodeData(), "Skills node added to canvas.");
  }

  function addInterfaceNode(preset: InterfacePresetKey) {
    const label = INTERFACE_LIBRARY_ITEMS.find((item) => item.key === preset)?.label ?? "Interface";
    addResourceNode("interface", createInterfaceNodeData(preset), `${label} interface node added to canvas.`);
  }

  function addLearningMachineNode() {
    addResourceNode("learning_machine", createLearningMachineNodeData(), "Learning Machine node added to canvas.");
  }

  function addVectorDbNode(preset: VectorDbPresetKey) {
    const presetLabel = VECTOR_DB_LIBRARY_ITEMS.find((item) => item.key === preset)?.label ?? "Vector DB";
    addResourceNode(
      "vector_db",
      createVectorDbNodeData(preset),
      `${presetLabel} node added to canvas.`,
    );
  }

  function addManagerNode(type: "memory_manager" | "session_summary_manager" | "compression_manager") {
    addResourceNode(type, createManagerNodeData(type), `${NODE_CATALOG[type].label} node added to canvas.`);
  }

  function addDatabaseNode(preset: DatabasePresetKey) {
    const presetLabel = DATABASE_LIBRARY_ITEMS.find((item) => item.key === preset)?.label ?? "Database";
    addResourceNode(
      "database",
      createDatabaseNodeData(preset),
      `${presetLabel} node added to canvas.`,
    );
  }

  function renameMyTool(toolId: string) {
    const currentTool = myTools.find((tool) => tool.id === toolId);
    if (!currentTool) {
      return;
    }

    const nextName = window.prompt("Rename tool", currentTool.name)?.trim();
    if (!nextName || nextName === currentTool.name) {
      return;
    }

    setMyTools((currentTools) =>
      currentTools.map((tool) =>
        tool.id === toolId
          ? {
              ...tool,
              name: nextName,
            }
          : tool,
      ),
    );
    setConnectionMessage(`${currentTool.name} renamed to ${nextName}.`);
  }

  function deleteMyTool(toolId: string) {
    const currentTool = myTools.find((tool) => tool.id === toolId);
    if (!currentTool) {
      return;
    }

    const confirmed = window.confirm(`Delete "${currentTool.name}" from My Tools?`);
    if (!confirmed) {
      return;
    }

    setMyTools((currentTools) => currentTools.filter((tool) => tool.id !== toolId));
    setConnectionMessage(`${currentTool.name} removed from My Tools.`);
  }

  function saveCurrentFunctionTool() {
    if (!selectedNode || selectedNode.type !== "tool" || getToolMode(selectedNode.data) !== "function") {
      return;
    }

    const functionName = fieldValueAsString(selectedNode.data.extras?.functionName).trim();
    const functionCode = fieldValueAsString(selectedNode.data.extras?.functionCode).trim();
    const name = selectedNode.data.name.trim();

    if (!name || !functionName || !functionCode) {
      setConnectionMessage("Fill in name, function name, and code before saving to My Tools.");
      return;
    }

    const savedTool: SavedUserTool = {
      id: `my_tool_${Date.now()}`,
      name,
      description: selectedNode.data.description ?? "Custom function tool",
      functionName,
      functionCode,
      createdAt: new Date().toISOString(),
    };

    setMyTools((currentTools) => {
      const existingIndex = currentTools.findIndex((tool) => tool.name === savedTool.name);
      if (existingIndex >= 0) {
        const nextTools = [...currentTools];
        nextTools[existingIndex] = { ...savedTool, id: currentTools[existingIndex].id };
        return nextTools;
      }
      return [savedTool, ...currentTools];
    });
    setConnectionMessage(`${name} saved to My Tools.`);
  }

  function deleteSelectedNode() {
    if (!graph || !selectedNode) {
      return;
    }

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        nodes: currentGraph.nodes.filter((node) => node.id !== selectedNode.id),
        edges: currentGraph.edges.filter(
          (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id,
        ),
      };
    });
    if (editingFunctionNodeId === selectedNode.id) {
      setEditingFunctionNodeId(null);
    }
    if (pendingConnectionSourceId === selectedNode.id) {
      setPendingConnectionSourceId(null);
    }
    setConnectionMessage(`${selectedNode.data.name} removed from canvas.`);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) {
      return;
    }

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        edges: currentGraph.edges.filter((edge) => edge.id !== selectedEdgeId),
      };
    });
    setConnectionMessage("Connection removed from canvas.");
    setSelectedEdgeId(null);
  }

  function startConnection(nodeId: string) {
    const node = nodeMap[nodeId];
    if (!node) {
      return;
    }

    if (pendingConnectionSourceId === nodeId) {
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      setConnectionMessage("Connection canceled.");
      return;
    }

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setPendingConnectionSourceId(nodeId);
    setConnectionPointer({
      x: node.position.x + NODE_WIDTH,
      y: node.position.y + NODE_MIN_HEIGHT / 2,
    });
    setConnectionMessage(`Source selected: ${node.data.name}. Now click the destination input port.`);
  }

  function finishConnection(targetId: string) {
    if (!graph || !pendingConnectionSourceId) {
      return;
    }

    const sourceNode = nodeMap[pendingConnectionSourceId];
    const targetNode = nodeMap[targetId];

    if (!sourceNode || !targetNode) {
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    if (sourceNode.id === targetNode.id) {
      setConnectionMessage("A component cannot be connected to itself.");
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    if (!canConnect(sourceNode.type, targetNode.type)) {
      setConnectionMessage(
        `${NODE_CATALOG[sourceNode.type].label} cannot connect to ${NODE_CATALOG[targetNode.type].label}.`,
      );
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    const alreadyExists = graph.edges.some(
      (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
    );

    if (alreadyExists) {
      setConnectionMessage("This connection already exists.");
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const edgeAlreadyExists = currentGraph.edges.some(
        (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
      );
      if (edgeAlreadyExists) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        edges: [
          ...currentGraph.edges,
          {
            id: `edge_${sourceNode.id}_${targetNode.id}`,
            source: sourceNode.id,
            target: targetNode.id,
          },
        ],
      };
    });
    setPendingConnectionSourceId(null);
    setConnectionPointer(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(`edge_${sourceNode.id}_${targetNode.id}`);
    setConnectionMessage(`${sourceNode.data.name} connected to ${targetNode.data.name}.`);
  }

  function selectEdge(edge: GraphEdge) {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setPendingConnectionSourceId(null);
    setConnectionMessage(`Connection selected: ${nodeMap[edge.source]?.data.name ?? edge.source} -> ${nodeMap[edge.target]?.data.name ?? edge.target}.`);
    setActiveRightTab("properties");
  }

  function requestHitlRunConfirmation(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      hitlRunConfirmResolverRef.current = resolve;
      setHitlRunConfirmMessage(message);
      setIsHitlRunConfirmOpen(true);
    });
  }

  function resolveHitlRunConfirmation(approved: boolean) {
    setIsHitlRunConfirmOpen(false);
    setHitlRunConfirmMessage("");
    const resolver = hitlRunConfirmResolverRef.current;
    hitlRunConfirmResolverRef.current = null;
    if (resolver) {
      resolver(approved);
    }
  }

  async function handleRun() {
    if (!graph) {
      return;
    }

    let runtimeGraph = prepareGraphWithResolvedInputMetadata(graph);
    let hitlAutoApprovedForRun = false;
    if (shouldPromptHitlConfirmation(runtimeGraph)) {
      const approved = await requestHitlRunConfirmation(
        "This flow includes a Draft Review Gate that requires confirmation. Confirm to run this preview with hitl_auto_approve=true for this execution.",
      );
      if (!approved) {
        setConnectionMessage("Run cancelled. HITL confirmation was not approved.");
        return;
      }
      runtimeGraph = prepareGraphWithResolvedInputMetadata(graph, { forceHitlAutoApprove: true });
      hitlAutoApprovedForRun = true;
      setConnectionMessage("HITL confirmation approved in modal. Running with hitl_auto_approve=true for this execution.");
    }

    setGraph(runtimeGraph);

    setIsRunning(true);
    setRunError(null);
    setRunResult(null);
    setOutputResponseOnly(false);

    try {
      let result = await runGraph(runtimeGraph);
      if (!hitlAutoApprovedForRun && shouldPromptHitlConfirmationFromRunResult(runtimeGraph, result)) {
        const approved = await requestHitlRunConfirmation(
          "This flow paused on a confirmation gate. Confirm to rerun this preview with hitl_auto_approve=true.",
        );
        if (!approved) {
          setRunResult(result);
          setConnectionMessage("Run paused at HITL confirmation. Approval was not granted.");
          return;
        }
        runtimeGraph = prepareGraphWithResolvedInputMetadata(graph, { forceHitlAutoApprove: true });
        setGraph(runtimeGraph);
        hitlAutoApprovedForRun = true;
        setConnectionMessage("HITL confirmation approved after pause. Re-running with hitl_auto_approve=true.");
        result = await runGraph(runtimeGraph);
      }
      setRunResult(result);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Unexpected runtime error.");
    } finally {
      setIsRunning(false);
    }
  }

  async function handleChatFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const fileBuffer = await file.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(fileBuffer);
    setChatDraft((current) => ({
      ...current,
      fileName: file.name,
      fileAlias: current.fileAlias || file.name,
      fileMimeType: file.type || "text/plain",
      fileEncoding: "base64",
      fileBase64,
      fileContent: "",
    }));
  }

  function clearChatFile() {
    setChatDraft((current) => ({
      ...current,
      fileName: "",
      fileAlias: "",
      fileMimeType: "",
      fileEncoding: "base64",
      fileBase64: "",
      fileContent: "",
    }));
  }

  async function handleRunFromChat() {
    if (!graph) {
      return;
    }
    if (!inputNode) {
      setConnectionMessage("Add an Input node before using chat.");
      return;
    }

    if (chatDraft.metadata.trim() && !parseJsonObject(chatDraft.metadata)) {
      setConnectionMessage("Chat metadata must be a valid JSON object.");
      return;
    }

    if (inputSource !== "email" && inputMode !== "text" && !chatDraft.fileName) {
      setConnectionMessage("Current Input mode requires a file in chat upload.");
      return;
    }

    if (!canSendChatMessage) {
      setConnectionMessage("Provide a message or file before sending to the flow.");
      return;
    }

    const normalizedUserText = chatDraft.text.trim();
    const userText =
      inputSource === "email"
        ? "Check the configured inbox and run the flow with the newest matching email."
        : inputSource === "webhook"
        ? normalizedUserText || "Preview webhook payload"
        : inputSource === "whatsapp"
        ? normalizedUserText || "Preview WhatsApp message"
        : inputSource === "form"
        ? normalizedUserText || (chatDraft.fileAlias || chatDraft.fileName || "Preview form submission")
        : inputMode === "file"
        ? normalizedUserText || (chatDraft.fileAlias || chatDraft.fileName || "Uploaded file")
        : normalizedUserText || "(empty message)";

    const preparedGraph = updateInputNodePayload(graph, chatDraft);
    let runtimeGraph = prepareGraphWithResolvedInputMetadata(preparedGraph);
    let hitlAutoApprovedForChatRun = false;
    if (shouldPromptHitlConfirmation(runtimeGraph)) {
      const approved = await requestHitlRunConfirmation(
        "This flow includes a Draft Review Gate that requires confirmation. Confirm to run this chat execution with hitl_auto_approve=true.",
      );
      if (!approved) {
        setConnectionMessage("Chat run cancelled. HITL confirmation was not approved.");
        return;
      }
      runtimeGraph = prepareGraphWithResolvedInputMetadata(preparedGraph, { forceHitlAutoApprove: true });
      hitlAutoApprovedForChatRun = true;
      setConnectionMessage("HITL confirmation approved in modal for chat execution.");
    }

    setChatMessages((current) => [
      ...current,
      {
        role: "user",
        text: userText,
        attachmentName: chatDraft.fileName || undefined,
      },
    ]);

    setGraph(runtimeGraph);
    setIsRunning(true);
    setRunError(null);
    setRunResult(null);

    try {
      let result = await runGraph(runtimeGraph);
      if (!hitlAutoApprovedForChatRun && shouldPromptHitlConfirmationFromRunResult(runtimeGraph, result)) {
        const approved = await requestHitlRunConfirmation(
          "This flow paused on a confirmation gate. Confirm to rerun this chat execution with hitl_auto_approve=true.",
        );
        if (!approved) {
          setRunResult(result);
          setChatMessages((current) => [
            ...current,
            {
              role: "assistant",
              text: "Execution paused at HITL confirmation and approval was not granted.",
            },
          ]);
          setConnectionMessage("Chat run paused at HITL confirmation. Approval was not granted.");
          return;
        }
        runtimeGraph = prepareGraphWithResolvedInputMetadata(preparedGraph, { forceHitlAutoApprove: true });
        setGraph(runtimeGraph);
        hitlAutoApprovedForChatRun = true;
        setConnectionMessage("HITL confirmation approved after pause for chat execution.");
        result = await runGraph(runtimeGraph);
      }
      setRunResult(result);
      const assistantText = result.clean_stdout || extractAgentResponse(result.stdout) || result.stdout || (result.success ? "No clean assistant reply was produced." : result.stderr);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: assistantText || "No response produced.",
        },
      ]);
      setChatDraft((current) => ({
        ...current,
        text: "",
      }));
      setActiveRightTab("code");
      setConnectionMessage("Flow executed from chat input.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected runtime error.";
      setRunError(message);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `Execution error: ${message}`,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  async function refreshSavedFlows() {
    try {
      const flows = await listFlows();
      setSavedFlows(flows);
    } catch (error) {
      console.error(error);
    }
  }

  function navigateToRoute(path: string, search = "") {
    if (window.location.pathname === path && window.location.search === search) {
      return;
    }
    window.history.pushState({}, "", `${path}${search}`);
    setCurrentPath(path);
    setCurrentSearch(search);
  }

  function handleOpenFlowFromHome(name: string) {
    const normalizedName = slugifyFlowName(name);
    if (!normalizedName) {
      return;
    }
    navigateToRoute(buildFlowPath(normalizedName));
  }

  function handleCreateFlowFromHome() {
    navigateToRoute(buildFlowPath("new"));
  }

  function handleCreateTemplateFromHome(templateId: string) {
    navigateToRoute(buildFlowPath("new"), `?template=${encodeURIComponent(templateId)}`);
  }

  function handleCreateBlankFlowFromHome() {
    navigateToRoute(buildFlowPath("blank"));
  }

  function handleGoHome() {
    navigateToRoute("/");
  }

  function upsertSavedFlowSummary(payload: Pick<SaveFlowResponse, "name" | "updated_at">) {
    setSavedFlows((current) => {
      const next = [
        { name: payload.name, updated_at: payload.updated_at },
        ...current.filter((item) => item.name !== payload.name),
      ];
      next.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
      return next;
    });
  }

  async function saveCurrentFlow(options?: {
    openIntegrationModal?: boolean;
    successMessage?: string;
    suppressSuccessMessage?: boolean;
    source?: "manual" | "runtime" | "autosave";
  }) {
    if (!graph) {
      return;
    }

    const normalizedName = slugifyFlowName(flowName);
    if (!normalizedName) {
      setConnectionMessage("Provide a valid flow name before saving.");
      return;
    }

    setIsSavingFlow(true);
    if (options?.source === "autosave") {
      setAutosaveState("saving");
      setAutosaveError(null);
    }
    try {
      const hasEmailListenerInput = graph.nodes.some(
        (node) =>
          node.type === "input" &&
          getInputSource(node.data) === "email" &&
          node.data.extras?.emailListenerEnabled !== false,
      );
      const response = await saveFlow(normalizedName, graph);
      lastPersistedFlowSnapshotRef.current = buildPersistedFlowSnapshot(normalizedName, graph);
      const nextDraftRouteKey = buildFlowDraftRouteKey(normalizedName, null);
      if (flowDraftRouteKey && flowDraftRouteKey !== nextDraftRouteKey) {
        clearFlowDraftFromStorage(flowDraftRouteKey);
      }
      saveFlowDraftToStorage(nextDraftRouteKey, {
        flowName: normalizedName,
        graph,
        updatedAt: new Date().toISOString(),
      });
      setFlowName(normalizedName);
      window.history.replaceState({}, "", buildFlowPath(normalizedName));
      setCurrentPath(buildFlowPath(normalizedName));
      setCurrentSearch("");
      upsertSavedFlowSummary(response);
      const defaultMessage = hasEmailListenerInput
        ? `Flow '${normalizedName}' saved successfully. Email listener synced in the backend.`
        : `Flow '${normalizedName}' saved successfully.`;
      if (!options?.suppressSuccessMessage) {
        setConnectionMessage(options?.successMessage || defaultMessage);
      }
      if (options?.source === "autosave") {
        setAutosaveState("saved");
        setAutosaveError(null);
      }
      if (options?.openIntegrationModal === true) {
        setSavedFlowIntegrationModal({
          name: normalizedName,
          authToken: getGraphAuthToken(graph),
        });
        setActiveIntegrationLanguage("curl");
        setDidCopyIntegration(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save flow.";
      if (options?.source === "autosave") {
        setAutosaveState("error");
        setAutosaveError(message);
      }
      setConnectionMessage(message);
    } finally {
      setIsSavingFlow(false);
    }
  }

  async function handleSaveFlow() {
    await saveCurrentFlow({
      openIntegrationModal: false,
    });
  }

  async function handleSaveRuntimeData() {
    await saveCurrentFlow({
      openIntegrationModal: false,
      successMessage: `Runtime settings for '${slugifyFlowName(flowName) || flowName}' saved successfully.`,
    });
  }

  async function handleCopyIntegrationSnippet() {
    if (!savedFlowIntegrationModal) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(
        buildIntegrationSnippet(savedFlowIntegrationModal.name, activeIntegrationLanguage, savedFlowIntegrationModal.authToken),
      );
      setDidCopyIntegration(true);
    } catch (error) {
      console.error(error);
      setConnectionMessage("Failed to copy integration snippet.");
    }
  }

  async function handleRunSavedFlowByName() {
    const normalizedName = slugifyFlowName(flowName);
    if (!normalizedName) {
      setConnectionMessage("Provide a valid flow name before running by name.");
      return;
    }

    let metadataPayload = parseJsonObject(runByNameMetadata);
    if (runByNameMetadata.trim() && !metadataPayload) {
      setConnectionMessage("Input metadata must be a valid JSON object.");
      return;
    }

    let savedGraphForRun: CanvasGraph | null = null;
    let hitlAutoApprovedForSavedRun = false;
    try {
      const record = await fetchFlowByName(normalizedName);
      savedGraphForRun = record.graph;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load saved flow before running.";
      setRunError(message);
      setConnectionMessage(message);
      return;
    }

    if (savedGraphForRun && graphHasHitlConfirmationGate(savedGraphForRun) && metadataPayload?.hitl_auto_approve !== true) {
      const approved = await requestHitlRunConfirmation(
        "This flow includes a Draft Review Gate that requires confirmation. Confirm to run by name with hitl_auto_approve=true for this execution.",
      );
      if (!approved) {
        setConnectionMessage("Saved flow run cancelled. HITL confirmation was not approved.");
        return;
      }
      metadataPayload = {
        ...(metadataPayload ?? {}),
        hitl_auto_approve: true,
      };
      hitlAutoApprovedForSavedRun = true;
      setRunByNameMetadata(stringifyJsonObject(metadataPayload));
      setConnectionMessage("HITL confirmation approved in modal. Running saved flow with hitl_auto_approve=true.");
    }

    setIsRunningSavedFlow(true);
    setRunError(null);
    setRunResult(null);
    setOutputResponseOnly(false);
    try {
      const savedFlowAuthToken = getGraphAuthToken(savedGraphForRun);
      let result = await runFlowByName(normalizedName, runByNameInputText, metadataPayload, savedFlowAuthToken);
      if (
        savedGraphForRun &&
        !hitlAutoApprovedForSavedRun &&
        shouldPromptHitlConfirmationFromRunResult(savedGraphForRun, result)
      ) {
        const approved = await requestHitlRunConfirmation(
          "This flow paused on a confirmation gate. Confirm to rerun by name with hitl_auto_approve=true.",
        );
        if (!approved) {
          setRunResult(result);
          setConnectionMessage("Saved flow run paused at HITL confirmation. Approval was not granted.");
          return;
        }
        metadataPayload = {
          ...(metadataPayload ?? {}),
          hitl_auto_approve: true,
        };
        hitlAutoApprovedForSavedRun = true;
        setRunByNameMetadata(stringifyJsonObject(metadataPayload));
        setConnectionMessage("HITL confirmation approved after pause. Re-running saved flow with hitl_auto_approve=true.");
        result = await runFlowByName(normalizedName, runByNameInputText, metadataPayload, savedFlowAuthToken);
      }
      setRunResult(result);
      setConnectionMessage(`Saved flow '${normalizedName}' executed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run saved flow.";
      setRunError(message);
      setConnectionMessage(message);
    } finally {
      setIsRunningSavedFlow(false);
    }
  }

  function handleExportPython() {
    const normalizedName = slugifyFlowName(flowName) || "agnolab_flow";
    downloadAsFile(code, `${normalizedName}.py`, "text/x-python;charset=utf-8");
    setConnectionMessage(`Generated code exported as ${normalizedName}.py`);
  }

  function handleExportFlow() {
    if (!graph) {
      return;
    }

    const normalizedName = slugifyFlowName(flowName) || slugifyFlowName(graph.project.name) || "agnolab_flow";
    const payload = {
      format: "agnolab-flow",
      version: 1,
      source: "AgnoLab",
      exported_at: new Date().toISOString(),
      flow_name: normalizedName,
      graph,
    };
    downloadAsFile(JSON.stringify(payload, null, 2), `${normalizedName}.agnolab-flow.json`, "application/json;charset=utf-8");
    setConnectionMessage(`Flow '${normalizedName}' exported.`);
  }

  function handleTriggerImportFlow() {
    flowImportInputRef.current?.click();
  }

  async function handleImportFlowFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      const parsed = JSON.parse(rawContent) as unknown;
      const imported = normalizeImportedFlowPayload(parsed);
      if (!imported) {
        throw new Error("Invalid flow file. Expected an AgnoLab flow export, saved flow record, or raw canvas graph.");
      }

      const importedFlowPath = buildFlowPath("new");
      pendingImportedGraphRef.current = imported.graph;
      pendingImportedFlowNameRef.current = imported.flowName;
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      setCanvasPanState(null);
      setCanvasOffset({ x: 0, y: 0 });
      setCanvasZoom(1);
      hasAutoCenteredRef.current = false;
      ignoreCanvasClickRef.current = false;

      if (currentPath === importedFlowPath && currentSearch === "") {
        pendingImportedGraphRef.current = null;
        pendingImportedFlowNameRef.current = "imported_flow";
        setGraph(imported.graph);
        setFlowName(imported.flowName);
        setConnectionMessage(`Flow '${imported.flowName}' imported. Save to persist it.`);
        return;
      }

      navigateToRoute(importedFlowPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import flow.";
      setConnectionMessage(message);
      pendingImportedGraphRef.current = null;
      pendingImportedFlowNameRef.current = "imported_flow";
    }
  }

  function updateProjectRuntime(patch: Partial<ProjectRuntimeConfig>) {
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        project: {
          ...currentGraph.project,
          runtime: {
            ...createDefaultProjectRuntime(),
            ...getGraphProjectRuntime(currentGraph),
            ...patch,
          },
        },
      };
    });
  }

  function addProjectRuntimeEnvVar() {
    updateProjectRuntime({
      envVars: [...projectRuntimeEnvVars, { key: "", value: "" }],
    });
  }

  function updateProjectRuntimeEnvVar(index: number, patch: Partial<ProjectRuntimeEnvVar>) {
    updateProjectRuntime({
      envVars: projectRuntimeEnvVars.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    });
  }

  function removeProjectRuntimeEnvVar(index: number) {
    updateProjectRuntime({
      envVars: projectRuntimeEnvVars.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  async function handleOpenIntegrationModal(targetFlowName?: string) {
    const normalizedName = slugifyFlowName(targetFlowName ?? flowName);
    if (!normalizedName) {
      setConnectionMessage("Provide a valid flow name to generate an integration snippet.");
      return;
    }

    let authToken = targetFlowName ? "" : getGraphAuthToken(graph);
    if (targetFlowName) {
      try {
        const record = await fetchFlowByName(normalizedName);
        authToken = getGraphAuthToken(record.graph);
      } catch (error) {
        console.error(error);
      }
    }

    setSavedFlowIntegrationModal({
      name: normalizedName,
      authToken,
    });
    setActiveIntegrationLanguage("curl");
    setDidCopyIntegration(false);
  }

  async function handleCopyWebhookCurlCommand() {
    if (!webhookCurlModal) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(webhookCurlModal.command);
      setDidCopyWebhookCurl(true);
    } catch (error) {
      console.error(error);
      setConnectionMessage("Failed to copy webhook cURL example.");
    }
  }

  function handleOpenWebhookCurlModal(node: GraphNode, endpoint: string) {
    const extras = node.data.extras ?? {};
    setWebhookCurlModal({
      title: node.data.name,
      endpoint,
      command: buildWebhookCurlCommand(endpoint, {
        textField: extras.webhookTextField,
        secretHeader: extras.webhookSecretHeader,
        secretValue: extras.webhookSecret,
        authToken: getGraphAuthToken(graph),
      }),
    });
    setDidCopyWebhookCurl(false);
  }

  async function loadWhatsappSessionState(flowRouteName: string, nodeId: string): Promise<WhatsappSessionStatus | null> {
    try {
      return await fetchWhatsappSessionStatus(flowRouteName, nodeId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load WhatsApp session status.";
      setConnectionMessage(message);
      return null;
    }
  }

  async function handleOpenWhatsappSessionModal(node: GraphNode) {
    const flowRouteName = slugifyFlowName(flowName);
    if (!flowRouteName) {
      setConnectionMessage("Save the flow with a valid name before connecting WhatsApp.");
      return;
    }
    if (!savedFlows.some((flow) => flow.name === flowRouteName)) {
      setConnectionMessage("Save the flow before connecting WhatsApp so the gateway can target a persisted flow name.");
      return;
    }

    const nextModal: WhatsappSessionModalState = {
      flowName: flowRouteName,
      nodeId: node.id,
      nodeName: node.data.name,
      session: null,
    };
    setWhatsappSessionModal(nextModal);

    const session = await loadWhatsappSessionState(flowRouteName, node.id);
    setWhatsappSessionModal((current) =>
      current && current.flowName === flowRouteName && current.nodeId === node.id
        ? {
            ...current,
            session,
          }
        : current,
    );
  }

  async function handleStartWhatsappSession() {
    if (!whatsappSessionModal) {
      return;
    }

    setIsUpdatingWhatsappSession(true);
    try {
      const session = await startWhatsappSession(whatsappSessionModal.flowName, whatsappSessionModal.nodeId);
      setWhatsappSessionModal((current) => (current ? { ...current, session } : current));
      setConnectionMessage(
        session.last_error
          ? session.last_error
          : `WhatsApp session '${session.session_id}' started. Scan the QR code to connect.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start WhatsApp session.";
      setConnectionMessage(message);
    } finally {
      setIsUpdatingWhatsappSession(false);
    }
  }

  async function handleRefreshWhatsappSession() {
    if (!whatsappSessionModal) {
      return;
    }

    setIsUpdatingWhatsappSession(true);
    try {
      const session = await fetchWhatsappSessionStatus(whatsappSessionModal.flowName, whatsappSessionModal.nodeId);
      setWhatsappSessionModal((current) => (current ? { ...current, session } : current));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh WhatsApp session.";
      setConnectionMessage(message);
    } finally {
      setIsUpdatingWhatsappSession(false);
    }
  }

  async function handleStopWhatsappSession() {
    if (!whatsappSessionModal) {
      return;
    }

    setIsUpdatingWhatsappSession(true);
    try {
      const session = await stopWhatsappSession(whatsappSessionModal.flowName, whatsappSessionModal.nodeId);
      setWhatsappSessionModal((current) => (current ? { ...current, session } : current));
      setConnectionMessage(session.last_error ? session.last_error : `WhatsApp session '${session.session_id}' stopped.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop WhatsApp session.";
      setConnectionMessage(message);
    } finally {
      setIsUpdatingWhatsappSession(false);
    }
  }

  async function loadQueueSubscriberStatus(flowRouteName: string, nodeId: string): Promise<QueueSubscriberStatus | null> {
    try {
      const status = await fetchQueueSubscriberStatus(flowRouteName, nodeId);
      setQueueSubscriberStatusByNodeId((current) => ({
        ...current,
        [nodeId]: status,
      }));
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load queue subscriber status.";
      setConnectionMessage(message);
      return null;
    }
  }

  async function handleStartQueueSubscriber(node: GraphNode) {
    const flowRouteName = slugifyFlowName(flowName);
    if (!flowRouteName) {
      setConnectionMessage("Save the flow with a valid name before connecting Queue subscriber.");
      return;
    }
    if (!savedFlows.some((flow) => flow.name === flowRouteName)) {
      setConnectionMessage("Save the flow before connecting Queue subscriber so the backend can target a persisted flow name.");
      return;
    }

    setIsUpdatingQueueSubscriber(true);
    try {
      const status = await startQueueSubscriber(flowRouteName, node.id);
      setQueueSubscriberStatusByNodeId((current) => ({
        ...current,
        [node.id]: status,
      }));
      setConnectionMessage(
        status.last_error
          ? status.last_error
          : `Queue subscriber '${status.node_name}' is now ${status.connected ? "connected" : status.status}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start queue subscriber.";
      setConnectionMessage(message);
    } finally {
      setIsUpdatingQueueSubscriber(false);
    }
  }

  async function handleStopQueueSubscriber(node: GraphNode) {
    const flowRouteName = slugifyFlowName(flowName);
    if (!flowRouteName) {
      setConnectionMessage("Save the flow with a valid name before disconnecting Queue subscriber.");
      return;
    }

    setIsUpdatingQueueSubscriber(true);
    try {
      const status = await stopQueueSubscriber(flowRouteName, node.id);
      setQueueSubscriberStatusByNodeId((current) => ({
        ...current,
        [node.id]: status,
      }));
      setConnectionMessage(status.last_error ? status.last_error : `Queue subscriber '${status.node_name}' stopped.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop queue subscriber.";
      setConnectionMessage(message);
    } finally {
      setIsUpdatingQueueSubscriber(false);
    }
  }

  function getCanvasLocalPoint(clientX: number, clientY: number): PointerPosition | null {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) {
      return null;
    }

    return {
      x: clientX - canvasRect.left,
      y: clientY - canvasRect.top,
    };
  }

  function applyCanvasZoom(nextZoom: number, anchor?: PointerPosition | null) {
    const clampedZoom = clampCanvasZoom(nextZoom);
    if (Math.abs(clampedZoom - canvasZoom) < 0.001) {
      return;
    }

    const fallbackAnchor = canvasRef.current
      ? {
          x: canvasRef.current.clientWidth / 2,
          y: canvasRef.current.clientHeight / 2,
        }
      : null;
    const anchorPoint = anchor ?? fallbackAnchor;

    if (!anchorPoint) {
      setCanvasZoom(clampedZoom);
      return;
    }

    const worldX = (anchorPoint.x - canvasOffset.x) / canvasZoom;
    const worldY = (anchorPoint.y - canvasOffset.y) / canvasZoom;
    setCanvasOffset({
      x: anchorPoint.x - worldX * clampedZoom,
      y: anchorPoint.y - worldY * clampedZoom,
    });
    setCanvasZoom(clampedZoom);
  }

  function handleZoomIn() {
    applyCanvasZoom(canvasZoom + CANVAS_ZOOM_STEP);
  }

  function handleZoomOut() {
    applyCanvasZoom(canvasZoom - CANVAS_ZOOM_STEP);
  }

  function handleZoomReset() {
    setCanvasZoom(1);
    setCanvasOffset({ x: 0, y: 0 });
  }

  function handleNodeMouseDown(nodeId: string, event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const node = nodeMap[nodeId];
    if (!canvasRect || !node) {
      return;
    }

    setSelectedNodeId(nodeId);
    setDragState({
      nodeId,
      offsetX: (event.clientX - canvasRect.left - canvasOffset.x) / canvasZoom - node.position.x,
      offsetY: (event.clientY - canvasRect.top - canvasOffset.y) / canvasZoom - node.position.y,
    });
  }

  function handleCanvasMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0 || pendingConnectionSourceId) {
      return;
    }

    if (!isCanvasBackgroundTarget(event.target, event.currentTarget)) {
      return;
    }

    ignoreCanvasClickRef.current = false;
    setCanvasPanState({
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasOffset.x,
      originY: canvasOffset.y,
    });
    event.preventDefault();
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLElement>) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    const anchor = getCanvasLocalPoint(event.clientX, event.clientY);
    const direction = event.deltaY < 0 ? 1 : -1;
    applyCanvasZoom(canvasZoom + direction * CANVAS_ZOOM_STEP, anchor);
    event.preventDefault();
  }

  function handleCanvasPointerMove(event: ReactMouseEvent<HTMLElement>) {
    if (!pendingConnectionSourceId) {
      return;
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) {
      return;
    }

    setConnectionPointer({
      x: (event.clientX - canvasRect.left - canvasOffset.x) / canvasZoom,
      y: (event.clientY - canvasRect.top - canvasOffset.y) / canvasZoom,
    });
  }

  function renderRequiredMark(field: { required?: boolean }) {
    if (!field.required) {
      return null;
    }
    return <span className="required-mark">*</span>;
  }

  function getAgentFieldBlockedReason(field: AgentFieldDefinition): string | null {
    if (field.key === "skills" && !selectedAgentResources.skills) {
      return "Connect a Skills node to this Agent to load local Agno skills.";
    }

    if (field.key === "learning_machine" && !selectedAgentResources.learningMachine) {
      return "Connect a Learning Machine node to this Agent to unlock managed learning.";
    }

    if (field.key === "learning") {
      if (selectedAgentResources.learningMachine) {
        return "This Agent already uses the connected Learning Machine node for learning.";
      }
      if (!selectedAgentResources.database) {
        return "Connect a Database node to this Agent or plug in a Learning Machine node to enable learning.";
      }
      return null;
    }

    if (field.key === "memory_manager") {
      if (!selectedAgentResources.memoryManager && !selectedAgentResources.database) {
        return "Connect both a Memory Manager node and a Database node to this Agent to unlock this property.";
      }
      if (!selectedAgentResources.memoryManager) {
        return "Connect a Memory Manager node to this Agent to unlock this property.";
      }
      if (!selectedAgentResources.database) {
        return "Connect a Database node to this Agent to unlock this property.";
      }
      return null;
    }

    if (field.key === "session_summary_manager") {
      if (!selectedAgentResources.sessionSummaryManager && !selectedAgentResources.database) {
        return "Connect both a Session Summary Manager node and a Database node to this Agent to unlock this property.";
      }
      if (!selectedAgentResources.sessionSummaryManager) {
        return "Connect a Session Summary Manager node to this Agent to unlock this property.";
      }
      if (!selectedAgentResources.database) {
        return "Connect a Database node to this Agent to unlock this property.";
      }
      return null;
    }

    if (field.key === "compression_manager" && !selectedAgentResources.compressionManager) {
      return "Connect a Compression Manager node to this Agent to unlock this property.";
    }

    if (DATABASE_DEPENDENT_AGENT_FIELDS.has(field.key) && !selectedAgentResources.database) {
      return "Connect a Database node to this Agent to unlock this property.";
    }

    if (
      KNOWLEDGE_DEPENDENT_AGENT_FIELDS.has(field.key) &&
      !selectedAgentResources.knowledge &&
      !selectedAgentResources.vectorDb
    ) {
      return "Connect a Knowledge or Vector DB node to this Agent to unlock this property.";
    }

    return null;
  }

  function renderAgentFieldTooltip(field: AgentFieldDefinition, blockedReason: string | null) {
    const baseHelp = field.helper?.trim() || `Configures what "${field.label}" does for this Agent.`;

    return (
      <div className="help-tooltip">
        <strong>{field.label}</strong>
        <p>{baseHelp}</p>
        {blockedReason ? <p>Blocked: {blockedReason}</p> : null}
      </div>
    );
  }

  function getTeamFieldBlockedReason(field: AgentFieldDefinition): string | null {
    if (field.key === "learning_machine" && !selectedTeamResources.learningMachine) {
      return "Connect a Learning Machine node to this Team to unlock managed learning.";
    }

    if (field.key === "learning") {
      if (selectedTeamResources.learningMachine) {
        return "This Team already uses the connected Learning Machine node for learning.";
      }
      if (!selectedTeamResources.database) {
        return "Connect a Database node to this Team or plug in a Learning Machine node to enable learning.";
      }
      return null;
    }

    if (field.key === "memory_manager") {
      if (!selectedTeamResources.memoryManager && !selectedTeamResources.database) {
        return "Connect both a Memory Manager node and a Database node to this Team to unlock this property.";
      }
      if (!selectedTeamResources.memoryManager) {
        return "Connect a Memory Manager node to this Team to unlock this property.";
      }
      if (!selectedTeamResources.database) {
        return "Connect a Database node to this Team to unlock this property.";
      }
      return null;
    }

    if (field.key === "session_summary_manager") {
      if (!selectedTeamResources.sessionSummaryManager && !selectedTeamResources.database) {
        return "Connect both a Session Summary Manager node and a Database node to this Team to unlock this property.";
      }
      if (!selectedTeamResources.sessionSummaryManager) {
        return "Connect a Session Summary Manager node to this Team to unlock this property.";
      }
      if (!selectedTeamResources.database) {
        return "Connect a Database node to this Team to unlock this property.";
      }
      return null;
    }

    if (field.key === "compression_manager" && !selectedTeamResources.compressionManager) {
      return "Connect a Compression Manager node to this Team to unlock this property.";
    }

    if (DATABASE_DEPENDENT_TEAM_FIELDS.has(field.key) && !selectedTeamResources.database) {
      return "Connect a Database node to this Team to unlock this property.";
    }

    if (
      KNOWLEDGE_DEPENDENT_TEAM_FIELDS.has(field.key) &&
      !selectedTeamResources.knowledge &&
      !selectedTeamResources.vectorDb
    ) {
      return "Connect a Knowledge or Vector DB node to this Team to unlock this property.";
    }

    return null;
  }

  function renderTeamFieldTooltip(field: AgentFieldDefinition, blockedReason: string | null) {
    const baseHelp = field.helper?.trim() || `Configures what "${field.label}" does for this Team.`;

    return (
      <div className="help-tooltip">
        <strong>{field.label}</strong>
        <p>{baseHelp}</p>
        {blockedReason ? <p>Blocked: {blockedReason}</p> : null}
      </div>
    );
  }

  function getAgentComponentFieldUi(fieldKey: string, currentValue: unknown) {
    const currentText = fieldValueAsString(currentValue).trim();

    if (fieldKey === "db") {
      if (selectedAgentResources.database) {
        return {
          value: selectedAgentResources.database.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.database.data.name}.`,
        };
      }

      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Database node to manage this visually.",
        };
      }

      return {
        value: "",
        placeholder: "Connect a Database node",
      };
    }

    if (fieldKey === "knowledge") {
      if (selectedAgentResources.knowledge) {
        return {
          value: selectedAgentResources.knowledge.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.knowledge.data.name}.`,
        };
      }

      if (selectedAgentResources.vectorDb) {
        return {
          value: `${selectedAgentResources.vectorDb.data.name} (via Vector DB)`,
          note: `Read-only because it is derived from ${selectedAgentResources.vectorDb.data.name}.`,
        };
      }

      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Knowledge or Vector DB node to manage this visually.",
        };
      }

      return {
        value: "",
        placeholder: "Connect a Knowledge or Vector DB node",
      };
    }

    if (fieldKey === "skills") {
      if (selectedAgentResources.skills) {
        return {
          value: selectedAgentResources.skills.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.skills.data.name}.`,
        };
      }

      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Skills node to manage this visually.",
        };
      }

      return {
        value: "",
        placeholder: "Connect a Skills node",
      };
    }

    if (fieldKey === "learning_machine") {
      if (selectedAgentResources.learningMachine) {
        return {
          value: selectedAgentResources.learningMachine.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.learningMachine.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Learning Machine node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Learning Machine node",
      };
    }

    if (fieldKey === "memory_manager") {
      if (selectedAgentResources.memoryManager) {
        return {
          value: selectedAgentResources.memoryManager.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.memoryManager.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Memory Manager node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Memory Manager node",
      };
    }

    if (fieldKey === "session_summary_manager") {
      if (selectedAgentResources.sessionSummaryManager) {
        return {
          value: selectedAgentResources.sessionSummaryManager.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.sessionSummaryManager.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Session Summary Manager node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Session Summary Manager node",
      };
    }

    if (fieldKey === "compression_manager") {
      if (selectedAgentResources.compressionManager) {
        return {
          value: selectedAgentResources.compressionManager.data.name,
          note: `Read-only because it is connected from ${selectedAgentResources.compressionManager.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Compression Manager node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Compression Manager node",
      };
    }

    if (currentText) {
      return {
        value: currentText,
        note: "Loaded from saved config. This component is read-only in the canvas for now.",
      };
    }

    return {
      value: "",
      placeholder: "No component connected",
    };
  }

  function getTeamComponentFieldUi(fieldKey: string, currentValue: unknown) {
    const currentText = fieldValueAsString(currentValue).trim();

    if (fieldKey === "db") {
      if (selectedTeamResources.database) {
        return {
          value: selectedTeamResources.database.data.name,
          note: `Read-only because it is connected from ${selectedTeamResources.database.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Database node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Database node",
      };
    }

    if (fieldKey === "knowledge") {
      if (selectedTeamResources.knowledge) {
        return {
          value: selectedTeamResources.knowledge.data.name,
          note: `Read-only because it is connected from ${selectedTeamResources.knowledge.data.name}.`,
        };
      }
      if (selectedTeamResources.vectorDb) {
        return {
          value: `${selectedTeamResources.vectorDb.data.name} (via Vector DB)`,
          note: `Read-only because it is derived from ${selectedTeamResources.vectorDb.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Knowledge or Vector DB node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Knowledge or Vector DB node",
      };
    }

    if (fieldKey === "learning_machine") {
      if (selectedTeamResources.learningMachine) {
        return {
          value: selectedTeamResources.learningMachine.data.name,
          note: `Read-only because it is connected from ${selectedTeamResources.learningMachine.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Learning Machine node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Learning Machine node",
      };
    }

    if (fieldKey === "memory_manager") {
      if (selectedTeamResources.memoryManager) {
        return {
          value: selectedTeamResources.memoryManager.data.name,
          note: `Read-only because it is connected from ${selectedTeamResources.memoryManager.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Memory Manager node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Memory Manager node",
      };
    }

    if (fieldKey === "session_summary_manager") {
      if (selectedTeamResources.sessionSummaryManager) {
        return {
          value: selectedTeamResources.sessionSummaryManager.data.name,
          note: `Read-only because it is connected from ${selectedTeamResources.sessionSummaryManager.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Session Summary Manager node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Session Summary Manager node",
      };
    }

    if (fieldKey === "compression_manager") {
      if (selectedTeamResources.compressionManager) {
        return {
          value: selectedTeamResources.compressionManager.data.name,
          note: `Read-only because it is connected from ${selectedTeamResources.compressionManager.data.name}.`,
        };
      }
      if (currentText) {
        return {
          value: currentText,
          note: "Loaded from saved config. Connect a Compression Manager node to manage this visually.",
        };
      }
      return {
        value: "",
        placeholder: "Connect a Compression Manager node",
      };
    }

    if (currentText) {
      return {
        value: currentText,
        note: "Loaded from saved config. This component is read-only in the canvas for now.",
      };
    }

    return {
      value: "",
      placeholder: "No component connected",
    };
  }

  function renderAgentField(field: AgentFieldDefinition) {
    if (!selectedNode) {
      return null;
    }

    const agentConfig = getAgentConfig(selectedNode.data);
    const providerConfig = getProviderConfig(selectedNode.data);
    const usesRootField = ["name", "description", "instructions", "provider", "model"].includes(field.key);
    const usesProviderField = [
      "provider_profile",
      "provider_api_key_env",
      "provider_api_key",
      "provider_base_url_env",
      "provider_base_url",
      "provider_execution_timeout_seconds",
      "provider_env_json",
    ].includes(field.key);
    const currentValue = (usesRootField
      ? selectedNode.data[field.key as keyof NodeData]
      : usesProviderField
        ? providerConfig[field.key]
        : agentConfig[field.key]);
    const blockedReason = getAgentFieldBlockedReason(field);
    const componentFieldUi = COMPONENT_SELECT_AGENT_FIELDS.has(field.key)
      ? getAgentComponentFieldUi(field.key, currentValue)
      : null;
    const isBlocked = Boolean(blockedReason) && !componentFieldUi?.value;

    const label = (
      <span className="field-label-row">
        <span>
          {field.label}
          {renderRequiredMark(field)}
        </span>
        <div className="property-help">
          <button
            type="button"
            className={`help-button field-help-button ${isBlocked ? "is-blocked" : ""}`}
            onClick={(event) => event.preventDefault()}
          >
            {isBlocked ? "!" : "?"}
          </button>
          {renderAgentFieldTooltip(field, blockedReason)}
        </div>
      </span>
    );

    if (componentFieldUi) {
      return (
        <label key={field.key}>
          {label}
          <select value={componentFieldUi.value} disabled>
            {!componentFieldUi.value ? (
              <option value="">{componentFieldUi.placeholder ?? "No component connected"}</option>
            ) : null}
            {componentFieldUi.value ? <option value={componentFieldUi.value}>{componentFieldUi.value}</option> : null}
          </select>
          {componentFieldUi.note ? <p className="muted small-note">{componentFieldUi.note}</p> : null}
        </label>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            disabled={isBlocked}
            onChange={(event) => {
              const value = parseFieldValue(field, "", event.target.checked);
              if (usesRootField) {
                setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: value } as Partial<NodeData>));
              } else if (usesProviderField) {
                setGraph(updateNodeData(graph, selectedNode.id, updateProviderConfig(selectedNode.data, field.key, value)));
              } else {
                setGraph(updateNodeData(graph, selectedNode.id, updateAgentConfig(selectedNode.data, field.key, value)));
              }
            }}
          />
          {label}
        </label>
      );
    }

    const sharedProps = {
      placeholder: field.placeholder,
      value: fieldValueAsString(currentValue),
      disabled: isBlocked,
      onChange: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => {
        const value = parseFieldValue(field, event.target.value, false);
        if (field.key === "provider_profile") {
          const presetId = fieldValueAsString(value);
          setGraph(updateNodeData(graph, selectedNode.id, applyProviderPreset(selectedNode.data, presetId)));
          return;
        }

        if (usesRootField) {
          setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: value } as Partial<NodeData>));
        } else if (usesProviderField) {
          setGraph(updateNodeData(graph, selectedNode.id, updateProviderConfig(selectedNode.data, field.key, value)));
        } else {
          setGraph(updateNodeData(graph, selectedNode.id, updateAgentConfig(selectedNode.data, field.key, value)));
        }
      },
    };

    const isOllamaModelField = field.key === "model" && selectedAgentProvider.startsWith("ollama");

    if (isOllamaModelField) {
      const currentModel = fieldValueAsString(currentValue);
      const hasCurrentModelInOptions = ollamaModelOptions.includes(currentModel);

      return (
        <label key={field.key}>
          {label}
          <select
            value={currentModel}
            disabled={isBlocked}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: event.target.value } as Partial<NodeData>))
            }
          >
            {!currentModel ? <option value="">Select a local model</option> : null}
            {currentModel && !hasCurrentModelInOptions ? <option value={currentModel}>{currentModel} (current)</option> : null}
            {ollamaModelOptions.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setOllamaModelsRefreshKey((current) => current + 1)}
              disabled={isLoadingOllamaModels}
            >
              {isLoadingOllamaModels ? "Refreshing models..." : "Refresh local models"}
            </button>
          </div>
          <p className="muted small-note">
            {isLoadingOllamaModels
              ? "Loading local Ollama models..."
              : ollamaModelOptions.length
                ? `Loaded ${ollamaModelOptions.length} model(s) from local Ollama.`
                : "No local models found or Ollama is unavailable."}
          </p>
        </label>
      );
    }

    if (field.key === "timezone_identifier") {
      const currentTimezone = fieldValueAsString(currentValue);

      return (
        <label key={field.key}>
          {label}
          <select
            value={currentTimezone}
            disabled={isBlocked}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, updateAgentConfig(selectedNode.data, field.key, event.target.value)))
            }
          >
            <option value="">Not set</option>
            {currentTimezone && !timezoneOptions.includes(currentTimezone) ? (
              <option value={currentTimezone}>{currentTimezone}</option>
            ) : null}
            {timezoneOptions.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={field.key}>
        {label}
        {field.type === "textarea" || field.type === "json" || field.type === "python" ? (
          <textarea {...sharedProps} className={field.type !== "textarea" ? "code-input" : undefined} />
        ) : field.type === "select" ? (
          <select {...sharedProps}>
            <option value="">Not set</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              {...sharedProps}
              type={field.type === "number" ? "number" : "text"}
              list={
                field.key === "provider"
                  ? "agno-provider-options"
                  : field.key === "model" && selectedAgentProvider.startsWith("ollama")
                    ? "ollama-model-options"
                    : undefined
              }
            />
            {field.key === "provider" ? (
              <datalist id="agno-provider-options">
                {AGNO_MODEL_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            ) : null}
            {field.key === "model" && selectedAgentProvider.startsWith("ollama") ? (
              <>
                <datalist id="ollama-model-options">
                  {ollamaModelOptions.map((modelName) => (
                    <option key={modelName} value={modelName} />
                  ))}
                </datalist>
                <p className="muted small-note">
                  {isLoadingOllamaModels
                    ? "Loading local Ollama models..."
                    : ollamaModelOptions.length
                      ? "Suggestions loaded from your local Ollama instance."
                      : "No local models found or Ollama is unavailable."}
                </p>
              </>
            ) : null}
          </>
        )}
      </label>
    );
  }

  function renderTeamField(field: AgentFieldDefinition) {
    if (!selectedNode || selectedNode.type !== "team") {
      return null;
    }

    const teamConfig = getTeamConfig(selectedNode.data);
    const providerConfig = getProviderConfig(selectedNode.data);
    const usesRootField = ["name", "description", "instructions", "provider", "model"].includes(field.key);
    const usesProviderField = [
      "provider_profile",
      "provider_api_key_env",
      "provider_api_key",
      "provider_base_url_env",
      "provider_base_url",
      "provider_execution_timeout_seconds",
      "provider_env_json",
    ].includes(field.key);
    const currentValue = (usesRootField
      ? selectedNode.data[field.key as keyof NodeData]
      : usesProviderField
        ? providerConfig[field.key]
        : teamConfig[field.key]);
    const blockedReason = getTeamFieldBlockedReason(field);
    const componentFieldUi = COMPONENT_SELECT_TEAM_FIELDS.has(field.key)
      ? getTeamComponentFieldUi(field.key, currentValue)
      : null;
    const isBlocked = Boolean(blockedReason) && !componentFieldUi?.value;

    const label = (
      <span className="field-label-row">
        <span>
          {field.label}
          {renderRequiredMark(field)}
        </span>
        <div className="property-help">
          <button
            type="button"
            className={`help-button field-help-button ${isBlocked ? "is-blocked" : ""}`}
            onClick={(event) => event.preventDefault()}
          >
            {isBlocked ? "!" : "?"}
          </button>
          {renderTeamFieldTooltip(field, blockedReason)}
        </div>
      </span>
    );

    if (componentFieldUi) {
      return (
        <label key={field.key}>
          {label}
          <select value={componentFieldUi.value} disabled>
            {!componentFieldUi.value ? (
              <option value="">{componentFieldUi.placeholder ?? "No component connected"}</option>
            ) : null}
            {componentFieldUi.value ? <option value={componentFieldUi.value}>{componentFieldUi.value}</option> : null}
          </select>
          {componentFieldUi.note ? <p className="muted small-note">{componentFieldUi.note}</p> : null}
        </label>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            disabled={isBlocked}
            onChange={(event) => {
              const value = parseFieldValue(field, "", event.target.checked);
              if (usesRootField) {
                setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: value } as Partial<NodeData>));
              } else if (usesProviderField) {
                setGraph(updateNodeData(graph, selectedNode.id, updateProviderConfig(selectedNode.data, field.key, value)));
              } else {
                setGraph(updateNodeData(graph, selectedNode.id, updateTeamConfig(selectedNode.data, field.key, value)));
              }
            }}
          />
          {label}
        </label>
      );
    }

    const sharedProps = {
      placeholder: field.placeholder,
      value: fieldValueAsString(currentValue),
      disabled: isBlocked,
      onChange: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => {
        const value = parseFieldValue(field, event.target.value, false);
        if (field.key === "provider_profile") {
          const presetId = fieldValueAsString(value);
          setGraph(updateNodeData(graph, selectedNode.id, applyProviderPreset(selectedNode.data, presetId)));
          return;
        }

        if (usesRootField) {
          setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: value } as Partial<NodeData>));
        } else if (usesProviderField) {
          setGraph(updateNodeData(graph, selectedNode.id, updateProviderConfig(selectedNode.data, field.key, value)));
        } else {
          setGraph(updateNodeData(graph, selectedNode.id, updateTeamConfig(selectedNode.data, field.key, value)));
        }
      },
    };

    if (field.key === "timezone_identifier") {
      const currentTimezone = fieldValueAsString(currentValue);

      return (
        <label key={field.key}>
          {label}
          <select
            value={currentTimezone}
            disabled={isBlocked}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, updateTeamConfig(selectedNode.data, field.key, event.target.value)))
            }
          >
            <option value="">Not set</option>
            {currentTimezone && !timezoneOptions.includes(currentTimezone) ? (
              <option value={currentTimezone}>{currentTimezone}</option>
            ) : null}
            {timezoneOptions.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={field.key}>
        {label}
        {field.type === "textarea" || field.type === "json" || field.type === "python" ? (
          <textarea {...sharedProps} className={field.type !== "textarea" ? "code-input" : undefined} />
        ) : field.type === "select" ? (
          <select {...sharedProps}>
            <option value="">Not set</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              {...sharedProps}
              type={field.type === "number" ? "number" : "text"}
              list={field.key === "provider" ? "agno-provider-options" : undefined}
            />
            {field.key === "provider" ? (
              <datalist id="agno-provider-options">
                {AGNO_MODEL_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            ) : null}
          </>
        )}
      </label>
    );
  }

  function renderSelectedNodeProperties() {
    if (!selectedNode) {
      return <p className="muted">Select a node in the canvas to edit its properties.</p>;
    }

    if (selectedNode.type === "database") {
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

    if (selectedNode.type === "vector_db") {
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

    if (selectedNode.type === "knowledge") {
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

    if (selectedNode.type === "learning_machine") {
      const currentNode = selectedNode;
      const currentGraph = graph;
      if (!currentGraph) {
        return null;
      }
      const currentExtras = {
        ...getDefaultLearningMachineExtras(),
        ...(currentNode.data.extras ?? {}),
      };
      const connectedDatabase =
        currentGraph.edges
          .filter((edge) => edge.target === currentNode.id)
          .map((edge) => nodeMap[edge.source])
          .find((node): node is GraphNode => Boolean(node) && node.type === "database") ?? null;
      const connectedKnowledge =
        currentGraph.edges
          .filter((edge) => edge.target === currentNode.id)
          .map((edge) => nodeMap[edge.source])
          .find((node): node is GraphNode => Boolean(node) && node.type === "knowledge") ?? null;
      const connectedDbExpression = connectedDatabase ? fieldValueAsString(connectedDatabase.data.extras?.dbExpression) : undefined;
      const connectedKnowledgeExpression = connectedKnowledge ? fieldValueAsString(connectedKnowledge.data.extras?.knowledgeExpression) : undefined;
      const learningModelPreview = Boolean(currentExtras.useLearningModel)
        ? toPythonString(`${fieldValueAsString(currentNode.data.provider) || "openai"}:${fieldValueAsString(currentNode.data.model) || "gpt-4.1-mini"}`)
        : undefined;
      const generatedExpression = buildLearningMachineExpressionFromExtras(
        currentExtras,
        connectedDbExpression,
        connectedKnowledgeExpression,
        learningModelPreview,
      );
      const updateLearningMachineConfig = (patch: Record<string, unknown>) => {
        const nextExtras: Record<string, unknown> = {
          ...currentExtras,
          ...patch,
        };
        const nextLearningModelPreview = Boolean(nextExtras.useLearningModel)
          ? toPythonString(`${fieldValueAsString(currentNode.data.provider) || "openai"}:${fieldValueAsString(currentNode.data.model) || "gpt-4.1-mini"}`)
          : undefined;
        nextExtras.learningMachineExpression = buildLearningMachineExpressionFromExtras(
          nextExtras,
          connectedDbExpression,
          connectedKnowledgeExpression,
          nextLearningModelPreview,
        );
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
            {renderInspectorPropertyLabel("Description", "Optional description for the canvas and future docs/export surfaces.")}
            <textarea
              value={fieldValueAsString(currentNode.data.description)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
            />
          </label>
          {connectedDatabase ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Connected Database", "Database currently connected to this Learning Machine.")}
                <select value={connectedDatabase.data.name} disabled>
                  <option value={connectedDatabase.data.name}>{connectedDatabase.data.name}</option>
                </select>
              </label>
              <p className="muted small-note">Read-only because it is connected from {connectedDatabase.data.name}.</p>
            </>
          ) : (
            <div className="info-note">
              <p>Connect a Database node if you want this Learning Machine to persist state outside the default runtime behavior.</p>
            </div>
          )}
          {connectedKnowledge ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Connected Knowledge", "Knowledge resource currently connected to this Learning Machine.")}
                <select value={connectedKnowledge.data.name} disabled>
                  <option value={connectedKnowledge.data.name}>{connectedKnowledge.data.name}</option>
                </select>
              </label>
              <p className="muted small-note">Read-only because it is connected from {connectedKnowledge.data.name}.</p>
            </>
          ) : (
            <div className="info-note">
              <p>Connect a Knowledge node when you want learned knowledge to use a dedicated store.</p>
            </div>
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.useLearningModel)}
              onChange={(event) => updateLearningMachineConfig({ useLearningModel: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Use Learning Model", "Enables a dedicated provider/model pair for learning operations instead of relying on Agno defaults.")}
          </label>
          {Boolean(currentExtras.useLearningModel) ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Provider Preset", "Applies the provider catalog defaults for this learning model.")}
                <select
                  value={fieldValueAsString(getProviderConfig(currentNode.data).provider_profile)}
                  onChange={(event) =>
                    setGraph(updateNodeData(currentGraph, currentNode.id, applyProviderPreset(currentNode.data, event.target.value)))
                  }
                >
                  <option value="">Not set</option>
                  {AGNO_MODEL_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {renderInspectorPropertyLabel("Provider", "Provider id used to build the learning model instance.")}
                <input
                  value={fieldValueAsString(currentNode.data.provider)}
                  onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { provider: event.target.value }))}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Model", "Model id used for the learning operations.")}
                <input
                  value={fieldValueAsString(currentNode.data.model)}
                  onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { model: event.target.value }))}
                />
              </label>
            </>
          ) : null}
          <label>
            {renderInspectorPropertyLabel("Namespace", "Logical namespace used by the Learning Machine to isolate tenants or environments.")}
            <input
              value={fieldValueAsString(currentExtras.learningNamespace)}
              onChange={(event) => updateLearningMachineConfig({ learningNamespace: event.target.value })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningUserProfile)}
              onChange={(event) => updateLearningMachineConfig({ learningUserProfile: event.target.checked })}
            />
            {renderInspectorPropertyLabel("User Profile Store", "Tracks stable profile facts and long-lived user preferences.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningUserMemory)}
              onChange={(event) => updateLearningMachineConfig({ learningUserMemory: event.target.checked })}
            />
            {renderInspectorPropertyLabel("User Memory Store", "Stores user-specific memories that can be recalled across sessions.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningSessionContext)}
              onChange={(event) => updateLearningMachineConfig({ learningSessionContext: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Session Context Store", "Persists session-level context learned during execution.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningEntityMemory)}
              onChange={(event) => updateLearningMachineConfig({ learningEntityMemory: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Entity Memory Store", "Keeps memory about third-party entities, accounts, or external objects.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningLearnedKnowledge)}
              onChange={(event) => updateLearningMachineConfig({ learningLearnedKnowledge: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Learned Knowledge Store", "Stores knowledge synthesized from prior runs and observations.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningDecisionLog)}
              onChange={(event) => updateLearningMachineConfig({ learningDecisionLog: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Decision Log Store", "Tracks important decisions, rationale, and run-level outcomes.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.learningDebugMode)}
              onChange={(event) => updateLearningMachineConfig({ learningDebugMode: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Enable Debug Mode", "Turns on debug behavior for the Learning Machine runtime.")}
          </label>
          <label>
            {renderInspectorPropertyLabel("Generated Learning Machine Expression", "Preview of the Agno LearningMachine expression generated from the fields above.")}
            <textarea className="code-input" value={generatedExpression} readOnly />
          </label>
        </>
      );
    }

    if (selectedNode.type === "skills") {
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

    if (selectedNode.type === "interface") {
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

    if (selectedNode.type === "workflow") {
      const currentNode = selectedNode;
      const currentGraph = graph;
      if (!currentGraph) {
        return null;
      }
      const currentWorkflowConfig: Record<string, unknown> = {
        debug_mode: true,
        stream_events: true,
        stream_executor_events: true,
        store_executor_outputs: true,
        telemetry: true,
        num_history_runs: 3,
        cache_session: false,
        add_workflow_history_to_steps: false,
        ...(getWorkflowConfig(currentNode.data) ?? {}),
      };
      const connectedDatabase =
        currentGraph.edges
          .filter((edge) => edge.target === currentNode.id)
          .map((edge) => nodeMap[edge.source])
          .find((node): node is GraphNode => Boolean(node) && node.type === "database") ?? null;
      const connectedSteps = currentGraph.edges
        .filter((edge) => edge.target === currentNode.id)
        .map((edge) => nodeMap[edge.source])
        .filter((node): node is GraphNode => Boolean(node) && node.type === "workflow_step")
        .sort((left, right) => {
          const leftOrder = Number(fieldValueAsString(left.data.extras?.stepOrder) || "9999");
          const rightOrder = Number(fieldValueAsString(right.data.extras?.stepOrder) || "9999");
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          if (left.position.x !== right.position.x) {
            return left.position.x - right.position.x;
          }
          if (left.position.y !== right.position.y) {
            return left.position.y - right.position.y;
          }
          return left.data.name.localeCompare(right.data.name);
        });

      return (
        <>
          <label>
            {renderInspectorPropertyLabel("Name", "Workflow display name used in the canvas and generated code.", true)}
            <input
              value={currentNode.data.name}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Description", "Optional workflow description passed to Agno and shown in the canvas.")}
            <textarea
              value={fieldValueAsString(currentNode.data.description)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { description: event.target.value }))}
            />
          </label>
          {connectedSteps.length ? (
            <div className="info-note">
              <p>
                <strong>Ordered steps</strong>
              </p>
              <p>{connectedSteps.map((step) => `${fieldValueAsString(step.data.extras?.stepOrder) || "?"}. ${step.data.name}`).join(" | ")}</p>
            </div>
          ) : (
            <div className="info-note">
              <p>Connect one or more Workflow Step nodes to this Workflow to build the execution order.</p>
            </div>
          )}
          {connectedDatabase ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Connected Database", "Database currently connected to this Workflow for persisted session state.")}
                <select value={connectedDatabase.data.name} disabled>
                  <option value={connectedDatabase.data.name}>{connectedDatabase.data.name}</option>
                </select>
              </label>
              <p className="muted small-note">Read-only because it is connected from {connectedDatabase.data.name}.</p>
            </>
          ) : (
            <div className="info-note">
              <p>Connect a Database node if you want persisted workflow session state and history.</p>
            </div>
          )}
          <label>
            {renderInspectorPropertyLabel("User ID", "Optional user id forwarded to the workflow runtime.")}
            <input
              value={fieldValueAsString(currentWorkflowConfig.user_id)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "user_id", event.target.value)))}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Session ID", "Optional workflow session id.")}
            <input
              value={fieldValueAsString(currentWorkflowConfig.session_id)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "session_id", event.target.value)))}
            />
          </label>
          <label>
            {renderInspectorPropertyLabel("Session State", "Optional initial workflow session state JSON.")}
            <textarea
              className="code-input"
              value={fieldValueAsString(currentWorkflowConfig.session_state)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "session_state", event.target.value)))}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.add_session_state_to_context)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "add_session_state_to_context", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Add Session State To Context", "Makes workflow session state available to the steps during execution.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.overwrite_db_session_state)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "overwrite_db_session_state", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Overwrite DB Session State", "Overwrites persisted session state with the configured session state when the workflow starts.")}
          </label>
          <label>
            {renderInspectorPropertyLabel("Dependencies", "Optional dependency JSON shared with workflow steps.")}
            <textarea
              className="code-input"
              value={fieldValueAsString(currentWorkflowConfig.dependencies)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "dependencies", event.target.value)))}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.add_dependencies_to_context)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "add_dependencies_to_context", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Add Dependencies To Context", "Injects workflow dependencies into step execution context.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.cache_session)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "cache_session", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Cache Session", "Caches workflow session data between runs when supported by Agno.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.add_workflow_history_to_steps)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "add_workflow_history_to_steps", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Add Workflow History To Steps", "Makes previous workflow history available to step executors.")}
          </label>
          <label>
            {renderInspectorPropertyLabel("Workflow History Runs", "How many previous workflow runs should be available when history is enabled.")}
            <input
              type="number"
              min="1"
              value={fieldValueAsString(currentWorkflowConfig.num_history_runs)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "num_history_runs", Number(event.target.value))))}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.stream)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "stream", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Stream", "Enables streaming mode for the workflow run output.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.stream_events)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "stream_events", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Stream Events", "Streams workflow events during execution.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={currentWorkflowConfig.stream_executor_events !== false}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "stream_executor_events", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Stream Executor Events", "Includes agent and team executor events in the workflow event stream.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.store_events)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "store_events", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Store Events", "Stores emitted workflow events in the run output.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={currentWorkflowConfig.store_executor_outputs !== false}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "store_executor_outputs", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Store Executor Outputs", "Stores the raw outputs produced by each step executor.")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentWorkflowConfig.debug_mode)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "debug_mode", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Debug Mode", "Enables Agno workflow debug mode.")}
          </label>
          <label>
            {renderInspectorPropertyLabel("Debug Level", "Workflow debug verbosity level.")}
            <select
              value={fieldValueAsString(currentWorkflowConfig.debug_level)}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "debug_level", Number(event.target.value))))}
            >
              <option value="">Default</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={currentWorkflowConfig.telemetry !== false}
              onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, updateWorkflowConfig(currentNode.data, "telemetry", event.target.checked)))}
            />
            {renderInspectorPropertyLabel("Telemetry", "Keeps Agno workflow telemetry enabled.")}
          </label>
        </>
      );
    }

    if (selectedNode.type === "workflow_step") {
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

    if (selectedNode.type === "input") {
      const currentNode = selectedNode;
      const currentGraph = graph;
      if (!currentGraph) {
        return null;
      }
      const currentInputSource = getInputSource(currentNode.data);
      const inputMode = getInputMode(currentNode.data);
      const emailProtocol = getEmailProtocol(currentNode.data);
      const emailSecurity = getEmailSecurity(currentNode.data);
      const currentExtras = currentNode.data.extras ?? {};
      const currentMetadata = buildInputMetadataFromExtras(currentExtras);
      const hasHitlAutoApproveOverride = Object.prototype.hasOwnProperty.call(currentExtras, "hitlAutoApprove");
      const hitlAutoApproveValue = normalizeHitlAutoApproveSelection(
        hasHitlAutoApproveOverride ? currentExtras.hitlAutoApprove : currentMetadata.hitl_auto_approve,
      );
      const hasHitlUserInputOverride = Object.prototype.hasOwnProperty.call(currentExtras, "hitlUserInputJson");
      const fallbackHitlUserInput =
        !hasHitlUserInputOverride &&
        currentMetadata.hitl_user_input &&
        typeof currentMetadata.hitl_user_input === "object" &&
        !Array.isArray(currentMetadata.hitl_user_input)
          ? stringifyJsonObject(currentMetadata.hitl_user_input as Record<string, unknown>)
          : "";
      const hitlUserInputJson = hasHitlUserInputOverride
        ? fieldValueAsString(currentExtras.hitlUserInputJson)
        : fallbackHitlUserInput;
      const attachedFileName = getAttachedFileName(currentNode.data);
      const attachedFileMimeType = fieldValueAsString(currentNode.data.extras?.attachedFileMimeType);
      const emailUnreadOnly = Boolean(currentExtras.emailUnreadOnly ?? true);
      const emailListenerEnabled = Boolean(currentExtras.emailListenerEnabled ?? true);
      const currentFlowRouteName = slugifyFlowName(flowName) || "save_this_flow_first";
      const webhookEndpoint = `${API_BASE}/api/integrations/webhook/${encodeURIComponent(currentFlowRouteName)}/${encodeURIComponent(currentNode.id)}`;
      const whatsappEventsEndpoint = `${API_BASE}/api/integrations/whatsapp/${encodeURIComponent(currentFlowRouteName)}/${encodeURIComponent(currentNode.id)}/events`;
      const formEndpoint = `${API_BASE}/api/integrations/form/${encodeURIComponent(currentFlowRouteName)}/${encodeURIComponent(currentNode.id)}`;
      const updateInputExtras = (patch: Record<string, unknown>) =>
        setGraph(
          updateNodeData(currentGraph, currentNode.id, {
            extras: {
              ...currentExtras,
              ...patch,
            },
          }),
        );

      async function handleInputFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) {
          return;
        }

        const fileBuffer = await file.arrayBuffer();
        const fileBase64 = arrayBufferToBase64(fileBuffer);
        setGraph(
          updateNodeData(currentGraph, currentNode.id, {
            extras: {
              ...(currentNode.data.extras ?? {}),
              attachedFileName: file.name,
              attachedFileAlias: fieldValueAsString(currentNode.data.extras?.attachedFileAlias) || file.name,
              attachedFileMimeType: file.type || "text/plain",
              attachedFileEncoding: "base64",
              attachedFileBase64: fileBase64,
              attachedFileContent: "",
            },
          }),
        );
      }

      function updateEmailProtocol(nextProtocol: "imap" | "pop") {
        const currentPort = fieldValueAsString(currentExtras.emailPort).trim();
        const currentDefaultPort = getDefaultEmailPort(emailProtocol, emailSecurity);
        const nextDefaultPort = getDefaultEmailPort(nextProtocol, emailSecurity);
        updateInputExtras({
          emailProtocol: nextProtocol,
          emailPort: !currentPort || currentPort === currentDefaultPort ? nextDefaultPort : currentPort,
          emailUnreadOnly: nextProtocol === "pop" ? false : emailUnreadOnly,
        });
      }

      function updateEmailSecurity(nextSecurity: "ssl" | "starttls" | "none") {
        const currentPort = fieldValueAsString(currentExtras.emailPort).trim();
        const currentDefaultPort = getDefaultEmailPort(emailProtocol, emailSecurity);
        const nextDefaultPort = getDefaultEmailPort(emailProtocol, nextSecurity);
        updateInputExtras({
          emailSecurity: nextSecurity,
          emailPort: !currentPort || currentPort === currentDefaultPort ? nextDefaultPort : currentPort,
        });
      }

      return (
        <>
          <label>
            Name
            <span className="required-mark">*</span>
            <input
              value={selectedNode.data.name}
              onChange={(event) =>
                setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))
              }
            />
          </label>

          <label>
            {renderInspectorPropertyLabel("Input Source", "Choose whether this flow starts from manual payloads, email inbox polling, webhooks, WhatsApp messages, or form submissions.", true)}
            <select
              value={currentInputSource}
              onChange={(event) => {
                const nextSource = event.target.value as "manual" | "email" | "webhook" | "whatsapp" | "form";
                if (nextSource === "email") {
                  updateInputExtras({
                    inputSource: "email",
                    inputMode: "text",
                    attachedFileName: "",
                    attachedFileAlias: "",
                    attachedFileMimeType: "",
                    attachedFileEncoding: "base64",
                    attachedFileBase64: "",
                    attachedFileContent: "",
                    emailPort: fieldValueAsString(currentExtras.emailPort).trim() || getDefaultEmailPort(emailProtocol, emailSecurity),
                  });
                  return;
                }

                if (nextSource === "webhook") {
                  updateInputExtras({
                    inputSource: "webhook",
                    inputMode: "text",
                    attachedFileName: "",
                    attachedFileAlias: "",
                    attachedFileMimeType: "",
                    attachedFileEncoding: "base64",
                    attachedFileBase64: "",
                    attachedFileContent: "",
                    inputText: getInputText(currentNode.data) || "Webhook event received.",
                    webhookSecretHeader: fieldValueAsString(currentExtras.webhookSecretHeader) || "X-AgnoLab-Secret",
                    webhookTextField: fieldValueAsString(currentExtras.webhookTextField) || "message",
                  });
                  return;
                }

                if (nextSource === "whatsapp") {
                  updateInputExtras({
                    inputSource: "whatsapp",
                    inputMode: "text",
                    attachedFileName: "",
                    attachedFileAlias: "",
                    attachedFileMimeType: "",
                    attachedFileEncoding: "base64",
                    attachedFileBase64: "",
                    attachedFileContent: "",
                    inputText: getInputText(currentNode.data) || "WhatsApp message received.",
                    whatsappSessionId: fieldValueAsString(currentExtras.whatsappSessionId) || `agnolab_whatsapp_${currentNode.id}`,
                    whatsappWebhookSecret: fieldValueAsString(currentExtras.whatsappWebhookSecret) || createClientSecret("wa"),
                    whatsappIgnoreGroups: currentExtras.whatsappIgnoreGroups ?? true,
                    whatsappReplyEnabled: currentExtras.whatsappReplyEnabled ?? true,
                    whatsappReplyTemplate: fieldValueAsString(currentExtras.whatsappReplyTemplate) || "$result_text",
                  });
                  return;
                }

                if (nextSource === "form") {
                  updateInputExtras({
                    inputSource: "form",
                    inputMode: inputMode === "file" ? "file" : "mixed",
                    inputText: getInputText(currentNode.data) || "New form submission received.",
                    formSecretHeader: fieldValueAsString(currentExtras.formSecretHeader) || "X-AgnoLab-Secret",
                    formSecretField: fieldValueAsString(currentExtras.formSecretField) || "_secret",
                    formTextField: fieldValueAsString(currentExtras.formTextField) || "message",
                    formMetadataField: fieldValueAsString(currentExtras.formMetadataField) || "metadata_json",
                  });
                  return;
                }

                updateInputExtras({
                  inputSource: "manual",
                });
              }}
            >
              <option value="manual">Manual payload</option>
              <option value="email">Email inbox</option>
              <option value="webhook">Webhook</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="form">Form submission</option>
            </select>
          </label>

          {currentInputSource === "manual" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Payload Mode", "Controls whether this input sends text, a file, or both.", true)}
                <select
                  value={inputMode}
                  onChange={(event) =>
                    updateInputExtras({
                      inputMode: event.target.value,
                    })
                  }
                >
                  <option value="text">Text only</option>
                  <option value="file">File only</option>
                  <option value="mixed">Text + file</option>
                </select>
              </label>

              {inputMode !== "file" ? (
                <label>
                  {renderInspectorPropertyLabel("Text Payload", "Default text passed to the flow when this input runs manually.")}
                  <textarea
                    value={getInputText(selectedNode.data)}
                    onChange={(event) =>
                      setGraph(
                        updateNodeData(currentGraph, currentNode.id, {
                          prompt: event.target.value,
                          extras: {
                            ...(currentNode.data.extras ?? {}),
                            inputText: event.target.value,
                          },
                        }),
                      )
                    }
                  />
                </label>
              ) : null}

              {inputMode !== "text" ? (
                <>
                  <label>
                    {renderInspectorPropertyLabel("Upload File", "Attach CSV, JSON, TXT, TSV, XLS, or XLSX content to the input payload.")}
                    <input
                      type="file"
                      accept={FLOW_INPUT_FILE_ACCEPT}
                      onChange={handleInputFileChange}
                    />
                  </label>
                  <p className="muted">{FLOW_INPUT_FILE_SUPPORT_NOTE}</p>

                  <label>
                    {renderInspectorPropertyLabel("File Alias", "Optional display name exposed alongside the uploaded file path.")}
                    <input
                      value={fieldValueAsString(currentExtras.attachedFileAlias)}
                      onChange={(event) =>
                        updateInputExtras({
                          attachedFileAlias: event.target.value,
                        })
                      }
                    />
                  </label>

                  {attachedFileName ? (
                    <div className="info-note">
                      <p>
                        <strong>{attachedFileName}</strong>
                      </p>
                      <p>{attachedFileMimeType || "text/plain"}</p>
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            updateInputExtras({
                              attachedFileName: "",
                              attachedFileAlias: "",
                              attachedFileMimeType: "",
                              attachedFileEncoding: "base64",
                              attachedFileBase64: "",
                              attachedFileContent: "",
                            })
                          }
                        >
                          Clear File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="info-note">
                      <p>Use upload to attach CSV, JSON, TXT, TSV, XLS, or XLSX files to the payload.</p>
                    </div>
                  )}
                </>
              ) : null}
            </>
          ) : currentInputSource === "email" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Protocol", "Select whether this mailbox should be read with IMAP or POP3.", true)}
                <select
                  value={emailProtocol}
                  onChange={(event) => updateEmailProtocol(event.target.value as "imap" | "pop")}
                >
                  <option value="imap">IMAP</option>
                  <option value="pop">POP3</option>
                </select>
              </label>

              <label>
                {renderInspectorPropertyLabel("Security", "Connection security used when connecting to the mailbox server.", true)}
                <select
                  value={emailSecurity}
                  onChange={(event) => updateEmailSecurity(event.target.value as "ssl" | "starttls" | "none")}
                >
                  <option value="ssl">SSL/TLS</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="none">None</option>
                </select>
              </label>

              <label>
                {renderInspectorPropertyLabel("Host", "IMAP or POP server hostname, for example imap.gmail.com.", true)}
                <input
                  value={fieldValueAsString(currentExtras.emailHost)}
                  onChange={(event) => updateInputExtras({ emailHost: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Port", "Mailbox server port. Defaults change with protocol and security.")}
                <input
                  value={fieldValueAsString(currentExtras.emailPort)}
                  onChange={(event) => updateInputExtras({ emailPort: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Mailbox", "Folder to inspect when using IMAP. POP3 ignores this field and always reads the inbox.")}
                <input
                  value={fieldValueAsString(currentExtras.emailMailbox)}
                  onChange={(event) => updateInputExtras({ emailMailbox: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Username", "Mailbox login or email address used to authenticate.", true)}
                <input
                  value={fieldValueAsString(currentExtras.emailUsername)}
                  onChange={(event) => updateInputExtras({ emailUsername: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Password", "Mailbox password or app password. Stored in the flow config, so prefer app passwords.", true)}
                <input
                  type="password"
                  value={fieldValueAsString(currentExtras.emailPassword)}
                  onChange={(event) => updateInputExtras({ emailPassword: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Max Messages to Scan", "Newest messages checked per run before giving up. Higher values help if your filters are very specific.")}
                <input
                  value={fieldValueAsString(currentExtras.emailMaxMessages)}
                  onChange={(event) => updateInputExtras({ emailMaxMessages: event.target.value })}
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={emailListenerEnabled}
                  onChange={(event) => updateInputExtras({ emailListenerEnabled: event.target.checked })}
                />
                {renderInspectorPropertyLabel(
                  "Background Listener",
                  "Starts a backend monitor after the flow is saved. IMAP stays under continuous watch through a background loop; POP also runs through the same monitor using polling.",
                )}
              </label>

              <label>
                {renderInspectorPropertyLabel("Listener Interval (seconds)", "How often the backend listener checks the mailbox for new matches. Lower values react faster but create more mailbox traffic.")}
                <input
                  value={fieldValueAsString(currentExtras.emailPollIntervalSeconds)}
                  onChange={(event) => updateInputExtras({ emailPollIntervalSeconds: event.target.value })}
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={emailProtocol === "pop" ? false : emailUnreadOnly}
                  disabled={emailProtocol === "pop"}
                  onChange={(event) => updateInputExtras({ emailUnreadOnly: event.target.checked })}
                />
                {renderInspectorPropertyLabel(
                  "Unread Only",
                  emailProtocol === "pop"
                    ? "POP3 does not expose unread state, so this option is only available for IMAP."
                    : "When enabled, only unread IMAP messages are considered.",
                )}
              </label>

              <label>
                {renderInspectorPropertyLabel("Subject Filter", "Optional case-insensitive substring match against the email subject.")}
                <input
                  value={fieldValueAsString(currentExtras.emailSubjectFilter)}
                  onChange={(event) => updateInputExtras({ emailSubjectFilter: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Sender Filter", "Optional case-insensitive substring match against the sender address or name.")}
                <input
                  value={fieldValueAsString(currentExtras.emailFromFilter)}
                  onChange={(event) => updateInputExtras({ emailFromFilter: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Recipient Filter", "Optional case-insensitive substring match against the To recipients.")}
                <input
                  value={fieldValueAsString(currentExtras.emailToFilter)}
                  onChange={(event) => updateInputExtras({ emailToFilter: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Body Keywords", "Optional comma or line-break separated keywords. All keywords must appear in the message body.")}
                <textarea
                  value={fieldValueAsString(currentExtras.emailBodyKeywords)}
                  onChange={(event) => updateInputExtras({ emailBodyKeywords: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Fallback Text", "Optional text used when no email matches the filters or the mailbox cannot be reached.")}
                <textarea
                  value={getInputText(selectedNode.data)}
                  onChange={(event) =>
                    setGraph(
                      updateNodeData(currentGraph, currentNode.id, {
                        prompt: event.target.value,
                        extras: {
                          ...(currentNode.data.extras ?? {}),
                          inputText: event.target.value,
                        },
                      }),
                    )
                  }
                />
              </label>

              <div className="info-note">
                <p>After you save the flow, the backend listener can monitor this inbox automatically. Manual run still works and uses the newest matching email as `flow_input_payload.text`.</p>
              </div>
            </>
          ) : currentInputSource === "webhook" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Webhook Endpoint", "Save the flow, then send HTTP POST requests to this endpoint to trigger it.")}
                <input value={webhookEndpoint} readOnly />
              </label>

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleOpenWebhookCurlModal(currentNode, webhookEndpoint)}
                >
                  Show cURL Example
                </button>
              </div>

              <label>
                {renderInspectorPropertyLabel("Shared Secret", "Optional secret compared against the configured header before the flow is allowed to run.")}
                <input
                  type="password"
                  value={fieldValueAsString(currentExtras.webhookSecret)}
                  onChange={(event) => updateInputExtras({ webhookSecret: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Secret Header", "Header name used to carry the shared secret from the caller, for example X-AgnoLab-Secret.")}
                <input
                  value={fieldValueAsString(currentExtras.webhookSecretHeader)}
                  onChange={(event) => updateInputExtras({ webhookSecretHeader: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Text Field", "JSON field preferred as the main flow text when the webhook body is an object.")}
                <input
                  value={fieldValueAsString(currentExtras.webhookTextField)}
                  onChange={(event) => updateInputExtras({ webhookTextField: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Fallback Text", "Preview text used for manual runs or when the webhook body does not expose the configured field.")}
                <textarea
                  value={getInputText(selectedNode.data)}
                  onChange={(event) =>
                    setGraph(
                      updateNodeData(currentGraph, currentNode.id, {
                        prompt: event.target.value,
                        extras: {
                          ...(currentNode.data.extras ?? {}),
                          inputText: event.target.value,
                        },
                      }),
                    )
                  }
                />
              </label>

              <div className="info-note">
                <p>External callers can send JSON or plain text. The backend forwards headers, query params, parsed JSON, and body metadata into the flow.</p>
                {projectAuthEnabled ? <p>This flow also requires `Authorization: Bearer ...` on webhook requests.</p> : null}
              </div>
            </>
          ) : currentInputSource === "whatsapp" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("WhatsApp Session ID", "Stable session name used inside the WhatsApp gateway. Reuse the same id to preserve the linked device login.", true)}
                <input
                  value={fieldValueAsString(currentExtras.whatsappSessionId)}
                  onChange={(event) => updateInputExtras({ whatsappSessionId: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Events Endpoint", "Internal callback used by the WhatsApp gateway to trigger this flow when a new message arrives.")}
                <input value={whatsappEventsEndpoint} readOnly />
              </label>

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleOpenWhatsappSessionModal(currentNode)}
                >
                  Connect / Scan QR
                </button>
              </div>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(currentExtras.whatsappIgnoreGroups ?? true)}
                  onChange={(event) => updateInputExtras({ whatsappIgnoreGroups: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Ignore Group Messages", "When enabled, only direct 1:1 WhatsApp conversations trigger the flow.")}
              </label>

              <label>
                {renderInspectorPropertyLabel("Sender Filter", "Optional case-insensitive substring filter applied to the sender id or push name.")}
                <input
                  value={fieldValueAsString(currentExtras.whatsappSenderFilter)}
                  onChange={(event) => updateInputExtras({ whatsappSenderFilter: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Body Keywords", "Optional comma or line-break separated keywords. All keywords must appear in the incoming WhatsApp message.")}
                <textarea
                  value={fieldValueAsString(currentExtras.whatsappBodyKeywords)}
                  onChange={(event) => updateInputExtras({ whatsappBodyKeywords: event.target.value })}
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(currentExtras.whatsappReplyEnabled ?? true)}
                  onChange={(event) => updateInputExtras({ whatsappReplyEnabled: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Auto Reply With Flow Result", "Sends the final clean flow result back to the same WhatsApp chat using the connected gateway session.")}
              </label>

              <label>
                {renderInspectorPropertyLabel("Reply Template", "Template for the outgoing WhatsApp reply. Use `$result_text`, `$input_text`, `$whatsapp_from`, `$whatsapp_sender_name`, and metadata keys.")}
                <textarea
                  value={fieldValueAsString(currentExtras.whatsappReplyTemplate)}
                  onChange={(event) => updateInputExtras({ whatsappReplyTemplate: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Fallback Text", "Preview text used when you manually run this flow without a live WhatsApp event.")}
                <textarea
                  value={getInputText(selectedNode.data)}
                  onChange={(event) =>
                    setGraph(
                      updateNodeData(currentGraph, currentNode.id, {
                        prompt: event.target.value,
                        extras: {
                          ...(currentNode.data.extras ?? {}),
                          inputText: event.target.value,
                        },
                      }),
                    )
                  }
                />
              </label>

              <div className="info-note">
                <p>Save the flow, open Connect / Scan QR, and pair the device. After that, each matching WhatsApp message runs the flow and can reply automatically with the final result.</p>
                <p>The WhatsApp listener always executes the saved flow version on the backend. If you changed agent wiring, instructions, or Runtime Variables, save the flow before testing a new message.</p>
                <p>The QR/session modal uses `WHATSAPP_GATEWAY_BASE_URL`, `WHATSAPP_GATEWAY_SECRET_KEY`, and `WHATSAPP_WEBHOOK_BASE_URL` from the saved flow Runtime Variables. Save the flow again after editing them.</p>
              </div>
            </>
          ) : currentInputSource === "form" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Form Endpoint", "Save the flow, then submit multipart or URL-encoded forms to this endpoint.")}
                <input value={formEndpoint} readOnly />
              </label>

              <label>
                {renderInspectorPropertyLabel("Payload Mode", "Controls the preview payload used when you test this input manually from chat or run preview.", true)}
                <select
                  value={inputMode}
                  onChange={(event) =>
                    updateInputExtras({
                      inputMode: event.target.value,
                    })
                  }
                >
                  <option value="text">Text only</option>
                  <option value="file">File only</option>
                  <option value="mixed">Text + file</option>
                </select>
              </label>

              {inputMode !== "file" ? (
                <label>
                  {renderInspectorPropertyLabel("Preview Text", "Preview text used for manual runs or when the form text field is empty.")}
                  <textarea
                    value={getInputText(selectedNode.data)}
                    onChange={(event) =>
                      setGraph(
                        updateNodeData(currentGraph, currentNode.id, {
                          prompt: event.target.value,
                          extras: {
                            ...(currentNode.data.extras ?? {}),
                            inputText: event.target.value,
                          },
                        }),
                      )
                    }
                  />
                </label>
              ) : null}

              {inputMode !== "text" ? (
                <>
                  <label>
                    {renderInspectorPropertyLabel("Upload File", "Preview attachment used when testing form submissions manually.")}
                    <input type="file" accept={FLOW_INPUT_FILE_ACCEPT} onChange={handleInputFileChange} />
                  </label>
                  <p className="muted">{FLOW_INPUT_FILE_SUPPORT_NOTE}</p>

                  <label>
                    {renderInspectorPropertyLabel("File Alias", "Optional display name exposed alongside the uploaded file path.")}
                    <input
                      value={fieldValueAsString(currentExtras.attachedFileAlias)}
                      onChange={(event) =>
                        updateInputExtras({
                          attachedFileAlias: event.target.value,
                        })
                      }
                    />
                  </label>

                  {attachedFileName ? (
                    <div className="info-note">
                      <p>
                        <strong>{attachedFileName}</strong>
                      </p>
                      <p>{attachedFileMimeType || "text/plain"}</p>
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            updateInputExtras({
                              attachedFileName: "",
                              attachedFileAlias: "",
                              attachedFileMimeType: "",
                              attachedFileEncoding: "base64",
                              attachedFileBase64: "",
                              attachedFileContent: "",
                            })
                          }
                        >
                          Clear File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="info-note">
                      <p>Use upload to preview a file-backed form submission.</p>
                    </div>
                  )}
                </>
              ) : null}

              <label>
                {renderInspectorPropertyLabel("Shared Secret", "Optional secret accepted either from the configured header or from the configured hidden form field.")}
                <input
                  type="password"
                  value={fieldValueAsString(currentExtras.formSecret)}
                  onChange={(event) => updateInputExtras({ formSecret: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Secret Header", "Optional header name that can carry the secret for form submissions.")}
                <input
                  value={fieldValueAsString(currentExtras.formSecretHeader)}
                  onChange={(event) => updateInputExtras({ formSecretHeader: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Secret Form Field", "Hidden form field name that can also carry the secret.")}
                <input
                  value={fieldValueAsString(currentExtras.formSecretField)}
                  onChange={(event) => updateInputExtras({ formSecretField: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Text Field", "Field name preferred as the main flow text when the form is submitted.")}
                <input
                  value={fieldValueAsString(currentExtras.formTextField)}
                  onChange={(event) => updateInputExtras({ formTextField: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Metadata JSON Field", "Optional form field whose content is parsed as JSON and merged into flow_input_metadata.")}
                <input
                  value={fieldValueAsString(currentExtras.formMetadataField)}
                  onChange={(event) => updateInputExtras({ formMetadataField: event.target.value })}
                />
              </label>

              <label>
                {renderInspectorPropertyLabel("Primary File Field", "Optional field name used to prioritize one uploaded file when a form sends many files.")}
                <input
                  value={fieldValueAsString(currentExtras.formPrimaryFileField)}
                  onChange={(event) => updateInputExtras({ formPrimaryFileField: event.target.value })}
                />
              </label>

              <div className="info-note">
                <p>The backend accepts multipart form-data and x-www-form-urlencoded payloads. All fields and files are exposed to the flow runtime metadata.</p>
              </div>
            </>
          ) : null}

          <label>
            {renderInspectorPropertyLabel("Payload Metadata JSON", "Static metadata merged into `flow_input_metadata` on every run.")}
            <textarea
              className="code-input"
              value={fieldValueAsString(currentExtras.payloadJson)}
              onChange={(event) =>
                updateInputExtras({
                  payloadJson: event.target.value,
                })
              }
            />
          </label>

          <label>
            {renderInspectorPropertyLabel("HITL Auto Approve", "Controls whether HITL workflow steps auto-continue or open the confirmation modal at run time.")}
            <select
              value={hitlAutoApproveValue}
              onChange={(event) =>
                updateInputExtras({
                  hitlAutoApprove: event.target.value,
                })
              }
            >
              <option value="">Not set (manual confirmation modal on run)</option>
              <option value="true">true (auto-continue HITL)</option>
              <option value="false">false (force confirmation modal on run)</option>
            </select>
          </label>

          <label>
            {renderInspectorPropertyLabel("HITL User Input (JSON)", "Optional structured payload forwarded when a HITL gate expects user input fields.")}
            <textarea
              className="code-input"
              placeholder={"{\n  \"ticket_id\": \"HITL-DEMO-001\",\n  \"review_note\": \"approved\"\n}\n"}
              value={hitlUserInputJson}
              onChange={(event) =>
                updateInputExtras({
                  hitlUserInputJson: event.target.value,
                })
              }
            />
          </label>

          <div className="info-note">
            <p>The codegen exposes `flow_input_payload`, `flow_input_files`, `flow_input_file_path`, and `flow_input` to tools, agents, and teams.</p>
          </div>
        </>
      );
    }

    if (
      selectedNode.type === "memory_manager" ||
      selectedNode.type === "session_summary_manager" ||
      selectedNode.type === "compression_manager"
    ) {
      const currentNode = selectedNode;
      const currentManagerType = currentNode.type as "memory_manager" | "session_summary_manager" | "compression_manager";
      const currentGraph = graph;
      if (!currentGraph) {
        return null;
      }
      const currentExtras = currentNode.data.extras ?? {};
      const updateManagerConfig = (patch: Record<string, unknown>) =>
        setGraph(
          updateNodeData(currentGraph, currentNode.id, {
            extras: {
              ...currentExtras,
              ...patch,
              managerExpression: buildManagerExpressionFromExtras(currentManagerType, {
                ...currentExtras,
                ...patch,
              }),
            },
          }),
        );
      const connectedDatabase =
        currentNode.type === "memory_manager"
          ? currentGraph.edges
              .filter((edge) => edge.target === currentNode.id)
              .map((edge) => nodeMap[edge.source])
              .find((node): node is GraphNode => Boolean(node) && node.type === "database") ?? null
          : null;

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
            {renderInspectorPropertyLabel("Component Type", "Identifies which Agno manager class this node represents. The type is fixed after creation.")}
            <select value={currentNode.type} disabled>
              <option value={currentNode.type}>{NODE_CATALOG[currentNode.type].label}</option>
            </select>
          </label>
          <p className="muted small-note">This component type is fixed by the node. Create a new node to switch manager types.</p>
          {connectedDatabase ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Connected Database", "Database node currently connected to this manager.")}
                <select value={connectedDatabase.data.name} disabled>
                  <option value={connectedDatabase.data.name}>{connectedDatabase.data.name}</option>
                </select>
              </label>
              <p className="muted small-note">Read-only because it is connected from {connectedDatabase.data.name}.</p>
            </>
          ) : null}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(currentExtras.useManagerModel)}
              onChange={(event) => updateManagerConfig({ useManagerModel: event.target.checked })}
            />
            {renderInspectorPropertyLabel("Use Manager Model", "Enables a dedicated provider and model for this manager, instead of relying on Agno defaults.")}
          </label>
          {Boolean(currentExtras.useManagerModel) ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Provider Preset", "Applies the provider catalog defaults for this manager model.")}
                <select
                  value={fieldValueAsString(getProviderConfig(currentNode.data).provider_profile)}
                  onChange={(event) =>
                    setGraph(updateNodeData(currentGraph, currentNode.id, applyProviderPreset(currentNode.data, event.target.value)))
                  }
                >
                  <option value="">Not set</option>
                  {AGNO_MODEL_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {renderInspectorPropertyLabel("Provider", "Provider id used to build the manager model instance.")}
                <input
                  value={fieldValueAsString(currentNode.data.provider)}
                  onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { provider: event.target.value }))}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Model", "Model id used by the manager component.")}
                <input
                  value={fieldValueAsString(currentNode.data.model)}
                  onChange={(event) => setGraph(updateNodeData(currentGraph, currentNode.id, { model: event.target.value }))}
                />
              </label>
            </>
          ) : null}
          {currentNode.type === "memory_manager" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("System Message", "Optional system message passed to the Memory Manager.")}
                <textarea
                  value={fieldValueAsString(currentExtras.systemMessage)}
                  onChange={(event) => updateManagerConfig({ systemMessage: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Memory Capture Instructions", "Instructions that control how the manager extracts durable user memories.")}
                <textarea
                  value={fieldValueAsString(currentExtras.memoryCaptureInstructions)}
                  onChange={(event) => updateManagerConfig({ memoryCaptureInstructions: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Additional Instructions", "Extra instructions appended to the manager prompt.")}
                <textarea
                  value={fieldValueAsString(currentExtras.additionalInstructions)}
                  onChange={(event) => updateManagerConfig({ additionalInstructions: event.target.value })}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(currentExtras.debugMode)}
                  onChange={(event) => updateManagerConfig({ debugMode: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Enable Debug Mode", "Turns on debug behavior for the Memory Manager.")}
              </label>
            </>
          ) : currentNode.type === "session_summary_manager" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Summary Request Message", "Message used when asking the model to summarize the session.")}
                <input
                  value={fieldValueAsString(currentExtras.summaryRequestMessage)}
                  onChange={(event) => updateManagerConfig({ summaryRequestMessage: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Session Summary Prompt", "Optional custom prompt used to generate the session summary.")}
                <textarea
                  value={fieldValueAsString(currentExtras.sessionSummaryPrompt)}
                  onChange={(event) => updateManagerConfig({ sessionSummaryPrompt: event.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={currentExtras.compressToolResults !== false}
                  onChange={(event) => updateManagerConfig({ compressToolResults: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Enable Tool Result Compression", "Turns on compression of tool results for this manager.")}
              </label>
              <label>
                {renderInspectorPropertyLabel("Tool Results Limit", "Triggers compression after this many uncompressed tool results.")}
                <input
                  type="number"
                  min="1"
                  value={fieldValueAsString(currentExtras.compressToolResultsLimit)}
                  onChange={(event) => updateManagerConfig({ compressToolResultsLimit: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Token Limit", "Optional token threshold that triggers compression based on context size.")}
                <input
                  type="number"
                  min="1"
                  value={fieldValueAsString(currentExtras.compressTokenLimit)}
                  onChange={(event) => updateManagerConfig({ compressTokenLimit: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Compression Instructions", "Optional custom instructions used when compressing tool calls and results.")}
                <textarea
                  value={fieldValueAsString(currentExtras.compressToolCallInstructions)}
                  onChange={(event) => updateManagerConfig({ compressToolCallInstructions: event.target.value })}
                />
              </label>
            </>
          )}
        </>
      );
    }

    if (selectedNode.type === "agent") {
      const connectedTools = graph?.edges
        .filter((edge) => edge.target === selectedNode.id)
        .map((edge) => nodeMap[edge.source])
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
        .filter((node) => node.type === "tool");
      const pluggedResources = graph?.edges
        .filter((edge) => edge.target === selectedNode.id)
        .map((edge) => nodeMap[edge.source])
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
        .filter((node) => ["database", "vector_db", "knowledge", "skills", "learning_machine", "memory_manager", "session_summary_manager", "compression_manager"].includes(node.type));
      const agentConfig = getAgentConfig(selectedNode.data);
      const hasConnectedTools = Boolean(connectedTools?.length);

      return (
        <>
          <div className="info-note">
            <p>Use a provider preset or enter a supported provider id. The generator uses the correct Agno provider class and falls back to the system environment when a key or URL is left blank.</p>
          </div>
          <div className="info-note">
            <p>Agents now support real multimodal input. Files attached in Input or chat are sent as `images`, `audio`, `videos`, or `files` when `Send Media To Model` is enabled.</p>
          </div>
          {connectedTools?.length ? (
            <div className="info-note">
              <p>
                <strong>Connected tools</strong>
              </p>
              <p>{connectedTools.map((node) => node.data.name).join(" | ")}</p>
            </div>
          ) : null}
          {pluggedResources?.length ? (
            <div className="info-note">
              <p>
                <strong>Plugged resources</strong>
              </p>
              <p>{pluggedResources.map((node) => `${NODE_CATALOG[node.type].label}: ${node.data.name}`).join(" | ")}</p>
            </div>
          ) : null}
          {AGENT_FIELD_GROUPS.map((group) => {
            const groupNote = getAgentGroupNote(group);
            const fields = AGENT_FIELDS.filter(
              (field) => field.group === group && shouldShowAgentField(field, agentConfig, hasConnectedTools, Boolean(selectedAgentResources.learningMachine)),
            );
            if (!fields.length) {
              return null;
            }
            return (
              <section key={group} className="field-group">
                <h3>{group}</h3>
                {groupNote ? <p className="muted small-note">{groupNote}</p> : null}
                {fields.map((field) => renderAgentField(field))}
              </section>
            );
          })}
        </>
      );
    }

    if (selectedNode.type === "team") {
      const teamConfig = getTeamConfig(selectedNode.data);
      const teamMembers = graph?.edges
        .filter((edge) => edge.target === selectedNode.id)
        .map((edge) => nodeMap[edge.source])
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
        .filter((node) => node.type === "agent" || node.type === "team");
      const connectedTools = graph?.edges
        .filter((edge) => edge.target === selectedNode.id)
        .map((edge) => nodeMap[edge.source])
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
        .filter((node) => node.type === "tool");
      const pluggedResources = graph?.edges
        .filter((edge) => edge.target === selectedNode.id)
        .map((edge) => nodeMap[edge.source])
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
        .filter((node) => ["database", "vector_db", "knowledge", "learning_machine", "memory_manager", "session_summary_manager", "compression_manager"].includes(node.type));
      const hasConnectedTools = Boolean(connectedTools?.length);

      return (
        <>
          <div className="info-note">
            <p>Teams now support leader model settings, routing mode, shared context, connected tools, knowledge, memory, and multimodal execution.</p>
          </div>
          {teamMembers?.length ? (
            <div className="info-note">
              <p>
                <strong>Members</strong>
              </p>
              <p>{teamMembers.map((node) => `${NODE_CATALOG[node.type].label}: ${node.data.name}`).join(" | ")}</p>
            </div>
          ) : (
            <div className="info-note">
              <p>Add at least one Agent or Team node to this Team.</p>
            </div>
          )}
          {connectedTools?.length ? (
            <div className="info-note">
              <p>
                <strong>Connected tools</strong>
              </p>
              <p>{connectedTools.map((node) => node.data.name).join(" | ")}</p>
            </div>
          ) : null}
          {pluggedResources?.length ? (
            <div className="info-note">
              <p>
                <strong>Plugged resources</strong>
              </p>
              <p>{pluggedResources.map((node) => `${NODE_CATALOG[node.type].label}: ${node.data.name}`).join(" | ")}</p>
            </div>
          ) : null}
          {TEAM_FIELD_GROUPS.map((group) => {
            const groupNote = getTeamGroupNote(group);
            const fields = TEAM_FIELDS.filter(
              (field) => field.group === group && shouldShowTeamField(field, teamConfig, hasConnectedTools, Boolean(selectedTeamResources.learningMachine)),
            );
            if (!fields.length) {
              return null;
            }
            return (
              <section key={group} className="field-group">
                <h3>{group}</h3>
                {groupNote ? <p className="muted small-note">{groupNote}</p> : null}
                {fields.map((field) => renderTeamField(field))}
              </section>
            );
          })}
        </>
      );
    }

    if (selectedNode.type === "tool") {
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

    if (selectedNode.type === "output_api") {
      const currentNode = selectedNode;
      const currentExtras = currentNode.data.extras ?? {};
      const outputMode = getOutputMode(currentNode.data);
      const chatProvider = getChatProvider(currentNode.data);
      const updateOutputExtras = (patch: Record<string, unknown>) =>
        setGraph(
          updateNodeData(graph, currentNode.id, {
            extras: {
              ...currentExtras,
              ...patch,
            },
          }),
        );

      return (
        <>
          <label>
            Name
            <span className="required-mark">*</span>
            <input
              value={currentNode.data.name}
              onChange={(event) =>
                setGraph(updateNodeData(graph, currentNode.id, { name: event.target.value }))
              }
            />
          </label>

          <label>
            {renderInspectorPropertyLabel("Output Mode", "Choose where this integration output should deliver the final flow result.", true)}
            <select
              value={outputMode}
              onChange={(event) => updateOutputExtras({ outputMode: event.target.value })}
            >
              <option value="api">API POST</option>
              <option value="email">Email send</option>
              <option value="chat">Chat message</option>
              <option value="spreadsheet">Spreadsheet append</option>
            </select>
          </label>

          {outputMode === "api" ? (
            <>
              <label>
                API URL
                <span className="required-mark">*</span>
                <input
                  placeholder="https://api.example.com/webhooks/flow-result"
                  value={fieldValueAsString(currentExtras.apiUrl)}
                  onChange={(event) => updateOutputExtras({ apiUrl: event.target.value })}
                />
              </label>

              <label>
                Bearer Token
                <input
                  placeholder="token without 'Bearer' prefix"
                  value={fieldValueAsString(currentExtras.apiBearerToken)}
                  onChange={(event) => updateOutputExtras({ apiBearerToken: event.target.value })}
                />
              </label>

              <label>
                Timeout (seconds)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={fieldValueAsString(currentExtras.apiTimeoutSeconds || 15)}
                  onChange={(event) => {
                    const rawValue = Number(event.target.value);
                    const nextValue = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 15;
                    updateOutputExtras({ apiTimeoutSeconds: nextValue });
                  }}
                />
              </label>

              <label>
                Additional Headers JSON
                <textarea
                  className="code-input"
                  value={fieldValueAsString(currentExtras.apiHeadersJson)}
                  onChange={(event) => updateOutputExtras({ apiHeadersJson: event.target.value })}
                />
              </label>

              <label>
                Additional Payload JSON
                <textarea
                  className="code-input"
                  value={fieldValueAsString(currentExtras.apiPayloadJson)}
                  onChange={(event) => updateOutputExtras({ apiPayloadJson: event.target.value })}
                />
              </label>

              <div className="info-note">
                <p>This node sends a POST request with a standard JSON envelope containing <code>flow</code>, <code>timestamp</code>, <code>input</code>, and <code>result</code>.</p>
                <p>Template placeholders work in the additional payload JSON. Use metadata keys like <code>$tenant</code> and system values like <code>$result_text</code>, <code>$input_text</code>, <code>$timestamp</code>, and <code>$flow_name</code>.</p>
                <p>Example: <code>{'{"tenant": $tenant, "summary": "$result_text"}'}</code></p>
              </div>
            </>
          ) : outputMode === "email" ? (
            <>
              <label>
                SMTP Host
                <span className="required-mark">*</span>
                <input
                  placeholder="smtp.example.com"
                  value={fieldValueAsString(currentExtras.emailHost)}
                  onChange={(event) => updateOutputExtras({ emailHost: event.target.value })}
                />
              </label>

              <label>
                Security
                <select
                  value={fieldValueAsString(currentExtras.emailSecurity || "starttls")}
                  onChange={(event) => updateOutputExtras({ emailSecurity: event.target.value })}
                >
                  <option value="ssl">SSL/TLS</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="none">None</option>
                </select>
              </label>

              <label>
                SMTP Port
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={fieldValueAsString(currentExtras.emailPort || 587)}
                  onChange={(event) => updateOutputExtras({ emailPort: event.target.value })}
                />
              </label>

              <label>
                Username
                <input
                  value={fieldValueAsString(currentExtras.emailUsername)}
                  onChange={(event) => updateOutputExtras({ emailUsername: event.target.value })}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={fieldValueAsString(currentExtras.emailPassword)}
                  onChange={(event) => updateOutputExtras({ emailPassword: event.target.value })}
                />
              </label>

              <label>
                From
                <span className="required-mark">*</span>
                <input
                  placeholder="robot@example.com"
                  value={fieldValueAsString(currentExtras.emailFrom)}
                  onChange={(event) => updateOutputExtras({ emailFrom: event.target.value })}
                />
              </label>

              <label>
                To
                <span className="required-mark">*</span>
                <input
                  placeholder="ops@example.com, support@example.com"
                  value={fieldValueAsString(currentExtras.emailTo)}
                  onChange={(event) => updateOutputExtras({ emailTo: event.target.value })}
                />
              </label>

              <label>
                Cc
                <input
                  value={fieldValueAsString(currentExtras.emailCc)}
                  onChange={(event) => updateOutputExtras({ emailCc: event.target.value })}
                />
              </label>

              <label>
                Bcc
                <input
                  value={fieldValueAsString(currentExtras.emailBcc)}
                  onChange={(event) => updateOutputExtras({ emailBcc: event.target.value })}
                />
              </label>

              <label>
                Subject Template
                <textarea
                  value={fieldValueAsString(currentExtras.emailSubject)}
                  onChange={(event) => updateOutputExtras({ emailSubject: event.target.value })}
                />
              </label>

              <label>
                Body Template
                <textarea
                  value={fieldValueAsString(currentExtras.emailBodyTemplate)}
                  onChange={(event) => updateOutputExtras({ emailBodyTemplate: event.target.value })}
                />
              </label>

              <label>
                Timeout (seconds)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={fieldValueAsString(currentExtras.emailTimeoutSeconds || 15)}
                  onChange={(event) => updateOutputExtras({ emailTimeoutSeconds: event.target.value })}
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(currentExtras.emailAttachInputFiles)}
                  onChange={(event) => updateOutputExtras({ emailAttachInputFiles: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Attach Input Files", "Forwards any incoming flow_input_files as email attachments when present.")}
              </label>

              <div className="info-note">
                <p>Subject and body support placeholders like <code>$tenant</code>, <code>$result_text</code>, <code>$input_text</code>, <code>$timestamp</code>, and <code>$flow_name</code>.</p>
              </div>
            </>
          ) : outputMode === "chat" ? (
            <>
              <label>
                Chat Provider
                <select
                  value={chatProvider}
                  onChange={(event) => updateOutputExtras({ chatProvider: event.target.value })}
                >
                  <option value="slack">Slack webhook</option>
                  <option value="discord">Discord webhook</option>
                  <option value="telegram">Telegram bot</option>
                  <option value="whatsapp">WhatsApp gateway</option>
                  <option value="generic">Generic webhook</option>
                </select>
              </label>

              {chatProvider === "telegram" ? (
                <>
                  <label>
                    Bot Token
                    <span className="required-mark">*</span>
                    <input
                      type="password"
                      value={fieldValueAsString(currentExtras.chatBotToken)}
                      onChange={(event) => updateOutputExtras({ chatBotToken: event.target.value })}
                    />
                  </label>

                  <label>
                    Chat ID
                    <span className="required-mark">*</span>
                    <input
                      value={fieldValueAsString(currentExtras.chatChannelId)}
                      onChange={(event) => updateOutputExtras({ chatChannelId: event.target.value })}
                    />
                  </label>
                </>
              ) : chatProvider === "whatsapp" ? (
                <>
                  <label>
                    WhatsApp Session ID
                    <span className="required-mark">*</span>
                    <input
                      value={fieldValueAsString(currentExtras.chatWhatsappSessionId)}
                      onChange={(event) => updateOutputExtras({ chatWhatsappSessionId: event.target.value })}
                    />
                  </label>

                  <label>
                    Target Phone / Chat
                    <span className="required-mark">*</span>
                    <input
                      placeholder="$whatsapp_from or 5511999999999"
                      value={fieldValueAsString(currentExtras.chatChannelId)}
                      onChange={(event) => updateOutputExtras({ chatChannelId: event.target.value })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Webhook URL
                    <span className="required-mark">*</span>
                    <input
                      placeholder="https://hooks.slack.com/..."
                      value={fieldValueAsString(currentExtras.chatWebhookUrl)}
                      onChange={(event) => updateOutputExtras({ chatWebhookUrl: event.target.value })}
                    />
                  </label>

                  <label>
                    Additional Headers JSON
                    <textarea
                      className="code-input"
                      value={fieldValueAsString(currentExtras.chatHeadersJson)}
                      onChange={(event) => updateOutputExtras({ chatHeadersJson: event.target.value })}
                    />
                  </label>
                </>
              )}

              <label>
                Message Template
                <textarea
                  value={fieldValueAsString(currentExtras.chatMessageTemplate)}
                  onChange={(event) => updateOutputExtras({ chatMessageTemplate: event.target.value })}
                />
              </label>

              <label>
                Timeout (seconds)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={fieldValueAsString(currentExtras.chatTimeoutSeconds || 15)}
                  onChange={(event) => updateOutputExtras({ chatTimeoutSeconds: event.target.value })}
                />
              </label>

              <div className="info-note">
                <p>Use this mode for Slack, Discord, Telegram, WhatsApp, or any webhook that accepts a short JSON message. Placeholders like <code>$tenant</code>, <code>$result_text</code>, and <code>$whatsapp_from</code> are supported.</p>
              </div>
            </>
          ) : (
            <>
              <label>
                CSV File Path
                <span className="required-mark">*</span>
                <input
                  placeholder="tmp/flow_results.csv"
                  value={fieldValueAsString(currentExtras.sheetFilePath)}
                  onChange={(event) => updateOutputExtras({ sheetFilePath: event.target.value })}
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(currentExtras.sheetIncludeHeader ?? true)}
                  onChange={(event) => updateOutputExtras({ sheetIncludeHeader: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Write Header Row", "Adds a CSV header when the file is created or empty.")}
              </label>

              <label>
                Row JSON
                <textarea
                  className="code-input"
                  value={fieldValueAsString(currentExtras.sheetRowJson)}
                  onChange={(event) => updateOutputExtras({ sheetRowJson: event.target.value })}
                />
              </label>

              <div className="info-note">
                <p>Append a structured row to a local CSV file after every run. JSON values are serialized automatically, and placeholders like <code>$tenant</code>, <code>$result_text</code>, and <code>$timestamp</code> are supported.</p>
              </div>
            </>
          )}
        </>
      );
    }

    if (isQueueNodeType(selectedNode.type)) {
      const currentNode = selectedNode;
      const currentGraph = graph;
      if (!currentGraph) {
        return null;
      }

      const currentExtras = currentNode.data.extras ?? {};
      const isInputNode = isQueueInputNodeType(currentNode.type);
      const queueProvider = fieldValueAsString(currentExtras.queueProvider).trim().toLowerCase();
      const flowRouteName = slugifyFlowName(flowName) || "save_this_flow_first";
      const subscriberStatus = selectedQueueSubscriberStatus;

      const updateQueueExtras = (patch: Record<string, unknown>) =>
        setGraph(
          updateNodeData(currentGraph, currentNode.id, {
            extras: {
              ...currentExtras,
              ...patch,
            },
          }),
        );

      return (
        <>
          <label>
            {renderInspectorPropertyLabel("Name", "Display name used in the canvas.", true)}
            <input
              value={currentNode.data.name}
              onChange={(event) =>
                setGraph(updateNodeData(currentGraph, currentNode.id, { name: event.target.value }))
              }
            />
          </label>

          <label>
            {renderInspectorPropertyLabel("Queue Provider", "Messaging provider configured for this queue node.", true)}
            <input value={queueProvider || "queue"} readOnly />
          </label>

          {queueProvider === "rabbitmq" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("RabbitMQ URL", "AMQP endpoint used by this queue node.", true)}
                <input
                  value={fieldValueAsString(currentExtras.rabbitmqUrl)}
                  onChange={(event) => updateQueueExtras({ rabbitmqUrl: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Queue Name", "Queue used for consume/publish.", true)}
                <input
                  value={fieldValueAsString(currentExtras.rabbitmqQueue)}
                  onChange={(event) => updateQueueExtras({ rabbitmqQueue: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Exchange", "Optional exchange name for routing.")}
                <input
                  value={fieldValueAsString(currentExtras.rabbitmqExchange)}
                  onChange={(event) => updateQueueExtras({ rabbitmqExchange: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Routing Key", "Optional routing key.")}
                <input
                  value={fieldValueAsString(currentExtras.rabbitmqRoutingKey)}
                  onChange={(event) => updateQueueExtras({ rabbitmqRoutingKey: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {queueProvider === "kafka" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Bootstrap Servers", "Comma-separated Kafka brokers.", true)}
                <input
                  value={fieldValueAsString(currentExtras.kafkaBootstrapServers)}
                  onChange={(event) => updateQueueExtras({ kafkaBootstrapServers: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Topic", "Topic used for consume/publish.", true)}
                <input
                  value={fieldValueAsString(currentExtras.kafkaTopic)}
                  onChange={(event) => updateQueueExtras({ kafkaTopic: event.target.value })}
                />
              </label>
              {isInputNode ? (
                <label>
                  {renderInspectorPropertyLabel("Consumer Group ID", "Consumer group id used by the subscriber.")}
                  <input
                    value={fieldValueAsString(currentExtras.kafkaGroupId)}
                    onChange={(event) => updateQueueExtras({ kafkaGroupId: event.target.value })}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {queueProvider === "redis" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Redis URL", "Redis connection URL or API endpoint.", true)}
                <input
                  value={fieldValueAsString(currentExtras.redisUrl)}
                  onChange={(event) => updateQueueExtras({ redisUrl: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Channel/Stream", "Channel (or stream) used for messaging.", true)}
                <input
                  value={fieldValueAsString(currentExtras.redisChannel)}
                  onChange={(event) => updateQueueExtras({ redisChannel: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {queueProvider === "nats" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("NATS URL", "NATS server URL.", true)}
                <input
                  value={fieldValueAsString(currentExtras.natsUrl)}
                  onChange={(event) => updateQueueExtras({ natsUrl: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Subject", "NATS subject used for messaging.", true)}
                <input
                  value={fieldValueAsString(currentExtras.natsSubject)}
                  onChange={(event) => updateQueueExtras({ natsSubject: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {queueProvider === "sqs" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("AWS Region", "AWS region used for SQS client.", true)}
                <input
                  value={fieldValueAsString(currentExtras.awsRegion || "us-east-1")}
                  onChange={(event) => updateQueueExtras({ awsRegion: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Queue URL", "Full SQS queue URL.", true)}
                <input
                  value={fieldValueAsString(currentExtras.sqsQueueUrl)}
                  onChange={(event) => updateQueueExtras({ sqsQueueUrl: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Endpoint URL", "Optional endpoint for local emulators (LocalStack).")}
                <input
                  value={fieldValueAsString(currentExtras.awsEndpointUrl || "http://localhost:4566")}
                  onChange={(event) => updateQueueExtras({ awsEndpointUrl: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Access Key", "Access key for AWS/emulator auth.")}
                <input
                  value={fieldValueAsString(currentExtras.awsAccessKeyId || "test")}
                  onChange={(event) => updateQueueExtras({ awsAccessKeyId: event.target.value })}
                />
              </label>
              <label>
                {renderInspectorPropertyLabel("Secret Key", "Secret key for AWS/emulator auth.")}
                <input
                  type="password"
                  value={fieldValueAsString(currentExtras.awsSecretAccessKey || "test")}
                  onChange={(event) => updateQueueExtras({ awsSecretAccessKey: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {queueProvider === "pubsub" ? (
            <>
              <label>
                {renderInspectorPropertyLabel("Project ID", "Google Cloud project id used by Pub/Sub.", true)}
                <input
                  value={fieldValueAsString(currentExtras.pubsubProjectId)}
                  onChange={(event) => updateQueueExtras({ pubsubProjectId: event.target.value })}
                />
              </label>
              {isInputNode ? (
                <label>
                  {renderInspectorPropertyLabel("Subscription", "Subscription name used by subscriber.", true)}
                  <input
                    value={fieldValueAsString(currentExtras.pubsubSubscription)}
                    onChange={(event) => updateQueueExtras({ pubsubSubscription: event.target.value })}
                  />
                </label>
              ) : (
                <label>
                  {renderInspectorPropertyLabel("Topic", "Topic name used for publish.", true)}
                  <input
                    value={fieldValueAsString(currentExtras.pubsubTopic)}
                    onChange={(event) => updateQueueExtras({ pubsubTopic: event.target.value })}
                  />
                </label>
              )}
              <label>
                {renderInspectorPropertyLabel("Emulator Host", "Pub/Sub emulator host for local tests.")}
                <input
                  value={fieldValueAsString(currentExtras.pubsubEmulatorHost)}
                  onChange={(event) => updateQueueExtras({ pubsubEmulatorHost: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {isInputNode ? (
            <>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(currentExtras.queueSubscriberEnabled ?? false)}
                  onChange={(event) => updateQueueExtras({ queueSubscriberEnabled: event.target.checked })}
                />
                {renderInspectorPropertyLabel("Enable Subscriber", "Marks this queue input as subscriber-driven." )}
              </label>

              <label>
                {renderInspectorPropertyLabel("Poll Interval (seconds)", "Interval used by subscriber to poll messages.")}
                <input
                  value={fieldValueAsString(currentExtras.queuePollIntervalSeconds || "5")}
                  onChange={(event) => updateQueueExtras({ queuePollIntervalSeconds: event.target.value })}
                />
              </label>

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleStartQueueSubscriber(currentNode)}
                  disabled={isUpdatingQueueSubscriber}
                >
                  Connect
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleStopQueueSubscriber(currentNode)}
                  disabled={isUpdatingQueueSubscriber}
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void loadQueueSubscriberStatus(flowRouteName, currentNode.id)}
                  disabled={isUpdatingQueueSubscriber}
                >
                  Refresh
                </button>
              </div>

              <div className="info-note">
                <p>Status: <strong>{subscriberStatus?.status || "idle"}</strong>{subscriberStatus?.connected ? " · connected" : " · disconnected"}</p>
                {subscriberStatus?.last_message_id ? <p>Last message: <code>{subscriberStatus.last_message_id}</code></p> : null}
                {subscriberStatus?.last_payload_received_at ? <p>Last received at: <code>{subscriberStatus.last_payload_received_at}</code></p> : null}
                {subscriberStatus?.last_payload_preview ? <p>Received payload: <code>{subscriberStatus.last_payload_preview}</code></p> : null}
                {subscriberStatus?.last_result ? <p>Last result: {subscriberStatus.last_result}</p> : null}
                {subscriberStatus?.last_error ? <p className="status-error">{subscriberStatus.last_error}</p> : null}
                <p>Flow name: <code>{flowRouteName}</code> · Node: <code>{currentNode.id}</code></p>
              </div>
            </>
          ) : (
            <div className="info-note">
              <p>This is a queue output node. Configure publish destination above and connect an executor node as source.</p>
            </div>
          )}
        </>
      );
    }

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
          Description
          <textarea
            value={selectedNode.data.description ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { description: event.target.value }))
            }
          />
        </label>

        <label>
          Instructions
          <textarea
            value={selectedNode.data.instructions ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { instructions: event.target.value }))
            }
          />
        </label>

        <label>
          Prompt
          <textarea
            value={selectedNode.data.prompt ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { prompt: event.target.value }))
            }
          />
        </label>

        <label>
          Condition
          <textarea
            value={selectedNode.data.condition ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { condition: event.target.value }))
            }
          />
        </label>

        {selectedNode.type === "output" ? (
          <label>
            {renderInspectorPropertyLabel("Output Format", "Choose a response format commonly used with Agno-generated flows.")}
            <select
              value={selectedNode.data.output_format ?? "text"}
              onChange={(event) =>
                setGraph(updateNodeData(graph, selectedNode.id, { output_format: event.target.value }))
              }
            >
              {AGNO_OUTPUT_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </>
    );
  }

  if (isHomeRoute) {
    return (
      <>
        <input
          ref={flowImportInputRef}
          type="file"
          accept=".json,application/json"
          className="chat-file-input"
          onChange={handleImportFlowFileChange}
        />
        <div className="loading home-screen">
          <div className="home-shell home-workspace">
            <aside className="home-sidebar panel">
              <p className="eyebrow">Templates</p>
              <h2>Library</h2>
              <button
                type="button"
                className={`home-sidebar-item ${homeSection === "flows" ? "active" : ""}`}
                onClick={() => setHomeSection("flows")}
              >
                Flows
              </button>
              <button
                type="button"
                className={`home-sidebar-item ${homeSection === "models" ? "active" : ""}`}
                onClick={() => setHomeSection("models")}
              >
                Models
              </button>
            </aside>

            <section className="home-content panel">
              <div className="home-content-header">
                <div>
                  <p className="eyebrow">AgnoLab</p>
                  <h1>{homeSection === "flows" ? "Flow Hub" : "Models"}</h1>
                  <p className="muted">
                    {homeSection === "flows"
                      ? "Open any saved flow by name, each one with its own path like /flow/flow_name."
                      : "Start from reusable templates for Agent, Team, Workflow, Memory, Learning, Skills, and RAG flows or open a blank canvas."}
                  </p>
                </div>
                <div className="home-navbar-actions">
                  <button type="button" className="secondary-button" onClick={handleTriggerImportFlow}>
                    Import Flow
                  </button>
                  <button type="button" className="secondary-button" disabled>
                    Login (coming soon)
                  </button>
                  {homeSection === "flows" ? (
                    <button type="button" className="secondary-button" onClick={refreshSavedFlows}>
                      Refresh
                    </button>
                  ) : null}
                </div>
              </div>

              {homeError ? <p className="status-error">{homeError}</p> : null}

              <div className="home-card-grid">
                {homeSection === "flows" ? (
                  savedFlows.length ? (
                    savedFlows.map((flow) => (
                      <article key={flow.name} className="flow-template-card">
                        <p className="flow-template-meta">FLOW</p>
                        <h3>{flow.name}</h3>
                        <p className="muted">Path: {buildFlowPath(flow.name)}</p>
                        <p className="muted">Updated: {new Date(flow.updated_at).toLocaleString()}</p>
                        <div className="button-row flow-template-actions">
                          <button type="button" className="secondary-button" onClick={() => handleOpenFlowFromHome(flow.name)}>
                            Open
                          </button>
                          <button type="button" className="secondary-button" onClick={() => handleOpenIntegrationModal(flow.name)}>
                            Integration
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <article className="flow-template-card">
                      <p className="flow-template-meta">EMPTY</p>
                      <h3>No saved flows yet</h3>
                      <p className="muted">Create your first flow to get a dedicated URL and cURL entrypoint.</p>
                    </article>
                  )
                ) : (
                  <>
                    {canvasTemplates.length ? (
                      canvasTemplates.map((template) => (
                        <article key={template.id} className="flow-template-card">
                          <p className="flow-template-meta">{template.category.toUpperCase()}</p>
                          <h3>{template.name}</h3>
                          <p className="muted">{template.description}</p>
                          <p className="muted">Flow name: {template.default_flow_name}</p>
                          <div className="button-row flow-template-actions">
                            <button
                              type="button"
                              className={template.category === "base" ? "primary-button" : "secondary-button"}
                              onClick={() => handleCreateTemplateFromHome(template.id)}
                            >
                              Use template
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <article className="flow-template-card">
                        <p className="flow-template-meta">LOADING</p>
                        <h3>Loading templates</h3>
                        <p className="muted">The template library is loading from the API.</p>
                      </article>
                    )}
                    <article className="flow-template-card">
                      <p className="flow-template-meta">TEMPLATE</p>
                      <h3>Blank</h3>
                      <p className="muted">Opens an empty canvas so you can build the flow from scratch.</p>
                      <div className="button-row flow-template-actions">
                        <button type="button" className="secondary-button" onClick={handleCreateBlankFlowFromHome}>
                          Start blank
                        </button>
                      </div>
                    </article>
                  </>
                )}
              </div>
            </section>
            </div>
        </div>

        {savedFlowIntegrationModal ? (
          <div className="modal-backdrop" onClick={() => setSavedFlowIntegrationModal(null)}>
            <div className="code-modal curl-modal" onClick={(event) => event.stopPropagation()}>
              <div className="code-modal-header">
                <div>
                  <p className="eyebrow">Saved Flow</p>
                  <h2>Integration for {savedFlowIntegrationModal.name}</h2>
                </div>
                <div className="button-row">
                  <button type="button" className="secondary-button save-button" onClick={handleCopyIntegrationSnippet}>
                    {didCopyIntegration ? "Copied" : "Copy Snippet"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setSavedFlowIntegrationModal(null)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="tab-bar">
                {(["curl", "go", "python", "javascript"] as IntegrationLanguage[]).map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={`tab-button ${activeIntegrationLanguage === language ? "active" : ""}`}
                    onClick={() => {
                      setActiveIntegrationLanguage(language);
                      setDidCopyIntegration(false);
                    }}
                  >
                    {language === "curl" ? "cURL" : language === "go" ? "Go" : language === "python" ? "Python" : "JavaScript"}
                  </button>
                ))}
              </div>
              <p className="muted">
                Use this snippet to execute the saved flow by name via POST.
                {savedFlowIntegrationModal.authToken ? " The Authorization header is already included because this flow requires bearer auth." : ""}
              </p>
              <MonacoToolEditor
                value={buildIntegrationSnippet(savedFlowIntegrationModal.name, activeIntegrationLanguage, savedFlowIntegrationModal.authToken)}
                readOnly
                language={getIntegrationEditorLanguage(activeIntegrationLanguage)}
                height="38vh"
              />
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (isLoadingRouteFlow) {
    return <div className="loading">Loading flow...</div>;
  }

  if (!graph) {
    return (
      <div className="loading home-screen">
        <div className="home-shell panel">
          <p className="eyebrow">AgnoLab</p>
          <h2>Could not load this flow</h2>
          <p className="status-error">{homeError ?? "Failed to load the requested flow."}</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={handleGoHome}>
              Back to Flow Hub
            </button>
            <button type="button" className="primary-button" onClick={handleCreateFlowFromHome}>
              New Flow
            </button>
          </div>
        </div>
      </div>
    );
  }

  const librarySearchTerm = librarySearchInput.trim().toLowerCase();
  const librarySearchResults: LibrarySearchResult[] = [];

  if (librarySearchTerm) {
    Object.values(NODE_CATALOG).forEach((definition) => {
      if (definition.type === "tool" || definition.showInLibraryCategory === false) {
        return;
      }

      if (!matchesLibrarySearch(librarySearchTerm, definition.label, definition.description, definition.type, definition.category)) {
        return;
      }

      librarySearchResults.push({
        key: `node:${definition.type}`,
        label: definition.label,
        description: definition.description,
        color: definition.color,
        icon: <NodeIcon type={definition.type} />,
        onSelect: () => addNode(definition.type),
      });
    });

    INTEGRATION_INPUT_LIBRARY_ITEMS.filter((item) => item.status === "available").forEach((item) => {
      if (!matchesLibrarySearch(librarySearchTerm, item.label, item.description, item.helper, item.badge)) {
        return;
      }

      librarySearchResults.push({
        key: `integration-input:${item.key}`,
        label: item.label,
        description: item.description,
        badge: item.badge,
        color: NODE_CATALOG.input.color,
        icon: <NodeIcon type="input" />,
        onSelect: () => handleIntegrationInputLibrarySelect(item.key),
      });
    });

    INTEGRATION_OUTPUT_LIBRARY_ITEMS.filter((item) => item.status === "available").forEach((item) => {
      if (!matchesLibrarySearch(librarySearchTerm, item.label, item.description, item.helper, item.badge)) {
        return;
      }

      librarySearchResults.push({
        key: `integration-output:${item.key}`,
        label: item.label,
        description: item.description,
        badge: item.badge,
        color: NODE_CATALOG.output_api.color,
        icon: <NodeIcon type="output_api" />,
        onSelect: () => handleIntegrationOutputLibrarySelect(item.key),
      });
    });

    if (
      matchesLibrarySearch(
        librarySearchTerm,
        NODE_CATALOG.tool.label,
        NODE_CATALOG.tool.description,
        "function tool",
        "tool",
      )
    ) {
      librarySearchResults.push({
        key: "function-tool",
        label: NODE_CATALOG.tool.label,
        description: NODE_CATALOG.tool.description,
        color: NODE_CATALOG.tool.color,
        icon: <NodeIcon type="tool" />,
        onSelect: () => addNode("tool"),
      });
    }

    STARTER_TOOLS.forEach((tool) => {
      if (!matchesLibrarySearch(librarySearchTerm, tool.name, tool.description, tool.id, "starter tool")) {
        return;
      }

      librarySearchResults.push({
        key: `starter:${tool.id}`,
        label: tool.name,
        description: tool.description ?? tool.name,
        color: NODE_CATALOG.tool.color,
        icon: <NodeIcon type="tool" />,
        onSelect: () => addStarterToolNode(tool),
      });
    });

    if (matchesLibrarySearch(librarySearchTerm, "learning machine", NODE_CATALOG.learning_machine.description, "learning")) {
      librarySearchResults.push({
        key: "learning:machine",
        label: "Learning Machine",
        description: "Add a Learning Machine node to the canvas and connect it to an Agent or Team.",
        color: NODE_CATALOG.learning_machine.color,
        icon: <NodeIcon type="learning_machine" />,
        onSelect: () => addLearningMachineNode(),
      });
    }

    if (matchesLibrarySearch(librarySearchTerm, "local skills", "skills", NODE_CATALOG.skills.description)) {
      librarySearchResults.push({
        key: "skills:local",
        label: "Local Skills",
        description: "Add a Skills node and configure a local skills path.",
        badge: "Agent",
        color: NODE_CATALOG.skills.color,
        icon: <NodeIcon type="skills" />,
        onSelect: () => addSkillsNode(),
      });
    }

    INTERFACE_LIBRARY_ITEMS.forEach((item) => {
      if (!matchesLibrarySearch(librarySearchTerm, item.label, item.description, item.key, "interface", item.badge)) {
        return;
      }

      librarySearchResults.push({
        key: `interface:${item.key}`,
        label: item.label,
        description: item.description,
        badge: item.badge,
        color: NODE_CATALOG.interface.color,
        icon: <NodeIcon type="interface" />,
        onSelect: () => addInterfaceNode(item.key),
      });
    });

    myTools.forEach((tool) => {
      if (!matchesLibrarySearch(librarySearchTerm, tool.name, tool.description, "my tool")) {
        return;
      }

      librarySearchResults.push({
        key: `my-tool:${tool.id}`,
        label: tool.name,
        description: tool.description ?? tool.name,
        color: NODE_CATALOG.tool.color,
        icon: <NodeIcon type="tool" />,
        onSelect: () => addMyToolNode(tool),
      });
    });

    VECTOR_DB_LIBRARY_ITEMS.forEach((item) => {
      if (!matchesLibrarySearch(librarySearchTerm, item.label, item.description, item.key, "vector db", item.badge)) {
        return;
      }

      librarySearchResults.push({
        key: `vector-db:${item.key}`,
        label: item.label,
        description: item.description,
        badge: item.badge,
        color: NODE_CATALOG.vector_db.color,
        icon: <ToolIcon category="Database" />,
        onSelect: () => addVectorDbNode(item.key as VectorDbPresetKey),
      });
    });

    if (matchesLibrarySearch(librarySearchTerm, "knowledge", "knowledge node", "rag", NODE_CATALOG.knowledge.description)) {
      librarySearchResults.push({
        key: "knowledge:base",
        label: "Knowledge Node",
        description: "Add a Knowledge node to the canvas and connect it to an Agent.",
        color: NODE_CATALOG.knowledge.color,
        icon: <NodeIcon type="knowledge" />,
        onSelect: () => addKnowledgeNode("knowledge"),
      });
    }

    if (matchesLibrarySearch(librarySearchTerm, "knowledge + contents db", "contents db", "knowledge contents")) {
      librarySearchResults.push({
        key: "knowledge:contents",
        label: "Knowledge + Contents DB",
        description: "Add a Knowledge node with Contents DB support to the canvas.",
        color: NODE_CATALOG.knowledge.color,
        icon: <NodeIcon type="knowledge" />,
        onSelect: () => addKnowledgeNode("knowledge_contents"),
      });
    }

    MANAGER_LIBRARY_ITEMS.forEach((item) => {
      if (!matchesLibrarySearch(librarySearchTerm, item.label, item.description, item.key, "manager")) {
        return;
      }

      librarySearchResults.push({
        key: `manager:${item.key}`,
        label: item.label,
        description: item.description,
        color: NODE_CATALOG[item.key].color,
        icon: <NodeIcon type={item.key} />,
        onSelect: () => addManagerNode(item.key),
      });
    });

    DATABASE_LIBRARY_ITEMS.forEach((item) => {
      if (!matchesLibrarySearch(librarySearchTerm, item.label, item.description, item.key, "database", item.badge)) {
        return;
      }

      librarySearchResults.push({
        key: `database:${item.key}`,
        label: item.label,
        description: item.description,
        badge: item.badge,
        color: NODE_CATALOG.database.color,
        icon: <ToolIcon category="Database" />,
        onSelect: () => addDatabaseNode(item.key as DatabasePresetKey),
      });
    });

    BUILT_IN_TOOLS.forEach((tool) => {
      if (!matchesLibrarySearch(librarySearchTerm, tool.label, tool.description, tool.key, tool.category, tool.prerequisite)) {
        return;
      }

      librarySearchResults.push({
        key: `builtin:${tool.key}`,
        label: tool.label,
        description: tool.description,
        color: toolIconColor(tool),
        icon: <ToolIcon toolKey={tool.key} category={tool.category} />,
        onSelect: () => addBuiltInToolNode(tool),
      });
    });
  }

  return (
    <div className="layout">
      <aside className="left-dock">
        <section className="dock-library panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Components</p>
              <h2>Library</h2>
            </div>
            <span className="dock-target">{graph.project.target}</span>
          </div>

          <div className="library-search">
            <input
              type="search"
              className="library-search-input"
              placeholder="Search components by name..."
              value={librarySearchInput}
              onChange={(event) => setLibrarySearchInput(event.target.value)}
            />
          </div>

          {librarySearchTerm ? (
            <div className="library-category">
              <div className="library-category-header">
                <h3>Search results</h3>
                <span>{librarySearchResults.length}</span>
              </div>
              {librarySearchResults.length ? (
                <div className="library-grid">
                  {librarySearchResults.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="library-item"
                      onClick={() => {
                        item.onSelect();
                        setLibrarySearchInput("");
                      }}
                      title={item.description}
                    >
                      <span className="library-icon" style={{ color: item.color }}>
                        {item.icon}
                      </span>
                      <span className="library-label">{item.label}</span>
                      {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No components found for "{librarySearchInput.trim()}".</p>
              )}
            </div>
          ) : null}

          {NODE_CATEGORIES.map((category) => {
            const sectionKey = `nodes:${category}`;
            const sectionOpen = isSectionOpen(sectionKey);
            const definitions = Object.values(NODE_CATALOG).filter(
              (definition) => definition.category === category && definition.type !== "tool" && definition.showInLibraryCategory !== false,
            );
            if (definitions.length === 0) {
              return null;
            }
            return (
              <div key={category} className="library-category">
                <button
                  type="button"
                  className="library-section-toggle"
                  onClick={() => toggleSection(sectionKey)}
                >
                  <div className="library-section-copy">
                    <h3>{category}</h3>
                  </div>
                  <span className="library-section-meta">
                    <span>{definitions.length}</span>
                    <span className={`library-chevron ${sectionOpen ? "" : "collapsed"}`}>⌄</span>
                  </span>
                </button>
                {sectionOpen ? (
                  <div className="library-grid">
                    {definitions.map((definition) => (
                      <button
                        key={definition.type}
                        type="button"
                        className="library-item"
                        onClick={() => addNode(definition.type)}
                        title={definition.description}
                      >
                        <span className="library-icon" style={{ color: definition.color }}>
                          <NodeIcon type={definition.type} />
                        </span>
                        <span className="library-label">{definition.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("integration-inputs")}
            >
              <div className="library-section-copy">
                <h3>Integration Inputs</h3>
              </div>
              <span className="library-section-meta">
                <span>{INTEGRATION_INPUT_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("integration-inputs") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("integration-inputs") ? (
              <div className="library-grid">
                {INTEGRATION_INPUT_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`library-item ${item.status === "planned" ? "library-item-disabled" : ""}`}
                    onClick={item.status === "available" ? () => handleIntegrationInputLibrarySelect(item.key) : undefined}
                    disabled={item.status === "planned"}
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.input.color }}>
                      <NodeIcon type="input" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("integration-outputs")}
            >
              <div className="library-section-copy">
                <h3>Integration Outputs</h3>
              </div>
              <span className="library-section-meta">
                <span>{INTEGRATION_OUTPUT_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("integration-outputs") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("integration-outputs") ? (
              <div className="library-grid">
                {INTEGRATION_OUTPUT_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`library-item ${item.status === "planned" ? "library-item-disabled" : ""}`}
                    onClick={item.status === "available" ? () => handleIntegrationOutputLibrarySelect(item.key) : undefined}
                    disabled={item.status === "planned"}
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.output_api.color }}>
                      <NodeIcon type="output_api" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("starter-tools")}
            >
              <div className="library-section-copy">
                <h3>Starter Tools</h3>
              </div>
              <span className="library-section-meta">
                <span>{STARTER_TOOLS.length}</span>
                <span className={`library-chevron ${isSectionOpen("starter-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("starter-tools") ? (
              <div className="library-grid">
                {STARTER_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className="library-item"
                    onClick={() => addStarterToolNode(tool)}
                    title={`${tool.description ?? tool.name}\n\nPrerequisite: ${tool.prerequisite ?? "Check tool setup before running."}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.tool.color }}>
                      <NodeIcon type="tool" />
                    </span>
                    <span className="library-label">{tool.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("learning")}
            >
              <div className="library-section-copy">
                <h3>Learning</h3>
              </div>
              <span className="library-section-meta">
                <span>{LEARNING_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("learning") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("learning") ? (
              <div className="library-grid">
                {LEARNING_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item library-item-disabled"
                    disabled
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.learning_machine.color }}>
                      <NodeIcon type="learning_machine" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="library-item"
                  onClick={() => addLearningMachineNode()}
                  title="Add a Learning Machine node to the canvas and connect it to an Agent or Team."
                >
                  <span className="library-icon" style={{ color: NODE_CATALOG.learning_machine.color }}>
                    <NodeIcon type="learning_machine" />
                  </span>
                  <span className="library-label">Learning Machine</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("function-tool")}
            >
              <div className="library-section-copy">
                <h3>Function Tool</h3>
              </div>
              <span className="library-section-meta">
                <span>1</span>
                <span className={`library-chevron ${isSectionOpen("function-tool") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("function-tool") ? (
              <div className="library-grid">
                <button
                  type="button"
                  className="library-item"
                  onClick={() => addNode("tool")}
                  title={NODE_CATALOG.tool.description}
                >
                  <span className="library-icon" style={{ color: NODE_CATALOG.tool.color }}>
                    <NodeIcon type="tool" />
                  </span>
                  <span className="library-label">{NODE_CATALOG.tool.label}</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("skills")}
            >
              <div className="library-section-copy">
                <h3>Skills</h3>
              </div>
              <span className="library-section-meta">
                <span>{SKILLS_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("skills") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("skills") ? (
              <div className="library-grid">
                {SKILLS_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item"
                    onClick={() => addSkillsNode()}
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.skills.color }}>
                      <NodeIcon type="skills" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("interfaces")}
            >
              <div className="library-section-copy">
                <h3>Interfaces</h3>
              </div>
              <span className="library-section-meta">
                <span>{INTERFACE_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("interfaces") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("interfaces") ? (
              <div className="library-grid">
                {INTERFACE_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item"
                    onClick={() => addInterfaceNode(item.key)}
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.interface.color }}>
                      <NodeIcon type="interface" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("my-tools")}
            >
              <div className="library-section-copy">
                <h3>My Tools</h3>
              </div>
              <span className="library-section-meta">
                <span>{myTools.length}</span>
                <span className={`library-chevron ${isSectionOpen("my-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("my-tools") && myTools.length ? (
              <div className="library-grid">
                {myTools.map((tool) => (
                  <div key={tool.id} className="library-item library-item-card" title={tool.description ?? tool.name}>
                    <button
                      type="button"
                      className="library-item-main"
                      onClick={() => addMyToolNode(tool)}
                    >
                      <span className="library-icon" style={{ color: NODE_CATALOG.tool.color }}>
                        <NodeIcon type="tool" />
                      </span>
                      <span className="library-label">{tool.name}</span>
                    </button>
                    <div className="library-item-actions">
                      <button
                        type="button"
                        className="mini-action-button"
                        onClick={() => renameMyTool(tool.id)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="mini-action-button danger"
                        onClick={() => deleteMyTool(tool.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : isSectionOpen("my-tools") ? (
              <p className="muted">Save a Function Tool to reuse it here.</p>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("vector-db")}
            >
              <div className="library-section-copy">
                <h3>Vector DB</h3>
              </div>
              <span className="library-section-meta">
                <span>{VECTOR_DB_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("vector-db") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("vector-db") ? (
              <div className="library-grid">
                {VECTOR_DB_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item"
                    onClick={() => addVectorDbNode(item.key as VectorDbPresetKey)}
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.vector_db.color }}>
                      <ToolIcon category="Database" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("knowledge")}
            >
              <div className="library-section-copy">
                <h3>Knowledge</h3>
              </div>
              <span className="library-section-meta">
                <span>2</span>
                <span className={`library-chevron ${isSectionOpen("knowledge") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("knowledge") ? (
              <div className="library-grid">
                {KNOWLEDGE_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item library-item-disabled"
                    disabled
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.knowledge.color }}>
                      <NodeIcon type="knowledge" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="library-item"
                  onClick={() => addKnowledgeNode("knowledge")}
                  title="Add a Knowledge node to the canvas and connect it to an Agent."
                >
                  <span className="library-icon" style={{ color: NODE_CATALOG.knowledge.color }}>
                    <NodeIcon type="knowledge" />
                  </span>
                  <span className="library-label">Knowledge Node</span>
                </button>
                <button
                  type="button"
                  className="library-item"
                  onClick={() => addKnowledgeNode("knowledge_contents")}
                  title="Add a Knowledge node with Contents DB support to the canvas."
                >
                  <span className="library-icon" style={{ color: NODE_CATALOG.knowledge.color }}>
                    <NodeIcon type="knowledge" />
                  </span>
                  <span className="library-label">Knowledge + Contents DB</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("managers")}
            >
              <div className="library-section-copy">
                <h3>Managers</h3>
              </div>
              <span className="library-section-meta">
                <span>{MANAGER_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("managers") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("managers") ? (
              <div className="library-grid">
                {MANAGER_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item"
                    onClick={() => addManagerNode(item.key)}
                    title={`${item.description}\n\n${item.helper}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG[item.key].color }}>
                      <NodeIcon type={item.key} />
                    </span>
                    <span className="library-label">{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("database-tools")}
            >
              <div className="library-section-copy">
                <h3>Database</h3>
              </div>
              <span className="library-section-meta">
                <span>{DATABASE_LIBRARY_ITEMS.length}</span>
                <span className={`library-chevron ${isSectionOpen("database-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("database-tools") ? (
              <div className="library-grid">
                {DATABASE_LIBRARY_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="library-item"
                    onClick={() => addDatabaseNode(item.key as DatabasePresetKey)}
                    title={`${item.description}${item.helper ? `\n\n${item.helper}` : ""}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.database.color }}>
                      <ToolIcon category="Database" />
                    </span>
                    <span className="library-label">{item.label}</span>
                    {item.badge ? <span className="library-item-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("agno-tools")}
            >
              <div className="library-section-copy">
                <h3>Agno Tools</h3>
              </div>
              <span className="library-section-meta">
                <span>{BUILT_IN_TOOLS.length}</span>
                <span className={`library-chevron ${isSectionOpen("agno-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>

            {isSectionOpen("agno-tools")
              ? BUILT_IN_TOOL_CATEGORIES.map((category) => {
                  const sectionKey = `agno-tools:${category}`;
                  const sectionOpen = isSectionOpen(sectionKey);
                  const tools = BUILT_IN_TOOLS.filter((tool) => tool.category === category);

                  return (
                    <div key={category} className="library-subcategory">
                      <button
                        type="button"
                        className="library-subcategory-toggle"
                        onClick={() => toggleSection(sectionKey)}
                      >
                        <div className="library-section-copy">
                          <h4>{category}</h4>
                        </div>
                        <span className="library-section-meta">
                          <span>{tools.length}</span>
                          <span className={`library-chevron ${sectionOpen ? "" : "collapsed"}`}>⌄</span>
                        </span>
                      </button>
                      {sectionOpen ? (
                        <div className="library-grid">
                          {tools.map((tool) => (
                            <button
                              key={tool.key}
                              type="button"
                              className="library-item"
                              onClick={() => addBuiltInToolNode(tool)}
                              title={formatToolLibraryTitle(tool)}
                            >
                              <span className="library-icon" style={{ color: toolIconColor(tool) }}>
                                <ToolIcon toolKey={tool.key} category={tool.category} />
                              </span>
                              <span className="library-label">{tool.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>

          <div className="library-upcoming">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("upcoming")}
            >
              <div className="library-section-copy">
                <h3>Upcoming</h3>
              </div>
              <span className="library-section-meta">
                <span>3</span>
                <span className={`library-chevron ${isSectionOpen("upcoming") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("upcoming") ? (
              <p className="muted">MCP, Memory, and Triggers will be added as new categories in this same sidebar.</p>
            ) : null}
          </div>
        </section>
      </aside>

      <main
        className={`canvas ${dragState ? "is-dragging" : ""} ${canvasPanState ? "is-panning" : ""}`}
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasPointerMove}
        onWheel={handleCanvasWheel}
        onClick={(event) => {
          if (ignoreCanvasClickRef.current) {
            ignoreCanvasClickRef.current = false;
            return;
          }

          if (isCanvasBackgroundTarget(event.target, event.currentTarget)) {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            setPendingConnectionSourceId(null);
            setConnectionPointer(null);
          }
        }}
      >
        <div className="canvas-brand">
          <p className="eyebrow">AgnoLab</p>
          <h1>{graph.project.name}</h1>
          <p className="muted">Visual canvas for Agno</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={handleGoHome}>
              Home
            </button>
          </div>
        </div>


        <div className="run-cta">
          <button type="button" className="primary-button run-button" onClick={handleRun} disabled={isRunning || isRunningSavedFlow}>
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>

        <div className="flow-actions">
          <input
            className="flow-name-input"
            value={flowName}
            onChange={(event) => setFlowName(event.target.value)}
            list="saved-flow-names"
            placeholder="flow_name"
          />
          <button type="button" className="secondary-button" onClick={handleSaveFlow} disabled={isSavingFlow}>
            {isSavingFlow ? "Saving..." : "Save Flow"}
          </button>
          <button type="button" className="secondary-button" onClick={handleExportFlow}>
            Export Flow
          </button>
          <button type="button" className="secondary-button" onClick={handleTriggerImportFlow}>
            Import Flow
          </button>
          <button type="button" className="secondary-button" onClick={handleExportPython}>
            Export .py
          </button>
          <button type="button" className="secondary-button" onClick={() => handleOpenIntegrationModal()}>
            Integration
          </button>
          <span className="muted small-note">
            {autosaveState === "saving"
              ? "Autosaving..."
              : autosaveState === "pending"
                ? "Autosave pending..."
                : autosaveState === "error"
                  ? autosaveError || "Autosave failed."
                  : "Autosave on"}
          </span>
          <datalist id="saved-flow-names">
            {savedFlows.map((flow) => (
              <option key={flow.name} value={flow.name} />
            ))}
          </datalist>
        </div>

        <input
          ref={flowImportInputRef}
          type="file"
          accept=".json,application/json"
          className="chat-file-input"
          onChange={handleImportFlowFileChange}
        />

        <div className="canvas-controls">
          <button type="button" className="secondary-button" onClick={handleZoomOut} disabled={canvasZoom <= MIN_CANVAS_ZOOM}>
            -
          </button>
          <button type="button" className="secondary-button canvas-zoom-readout" onClick={handleZoomReset} title="Reset zoom to 100%">
            {Math.round(canvasZoom * 100)}%
          </button>
          <button type="button" className="secondary-button" onClick={handleZoomIn} disabled={canvasZoom >= MAX_CANVAS_ZOOM}>
            +
          </button>
        </div>

        <div className="canvas-hint">
          <p>
            {pendingSourceNode
              ? `Connecting ${pendingSourceNode.data.name}. Click the destination left port to complete.`
              : connectionMessage ?? "To connect components: click the source right port and then the destination left port."}
          </p>
          {currentFlowRuntimeStatus?.active_runs ? (
            <p>
              <strong>Running:</strong> {currentFlowRuntimeStatus.active_runs} active request(s) · total {currentFlowRuntimeStatus.total_runs} ·
              success {currentFlowRuntimeStatus.success_runs} · failed {currentFlowRuntimeStatus.failed_runs}
            </p>
          ) : null}
        </div>

        <div
          className="canvas-viewport"
          style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})` }}
        >
        <div className="canvas-grid" />
        <svg className="edges">
          {graph.edges.map((edge) => {
            const source = nodeMap[edge.source];
            const target = nodeMap[edge.target];
            if (!source || !target) {
              return null;
            }

            const sourceCenterX = source.position.x + NODE_WIDTH / 2;
            const sourceCenterY = source.position.y + NODE_MIN_HEIGHT / 2;
            const targetCenterX = target.position.x + NODE_WIDTH / 2;
            const targetCenterY = target.position.y + NODE_MIN_HEIGHT / 2;
            const horizontalGap = targetCenterX - sourceCenterX;

            let x1 = source.position.x + NODE_WIDTH;
            let y1 = sourceCenterY;
            let x2 = target.position.x;
            let y2 = targetCenterY;

            if (Math.abs(horizontalGap) < 180) {
              x1 = sourceCenterX;
              y1 = source.position.y + 80;
              x2 = targetCenterX;
              y2 = target.position.y;
            } else if (horizontalGap < 0) {
              x1 = source.position.x;
              x2 = target.position.x + NODE_WIDTH;
            }

            const cx1 = x1 + (x2 - x1) * 0.45;
            const cx2 = x1 + (x2 - x1) * 0.55;

            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                  className={`edge-path ${selectedEdgeId === edge.id ? "selected" : ""}`}
                />
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                  className="edge-hit-area"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectEdge(edge);
                  }}
                />
              </g>
            );
          })}
          {pendingSourceNode && connectionPointer ? (
            <path
              d={`M ${pendingSourceNode.position.x + NODE_WIDTH} ${pendingSourceNode.position.y + NODE_MIN_HEIGHT / 2} C ${
                pendingSourceNode.position.x + NODE_WIDTH + (connectionPointer.x - (pendingSourceNode.position.x + NODE_WIDTH)) * 0.45
              } ${pendingSourceNode.position.y + NODE_MIN_HEIGHT / 2}, ${
                pendingSourceNode.position.x + NODE_WIDTH + (connectionPointer.x - (pendingSourceNode.position.x + NODE_WIDTH)) * 0.55
              } ${connectionPointer.y}, ${connectionPointer.x} ${connectionPointer.y}`}
              className="edge-path edge-path-pending"
            />
          ) : null}
        </svg>

        {graph.nodes.map((node) => {
          const visual = getNodeVisualIcon(node);
          const runBadge = nodeRunBadges[node.id];

          return (
            <div
              key={node.id}
              className={`canvas-node ${runBadge ? "has-run-status" : ""} ${selectedNodeId === node.id ? "selected" : ""} ${pendingConnectionSourceId === node.id ? "is-connecting" : ""} ${dragState?.nodeId === node.id ? "is-dragging" : ""}`}
              style={{
                left: `${node.position.x}px`,
                top: `${node.position.y}px`,
                borderColor: selectedNodeId === node.id ? visual.color : undefined,
              }}
              onClick={() => setSelectedNodeId(node.id)}
              onClickCapture={() => setSelectedEdgeId(null)}
              onDoubleClick={() => {
                if (node.type === "input") {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setIsChatOpen((current) => !current);
                  return;
                }

                if (node.type !== "output") {
                  return;
                }
                setSelectedNodeId(node.id);
                setActiveRightTab("code");
                setOutputResponseOnly((current) => !current);
              }}
              onMouseDown={(event) => handleNodeMouseDown(node.id, event)}
            >
              {NODE_CATALOG[node.type].receivesFrom.length > 0 ? (
                <button
                  type="button"
                  className="port port-left"
                  title={`Receives from: ${listNodeTypes(NODE_CATALOG[node.type].receivesFrom)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    finishConnection(node.id);
                  }}
                />
              ) : null}

              {NODE_CATALOG[node.type].sendsTo.length > 0 ? (
                <button
                  type="button"
                  className="port port-right"
                  title={`Sends to: ${listNodeTypes(NODE_CATALOG[node.type].sendsTo)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    startConnection(node.id);
                  }}
                />
              ) : null}

              {runBadge ? (
                <span
                  className={`node-run-badge ${
                    runBadge.variant === "running"
                      ? "is-running"
                      : runBadge.variant === "tool-completed"
                        ? "is-tool-completed"
                        : "is-completed"
                  }`}
                  title={runBadge.title}
                >
                  {runBadge.text}
                </span>
              ) : null}

              <div className="node-help">
                <button type="button" className="help-button" onClick={(event) => event.stopPropagation()}>
                  ?
                </button>
                <div className="help-tooltip">
                  <strong>{NODE_CATALOG[node.type].label}</strong>
                  <p>{NODE_CATALOG[node.type].description}</p>
                  <p>Receives from: {listNodeTypes(NODE_CATALOG[node.type].receivesFrom)}</p>
                  <p>Sends to: {listNodeTypes(NODE_CATALOG[node.type].sendsTo)}</p>
                </div>
              </div>

              <span className="node-icon" style={{ color: visual.color }}>
                {visual.icon}
              </span>
              <span className="node-type">{getCanvasNodeLabel(node.data, node.type)}</span>
              <strong>{node.data.name}</strong>
              <span className="node-meta">
                {node.type === "output" && outputResponseOnly
                  ? "Response only view"
                  : node.type === "output"
                    ? "Double-click for clean response"
                    : getCanvasNodeMeta(node)}
              </span>
            </div>
          );
        })}
        </div>
      </main>

      <aside className="right-dock">
        <section className="dock-inspector panel">
          <div className="tab-bar">
            <button
              type="button"
              className={`tab-button ${activeRightTab === "properties" ? "active" : ""}`}
              onClick={() => setActiveRightTab("properties")}
            >
              Properties
            </button>
            <button
              type="button"
              className={`tab-button ${activeRightTab === "code" ? "active" : ""}`}
              onClick={() => setActiveRightTab("code")}
            >
              Code
            </button>
            <button
              type="button"
              className={`tab-button ${activeRightTab === "runtime" ? "active" : ""}`}
              onClick={() => setActiveRightTab("runtime")}
            >
              Runtime
            </button>
          </div>

          {activeRightTab === "properties" ? (
            <div className="tab-content">
              <section className="subpanel">
                <h2>Selected node</h2>
                {selectedNode ? (
                  <div className="button-row danger-row">
                    <button type="button" className="danger-button" onClick={deleteSelectedNode}>
                      Delete Component
                    </button>
                  </div>
                ) : null}
                {selectedEdge ? (
                  <>
                    <div className="info-note">
                      <p>
                        <strong>Edge</strong>
                      </p>
                      <p>
                        {nodeMap[selectedEdge.source]?.data.name ?? selectedEdge.source} {"->"}{" "}
                        {nodeMap[selectedEdge.target]?.data.name ?? selectedEdge.target}
                      </p>
                    </div>
                    <div className="button-row danger-row">
                      <button type="button" className="danger-button" onClick={deleteSelectedEdge}>
                        Delete Edge
                      </button>
                    </div>
                  </>
                ) : null}
                {renderSelectedNodeProperties()}
              </section>

              <section className="subpanel">
                <h2>Warnings</h2>
                {warnings.length ? warnings.map((warning) => <p key={warning}>{warning}</p>) : <p className="muted">No warnings.</p>}
              </section>
            </div>
          ) : activeRightTab === "code" ? (
            <div className="tab-content">
              <section className="subpanel">
                <h2>Generated Python</h2>
                <p className="muted">Attached file payloads are hidden here for readability. Runtime execution still receives the uploaded file.</p>
                <div className="button-row">
                  <button type="button" className="secondary-button code-button" onClick={() => setIsCodePreviewOpen(true)}>
                    Show Code
                  </button>
                </div>
              </section>

              <section className="subpanel run-panel">
                <h2>Run result</h2>
                <div className="run-by-name-panel">
                  <h3>Run saved flow by name (POST mode)</h3>
                  <label>
                    Flow name
                    <input
                      value={flowName}
                      onChange={(event) => setFlowName(event.target.value)}
                      list="saved-flow-names"
                      placeholder="flow_name"
                    />
                  </label>
                  <label>
                    Input text
                    <textarea
                      value={runByNameInputText}
                      onChange={(event) => setRunByNameInputText(event.target.value)}
                      placeholder="Optional runtime input text"
                    />
                  </label>
                  <label>
                    Input metadata JSON
                    <textarea
                      className="code-input"
                      value={runByNameMetadata}
                      onChange={(event) => setRunByNameMetadata(event.target.value)}
                      placeholder='{"tenant":"acme"}'
                    />
                  </label>
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleRunSavedFlowByName}
                      disabled={isRunningSavedFlow}
                    >
                      {isRunningSavedFlow ? "Running saved flow..." : "Run Saved Flow"}
                    </button>
                    <button type="button" className="secondary-button" onClick={refreshSavedFlows}>
                      Refresh Flows
                    </button>
                  </div>
                  <p className="muted">
                    Available flows: {savedFlows.length ? savedFlows.map((flow) => flow.name).join(", ") : "none"}
                  </p>
                </div>
                {runError ? (
                  <div className="error-note">
                    <p>
                      <strong>Runtime error</strong>
                    </p>
                    <MonacoToolEditor
                      value={runError}
                      readOnly
                      language="plaintext"
                      height="18vh"
                    />
                  </div>
                ) : null}
                {runResult ? (
                  <>
                    <p className={runResult.success ? "status-ok" : "status-error"}>
                      {runResult.success ? "Execution succeeded." : "Execution failed."}
                    </p>
                    {runResult.stdout ? (
                      <>
                        <h3>{outputResponseOnly ? "agent response" : "stdout"}</h3>
                        {outputResponseOnly ? (
                          <div className="markdown-panel">
                            {displayedStdout ? (
                              <MarkdownRenderer text={displayedStdout} className="markdown-renderer" />
                            ) : (
                              <p className="muted">No clean agent response found.</p>
                            )}
                          </div>
                        ) : (
                          <MonacoToolEditor
                            value={displayedStdout}
                            readOnly
                            language="plaintext"
                            height="22vh"
                          />
                        )}
                      </>
                    ) : null}
                    {runResult.stderr ? (
                      <div className="error-note">
                        <p>
                          <strong>stderr traceback</strong>
                        </p>
                        <MonacoToolEditor
                          value={runResult.stderr}
                          readOnly
                          language="plaintext"
                          height="22vh"
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">Run the flow to inspect stdout and stderr.</p>
                )}
              </section>
            </div>
          ) : (
            <div className="tab-content">
              <section className="subpanel">
                <h2>Variables</h2>
                <p className="muted">Configure model keys, provider URLs, and any custom runtime env here. Non-empty values override the same system env during runtime. If a key is absent or blank here, the flow falls back to the host environment.</p>

                <div className="button-row">
                  <button type="button" className="secondary-button save-button" onClick={handleSaveRuntimeData} disabled={isSavingFlow}>
                    {isSavingFlow ? "Saving..." : "Save Runtime Data"}
                  </button>
                </div>

                {projectRuntimeEnvVars.length ? (
                  <div className="runtime-env-list">
                    {projectRuntimeEnvVars.map((item, index) => (
                      <div key={`runtime-env-${index}`} className="runtime-env-row">
                        <input
                          placeholder="ENV_NAME"
                          value={item.key}
                          onChange={(event) => updateProjectRuntimeEnvVar(index, { key: event.target.value })}
                        />
                        <input
                          placeholder="value"
                          value={item.value}
                          onChange={(event) => updateProjectRuntimeEnvVar(index, { value: event.target.value })}
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => removeProjectRuntimeEnvVar(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted runtime-env-empty">No runtime variables configured for this flow yet.</p>
                )}

                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={addProjectRuntimeEnvVar}>
                    Add Variable
                  </button>
                </div>
              </section>

              <section className="subpanel">
                <h2>Flow Authentication</h2>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={projectAuthEnabled}
                    onChange={(event) =>
                      updateProjectRuntime({
                        authEnabled: event.target.checked,
                      })
                    }
                  />
                  {renderInspectorPropertyLabel("Require Bearer Token", "Applies to external HTTP entrypoints such as `/api/flows/run`, Webhook Input, and Form Submission Input.")}
                </label>

                {projectAuthEnabled ? (
                  <label>
                    {renderInspectorPropertyLabel("Bearer Token", "Callers must send this exact token in `Authorization: Bearer <token>`.")}
                    <input
                      type="password"
                      placeholder="flow-secret-token"
                      value={projectAuthToken}
                      onChange={(event) =>
                        updateProjectRuntime({
                          authToken: event.target.value,
                        })
                      }
                    />
                  </label>
                ) : null}

                <p className="muted small-note">Canvas preview via `Run` keeps funcionando sem bearer; a exigência vale para entradas HTTP externas do flow.</p>
              </section>
            </div>
          )}
        </section>
      </aside>

      {isHitlRunConfirmOpen ? (
        <div className="modal-backdrop" onClick={() => resolveHitlRunConfirmation(false)}>
          <div className="code-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">HITL Confirmation</p>
                <h2>Draft Review Gate Approval</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => resolveHitlRunConfirmation(false)}>
                  Cancel
                </button>
                <button type="button" className="secondary-button save-button" onClick={() => resolveHitlRunConfirmation(true)}>
                  Confirm Run
                </button>
              </div>
            </div>
            <p className="muted">{hitlRunConfirmMessage}</p>
          </div>
        </div>
      ) : null}

      {savedFlowIntegrationModal ? (
        <div className="modal-backdrop" onClick={() => setSavedFlowIntegrationModal(null)}>
          <div className="code-modal curl-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">Saved Flow</p>
                <h2>Integration for {savedFlowIntegrationModal.name}</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button save-button" onClick={handleCopyIntegrationSnippet}>
                  {didCopyIntegration ? "Copied" : "Copy Snippet"}
                </button>
                <button type="button" className="secondary-button" onClick={() => setSavedFlowIntegrationModal(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="tab-bar">
              {(["curl", "go", "python", "javascript"] as IntegrationLanguage[]).map((language) => (
                <button
                  key={language}
                  type="button"
                  className={`tab-button ${activeIntegrationLanguage === language ? "active" : ""}`}
                  onClick={() => {
                    setActiveIntegrationLanguage(language);
                    setDidCopyIntegration(false);
                  }}
                >
                  {language === "curl" ? "cURL" : language === "go" ? "Go" : language === "python" ? "Python" : "JavaScript"}
                </button>
              ))}
            </div>
            <p className="muted">
              Use this snippet to execute the saved flow by name via POST.
              {savedFlowIntegrationModal.authToken ? " The Authorization header is already included because this flow requires bearer auth." : ""}
            </p>
            <MonacoToolEditor
              value={buildIntegrationSnippet(savedFlowIntegrationModal.name, activeIntegrationLanguage, savedFlowIntegrationModal.authToken)}
              readOnly
              language={getIntegrationEditorLanguage(activeIntegrationLanguage)}
              height="38vh"
            />
          </div>
        </div>
      ) : null}

      {webhookCurlModal ? (
        <div className="modal-backdrop" onClick={() => setWebhookCurlModal(null)}>
          <div className="code-modal curl-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">Webhook Input</p>
                <h2>{webhookCurlModal.title}</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button save-button" onClick={handleCopyWebhookCurlCommand}>
                  {didCopyWebhookCurl ? "Copied" : "Copy cURL"}
                </button>
                <button type="button" className="secondary-button" onClick={() => setWebhookCurlModal(null)}>
                  Close
                </button>
              </div>
            </div>
            <p className="muted">Endpoint: {webhookCurlModal.endpoint}</p>
            <MonacoToolEditor
              value={webhookCurlModal.command}
              readOnly
              language="shell"
              height="32vh"
            />
          </div>
        </div>
      ) : null}

      {whatsappSessionModal ? (
        <div className="modal-backdrop" onClick={() => setWhatsappSessionModal(null)}>
          <div className="code-modal curl-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">WhatsApp Input</p>
                <h2>{whatsappSessionModal.nodeName}</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={handleRefreshWhatsappSession} disabled={isUpdatingWhatsappSession}>
                  Refresh
                </button>
                <button type="button" className="secondary-button save-button" onClick={handleStartWhatsappSession} disabled={isUpdatingWhatsappSession}>
                  {isUpdatingWhatsappSession ? "Updating..." : "Start / Show QR"}
                </button>
                <button type="button" className="secondary-button" onClick={handleStopWhatsappSession} disabled={isUpdatingWhatsappSession}>
                  Disconnect
                </button>
                <button type="button" className="secondary-button" onClick={() => setWhatsappSessionModal(null)}>
                  Close
                </button>
              </div>
            </div>

            <p className="muted">
              Session ID: <code>{whatsappSessionModal.session?.session_id || "pending"}</code>
            </p>
            <p className="muted">
              Status: <strong>{whatsappSessionModal.session?.status || "unknown"}</strong>
              {whatsappSessionModal.session?.connected ? " · connected" : " · waiting for QR or reconnect"}
            </p>
            {whatsappSessionModal.session?.last_error ? <p className="status-error">{whatsappSessionModal.session.last_error}</p> : null}

            {whatsappSessionModal.session?.qr_code ? (
              <div className="whatsapp-qr-panel">
                <img src={whatsappSessionModal.session.qr_code} alt="WhatsApp QR code" className="whatsapp-qr-image" />
              </div>
            ) : (
              <div className="info-note">
                <p>
                  {whatsappSessionModal.session?.connected
                    ? "The WhatsApp session is already connected and listening for new messages."
                    : "Start the session to fetch the latest QR code. Keep this modal open while pairing the device."}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isCodePreviewOpen ? (
        <div className="modal-backdrop" onClick={() => setIsCodePreviewOpen(false)}>
          <div className="code-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">Generated Python</p>
                <h2>Code Preview</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => setIsCodePreviewOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <p className="muted">Attached file payloads are hidden here for readability. Runtime execution still receives the uploaded file.</p>
            <MonacoToolEditor
              value={displayedCode}
              readOnly
              height="70vh"
            />
          </div>
        </div>
      ) : null}

      {editingFunctionNode ? (
        <div className="modal-backdrop" onClick={() => setEditingFunctionNodeId(null)}>
          <div className="code-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">Function Tool</p>
                <h2>{editingFunctionNode.data.name}</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button save-button" onClick={saveCurrentFunctionTool}>
                  Save Tool
                </button>
                <button type="button" className="secondary-button" onClick={() => setEditingFunctionNodeId(null)}>
                  Close
                </button>
              </div>
            </div>

            <MonacoToolEditor
              value={fieldValueAsString(editingFunctionNode.data.extras?.functionCode)}
              onChange={(nextValue) =>
                setGraph(
                  updateNodeData(
                    graph,
                    editingFunctionNode.id,
                    updateToolConfig(editingFunctionNode.data, { functionCode: nextValue }),
                  ),
                )
              }
            />
          </div>
        </div>
      ) : null}

      {!isHomeRoute && isChatOpen ? (
        <div className="modal-backdrop" onClick={() => setIsChatOpen(false)}>
          <div className="code-modal chat-modal" onClick={(event) => event.stopPropagation()}>
            <header className="chat-topbar">
              <div>
                <p className="eyebrow">Flow playground</p>
                <h2>Flow Chat</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setIsChatOpen(false)}>
                Close
              </button>
            </header>

            {inputNode ? (
              <div className="chat-shell">
                <div className="chat-history" ref={chatHistoryRef}>
                  {chatMessages.length ? (
                    chatMessages.map((message, index) => (
                      <article key={`${message.role}-${index}`} className={`chat-bubble ${message.role === "user" ? "is-user" : "is-assistant"}`}>
                        <span className="chat-bubble-role">{message.role === "user" ? "You" : "Assistant"}</span>
                        {message.role === "assistant" ? (
                          <MarkdownRenderer text={message.text} className="markdown-renderer chat-markdown" />
                        ) : (
                          <p>{message.text}</p>
                        )}
                        {message.attachmentName ? <span className="chat-attachment-chip">📎 {message.attachmentName}</span> : null}
                      </article>
                    ))
                  ) : (
                    <div className="chat-empty-state">
                      <h3>Ready when you are.</h3>
                      <p className="muted">Send a message here to test your flow. Double-click the Input node to reopen this chat later.</p>
                    </div>
                  )}
                </div>

                <div className="chat-composer">
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    className="chat-file-input"
                    accept={FLOW_INPUT_FILE_ACCEPT}
                    onChange={handleChatFileChange}
                  />

                  <div className="chat-composer-toolbar">
                    <span className="chat-mode-chip">
                      {inputSource === "email"
                        ? "Email inbox"
                        : inputSource === "webhook"
                          ? "Webhook preview"
                          : inputSource === "whatsapp"
                            ? "WhatsApp preview"
                          : inputSource === "form"
                            ? "Form preview"
                        : inputMode === "text"
                          ? "Text only"
                          : inputMode === "file"
                            ? "File only"
                            : "Text + file"}
                    </span>
                    {chatSupportsFileUpload ? (
                      <button
                        type="button"
                        className="secondary-button chat-toolbar-upload"
                        onClick={() => chatFileInputRef.current?.click()}
                      >
                        + File
                      </button>
                    ) : null}
                  </div>

                  {inputSource !== "email" && chatDraft.fileName ? (
                    <div className="chat-upload-row">
                      <span className="chat-attachment-chip">📎 {chatDraft.fileAlias || chatDraft.fileName}</span>
                      <button type="button" className="secondary-button" onClick={clearChatFile}>
                        Remove
                      </button>
                      <input
                        className="chat-alias-input"
                        placeholder="File alias"
                        value={chatDraft.fileAlias}
                        onChange={(event) =>
                          setChatDraft((current) => ({
                            ...current,
                            fileAlias: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  <div className={`chat-prompt-shell ${inputSource !== "email" && inputMode === "file" ? "file-only" : ""}`}>
                    {inputSource === "email" ? (
                      <p className="muted chat-file-mode-copy">
                        Email inbox input active. Running from chat will poll the configured mailbox once and use the newest message that matches the filters.
                      </p>
                    ) : inputSource === "webhook" ? (
                      <textarea
                        className="chat-input"
                        value={chatDraft.text}
                        onChange={(event) => setChatDraft((current) => ({ ...current, text: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleRunFromChat().catch(console.error);
                          }
                        }}
                        placeholder="Simulate the webhook body text or message field"
                      />
                    ) : inputSource === "whatsapp" ? (
                      <textarea
                        className="chat-input"
                        value={chatDraft.text}
                        onChange={(event) => setChatDraft((current) => ({ ...current, text: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleRunFromChat().catch(console.error);
                          }
                        }}
                        placeholder="Simulate the incoming WhatsApp message text"
                      />
                    ) : inputMode !== "file" ? (
                      <textarea
                        className="chat-input"
                        value={chatDraft.text}
                        onChange={(event) => setChatDraft((current) => ({ ...current, text: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleRunFromChat().catch(console.error);
                          }
                        }}
                        placeholder="Ask anything"
                      />
                    ) : (
                      <p className="muted chat-file-mode-copy">File mode active. Upload a file and click Send.</p>
                    )}

                    <button
                      type="button"
                      className="primary-button chat-send-button"
                      onClick={handleRunFromChat}
                      disabled={isRunning || isRunningSavedFlow || !canSendChatMessage}
                    >
                      {isRunning ? "..." : inputSource === "email" ? "Check Inbox" : inputSource === "webhook" ? "Send Webhook" : inputSource === "whatsapp" ? "Send WhatsApp Preview" : inputSource === "form" ? "Submit Form" : "Send"}
                    </button>
                  </div>

                  <div className="chat-composer-footer">
                    <span className="muted small-note">
                      {inputSource === "email"
                        ? "This run will poll the configured mailbox once. Metadata JSON still goes to the flow input."
                        : inputSource === "webhook"
                          ? "This preview simulates a webhook execution. Use the generated endpoint to trigger the saved flow from external systems."
                          : inputSource === "whatsapp"
                            ? "This preview simulates an incoming WhatsApp message. The live integration runs automatically after the session is connected in the QR modal."
                          : inputSource === "form"
                            ? "This preview simulates a form submission. Uploaded files and metadata are sent into the flow runtime."
                        : chatSupportsFileUpload
                          ? "You can send text, files, and metadata from this chat."
                          : "This chat currently accepts text and metadata."}
                    </span>

                    <details className="chat-advanced">
                      <summary>Metadata JSON</summary>
                      <textarea
                        className="code-input"
                        value={chatDraft.metadata}
                        onChange={(event) => setChatDraft((current) => ({ ...current, metadata: event.target.value }))}
                      />
                    </details>
                  </div>
                </div>
              </div>
            ) : (
              <p className="status-error">No Input node found in this flow.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
