// Property inspector for output_api nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { updateNodeData } from "../graph";
import { renderInspectorPropertyLabel } from "./fields";
import { fieldValueAsString } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { getChatProvider, getOutputMode } from "../nodeData";

export interface OutputApiInspectorProps {
  selectedNode: GraphNode;
  graph: CanvasGraph | null;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function OutputApiInspector({ selectedNode, graph, setGraph }: OutputApiInspectorProps) {
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
