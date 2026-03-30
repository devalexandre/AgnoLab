from __future__ import annotations

from .provider_catalog import build_provider_config
from .models import CanvasGraph, GraphEdge, GraphNode, NodeData, Position, ProjectMeta


def build_sample_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Support Agent Flow"),
        nodes=[
            GraphNode(
                id="input_1",
                type="input",
                position=Position(x=260, y=250),
                data=NodeData(
                    name="User Input",
                    prompt="Pesquise formas práticas de usar agents em automação.",
                    extras={
                        "inputMode": "text",
                        "inputText": "Pesquise formas práticas de usar agents em automação.",
                        "attachedFileName": "",
                        "attachedFileAlias": "",
                        "attachedFileMimeType": "",
                        "attachedFileEncoding": "base64",
                        "attachedFileBase64": "",
                        "attachedFileContent": "",
                        "payloadJson": '{\n  "source": "sample_graph"\n}',
                    },
                ),
            ),
            GraphNode(
                id="tool_1",
                type="tool",
                position=Position(x=260, y=430),
                data=NodeData(
                    name="Search Tool",
                    extras={
                        "toolMode": "function",
                        "builtinToolKey": "websearch",
                        "builtinImportPath": "agno.tools.websearch",
                        "builtinClassName": "WebSearchTools",
                        "builtinConfig": '{\n  "backend": "google"\n}',
                        "functionName": "search_tool",
                        "functionCode": "def search_tool(value: str) -> str:\n    return f'Search stub: {value}'\n",
                    },
                ),
            ),
            GraphNode(
                id="agent_1",
                type="agent",
                position=Position(x=560, y=250),
                data=NodeData(
                    name="Search Agent",
                    instructions="Responda de forma objetiva e com foco em automação com agents.",
                    provider="openai",
                    model="gpt-4.1-mini",
                    extras={
                        "providerConfig": build_provider_config("openai"),
                        "agentConfig": {
                            "markdown": True,
                            "add_datetime_to_context": True,
                            "debug_mode": True,
                        }
                    },
                ),
            ),
            GraphNode(
                id="output_1",
                type="output",
                position=Position(x=860, y=250),
                data=NodeData(name="Console Output", output_format="text"),
            ),
        ],
        edges=[
            GraphEdge(id="edge_tool_agent", source="tool_1", target="agent_1"),
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )
