// Canvas/library icon for each node type.
// Moved out of App.tsx; App.tsx keeps the editor component itself.

import { NODE_CATALOG } from "./nodeCatalog";

export function NodeIcon({ type }: { type: keyof typeof NODE_CATALOG }) {
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

  if (type === "workflow_parallel") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h3M7 6v12M7 6h10M7 12h10M7 18h10M17 6v12M17 12h3" />
      </svg>
    );
  }

  if (type === "workflow_loop") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 7H8a4 4 0 0 0 0 8h1M14 4l3 3-3 3M7 17h9a4 4 0 0 0 0-8h-1" />
      </svg>
    );
  }

  if (type === "workflow_router") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h6M10 12l6-6h4M10 12l6 6h4M17 3l3 3-3 3M17 15l3 3-3 3" />
      </svg>
    );
  }

  if (type === "workflow_branch") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4v6a4 4 0 0 0 4 4h8M6 4v16M15 11l3 3-3 3" />
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
