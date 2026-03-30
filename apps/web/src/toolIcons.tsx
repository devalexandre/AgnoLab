import type { ReactNode } from "react";
import type { BuiltInToolDefinition } from "./toolCatalog";

export interface ToolIconProps {
  toolKey?: string;
  category?: string;
}

function IconShell({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ToolIcon({ toolKey, category }: ToolIconProps) {
  switch (toolKey) {
    case "websearch":
    case "duckduckgo":
      return (
        <IconShell>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </IconShell>
      );
    case "arxiv":
    case "wikipedia":
    case "hackernews":
      return (
        <IconShell>
          <path d="M6 5h12v14H6z" />
          <path d="M9 9h6" />
          <path d="M9 13h6" />
        </IconShell>
      );
    case "yfinance":
    case "openbb":
    case "financial_datasets":
      return (
        <IconShell>
          <path d="M5 18h14" />
          <path d="M7 15l3-4 3 2 4-6" />
          <path d="M17 7h1v1" />
        </IconShell>
      );
    case "postgres":
    case "duckdb":
    case "neo4j":
    case "sql":
    case "csv":
    case "pandas":
    case "bigquery":
    case "redshift":
      return (
        <IconShell>
          <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
          <path d="M5.5 6.5v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-8" />
          <path d="M5.5 10.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
        </IconShell>
      );
    case "firecrawl":
    case "crawl4ai":
    case "spider":
    case "brightdata":
    case "oxylabs":
      return (
        <IconShell>
          <circle cx="12" cy="12" r="6" />
          <path d="M12 6v12" />
          <path d="M6 12h12" />
          <path d="M8 8c1.3 1 2.7 1.5 4 1.5S14.7 9 16 8" />
          <path d="M8 16c1.3-1 2.7-1.5 4-1.5s2.7.5 4 1.5" />
        </IconShell>
      );
    case "newspaper":
    case "newspaper4k":
    case "jina":
      return (
        <IconShell>
          <path d="M5 6h14v12H5z" />
          <path d="M8 9h8" />
          <path d="M8 12h8" />
          <path d="M8 15h5" />
        </IconShell>
      );
    case "google_calendar":
    case "calcom":
    case "zoom":
      return (
        <IconShell>
          <path d="M7 5v3" />
          <path d="M17 5v3" />
          <rect x="5" y="7" width="14" height="12" rx="2" />
          <path d="M5 11h14" />
        </IconShell>
      );
    case "google_sheets":
      return (
        <IconShell>
          <path d="M7 4h8l3 3v13H7z" />
          <path d="M15 4v4h4" />
          <path d="M10 12h5" />
          <path d="M10 16h5" />
        </IconShell>
      );
    case "google_drive":
      return (
        <IconShell>
          <path d="M9 5l3 0 5 9-1.5 3H8.5L7 14z" />
          <path d="M9 5l-5 9 1.5 3" />
          <path d="M17 14H7" />
        </IconShell>
      );
    case "notion":
    case "confluence":
      return (
        <IconShell>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <path d="M9 15V9l6 6V9" />
        </IconShell>
      );
    case "todoist":
    case "trello":
    case "clickup":
    case "linear":
    case "jira":
      return (
        <IconShell>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </IconShell>
      );
    case "github":
    case "bitbucket":
      return (
        <IconShell>
          <path d="M9 18c-4 1.3-4-2.4-6-2.5" />
          <path d="M15 18v-3.2c0-1 .1-1.5-.5-2.1 2-.2 4-.9 4-4.2 0-.9-.3-1.8-.9-2.5.1-.3.4-1.2-.1-2.5 0 0-.8-.2-2.6 1a9 9 0 0 0-4.8 0c-1.8-1.2-2.6-1-2.6-1-.5 1.3-.2 2.2-.1 2.5-.6.7-.9 1.6-.9 2.5 0 3.3 2 4 4 4.2-.6.6-.6 1.3-.6 2.1V18" />
        </IconShell>
      );
    case "shell":
      return (
        <IconShell>
          <path d="M5 7l5 5-5 5" />
          <path d="M12 17h7" />
        </IconShell>
      );
    case "python":
      return (
        <IconShell>
          <path d="M9 5h3a3 3 0 0 1 3 3v2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          <path d="M15 19h-3a3 3 0 0 1-3-3v-2h6a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2z" />
          <circle cx="10" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="14" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
        </IconShell>
      );
    case "docker":
      return (
        <IconShell>
          <rect x="6" y="9" width="3" height="3" />
          <rect x="10" y="9" width="3" height="3" />
          <rect x="14" y="9" width="3" height="3" />
          <rect x="10" y="5" width="3" height="3" />
          <path d="M5 14h10a4 4 0 0 0 4-4c-1.5-.4-2.4 0-3 1-1-2.2-3.6-2-5-1.8" />
        </IconShell>
      );
    case "file":
      return (
        <IconShell>
          <path d="M8 4h7l4 4v12H8z" />
          <path d="M15 4v4h4" />
        </IconShell>
      );
    case "airflow":
      return (
        <IconShell>
          <path d="M6 16c1.5-4.5 4-7 8-8" />
          <path d="M12 6h4v4" />
          <path d="M8 18h8" />
        </IconShell>
      );
    case "aws_lambda":
      return (
        <IconShell>
          <path d="M8 6h3l5 12h-3L8 6z" />
          <path d="M8 18h8" />
        </IconShell>
      );
    case "e2b":
    case "daytona":
      return (
        <IconShell>
          <rect x="5" y="6" width="14" height="10" rx="2" />
          <path d="M9 19h6" />
          <path d="M12 16v3" />
        </IconShell>
      );
    case "dalle":
    case "replicate":
    case "fal":
    case "lumalabs":
    case "modelslabs":
      return (
        <IconShell>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <circle cx="10" cy="10" r="1.5" />
          <path d="M7 16l4-4 3 3 3-2" />
        </IconShell>
      );
    case "elevenlabs":
    case "cartesia":
      return (
        <IconShell>
          <path d="M9 8v8" />
          <path d="M12 6v12" />
          <path d="M15 9v6" />
          <path d="M6 12h0" />
          <path d="M18 12h0" />
        </IconShell>
      );
    case "mlx_transcribe":
    case "youtube":
    case "giphy":
      return (
        <IconShell>
          <rect x="5" y="7" width="14" height="10" rx="3" />
          <path d="M11 10l4 2-4 2z" />
        </IconShell>
      );
    case "opencv":
      return (
        <IconShell>
          <circle cx="9" cy="8" r="3" />
          <circle cx="15" cy="8" r="3" />
          <circle cx="12" cy="15" r="3" />
        </IconShell>
      );
    case "calculator":
      return (
        <IconShell>
          <rect x="7" y="4" width="10" height="16" rx="2" />
          <path d="M9.5 8h5" />
          <path d="M9.5 12h1" />
          <path d="M13.5 12h1" />
          <path d="M9.5 16h1" />
          <path d="M13.5 16h1" />
        </IconShell>
      );
    case "sleep":
      return (
        <IconShell>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v5l3 2" />
        </IconShell>
      );
    case "openweather":
      return (
        <IconShell>
          <path d="M7 15h9a3 3 0 1 0-.5-6 4.5 4.5 0 0 0-8.7 1A3 3 0 0 0 7 15z" />
          <path d="M9 18l-1 2" />
          <path d="M13 18l-1 2" />
        </IconShell>
      );
    case "google_maps":
      return (
        <IconShell>
          <path d="M12 20s5-5 5-9a5 5 0 1 0-10 0c0 4 5 9 5 9z" />
          <circle cx="12" cy="11" r="1.5" />
        </IconShell>
      );
    case "visualization":
      return (
        <IconShell>
          <path d="M5 18h14" />
          <path d="M8 15V9" />
          <path d="M12 15V6" />
          <path d="M16 15v-4" />
        </IconShell>
      );
    case "webbrowser":
      return (
        <IconShell>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M4 10h16" />
          <path d="M8 8h0" />
          <path d="M11 8h0" />
        </IconShell>
      );
    default:
      break;
  }

  switch (category) {
    case "Search":
      return (
        <IconShell>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </IconShell>
      );
    case "Finance":
      return (
        <IconShell>
          <path d="M5 18h14" />
          <path d="M7 15l3-4 3 2 4-6" />
        </IconShell>
      );
    case "Database":
      return (
        <IconShell>
          <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
          <path d="M5.5 6.5v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-8" />
        </IconShell>
      );
    default:
      return (
        <IconShell>
          <path d="M7 12h10" />
          <path d="M12 7v10" />
        </IconShell>
      );
  }
}

export function toolIconColor(tool: Pick<BuiltInToolDefinition, "category" | "key">): string {
  switch (tool.category) {
    case "Search":
      return "#6ecbff";
    case "Finance":
      return "#7ce3a1";
    case "Database":
      return "#8db4ff";
    case "Web Scraping":
      return "#ffb86c";
    case "Research":
      return "#f7d774";
    case "Productivity":
      return "#c4a1ff";
    case "Developer":
      return "#ff8f8f";
    case "AI & Media":
      return "#81e6d9";
    case "Utility":
      return "#cbd5e1";
    default:
      return "#f6ad55";
  }
}
