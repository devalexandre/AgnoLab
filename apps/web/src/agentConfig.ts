import { PROVIDER_ID_OPTIONS, PROVIDER_PROFILE_OPTIONS } from "./providerCatalog";

export type AgentFieldType = "text" | "textarea" | "number" | "checkbox" | "json" | "python" | "select";

export interface AgentFieldDefinition {
  key: string;
  label: string;
  type: AgentFieldType;
  group:
    | "Identity"
    | "Providers"
    | "Session"
    | "Memory"
    | "Knowledge"
    | "Tools"
    | "Prompt"
    | "Input/Output"
    | "Streaming"
    | "Debug";
  required?: boolean;
  helper?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export const AGNO_MODEL_PROVIDER_OPTIONS = PROVIDER_ID_OPTIONS;

export const AGENT_FIELDS: AgentFieldDefinition[] = [
  { key: "name", label: "Name", type: "text", group: "Identity", required: true },
  {
    key: "provider_profile",
    label: "Provider Preset",
    type: "select",
    group: "Providers",
    helper: "Applies the provider catalog defaults for provider, model, key and endpoint values.",
    options: PROVIDER_PROFILE_OPTIONS,
  },
  { key: "provider", label: "Provider", type: "text", group: "Providers", required: true, placeholder: "openai" },
  { key: "model", label: "Model", type: "text", group: "Providers", required: true, placeholder: "gpt-4.1-mini" },
  {
    key: "provider_api_key_env",
    label: "API Key Env Var",
    type: "text",
    group: "Providers",
    helper: "Optional override for the env var name. Leave blank to use the provider default or the system env.",
    placeholder: "OPENAI_API_KEY",
  },
  {
    key: "provider_api_key",
    label: "API Key",
    type: "text",
    group: "Providers",
    helper: "Optional. If empty, the flow uses the system environment.",
    placeholder: "sk-...",
  },
  {
    key: "provider_base_url_env",
    label: "Base URL Env Var",
    type: "text",
    group: "Providers",
    helper: "Optional override for providers that need a custom endpoint env var.",
    placeholder: "OPENAI_BASE_URL",
  },
  {
    key: "provider_base_url",
    label: "Base URL",
    type: "text",
    group: "Providers",
    helper: "Optional. Leave empty for default Agno provider routing. Usually needed for local/gateway providers (Ollama, LM Studio, LiteLLM, etc).",
    placeholder: "https://api.openai.com/v1",
  },
  {
    key: "provider_execution_timeout_seconds",
    label: "Execution Timeout Seconds",
    type: "number",
    group: "Providers",
    helper: "Optional. Increase this for slower local providers like Ollama so the run does not stop early.",
    placeholder: "120",
  },
  {
    key: "provider_env_json",
    label: "Extra Env JSON",
    type: "json",
    group: "Providers",
    helper: "Optional extra environment variables for this agent, useful for providers like Bedrock, Azure or Vertex.",
    placeholder: '{\n  "AWS_REGION": "us-east-1"\n}',
  },
  { key: "id", label: "ID", type: "text", group: "Identity" },
  { key: "user_id", label: "User ID", type: "text", group: "Identity" },
  { key: "session_id", label: "Session ID", type: "text", group: "Identity" },
  { key: "role", label: "Team Role", type: "text", group: "Identity" },
  { key: "description", label: "Description", type: "textarea", group: "Prompt" },
  { key: "instructions", label: "Instructions", type: "textarea", group: "Prompt", required: true },
  { key: "system_message", label: "System Message", type: "textarea", group: "Prompt" },
  { key: "system_message_role", label: "System Message Role", type: "text", group: "Prompt", placeholder: "system" },
  { key: "introduction", label: "Introduction", type: "textarea", group: "Prompt" },
  { key: "expected_output", label: "Expected Output", type: "textarea", group: "Prompt" },
  { key: "additional_context", label: "Additional Context", type: "textarea", group: "Prompt" },
  { key: "add_instruction_tags", label: "Add Instruction Tags", type: "checkbox", group: "Prompt" },
  { key: "markdown", label: "Markdown", type: "checkbox", group: "Prompt" },
  { key: "add_name_to_context", label: "Add Name To Context", type: "checkbox", group: "Prompt" },
  { key: "add_datetime_to_context", label: "Add Datetime To Context", type: "checkbox", group: "Prompt" },
  { key: "add_location_to_context", label: "Add Location To Context", type: "checkbox", group: "Prompt" },
  { key: "timezone_identifier", label: "Timezone Identifier", type: "text", group: "Prompt", placeholder: "Etc/UTC" },
  { key: "build_context", label: "Build Context", type: "checkbox", group: "Prompt" },
  { key: "build_user_context", label: "Build User Context", type: "checkbox", group: "Prompt" },
  { key: "resolve_in_context", label: "Resolve In Context", type: "checkbox", group: "Prompt" },
  { key: "session_state", label: "Session State", type: "json", group: "Session", placeholder: '{\n  "stage": "draft"\n}' },
  { key: "add_session_state_to_context", label: "Add Session State To Context", type: "checkbox", group: "Session" },
  { key: "enable_agentic_state", label: "Enable Agentic State", type: "checkbox", group: "Session" },
  { key: "overwrite_db_session_state", label: "Overwrite DB Session State", type: "checkbox", group: "Session" },
  { key: "cache_session", label: "Cache Session", type: "checkbox", group: "Session" },
  { key: "search_session_history", label: "Search Session History", type: "checkbox", group: "Session" },
  { key: "num_history_sessions", label: "Num History Sessions", type: "number", group: "Session" },
  { key: "add_history_to_context", label: "Add History To Context", type: "checkbox", group: "Session" },
  { key: "num_history_runs", label: "Num History Runs", type: "number", group: "Session" },
  { key: "num_history_messages", label: "Num History Messages", type: "number", group: "Session" },
  { key: "read_chat_history", label: "Read Chat History Tool", type: "checkbox", group: "Session" },
  { key: "read_tool_call_history", label: "Read Tool Call History", type: "checkbox", group: "Session" },
  { key: "store_history_messages", label: "Store History Messages", type: "checkbox", group: "Session" },
  { key: "dependencies", label: "Dependencies", type: "json", group: "Memory", placeholder: '{\n  "tenant_id": "acme"\n}' },
  { key: "add_dependencies_to_context", label: "Add Dependencies To Context", type: "checkbox", group: "Memory" },
  { key: "db", label: "DB", type: "python", group: "Memory", placeholder: "db_instance" },
  { key: "memory_manager", label: "Memory Manager", type: "python", group: "Memory", placeholder: "memory_manager" },
  { key: "enable_agentic_memory", label: "Enable Agentic Memory", type: "checkbox", group: "Memory" },
  { key: "update_memory_on_run", label: "Update Memory On Run", type: "checkbox", group: "Memory" },
  { key: "add_memories_to_context", label: "Add Memories To Context", type: "checkbox", group: "Memory" },
  { key: "enable_session_summaries", label: "Enable Session Summaries", type: "checkbox", group: "Memory" },
  { key: "add_session_summary_to_context", label: "Add Session Summary To Context", type: "checkbox", group: "Memory" },
  { key: "session_summary_manager", label: "Session Summary Manager", type: "python", group: "Memory", placeholder: "summary_manager" },
  { key: "compress_tool_results", label: "Compress Tool Results", type: "checkbox", group: "Memory" },
  { key: "compression_manager", label: "Compression Manager", type: "python", group: "Memory", placeholder: "compression_manager" },
  { key: "knowledge", label: "Knowledge", type: "python", group: "Knowledge", placeholder: "knowledge_base" },
  { key: "knowledge_filters", label: "Knowledge Filters", type: "json", group: "Knowledge", placeholder: '{\n  "topic": "support"\n}' },
  { key: "enable_agentic_knowledge_filters", label: "Enable Agentic Knowledge Filters", type: "checkbox", group: "Knowledge" },
  { key: "add_knowledge_to_context", label: "Add Knowledge To Context", type: "checkbox", group: "Knowledge" },
  { key: "knowledge_retriever", label: "Knowledge Retriever", type: "python", group: "Knowledge", placeholder: "custom_retriever" },
  {
    key: "references_format",
    label: "References Format",
    type: "select",
    group: "Knowledge",
    options: [
      { label: "json", value: "json" },
      { label: "yaml", value: "yaml" },
    ],
  },
  { key: "search_knowledge", label: "Search Knowledge Tool", type: "checkbox", group: "Knowledge" },
  { key: "update_knowledge", label: "Update Knowledge Tool", type: "checkbox", group: "Knowledge" },
  { key: "tool_call_limit", label: "Tool Call Limit", type: "number", group: "Tools" },
  { key: "tool_choice", label: "Tool Choice", type: "json", group: "Tools", placeholder: '{\n  "type": "function"\n}' },
  { key: "max_tool_calls_from_history", label: "Max Tool Calls From History", type: "number", group: "Tools" },
  { key: "tool_hooks", label: "Tool Hooks", type: "python", group: "Tools", placeholder: "[hook_a, hook_b]" },
  { key: "pre_hooks", label: "Pre Hooks", type: "python", group: "Tools", placeholder: "[pre_hook]" },
  { key: "post_hooks", label: "Post Hooks", type: "python", group: "Tools", placeholder: "[post_hook]" },
  { key: "reasoning", label: "Reasoning", type: "checkbox", group: "Input/Output" },
  { key: "reasoning_model", label: "Reasoning Model", type: "python", group: "Input/Output", placeholder: '"openai:gpt-4.1-mini"' },
  { key: "reasoning_agent", label: "Reasoning Agent", type: "python", group: "Input/Output", placeholder: "reasoning_agent" },
  { key: "reasoning_min_steps", label: "Reasoning Min Steps", type: "number", group: "Input/Output" },
  { key: "reasoning_max_steps", label: "Reasoning Max Steps", type: "number", group: "Input/Output" },
  { key: "send_media_to_model", label: "Send Media To Model", type: "checkbox", group: "Input/Output" },
  { key: "store_media", label: "Store Media", type: "checkbox", group: "Input/Output" },
  { key: "store_tool_messages", label: "Store Tool Messages", type: "checkbox", group: "Input/Output" },
  { key: "additional_input", label: "Additional Input", type: "json", group: "Input/Output", placeholder: '[{"role": "user", "content": "extra"}]' },
  { key: "user_message_role", label: "User Message Role", type: "text", group: "Input/Output", placeholder: "user" },
  { key: "retries", label: "Retries", type: "number", group: "Input/Output" },
  { key: "delay_between_retries", label: "Delay Between Retries", type: "number", group: "Input/Output" },
  { key: "exponential_backoff", label: "Exponential Backoff", type: "checkbox", group: "Input/Output" },
  { key: "input_schema", label: "Input Schema", type: "python", group: "Input/Output", placeholder: "InputSchema" },
  { key: "output_schema", label: "Output Schema", type: "python", group: "Input/Output", placeholder: "OutputSchema" },
  { key: "parser_model", label: "Parser Model", type: "python", group: "Input/Output", placeholder: '"openai:gpt-4.1-mini"' },
  { key: "parser_model_prompt", label: "Parser Model Prompt", type: "textarea", group: "Input/Output" },
  { key: "output_model", label: "Output Model", type: "python", group: "Input/Output", placeholder: '"openai:gpt-4.1-mini"' },
  { key: "output_model_prompt", label: "Output Model Prompt", type: "textarea", group: "Input/Output" },
  { key: "parse_response", label: "Parse Response", type: "checkbox", group: "Input/Output" },
  { key: "structured_outputs", label: "Structured Outputs", type: "checkbox", group: "Input/Output" },
  { key: "use_json_mode", label: "Use JSON Mode", type: "checkbox", group: "Input/Output" },
  { key: "save_response_to_file", label: "Save Response To File", type: "text", group: "Input/Output", placeholder: "outputs/result.json" },
  { key: "stream", label: "Stream", type: "checkbox", group: "Streaming" },
  { key: "stream_events", label: "Stream Events", type: "checkbox", group: "Streaming" },
  { key: "store_events", label: "Store Events", type: "checkbox", group: "Streaming" },
  { key: "events_to_skip", label: "Events To Skip", type: "json", group: "Streaming", placeholder: '["tool_started"]' },
  { key: "metadata", label: "Metadata", type: "json", group: "Debug", placeholder: '{\n  "owner": "alexandre"\n}' },
  { key: "debug_mode", label: "Debug Mode", type: "checkbox", group: "Debug" },
  {
    key: "debug_level",
    label: "Debug Level",
    type: "select",
    group: "Debug",
    options: [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
    ],
  },
  { key: "telemetry", label: "Telemetry", type: "checkbox", group: "Debug" },
];

export const AGENT_FIELD_GROUPS: AgentFieldDefinition["group"][] = [
  "Identity",
  "Providers",
  "Prompt",
  "Session",
  "Memory",
  "Knowledge",
  "Tools",
  "Input/Output",
  "Streaming",
  "Debug",
];
