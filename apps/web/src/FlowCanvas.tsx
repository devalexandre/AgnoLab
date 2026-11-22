/**
 * The flow canvas, built on React Flow (@xyflow/react).
 *
 * The graph (CanvasGraph) stays owned by App; this component renders it and reports user
 * intent back through callbacks. Node drags are kept local while the pointer moves and committed
 * once on drag end, so the (large) App component does not re-render on every mouse move.
 */
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MiniMap,
  Position as HandlePosition,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { NODE_WIDTH } from "./graph";
import type { GraphEdge, NodeType, Position } from "./types";

export const LIBRARY_DRAG_MIME = "application/x-agnolab-library-item";

export const MIN_FLOW_ZOOM = 0.3;
export const MAX_FLOW_ZOOM = 2.5;

export interface CanvasNodeRunBadge {
  variant: "running" | "tool-completed" | "completed";
  text: string;
  title: string;
}

/** Everything a node card needs to render; computed by App from the graph node. */
export interface CanvasNodeView {
  id: string;
  type: NodeType;
  position: Position;
  typeLabel: string;
  name: string;
  meta: string;
  icon: ReactNode;
  color: string;
  runBadge?: CanvasNodeRunBadge;
  hasInputs: boolean;
  hasOutputs: boolean;
  receivesFromLabel: string;
  sendsToLabel: string;
  helpTitle: string;
  helpDescription: string;
}

type AgnoNodeData = { view: CanvasNodeView };
type AgnoFlowNode = Node<AgnoNodeData, "agno">;

export interface FlowCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitView: () => void;
  /** Center of the visible area, in graph coordinates — where new nodes are placed. */
  getViewportCenter: () => Position | null;
  /** Rendered size of a node, once React Flow has measured it. */
  getNodeSize: (nodeId: string) => { width: number; height: number } | undefined;
}

export interface FlowCanvasProps {
  nodes: CanvasNodeView[];
  edges: GraphEdge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  colorScheme: "dark" | "light";
  canConnect: (sourceId: string, targetId: string) => boolean;
  onConnect: (sourceId: string, targetId: string) => void;
  onNodesMoved: (positions: Record<string, Position>) => void;
  onSelectionChange: (nodeIds: string[], edgeIds: string[]) => void;
  onDelete: (nodeIds: string[], edgeIds: string[]) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onDropLibraryItem: (position: Position) => void;
  onZoomChange: (zoom: number) => void;
  children?: ReactNode;
}

const AgnoNodeCard = memo(function AgnoNodeCard({ data, selected, dragging }: NodeProps<AgnoFlowNode>) {
  const { view } = data;
  const badge = view.runBadge;
  return (
    <div
      className={`canvas-node${badge ? " has-run-status" : ""}${selected ? " selected" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ borderColor: selected ? view.color : undefined, ["--node-accent" as string]: view.color }}
      data-node-type={view.type}
    >
      {view.hasInputs ? (
        <Handle
          type="target"
          position={HandlePosition.Left}
          className="port port-left"
          title={`Receives from: ${view.receivesFromLabel}`}
          aria-label={`${view.name} input`}
        />
      ) : null}
      {view.hasOutputs ? (
        <Handle
          type="source"
          position={HandlePosition.Right}
          className="port port-right"
          title={`Sends to: ${view.sendsToLabel}`}
          aria-label={`${view.name} output`}
        />
      ) : null}

      {badge ? (
        <span
          className={`node-run-badge ${
            badge.variant === "running" ? "is-running" : badge.variant === "tool-completed" ? "is-tool-completed" : "is-completed"
          }`}
          title={badge.title}
        >
          {badge.text}
        </span>
      ) : null}

      <div className="node-help nodrag">
        <button type="button" className="help-button" aria-label={`About ${view.helpTitle}`} onClick={(event) => event.stopPropagation()}>
          ?
        </button>
        <div className="help-tooltip" role="tooltip">
          <strong>{view.helpTitle}</strong>
          <p>{view.helpDescription}</p>
          <p>Receives from: {view.receivesFromLabel}</p>
          <p>Sends to: {view.sendsToLabel}</p>
        </div>
      </div>

      <span className="node-icon" style={{ color: view.color }}>
        {view.icon}
      </span>
      <span className="node-type">{view.typeLabel}</span>
      <strong>{view.name}</strong>
      <span className="node-meta">{view.meta}</span>
    </div>
  );
});

const NODE_TYPES = { agno: AgnoNodeCard };

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}

const FlowCanvasInner = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvasInner(props, ref) {
  const {
    nodes: views,
    edges: graphEdges,
    selectedNodeIds,
    selectedEdgeIds,
    colorScheme,
    canConnect,
    onConnect,
    onNodesMoved,
    onSelectionChange,
    onDelete,
    onNodeDoubleClick,
    onDropLibraryItem,
    onZoomChange,
    children,
  } = props;
  const flow = useReactFlow<AgnoFlowNode, Edge>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfNodes, setRfNodes] = useState<AgnoFlowNode[]>([]);
  const lastSelectionRef = useRef<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });

  // Rebuild React Flow nodes from the graph, keeping what React Flow owns (measured size,
  // in-progress drag position) so an unrelated App re-render never makes a dragged node jump.
  useEffect(() => {
    const selected = new Set(selectedNodeIds);
    setRfNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return views.map((view) => {
        const existing = previous.get(view.id);
        const isDragging = Boolean(existing?.dragging);
        return {
          id: view.id,
          type: "agno",
          position: isDragging && existing ? existing.position : view.position,
          data: { view },
          selected: selected.has(view.id),
          dragging: existing?.dragging,
          measured: existing?.measured,
          width: existing?.width,
          height: existing?.height,
        } satisfies AgnoFlowNode;
      });
    });
  }, [views, selectedNodeIds]);

  const runningNodeIds = useMemo(
    () => new Set(views.filter((view) => view.runBadge?.variant === "running").map((view) => view.id)),
    [views],
  );

  // Edges follow the same pattern as nodes: rebuilt from props, with React Flow's selection
  // changes applied locally so its store (and onSelectionChange) sees them.
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  useEffect(() => {
    const selected = new Set(selectedEdgeIds);
    setRfEdges(
      graphEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        selected: selected.has(edge.id),
        animated: runningNodeIds.has(edge.source),
        className: "agno-edge",
        interactionWidth: 22,
      })),
    );
  }, [graphEdges, selectedEdgeIds, runningNodeIds]);

  const handleEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const localChanges = changes.filter((change) => change.type === "select");
    if (localChanges.length > 0) {
      setRfEdges((current) => applyEdgeChanges(localChanges, current));
    }
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange<AgnoFlowNode>[]) => {
      // Removals are reported through onDelete; App owns the graph and rebuilds us.
      const localChanges = changes.filter((change) => change.type !== "remove");
      setRfNodes((current) => applyNodeChanges(localChanges, current));

      const moved: Record<string, Position> = {};
      for (const change of changes) {
        if (change.type === "position" && change.dragging === false && change.position) {
          moved[change.id] = { x: Math.round(change.position.x), y: Math.round(change.position.y) };
        }
      }
      if (Object.keys(moved).length > 0) {
        onNodesMoved(moved);
      }
    },
    [onNodesMoved],
  );

  const handleSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      const nodeIds = nodes.map((node) => node.id);
      const edgeIds = edges.map((edge) => edge.id);
      const last = lastSelectionRef.current;
      if (sameIds(last.nodes, nodeIds) && sameIds(last.edges, edgeIds)) {
        return;
      }
      lastSelectionRef.current = { nodes: nodeIds, edges: edgeIds };
      onSelectionChange(nodeIds, edgeIds);
    },
    [onSelectionChange],
  );

  const isValidConnection = useCallback<IsValidConnection<Edge>>(
    (connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      if (graphEdges.some((edge) => edge.source === source && edge.target === target)) return false;
      return canConnect(source, target);
    },
    [canConnect, graphEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onConnect(connection.source, connection.target);
      }
    },
    [onConnect],
  );

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) return;
      event.preventDefault();
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onDropLibraryItem({ x: Math.round(point.x - NODE_WIDTH / 2), y: Math.round(point.y - 40) });
    },
    [flow, onDropLibraryItem],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => void flow.zoomIn({ duration: 160 }),
      zoomOut: () => void flow.zoomOut({ duration: 160 }),
      resetZoom: () => void flow.zoomTo(1, { duration: 160 }),
      fitView: () => void flow.fitView({ padding: 0.08, duration: 220, maxZoom: 1.2 }),
      getNodeSize: (nodeId: string) => {
        const measured = flow.getNode(nodeId)?.measured;
        return measured?.width && measured?.height ? { width: measured.width, height: measured.height } : undefined;
      },
      getViewportCenter: () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return null;
        return flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      },
    }),
    [flow],
  );

  return (
    <div className="flow-canvas" ref={wrapperRef} onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow<AgnoFlowNode, Edge>
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onSelectionChange={handleSelectionChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onDelete={({ nodes, edges }) => onDelete(nodes.map((node) => node.id), edges.map((edge) => edge.id))}
        onNodeDoubleClick={(_, node) => onNodeDoubleClick(node.id)}
        onMove={(_, viewport) => onZoomChange(viewport.zoom)}
        colorMode={colorScheme}
        minZoom={MIN_FLOW_ZOOM}
        maxZoom={MAX_FLOW_ZOOM}
        // Delete/Backspace is handled by App's keyboard shortcuts (React Flow's own key tracking
        // can miss the first Delete right after a Ctrl/Cmd combo such as Ctrl+V).
        deleteKeyCode={null}
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        selectionKeyCode="Shift"
        connectOnClick
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.1 }}
        defaultEdgeOptions={{ type: "default" }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} className="flow-background" />
        <MiniMap
          className="canvas-minimap"
          pannable
          zoomable
          ariaLabel="Flow minimap"
          nodeColor={(node) => (node as AgnoFlowNode).data.view.color}
          nodeBorderRadius={6}
          maskColor="rgba(var(--agno-background-dark-rgb), 0.62)"
        />
      </ReactFlow>
      {children}
    </div>
  );
});

/** FlowCanvas with its own React Flow provider (needed for the imperative zoom/fit handle). */
const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});

export default FlowCanvas;
