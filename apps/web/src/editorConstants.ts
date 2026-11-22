// Editor constants, library catalogs and shared editor types.
// Moved out of App.tsx; App.tsx keeps the editor component itself.

import { NodeType, WhatsappSessionStatus } from "./types";

export const MY_TOOLS_STORAGE_KEY = "agnolab.my_tools";
export const FLOW_AUTOSAVE_DELAY_MS = 1200;
export const HISTORY_MAX_ENTRIES = 80;
export const DEFAULT_SECTION_OPEN = false;
export const FLOW_INPUT_FILE_ACCEPT = [
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
export const FLOW_INPUT_FILE_SUPPORT_NOTE =
  "Input accepts docs, images, audio, and video. Knowledge ingestion only indexes supported document formats and skips pure multimodal media files.";

export interface PointerPosition {
  x: number;
  y: number;
}

export interface ChatDraft {
  text: string;
  metadata: string;
  fileAlias: string;
  fileName: string;
  fileMimeType: string;
  fileEncoding: string;
  fileBase64: string;
  fileContent: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  attachmentName?: string;
}

export interface LibraryFeatureCard {
  key: string;
  label: string;
  description: string;
  helper?: string;
  badge?: string;
}

export interface IntegrationLibraryItem extends LibraryFeatureCard {
  status: "available" | "planned";
}

export interface ManagerLibraryItem {
  key: "memory_manager" | "session_summary_manager" | "compression_manager";
  label: string;
  description: string;
  helper: string;
}

export interface InterfaceLibraryItem {
  key: "whatsapp" | "telegram" | "slack" | "a2a" | "ag_ui" | "all";
  label: string;
  description: string;
  helper: string;
  badge?: string;
}

export interface InterfacePresetOption {
  key: InterfacePresetKey;
  label: string;
}

export interface LibrarySearchResult {
  key: string;
  label: string;
  description: string;
  badge?: string;
  color: string;
  icon: JSX.Element;
  onSelect: () => void;
}

export interface SavedFlowIntegrationModalState {
  name: string;
  authToken?: string | null;
}

export interface WebhookCurlModalState {
  title: string;
  endpoint: string;
  command: string;
}

export interface WhatsappSessionModalState {
  flowName: string;
  nodeId: string;
  nodeName: string;
  session?: WhatsappSessionStatus | null;
}

export type QueueNodeType =
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

export const QUEUE_INPUT_NODE_TYPES = new Set<QueueNodeType>([
  "rabbitmq_input",
  "kafka_input",
  "redis_input",
  "nats_input",
  "sqs_input",
  "pubsub_input",
]);

export function isQueueInputNodeType(type: NodeType): type is QueueNodeType {
  return QUEUE_INPUT_NODE_TYPES.has(type as QueueNodeType);
}

export function isQueueNodeType(type: NodeType): type is QueueNodeType {
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

export function matchesLibrarySearch(query: string, ...parts: Array<string | undefined | null>): boolean {
  if (!query) {
    return true;
  }
  return parts.some((part) => (part ?? "").toLowerCase().includes(query));
}

export const VECTOR_DB_LIBRARY_ITEMS: LibraryFeatureCard[] = [
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

export const KNOWLEDGE_LIBRARY_ITEMS: LibraryFeatureCard[] = [
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

export const LEARNING_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "learning-machine",
    label: "Learning Machine",
    description: "Centralizes user profile, memory, session context, learned knowledge, and decision history in a reusable Agno resource.",
    helper: "LearningMachine(db=..., knowledge=..., user_memory=True, session_context=True)",
    badge: "Core",
  },
];

export const SKILLS_LIBRARY_ITEMS: LibraryFeatureCard[] = [
  {
    key: "local-skills",
    label: "Local Skills",
    description: "Loads a single Agno skill folder or a directory containing multiple skill folders.",
    helper: "Skills(loaders=[LocalSkills(path=..., validate=True)])",
    badge: "Agent",
  },
];

export const DATABASE_LIBRARY_ITEMS: LibraryFeatureCard[] = [
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

export const MANAGER_LIBRARY_ITEMS: ManagerLibraryItem[] = [
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

export const INTERFACE_LIBRARY_ITEMS: InterfaceLibraryItem[] = [
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

export const INTEGRATION_INPUT_LIBRARY_ITEMS: IntegrationLibraryItem[] = [
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
    key: "schedule-input",
    label: "Schedule Input",
    description: "Runs the saved flow on a cron schedule (for example weekdays at 09:00) in the time zone you pick.",
    helper: "Daily digests, periodic reports, recurring checks. The API keeps the schedule running after save.",
    badge: "Cron",
    status: "available",
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

export const INTEGRATION_OUTPUT_LIBRARY_ITEMS: IntegrationLibraryItem[] = [
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

export const AGNO_OUTPUT_FORMAT_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "XML" },
  { value: "csv", label: "CSV" },
  { value: "html", label: "HTML" },
] as const;

export type VectorDbPresetKey = "pgvector" | "qdrant" | "chroma" | "pinecone" | "lancedb" | "weaviate";
export type DatabasePresetKey = "sqlite-db" | "postgres-db" | "mongo-db" | "async-postgres-db";
export type InterfacePresetKey = "whatsapp" | "telegram" | "slack" | "a2a" | "ag_ui" | "all";
export const INTERFACE_PRESET_OPTIONS: InterfacePresetOption[] = INTERFACE_LIBRARY_ITEMS.map((item) => ({
  key: item.key,
  label: item.label,
}));
export type KnowledgeReaderKey = "auto" | "pdf" | "csv" | "field_labeled_csv" | "excel" | "docx" | "pptx" | "json" | "markdown" | "text";

export const DATABASE_DEPENDENT_AGENT_FIELDS = new Set([
  "db",
  "checkpoint",
  "filesystem",
  "overwrite_db_session_state",
  "search_past_sessions",
  "num_past_sessions_to_search",
  "num_past_session_runs_in_search",
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

export const KNOWLEDGE_DEPENDENT_AGENT_FIELDS = new Set([
  "knowledge",
  "knowledge_filters",
  "enable_agentic_knowledge_filters",
  "add_knowledge_to_context",
  "knowledge_retriever",
  "references_format",
  "search_knowledge",
  "update_knowledge",
]);

export const COMPONENT_SELECT_AGENT_FIELDS = new Set([
  "db",
  "knowledge",
  "skills",
  "learning_machine",
  "memory_manager",
  "session_summary_manager",
  "compression_manager",
]);

export const DATABASE_DEPENDENT_TEAM_FIELDS = new Set([
  "db",
  "checkpoint",
  "overwrite_db_session_state",
  "search_past_sessions",
  "num_past_sessions_to_search",
  "num_past_session_runs_in_search",
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

export const KNOWLEDGE_DEPENDENT_TEAM_FIELDS = new Set([
  "knowledge",
  "knowledge_filters",
  "enable_agentic_knowledge_filters",
  "add_knowledge_to_context",
  "knowledge_retriever",
  "references_format",
  "search_knowledge",
  "update_knowledge",
]);

export const COMPONENT_SELECT_TEAM_FIELDS = new Set([
  "db",
  "knowledge",
  "learning_machine",
  "memory_manager",
  "session_summary_manager",
  "compression_manager",
]);

export const KNOWLEDGE_READER_OPTIONS: Array<{ key: KnowledgeReaderKey; label: string; description: string }> = [
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
