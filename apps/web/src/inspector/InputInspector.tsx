// Property inspector for input nodes. Extracted from App.tsx.
import type { Dispatch, SetStateAction } from "react";
import { type ChangeEvent } from "react";
import { API_BASE } from "../api";
import { updateNodeData } from "../graph";
import { buildInputMetadataFromExtras, normalizeHitlAutoApproveSelection, stringifyJsonObject } from "../hitl";
import { createClientSecret } from "../flowNormalize";
import { renderInspectorPropertyLabel } from "./fields";
import ScheduleInputInspector from "./ScheduleInputInspector";
import { fieldValueAsString, slugifyFlowName } from "../utils";
import { CanvasGraph, GraphNode } from "../types";
import { FLOW_INPUT_FILE_ACCEPT, FLOW_INPUT_FILE_SUPPORT_NOTE } from "../editorConstants";
import { arrayBufferToBase64, getAttachedFileName, getDefaultEmailPort, getEmailProtocol, getEmailSecurity, getInputMode, getInputSource, getInputText } from "../nodeData";

export interface InputInspectorProps {
  selectedNode: GraphNode;
  flowName: string;
  graph: CanvasGraph | null;
  handleOpenWebhookCurlModal: (node: GraphNode, endpoint: string) => void;
  handleOpenWhatsappSessionModal: (node: GraphNode) => void | Promise<void>;
  projectAuthEnabled: boolean;
  setGraph: Dispatch<SetStateAction<CanvasGraph | null>>;
}

export default function InputInspector({ selectedNode, flowName, graph, handleOpenWebhookCurlModal, handleOpenWhatsappSessionModal, projectAuthEnabled, setGraph }: InputInspectorProps) {
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
            const nextSource = event.target.value as "manual" | "email" | "webhook" | "whatsapp" | "form" | "schedule";
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

            if (nextSource === "schedule") {
              updateInputExtras({
                inputSource: "schedule",
                inputMode: "text",
                scheduleCron: fieldValueAsString(currentExtras.scheduleCron) || "0 9 * * 1-5",
                scheduleTimezone:
                  fieldValueAsString(currentExtras.scheduleTimezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                scheduleEnabled: currentExtras.scheduleEnabled ?? true,
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
          <option value="schedule">Schedule (cron)</option>
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
      ) : currentInputSource === "schedule" ? (
        <ScheduleInputInspector
          nodeId={currentNode.id}
          flowName={slugifyFlowName(flowName)}
          extras={currentExtras}
          onChange={(patch) => updateInputExtras(patch)}
        />
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
