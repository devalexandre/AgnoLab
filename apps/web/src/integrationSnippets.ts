// Builders for the "call this flow" integration code snippets shown in the UI.
// Extracted from App.tsx; all functions are pure string builders.

import { API_BASE } from "./api";
import { fieldValueAsString } from "./utils";

export type IntegrationLanguage = "curl" | "go" | "python" | "javascript";

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

export function buildIntegrationSnippet(flowName: string, language: IntegrationLanguage, authToken?: string | null): string {
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

export function buildWebhookCurlCommand(
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

export function getIntegrationEditorLanguage(language: IntegrationLanguage): string {
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
