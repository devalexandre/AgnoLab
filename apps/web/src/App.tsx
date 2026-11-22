import { type ChangeEvent, type DragEvent as ReactDragEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { deleteFlowByName, fetchCanvasTemplate, fetchDefaultGraph, fetchFlowByName, fetchQueueSubscriberStatus, fetchWhatsappSessionStatus, listBuiltInToolFunctions, listCanvasTemplates, listFlowRuntimeStatuses, listFlows, listOllamaModels, listSkillPaths, previewCode, runFlowByName, runGraph, saveFlow, startQueueSubscriber, startWhatsappSession, stopQueueSubscriber, stopWhatsappSession } from "./api";
import { AGENT_FIELDS, AGENT_FIELD_GROUPS, AGNO_MODEL_PROVIDER_OPTIONS, type AgentFieldDefinition } from "./agentConfig";
import { buildFlowDraftRouteKey, clearFlowDraftFromStorage, loadFlowDraftFromStorage, saveFlowDraftToStorage } from "./flowDraftStorage";
import {
  buildIntegrationSnippet,
  buildWebhookCurlCommand,
  getIntegrationEditorLanguage,
  type IntegrationLanguage,
} from "./integrationSnippets";
import {
  NODE_WIDTH,
  cloneGraph,
  createNodeId,
  createNodePosition,
  copySubgraph,
  layoutGraphLayered,
  pasteSubgraph,
  removeFromGraph,
  type GraphClipboard,
  updateNodeData,
} from "./graph";
import { buildInputMetadataFromExtras, graphHasHitlConfirmationGate, parseJsonObject, prepareGraphWithResolvedInputMetadata, shouldPromptHitlConfirmation, shouldPromptHitlConfirmationFromRunResult, stringifyJsonObject } from "./hitl";
import {
  getAgentGroupNote,
  getTeamGroupNote,
  shouldShowAgentField,
  shouldShowTeamField,
} from "./agentFieldVisibility";
import { deriveNodeRunBadges, parseDebugObservation } from "./debug";
import { buildBlankGraph, createDefaultProjectRuntime, getGraphAuthToken, getGraphProjectRuntime, normalizeImportedFlowPayload } from "./flowNormalize";
import FlowCanvas, { LIBRARY_DRAG_MIME, MAX_FLOW_ZOOM, MIN_FLOW_ZOOM, type CanvasNodeView, type FlowCanvasHandle } from "./FlowCanvas";
import { MarkdownRenderer } from "./markdown";
import type { MonacoToolEditorProps } from "./MonacoToolEditor";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";
import ThemePicker from "./ThemePicker";
import { renderInspectorPropertyLabel } from "./inspector/fields";
import WorkflowControlInspector from "./inspector/WorkflowControlInspector";
import DatabaseInspector from "./inspector/DatabaseInspector";
import InputInspector from "./inspector/InputInspector";
import InterfaceInspector from "./inspector/InterfaceInspector";
import KnowledgeInspector from "./inspector/KnowledgeInspector";
import LearningMachineInspector from "./inspector/LearningMachineInspector";
import OutputApiInspector from "./inspector/OutputApiInspector";
import SkillsInspector from "./inspector/SkillsInspector";
import ToolInspector from "./inspector/ToolInspector";
import VectorDbInspector from "./inspector/VectorDbInspector";
import WorkflowInspector from "./inspector/WorkflowInspector";
import WorkflowStepInspector from "./inspector/WorkflowStepInspector";
import { THEMES, applyTheme, getThemeDefinition, loadInitialThemeId, type ThemeId } from "./themes";
import {
  buildFlowPath,
  buildPersistedFlowSnapshot,
  getFlowNameFromPath,
  getTemplateIdFromSearch,
} from "./routing";
import { extractAgentResponse, sanitizeGeneratedCode } from "./runOutput";
import { downloadAsFile, fieldValueAsString, slugifyFlowName } from "./utils";

// Lazy-load the Monaco editor so its (large, bundled) chunk is only fetched when an
// editor is actually opened, keeping the initial app bundle small.
const LazyMonacoEditor = lazy(() => import("./MonacoToolEditor"));

function MonacoToolEditor(props: MonacoToolEditorProps) {
  return (
    <Suspense fallback={<div className="monaco-editor-loading">Loading editor…</div>}>
      <LazyMonacoEditor {...props} />
    </Suspense>
  );
}
import { BRANCH_ELSE_HANDLE, NODE_CATALOG, NODE_CATEGORIES, WORKFLOW_CONTROL_TYPES, canConnect, listNodeTypes } from "./nodeCatalog";
import { getProviderDefinition, normalizeProviderId } from "./providerCatalog";
import { TEAM_FIELDS, TEAM_FIELD_GROUPS } from "./teamConfig";
import { STARTER_TOOLS } from "./starterTools";
import { BUILT_IN_TOOLS, BUILT_IN_TOOL_CATEGORIES, type BuiltInToolDefinition } from "./toolCatalog";
import { ToolIcon, toolIconColor } from "./toolIcons";
import { BuiltInToolFunctionOption, CanvasGraph, CanvasTemplateSummary, FlowRuntimeStatus, FlowSummary, GraphNode, NodeData, Position, ProjectRuntimeConfig, ProjectRuntimeEnvVar, QueueSubscriberStatus, RunResult, SaveFlowResponse, SavedUserTool, SkillPathOption, StarterToolTemplate, WhatsappSessionStatus } from "./types";
import { AGNO_OUTPUT_FORMAT_OPTIONS, COMPONENT_SELECT_AGENT_FIELDS, COMPONENT_SELECT_TEAM_FIELDS, ChatDraft, ChatMessage, DATABASE_DEPENDENT_AGENT_FIELDS, DATABASE_DEPENDENT_TEAM_FIELDS, DATABASE_LIBRARY_ITEMS, DEFAULT_SECTION_OPEN, DatabasePresetKey, FLOW_AUTOSAVE_DELAY_MS, FLOW_INPUT_FILE_ACCEPT, HISTORY_MAX_ENTRIES, INTEGRATION_INPUT_LIBRARY_ITEMS, INTEGRATION_OUTPUT_LIBRARY_ITEMS, INTERFACE_LIBRARY_ITEMS, InterfacePresetKey, KNOWLEDGE_DEPENDENT_AGENT_FIELDS, KNOWLEDGE_DEPENDENT_TEAM_FIELDS, KNOWLEDGE_LIBRARY_ITEMS, LEARNING_LIBRARY_ITEMS, LibrarySearchResult, MANAGER_LIBRARY_ITEMS, MY_TOOLS_STORAGE_KEY, SKILLS_LIBRARY_ITEMS, SavedFlowIntegrationModalState, VECTOR_DB_LIBRARY_ITEMS, VectorDbPresetKey, WebhookCurlModalState, WhatsappSessionModalState, isQueueInputNodeType, isQueueNodeType, matchesLibrarySearch } from "./editorConstants";
import { applyProviderPreset, arrayBufferToBase64, buildManagerExpressionFromExtras, buildSkillsExpressionFromExtras, createBuiltInToolData, createChatOutputNodeData, createDatabaseNodeData, createEmailInputNodeData, createEmailOutputNodeData, createFormInputNodeData, createInterfaceNodeData, createKnowledgeNodeData, createLearningMachineNodeData, createManagerNodeData, createSavedToolNodeData, createScheduleInputNodeData, createSkillsNodeData, createSpreadsheetOutputNodeData, createStarterToolNodeData, createVectorDbNodeData, createWebhookInputNodeData, createWhatsappInputNodeData, getAgentConfig, getCanvasNodeLabel, getCanvasNodeMeta, getInputMode, getInputSource, getInputText, getNodeVisualIcon, getPrimaryInputNode, getProviderConfig, getTeamConfig, getToolMode, listSupportedTimeZones, parseFieldValue, updateAgentConfig, updateInputNodePayload, updateProviderConfig, updateTeamConfig, updateToolConfig } from "./nodeData";
import { NodeIcon } from "./NodeIcon";

export default function App() {
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const flowImportInputRef = useRef<HTMLInputElement | null>(null);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const hasAutoCenteredRef = useRef(false);
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
  // Multi-selection on the canvas; selectedNodeId stays the "primary" node shown in the inspector.
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "info" | "success" | "error" }>>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const flowCanvasRef = useRef<FlowCanvasHandle | null>(null);
  const graphClipboardRef = useRef<GraphClipboard | null>(null);
  const pendingDropPositionRef = useRef<Position | null>(null);
  const draggedLibraryItemRef = useRef<HTMLButtonElement | null>(null);
  const toastIdRef = useRef(0);
  const [code, setCode] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"properties" | "code" | "runtime">("properties");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [editingFunctionNodeId, setEditingFunctionNodeId] = useState<string | null>(null);
  const [myTools, setMyTools] = useState<SavedUserTool[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [librarySearchInput, setLibrarySearchInput] = useState("");
  const [outputResponseOnly, setOutputResponseOnly] = useState(false);
  const [flowName, setFlowName] = useState("support_agent_flow");
  const [themeId, setThemeId] = useState<ThemeId>(() => loadInitialThemeId());
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
  const [historyPast, setHistoryPast] = useState<CanvasGraph[]>([]);
  const [historyFuture, setHistoryFuture] = useState<CanvasGraph[]>([]);
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
  const isApplyingHistoryRef = useRef(false);
  const historyLastSnapshotRef = useRef<string | null>(null);
  const historyCommitTimeoutRef = useRef<number | null>(null);

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
    applyTheme(themeId);
  }, [themeId]);

  // Status messages from anywhere in the app surface as transient toasts.
  useEffect(() => {
    if (!connectionMessage) {
      return;
    }
    const tone = /fail|error|cannot|invalid|not allowed|could not|unable/i.test(connectionMessage)
      ? "error"
      : /saved|connected|copied|pasted|exported|imported|arranged|applied|added/i.test(connectionMessage)
        ? "success"
        : "info";
    pushToast(connectionMessage, tone);
    setConnectionMessage(null);
  }, [connectionMessage]);

  // Keep the canvas multi-selection in step when other UI picks the primary node.
  useEffect(() => {
    setSelectedNodeIds((current) => {
      if (!selectedNodeId) {
        return current.length === 0 ? current : [];
      }
      return current.includes(selectedNodeId) ? current : [selectedNodeId];
    });
  }, [selectedNodeId]);

  useEffect(() => {
    setHistoryPast([]);
    setHistoryFuture([]);
    historyLastSnapshotRef.current = null;
    if (historyCommitTimeoutRef.current !== null) {
      window.clearTimeout(historyCommitTimeoutRef.current);
      historyCommitTimeoutRef.current = null;
    }
  }, [currentPath, currentSearch]);

  useEffect(() => {
    if (!graph) {
      historyLastSnapshotRef.current = null;
      return;
    }

    const snapshot = JSON.stringify(graph);
    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      historyLastSnapshotRef.current = snapshot;
      return;
    }

    if (snapshot === historyLastSnapshotRef.current) {
      return;
    }

    if (historyCommitTimeoutRef.current !== null) {
      window.clearTimeout(historyCommitTimeoutRef.current);
    }

    const previousSnapshot = historyLastSnapshotRef.current;
    historyCommitTimeoutRef.current = window.setTimeout(() => {
      if (previousSnapshot) {
        try {
          const previousGraph = JSON.parse(previousSnapshot) as CanvasGraph;
          setHistoryPast((current) => {
            const next = [...current, previousGraph];
            return next.length > HISTORY_MAX_ENTRIES ? next.slice(next.length - HISTORY_MAX_ENTRIES) : next;
          });
          setHistoryFuture([]);
        } catch (error) {
          console.error(error);
        }
      }
      historyLastSnapshotRef.current = snapshot;
      historyCommitTimeoutRef.current = null;
    }, 220);

    return () => {
      if (historyCommitTimeoutRef.current !== null) {
        window.clearTimeout(historyCommitTimeoutRef.current);
      }
    };
  }, [graph]);

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
      setCanvasZoom(1);
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
            setCanvasZoom(1);
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
            setCanvasZoom(1);
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
          setCanvasZoom(1);
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
            setCanvasZoom(1);
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
          setCanvasZoom(1);
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
        setCanvasZoom(1);
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
    // Debounce: coalesce rapid graph changes (e.g. dragging a node) into a single
    // codegen request instead of firing one POST per mousemove frame.
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      previewCode(graph)
        .then((response) => {
          if (cancelled) {
            return;
          }
          setCode(response.code);
          setWarnings(response.warnings);
        })
        .catch(console.error);
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [graph]);

  useEffect(() => {
    if (!graph || hasAutoCenteredRef.current || graph.nodes.length === 0) {
      return;
    }
    hasAutoCenteredRef.current = true;
    // Wait a frame so React Flow has measured the freshly loaded nodes.
    const frame = window.requestAnimationFrame(() => flowCanvasRef.current?.fitView());
    return () => window.cancelAnimationFrame(frame);
  }, [graph]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.closest(".monaco-editor"));

      if (isEditableTarget) {
        return;
      }

      const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedoShortcut =
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z");

      if (isUndoShortcut) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (isRedoShortcut) {
        event.preventDefault();
        handleRedo();
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((current) => !current);
        return;
      }

      // Canvas shortcuts stay out of the way while a modal is open or text is selected.
      if (isCommandPaletteOpen || document.querySelector(".modal-backdrop")) {
        return;
      }
      const hasTextSelection = Boolean(window.getSelection()?.toString());

      if (mod && key === "c" && !hasTextSelection) {
        if (handleCopySelection()) event.preventDefault();
        return;
      }
      if (mod && key === "v") {
        if (handlePasteClipboard()) event.preventDefault();
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }
      if (mod && key === "a" && !hasTextSelection) {
        event.preventDefault();
        handleSelectAllNodes();
        return;
      }
      if (event.shiftKey && event.code === "Digit1") {
        event.preventDefault();
        handleFitView();
        return;
      }
      if (event.shiftKey && key === "l") {
        event.preventDefault();
        handleAutoLayout();
        return;
      }
      if (event.key === "Escape" && (selectedNodeIds.length > 0 || selectedEdgeId)) {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setSelectedEdgeId(null);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const nodeIds = currentSelectionIds();
        if (nodeIds.length > 0 || selectedEdgeId) {
          event.preventDefault();
          handleCanvasDelete(nodeIds, nodeIds.length === 0 && selectedEdgeId ? [selectedEdgeId] : []);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

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

  const canvasNodeViews = useMemo<CanvasNodeView[]>(
    () =>
      (graph?.nodes ?? []).map((node) => {
        const definition = NODE_CATALOG[node.type];
        const visual = getNodeVisualIcon(node);
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          typeLabel: getCanvasNodeLabel(node.data, node.type),
          name: node.data.name,
          meta:
            node.type === "output" && outputResponseOnly
              ? "Response only view"
              : node.type === "output"
                ? "Double-click for clean response"
                : getCanvasNodeMeta(node),
          icon: visual.icon,
          color: visual.color,
          runBadge: nodeRunBadges[node.id],
          hasInputs: definition.receivesFrom.length > 0,
          targetHandles:
            node.type === "workflow_branch"
              ? [
                  { id: null, label: "if" },
                  { id: BRANCH_ELSE_HANDLE, label: "else" },
                ]
              : undefined,
          hasOutputs: definition.sendsTo.length > 0,
          receivesFromLabel: listNodeTypes(definition.receivesFrom),
          sendsToLabel: listNodeTypes(definition.sendsTo),
          helpTitle: definition.label,
          helpDescription: definition.description,
        };
      }),
    [graph, nodeRunBadges, outputResponseOnly],
  );
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
    // One id for both the new node and the selection (ids are random, so it must not be
    // generated twice).
    const nodeId = createNodeId(graph, type);

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNextIndex = currentGraph.nodes.filter((node) => node.type === type).length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: nodeId,
            type,
            position: nextNodePosition(currentGraph),
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

      const safeNodeId = nodeId; // same id the node is selected by
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "input").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "input",
            position: nextNodePosition(currentGraph),
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

      const safeNodeId = nodeId; // same id the node is selected by
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "output_api").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "output_api",
            position: nextNodePosition(currentGraph),
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
    if (itemKey === "schedule-input") {
      addConfiguredInputNode(createScheduleInputNodeData, "Schedule input added. Save the flow to start the schedule.");
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

      const safeNodeId = nodeId; // same id the node is selected by
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "tool").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: nextNodePosition(currentGraph),
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

      const safeNodeId = nodeId; // same id the node is selected by

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: nextNodePosition(currentGraph),
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

      const safeNodeId = nodeId; // same id the node is selected by

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: nextNodePosition(currentGraph),
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

      const safeNodeId = nodeId; // same id the node is selected by
      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type,
            position: nextNodePosition(currentGraph),
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



  function pushToast(message: string, tone: "info" | "success" | "error" = "info") {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === "error" ? 7000 : 3800);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  /** Where a new node goes: the drop point if it came from a drag, else the visible center. */
  function nextNodePosition(currentGraph: CanvasGraph): Position {
    if (pendingDropPositionRef.current) {
      return pendingDropPositionRef.current;
    }
    const center = flowCanvasRef.current?.getViewportCenter();
    if (!center) {
      return createNodePosition(currentGraph);
    }
    // Stagger so consecutive adds don't stack exactly on top of each other.
    const stagger = (currentGraph.nodes.length % 6) * 24;
    return { x: Math.round(center.x - NODE_WIDTH / 2 + stagger), y: Math.round(center.y - 40 + stagger) };
  }

  function canConnectNodeIds(sourceId: string, targetId: string): boolean {
    const source = nodeMap[sourceId];
    const target = nodeMap[targetId];
    return Boolean(source && target && canConnect(source.type, target.type));
  }

  function connectNodes(sourceId: string, targetId: string, targetHandle: string | null = null) {
    const sourceNode = nodeMap[sourceId];
    const targetNode = nodeMap[targetId];
    if (!graph || !sourceNode || !targetNode) {
      return;
    }
    if (sourceNode.id === targetNode.id) {
      setConnectionMessage("A component cannot be connected to itself.");
      return;
    }
    if (!canConnect(sourceNode.type, targetNode.type)) {
      setConnectionMessage(`${NODE_CATALOG[sourceNode.type].label} cannot connect to ${NODE_CATALOG[targetNode.type].label}.`);
      return;
    }
    const edgeId = `edge_${sourceNode.id}_${targetNode.id}${targetHandle ? `_${targetHandle}` : ""}`;
    setGraph((currentGraph) => {
      if (
        !currentGraph ||
        currentGraph.edges.some(
          (edge) => edge.source === sourceNode.id && edge.target === targetNode.id && (edge.target_handle ?? null) === targetHandle,
        )
      ) {
        return currentGraph;
      }
      const edge = targetHandle
        ? { id: edgeId, source: sourceNode.id, target: targetNode.id, target_handle: targetHandle }
        : { id: edgeId, source: sourceNode.id, target: targetNode.id };
      return { ...currentGraph, edges: [...currentGraph.edges, edge] };
    });
    setConnectionMessage(
      `${sourceNode.data.name} connected to ${targetNode.data.name}${targetHandle ? ` (${targetHandle})` : ""}.`,
    );
  }

  function handleNodesMoved(positions: Record<string, Position>) {
    setGraph((currentGraph) =>
      currentGraph
        ? {
            ...currentGraph,
            nodes: currentGraph.nodes.map((node) => (positions[node.id] ? { ...node, position: positions[node.id] } : node)),
          }
        : currentGraph,
    );
  }

  function handleCanvasSelectionChange(nodeIds: string[], edgeIds: string[]) {
    setSelectedNodeIds(nodeIds);
    setSelectedNodeId((current) => (current && nodeIds.includes(current) ? current : nodeIds[nodeIds.length - 1] ?? null));
    setSelectedEdgeId(nodeIds.length === 0 ? edgeIds[0] ?? null : null);
    if (nodeIds.length > 0 || edgeIds.length > 0) {
      setActiveRightTab("properties");
    }
  }

  function handleCanvasDelete(nodeIds: string[], edgeIds: string[]) {
    if (!graph || (nodeIds.length === 0 && edgeIds.length === 0)) {
      return;
    }
    setGraph((currentGraph) => (currentGraph ? removeFromGraph(currentGraph, nodeIds, edgeIds) : currentGraph));
    if (editingFunctionNodeId && nodeIds.includes(editingFunctionNodeId)) {
      setEditingFunctionNodeId(null);
    }
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    if (nodeIds.length === 1) {
      setConnectionMessage(`${nodeMap[nodeIds[0]]?.data.name ?? "Node"} removed from canvas.`);
    } else if (nodeIds.length > 1) {
      setConnectionMessage(`${nodeIds.length} nodes removed from canvas.`);
    } else {
      setConnectionMessage(edgeIds.length === 1 ? "Connection removed from canvas." : `${edgeIds.length} connections removed.`);
    }
  }

  function handleNodeDoubleClick(nodeId: string) {
    const node = nodeMap[nodeId];
    if (!node) {
      return;
    }
    if (node.type === "input") {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setIsChatOpen((current) => !current);
      return;
    }
    if (node.type === "output") {
      setSelectedNodeId(node.id);
      setActiveRightTab("code");
      setOutputResponseOnly((current) => !current);
    }
  }

  function handleLibraryDragStart(event: ReactDragEvent<HTMLElement>) {
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>("button.library-item, button.library-item-main");
    if (!item || item.disabled) {
      event.preventDefault();
      return;
    }
    draggedLibraryItemRef.current = item;
    event.dataTransfer.setData(LIBRARY_DRAG_MIME, item.textContent ?? "node");
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleLibraryItemDrop(position: Position) {
    const item = draggedLibraryItemRef.current;
    draggedLibraryItemRef.current = null;
    if (!item) {
      return;
    }
    // Library buttons add nodes through their click handlers; the drop point is picked up by
    // nextNodePosition() while React processes the resulting state update.
    pendingDropPositionRef.current = position;
    item.click();
    window.setTimeout(() => {
      pendingDropPositionRef.current = null;
    }, 0);
  }

  function handleZoomIn() {
    flowCanvasRef.current?.zoomIn();
  }

  function handleZoomOut() {
    flowCanvasRef.current?.zoomOut();
  }

  function handleZoomReset() {
    flowCanvasRef.current?.resetZoom();
  }

  function handleFitView() {
    flowCanvasRef.current?.fitView();
  }

  function handleAutoLayout() {
    if (!graph || graph.nodes.length < 2) {
      return;
    }
    setGraph(layoutGraphLayered(graph, (nodeId) => flowCanvasRef.current?.getNodeSize(nodeId)));
    setConnectionMessage("Nodes arranged left to right by data flow.");
    window.setTimeout(() => flowCanvasRef.current?.fitView(), 60);
  }

  function currentSelectionIds(): string[] {
    if (selectedNodeIds.length > 0) return selectedNodeIds;
    return selectedNodeId ? [selectedNodeId] : [];
  }

  function handleCopySelection(): boolean {
    if (!graph) return false;
    const clipboard = copySubgraph(graph, currentSelectionIds());
    if (!clipboard) return false;
    graphClipboardRef.current = clipboard;
    setConnectionMessage(`Copied ${clipboard.nodes.length} node${clipboard.nodes.length === 1 ? "" : "s"}.`);
    return true;
  }

  function pasteGraphClipboard(clipboard: GraphClipboard) {
    if (!graph) return;
    const result = pasteSubgraph(graph, clipboard);
    setGraph(result.graph);
    setSelectedNodeIds(result.pastedIds);
    setSelectedNodeId(result.pastedIds[result.pastedIds.length - 1] ?? null);
    setSelectedEdgeId(null);
    // Paste again offsets from the new copy, not the original.
    graphClipboardRef.current = copySubgraph(result.graph, result.pastedIds);
    setConnectionMessage(`Pasted ${result.pastedIds.length} node${result.pastedIds.length === 1 ? "" : "s"}.`);
  }

  function handlePasteClipboard(): boolean {
    if (!graphClipboardRef.current) return false;
    pasteGraphClipboard(graphClipboardRef.current);
    return true;
  }

  function handleDuplicateSelection() {
    if (!graph) return;
    const clipboard = copySubgraph(graph, currentSelectionIds());
    if (clipboard) pasteGraphClipboard(clipboard);
  }

  function handleSelectAllNodes() {
    if (!graph) return;
    const ids = graph.nodes.map((node) => node.id);
    setSelectedNodeIds(ids);
    setSelectedNodeId(ids[ids.length - 1] ?? null);
    setSelectedEdgeId(null);
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

  async function handleDeleteFlowFromHome(name: string) {
    const normalizedName = slugifyFlowName(name);
    if (!normalizedName) {
      return;
    }

    const confirmed = window.confirm(`Delete flow '${normalizedName}'? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteFlowByName(normalizedName);
      setSavedFlows((current) => current.filter((item) => item.name !== normalizedName));
      setConnectionMessage(`Flow '${normalizedName}' deleted.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete flow.";
      setConnectionMessage(message);
      setHomeError(message);
    }
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

  async function handleExportServeApp() {
    if (!graph) {
      return;
    }
    try {
      const response = await previewCode(graph, { serve: true });
      downloadAsFile(response.code, "main.py", "text/x-python;charset=utf-8");
      setConnectionMessage("Exported AgentOS server app as main.py (run with: python main.py).");
    } catch (error) {
      console.error(error);
      setConnectionMessage("Failed to export the AgentOS server app.");
    }
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
      setCanvasZoom(1);
      hasAutoCenteredRef.current = false;

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






  function handleUndo() {
    if (!graph || historyPast.length === 0) {
      return;
    }
    const previousGraph = historyPast[historyPast.length - 1];
    setHistoryPast((current) => current.slice(0, -1));
    setHistoryFuture((current) => {
      const next = [cloneGraph(graph), ...current];
      return next.length > HISTORY_MAX_ENTRIES ? next.slice(0, HISTORY_MAX_ENTRIES) : next;
    });
    isApplyingHistoryRef.current = true;
    setGraph(cloneGraph(previousGraph));
    setConnectionMessage("Undo applied.");
  }

  function handleRedo() {
    if (!graph || historyFuture.length === 0) {
      return;
    }
    const nextGraph = historyFuture[0];
    setHistoryFuture((current) => current.slice(1));
    setHistoryPast((current) => {
      const next = [...current, cloneGraph(graph)];
      return next.length > HISTORY_MAX_ENTRIES ? next.slice(next.length - HISTORY_MAX_ENTRIES) : next;
    });
    isApplyingHistoryRef.current = true;
    setGraph(cloneGraph(nextGraph));
    setConnectionMessage("Redo applied.");
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
      return <DatabaseInspector selectedNode={selectedNode} graph={graph} setGraph={setGraph} />;
    }

    if (selectedNode.type === "vector_db") {
      return <VectorDbInspector selectedNode={selectedNode} graph={graph} setGraph={setGraph} />;
    }

    if (selectedNode.type === "knowledge") {
      return <KnowledgeInspector selectedNode={selectedNode} graph={graph} nodeMap={nodeMap} setGraph={setGraph} />;
    }

    if (selectedNode.type === "learning_machine") {
      return <LearningMachineInspector selectedNode={selectedNode} graph={graph} nodeMap={nodeMap} setGraph={setGraph} />;
    }

    if (selectedNode.type === "skills") {
      return <SkillsInspector selectedNode={selectedNode} graph={graph} isLoadingSkillPaths={isLoadingSkillPaths} setGraph={setGraph} setSkillPathsRefreshKey={setSkillPathsRefreshKey} skillPathOptions={skillPathOptions} />;
    }

    if (selectedNode.type === "interface") {
      return <InterfaceInspector selectedNode={selectedNode} graph={graph} nodeMap={nodeMap} setGraph={setGraph} />;
    }

    if (selectedNode.type === "workflow") {
      return <WorkflowInspector selectedNode={selectedNode} graph={graph} nodeMap={nodeMap} setGraph={setGraph} />;
    }

    if (WORKFLOW_CONTROL_TYPES.includes(selectedNode.type)) {
      const currentGraph = graph;
      if (!currentGraph) {
        return null;
      }
      const nodeId = selectedNode.id;
      return (
        <WorkflowControlInspector
          node={selectedNode}
          graph={currentGraph}
          onChange={(patch) => setGraph((current) => updateNodeData(current, nodeId, patch))}
        />
      );
    }

    if (selectedNode.type === "workflow_step") {
      return <WorkflowStepInspector selectedNode={selectedNode} graph={graph} nodeMap={nodeMap} setGraph={setGraph} />;
    }

    if (selectedNode.type === "input") {
      return <InputInspector selectedNode={selectedNode} flowName={flowName} graph={graph} handleOpenWebhookCurlModal={handleOpenWebhookCurlModal} handleOpenWhatsappSessionModal={handleOpenWhatsappSessionModal} projectAuthEnabled={projectAuthEnabled} setGraph={setGraph} />;
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
      return <ToolInspector selectedNode={selectedNode} builtInToolFunctionOptions={builtInToolFunctionOptions} builtInToolFunctionsError={builtInToolFunctionsError} graph={graph} isLoadingBuiltInToolFunctions={isLoadingBuiltInToolFunctions} saveCurrentFunctionTool={saveCurrentFunctionTool} setEditingFunctionNodeId={setEditingFunctionNodeId} setGraph={setGraph} />;
    }

    if (selectedNode.type === "output_api") {
      return <OutputApiInspector selectedNode={selectedNode} graph={graph} setGraph={setGraph} />;
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
              <div className="home-sidebar-footer">
                <p className="eyebrow">Appearance</p>
                <ThemePicker value={themeId} onChange={setThemeId} placement="top-start" />
              </div>
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
                          <button type="button" className="danger-button" onClick={() => handleDeleteFlowFromHome(flow.name)}>
                            Delete
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

  const hasCanvasSelection = selectedNodeIds.length > 0 || Boolean(selectedNodeId);
  const paletteCommands: PaletteCommand[] = [
    { id: "run", group: "Flow", label: "Run flow", keywords: "execute play", run: () => void handleRun(), disabled: isRunning || isRunningSavedFlow },
    { id: "save", group: "Flow", label: "Save flow", keywords: "persist", run: () => void handleSaveFlow() },
    { id: "code", group: "Flow", label: "Show generated Python", keywords: "code preview source", run: () => setIsCodePreviewOpen(true) },
    { id: "undo", group: "Edit", label: "Undo", shortcut: "Ctrl Z", run: handleUndo, disabled: historyPast.length === 0 },
    { id: "redo", group: "Edit", label: "Redo", shortcut: "Ctrl Y", run: handleRedo, disabled: historyFuture.length === 0 },
    { id: "select-all", group: "Edit", label: "Select all nodes", shortcut: "Ctrl A", run: handleSelectAllNodes },
    { id: "copy", group: "Edit", label: "Copy selection", shortcut: "Ctrl C", run: () => void handleCopySelection(), disabled: !hasCanvasSelection },
    { id: "paste", group: "Edit", label: "Paste", shortcut: "Ctrl V", run: () => void handlePasteClipboard(), disabled: !graphClipboardRef.current },
    { id: "duplicate", group: "Edit", label: "Duplicate selection", shortcut: "Ctrl D", run: handleDuplicateSelection, disabled: !hasCanvasSelection },
    { id: "fit", group: "View", label: "Fit flow to view", shortcut: "Shift 1", run: handleFitView },
    { id: "layout", group: "View", label: "Auto-layout nodes", keywords: "arrange organize tidy", shortcut: "Shift L", run: handleAutoLayout },
    { id: "zoom-in", group: "View", label: "Zoom in", run: handleZoomIn },
    { id: "zoom-out", group: "View", label: "Zoom out", run: handleZoomOut },
    { id: "zoom-reset", group: "View", label: "Reset zoom to 100%", run: handleZoomReset },
    ...THEMES.map((theme) => ({
      id: `theme:${theme.id}`,
      group: "Theme",
      label: `Theme: ${theme.label}`,
      keywords: theme.description,
      run: () => setThemeId(theme.id),
    })),
    { id: "import", group: "File", label: "Import flow (.json)", run: handleTriggerImportFlow },
    { id: "export-json", group: "File", label: "Export flow (.json)", run: handleExportFlow },
    { id: "export-py", group: "File", label: "Export Python (.py)", run: handleExportPython },
    { id: "export-serve", group: "File", label: "Export AgentOS server app", keywords: "fastapi serve", run: () => void handleExportServeApp() },
    { id: "home", group: "Navigate", label: "Go to Flow Hub", keywords: "home templates", run: handleGoHome },
    ...Object.values(NODE_CATALOG)
      .filter((definition) => definition.type !== "tool")
      .map((definition) => ({
        id: `node:${definition.type}`,
        group: "Add node",
        label: `Add ${definition.label}`,
        keywords: `${definition.category} ${definition.description}`,
        icon: (
          <span style={{ color: definition.color }}>
            <NodeIcon type={definition.type} />
          </span>
        ),
        run: () => addNode(definition.type),
      })),
    ...BUILT_IN_TOOLS.map((tool) => ({
      id: `tool:${tool.key}`,
      group: "Add tool",
      label: `Add ${tool.label}`,
      keywords: `${tool.category} ${tool.description}`,
      icon: (
        <span style={{ color: toolIconColor(tool) }}>
          <ToolIcon toolKey={tool.key} category={tool.category} />
        </span>
      ),
      run: () => addBuiltInToolNode(tool),
    })),
  ];

  return (
    <div className="layout">
      <aside className="left-dock" onDragStart={handleLibraryDragStart}>
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
                      draggable
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
                        draggable
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
                    draggable
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
                    draggable
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
                    draggable
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
                    draggable
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
                  draggable
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
                  draggable
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
                    draggable
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
                    draggable
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
                      draggable
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
                    draggable
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
                    draggable
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
                  draggable
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
                  draggable
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
                    draggable
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
                    draggable
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
                              draggable
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
        className="canvas"
        ref={canvasRef}
      >
        <header className="canvas-toolbar" role="toolbar" aria-label="Flow toolbar">
          <div className="canvas-toolbar-group canvas-toolbar-identity">
            <button type="button" className="icon-button" onClick={handleGoHome} title="Back to the Flow Hub" aria-label="Home">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
              </svg>
            </button>
            <div className="canvas-toolbar-title">
              <span className="eyebrow">AgnoLab · {graph.project.target}</span>
              <strong title={graph.project.name}>{graph.project.name}</strong>
            </div>
          </div>

          <div className="canvas-toolbar-group canvas-toolbar-flow">
            <label className="visually-hidden" htmlFor="flow-name-input">
              Flow name
            </label>
            <input
              id="flow-name-input"
              className="flow-name-input"
              value={flowName}
              onChange={(event) => setFlowName(event.target.value)}
              list="saved-flow-names"
              placeholder="flow_name"
            />
            <button type="button" className="secondary-button save-button" onClick={handleSaveFlow} disabled={isSavingFlow}>
              {isSavingFlow ? "Saving…" : "Save"}
            </button>
            <button type="button" className="secondary-button" onClick={() => handleOpenIntegrationModal()}>
              Integration
            </button>
            <details className="canvas-settings-menu">
              <summary className="secondary-button" aria-label="More flow actions">
                More
              </summary>
              <div className="canvas-settings-menu-items">
                <button type="button" className="secondary-button" onClick={handleTriggerImportFlow}>
                  Import Flow
                </button>
                <button type="button" className="secondary-button" onClick={handleExportFlow}>
                  Export Flow (.json)
                </button>
                <button type="button" className="secondary-button" onClick={handleExportPython}>
                  Export Python (.py)
                </button>
                <button type="button" className="secondary-button" onClick={handleExportServeApp} title="Export an AgentOS server app (FastAPI) that serves this flow's agents/teams/workflows as an API.">
                  Export Server App
                </button>
              </div>
            </details>
            <datalist id="saved-flow-names">
              {savedFlows.map((flow) => (
                <option key={flow.name} value={flow.name} />
              ))}
            </datalist>
          </div>

          <div className="canvas-toolbar-group canvas-toolbar-view">
            <div className="segmented" role="group" aria-label="History">
              <button type="button" className="icon-button" onClick={handleUndo} disabled={historyPast.length === 0} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 7 4 12l5 5M4.5 12H14a6 6 0 0 1 0 12h-1" transform="translate(0 -3)" />
                </svg>
              </button>
              <button type="button" className="icon-button" onClick={handleRedo} disabled={historyFuture.length === 0} title="Redo (Ctrl/Cmd+Y)" aria-label="Redo">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m15 7 5 5-5 5M19.5 12H10a6 6 0 0 0 0 12h1" transform="translate(0 -3)" />
                </svg>
              </button>
            </div>
            <div className="segmented zoom-control" role="group" aria-label="Zoom">
              <button type="button" className="icon-button" onClick={handleZoomOut} disabled={canvasZoom <= MIN_FLOW_ZOOM + 0.001} title="Zoom out (Ctrl/Cmd -)" aria-label="Zoom out">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 12h12" />
                </svg>
              </button>
              <button type="button" className="icon-button canvas-zoom-readout" onClick={handleZoomReset} title="Reset zoom to 100%">
                {Math.round(canvasZoom * 100)}%
              </button>
              <button type="button" className="icon-button" onClick={handleZoomIn} disabled={canvasZoom >= MAX_FLOW_ZOOM - 0.001} title="Zoom in (Ctrl/Cmd +)" aria-label="Zoom in">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </button>
            </div>
            <div className="segmented" role="group" aria-label="Layout">
              <button type="button" className="icon-button" onClick={handleFitView} title="Fit flow to view (Shift+1)" aria-label="Fit to view">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </button>
              <button type="button" className="icon-button" onClick={handleAutoLayout} title="Auto-layout: arrange nodes left to right by data flow (Shift+L)" aria-label="Auto-layout">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5h5v5H4zM15 5h5v5h-5zM15 14h5v5h-5zM9 7.5h6M17.5 10v4" />
                </svg>
              </button>
            </div>
            <button type="button" className="icon-button command-palette-trigger" onClick={() => setIsCommandPaletteOpen(true)} title="Command palette (Ctrl/Cmd+K)" aria-label="Open command palette">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.6-4.6" />
              </svg>
              <kbd>⌘K</kbd>
            </button>
            <ThemePicker value={themeId} onChange={setThemeId} placement="bottom-end" />
            <button type="button" className="primary-button run-button" onClick={handleRun} disabled={isRunning || isRunningSavedFlow}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13l10-6.5z" />
              </svg>
              {isRunning ? "Running…" : "Run"}
            </button>
          </div>
        </header>

        <div className="canvas-footer-left">
          <span className="muted small-note">
            {autosaveState === "saving"
              ? "Autosaving..."
              : autosaveState === "pending"
                ? "Autosave pending..."
                : autosaveState === "error"
                  ? autosaveError || "Autosave failed."
                  : "Autosave on"}
          </span>
        </div>

        <input
          ref={flowImportInputRef}
          type="file"
          accept=".json,application/json"
          className="chat-file-input"
          onChange={handleImportFlowFileChange}
        />

        {currentFlowRuntimeStatus?.active_runs ? (
          <div className="canvas-runtime-status" role="status">
            <strong>Running:</strong> {currentFlowRuntimeStatus.active_runs} active request(s) · total {currentFlowRuntimeStatus.total_runs} · success{" "}
            {currentFlowRuntimeStatus.success_runs} · failed {currentFlowRuntimeStatus.failed_runs}
          </div>
        ) : null}

        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast is-${toast.tone}`}>
              <span>{toast.message}</span>
              <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
                ×
              </button>
            </div>
          ))}
        </div>

        <FlowCanvas
          ref={flowCanvasRef}
          nodes={canvasNodeViews}
          edges={graph.edges}
          selectedNodeIds={selectedNodeIds}
          selectedEdgeIds={selectedEdgeId ? [selectedEdgeId] : []}
          colorScheme={getThemeDefinition(themeId).scheme}
          canConnect={canConnectNodeIds}
          onConnect={connectNodes}
          onNodesMoved={handleNodesMoved}
          onSelectionChange={handleCanvasSelectionChange}
          onDelete={handleCanvasDelete}
          onNodeDoubleClick={handleNodeDoubleClick}
          onDropLibraryItem={handleLibraryItemDrop}
          onZoomChange={setCanvasZoom}
        />
      </main>

      <CommandPalette open={isCommandPaletteOpen} commands={paletteCommands} onClose={() => setIsCommandPaletteOpen(false)} />

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
