// Conditional visibility and group notes for agent/team property fields.
// Extracted from App.tsx; pure logic over a field definition and its config.

import type { AgentFieldDefinition } from "./agentConfig";

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

export function shouldShowAgentField(
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

export function shouldShowTeamField(
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

export function getAgentGroupNote(group: AgentFieldDefinition["group"]): string | null {
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

export function getTeamGroupNote(group: AgentFieldDefinition["group"]): string | null {
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
