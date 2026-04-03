from __future__ import annotations

from collections.abc import Iterable
import re

from .models import CanvasGraph, NodeType

API_BASE_REQUIREMENTS = [
    "agno",
    "fastapi>=0.115.0",
    "jinja2>=3.1.0",
    "openai",
    "pydantic>=2.8.0",
    "python-dotenv",
    "uvicorn>=0.30.0",
]

FLOW_BASE_REQUIREMENTS = [
    "agno",
    "openai",
]

TOOL_REQUIREMENTS_BY_KEY: dict[str, list[str]] = {
    "websearch": ["ddgs"],
    "duckduckgo": ["ddgs"],
    "yfinance": ["yfinance"],
    "openbb": ["openbb"],
    "postgres": ["psycopg-binary"],
    "duckdb": ["duckdb"],
    "neo4j": ["neo4j"],
    "sql": ["sqlalchemy"],
    "pandas": ["pandas"],
    "bigquery": ["google-cloud-bigquery"],
    "redshift": ["redshift-connector"],
    "firecrawl": ["firecrawl-py"],
    "crawl4ai": ["crawl4ai"],
    "newspaper": [
        "newspaper3k; python_version < '3.14'",
        "lxml_html_clean; python_version < '3.14'",
    ],
    "newspaper4k": ["newspaper4k", "lxml_html_clean"],
    "spider": ["spider-client"],
    "oxylabs": ["oxylabs"],
    "arxiv": ["arxiv"],
    "wikipedia": ["wikipedia"],
    "google_calendar": ["google-api-python-client", "google-auth-httplib2", "google-auth-oauthlib"],
    "google_sheets": ["google-api-python-client", "google-auth-httplib2", "google-auth-oauthlib"],
    "google_drive": ["google-api-python-client", "google-auth-httplib2", "google-auth-oauthlib"],
    "notion": ["notion-client"],
    "todoist": ["todoist-api-python"],
    "trello": ["py-trello"],
    "jira": ["jira"],
    "confluence": ["atlassian-python-api"],
    "calcom": ["requests", "pytz"],
    "github": ["PyGithub"],
    "docker": ["docker"],
    "aws_lambda": ["boto3"],
    "e2b": ["e2b_code_interpreter"],
    "daytona": ["daytona"],
    "replicate": ["replicate"],
    "fal": ["fal-client"],
    "lumalabs": ["lumaai"],
    "elevenlabs": ["elevenlabs"],
    "cartesia": ["cartesia"],
    "mlx_transcribe": ["mlx-whisper"],
    "youtube": ["youtube_transcript_api"],
    "opencv": ["opencv-python"],
    "google_maps": ["googlemaps", "google-maps-places"],
}

FUNCTION_TOOL_REQUIREMENTS_BY_NAME: dict[str, list[str]] = {
    "read_excel_workbook": ["pandas", "openpyxl", "xlrd"],
}

COMPONENT_REQUIREMENTS_BY_SYMBOL: dict[str, list[str]] = {
    "PgVector": ["sqlalchemy", "psycopg-binary", "pgvector"],
    "Qdrant": ["qdrant-client"],
    "ChromaDb": ["chromadb"],
    "PineconeDb": ["pinecone<6"],
    "LanceDb": ["lancedb"],
    "Weaviate": ["weaviate-client"],
    "PostgresDb": ["sqlalchemy", "psycopg-binary"],
    "AsyncPostgresDb": ["sqlalchemy", "psycopg-binary"],
    "MongoDb": ["pymongo"],
    "Whatsapp": ["httpx", "cryptography>=41.0"],
    "Telegram": ["pyTelegramBotAPI"],
    "Slack": ["slack_sdk>=3.40.0", "httpx"],
    "A2A": ["a2a-sdk"],
    "AGUI": ["ag-ui-protocol"],
}

INTERFACE_REQUIREMENTS_BY_PRESET: dict[str, list[str]] = {
    "whatsapp": ["httpx", "cryptography>=41.0"],
    "telegram": ["pyTelegramBotAPI"],
    "slack": ["slack_sdk>=3.40.0", "httpx"],
    "a2a": ["a2a-sdk"],
    "ag_ui": ["ag-ui-protocol"],
    "all": [
        "httpx",
        "cryptography>=41.0",
        "pyTelegramBotAPI",
        "slack_sdk>=3.40.0",
        "a2a-sdk",
        "ag-ui-protocol",
    ],
}

INPUT_FILE_REQUIREMENTS_BY_EXTENSION: dict[str, list[str]] = {
    ".pdf": ["pypdf"],
    "application/pdf": ["pypdf"],
    ".docx": ["python-docx"],
    ".doc": ["python-docx"],
    "application/msword": ["python-docx"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["python-docx"],
    ".pptx": ["python-pptx"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["python-pptx"],
    ".xlsx": ["openpyxl"],
    ".xls": ["xlrd"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["openpyxl"],
    "application/vnd.ms-excel": ["xlrd"],
}

KNOWLEDGE_READER_REQUIREMENTS_BY_KEY: dict[str, list[str]] = {
    "auto": ["pypdf", "python-docx", "python-pptx", "openpyxl", "xlrd"],
    "pdf": ["pypdf"],
    "excel": ["openpyxl", "xlrd"],
    "docx": ["python-docx"],
    "pptx": ["python-pptx"],
    "field_labeled_csv": ["aiofiles"],
}

KNOWLEDGE_URL_REQUIREMENTS = ["beautifulsoup4"]
SKILLS_REQUIREMENTS = ["pyyaml"]


def unique_requirements(requirements: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for requirement in requirements:
        if requirement in seen:
            continue
        seen.add(requirement)
        result.append(requirement)
    return result


def all_supported_api_requirements() -> list[str]:
    extras = [
        requirement
        for requirements in TOOL_REQUIREMENTS_BY_KEY.values()
        for requirement in requirements
    ]
    starter_extras = [
        requirement
        for requirements in FUNCTION_TOOL_REQUIREMENTS_BY_NAME.values()
        for requirement in requirements
    ]
    component_extras = [
        requirement
        for requirements in COMPONENT_REQUIREMENTS_BY_SYMBOL.values()
        for requirement in requirements
    ]
    input_extras = [
        requirement
        for requirements in INPUT_FILE_REQUIREMENTS_BY_EXTENSION.values()
        for requirement in requirements
    ]
    knowledge_reader_extras = [
        requirement
        for requirements in KNOWLEDGE_READER_REQUIREMENTS_BY_KEY.values()
        for requirement in requirements
    ]
    return unique_requirements(
        [
            *API_BASE_REQUIREMENTS,
            *extras,
            *starter_extras,
            *component_extras,
            *[req for reqs in INTERFACE_REQUIREMENTS_BY_PRESET.values() for req in reqs],
            *input_extras,
            *knowledge_reader_extras,
            *KNOWLEDGE_URL_REQUIREMENTS,
            *SKILLS_REQUIREMENTS,
        ]
    )


def collect_component_requirements(raw_value: str) -> list[str]:
    requirements: list[str] = []
    for symbol, symbol_requirements in COMPONENT_REQUIREMENTS_BY_SYMBOL.items():
        if re.search(rf"\b{re.escape(symbol)}\b", raw_value):
            requirements.extend(symbol_requirements)
    return requirements


def graph_runtime_requirements(graph: CanvasGraph) -> list[str]:
    requirements: list[str] = [*FLOW_BASE_REQUIREMENTS]
    needs_requests = False
    node_map = {node.id: node for node in graph.nodes}

    for node in graph.nodes:
        extras = node.data.extras or {}

        if node.type == NodeType.OUTPUT_API:
            needs_requests = True

        if node.type == NodeType.INPUT:
            attached_file_name = str(extras.get("attachedFileName") or "").strip().lower()
            attached_file_mime_type = str(extras.get("attachedFileMimeType") or "").strip().lower()
            for key in {attached_file_name[attached_file_name.rfind(".") :] if "." in attached_file_name else "", attached_file_mime_type}:
                if not key:
                    continue
                requirements.extend(INPUT_FILE_REQUIREMENTS_BY_EXTENSION.get(key, []))

        if node.type == NodeType.DATABASE:
            requirements.extend(collect_component_requirements(str(extras.get("dbExpression") or "")))
            continue

        if node.type == NodeType.VECTOR_DB:
            requirements.extend(collect_component_requirements(str(extras.get("vectorExpression") or "")))
            continue

        if node.type == NodeType.KNOWLEDGE:
            incoming_nodes = [
                node_map[edge.source]
                for edge in graph.edges
                if edge.target == node.id and edge.source in node_map
            ]
            has_connected_vector_db = any(source_node.type == NodeType.VECTOR_DB for source_node in incoming_nodes)
            has_connected_database = any(source_node.type == NodeType.DATABASE for source_node in incoming_nodes)
            include_contents_db = bool(extras.get("includeContentsDb"))

            if not has_connected_vector_db:
                requirements.extend(collect_component_requirements(str(extras.get("knowledgeExpression") or "")))
            if include_contents_db and not has_connected_database:
                requirements.extend(collect_component_requirements(str(extras.get("contentsDbExpression") or "")))
            if bool(extras.get("ingestAttachedFiles", True)):
                reader_key = str(extras.get("knowledgeReader") or "auto").strip().lower() or "auto"
                requirements.extend(KNOWLEDGE_READER_REQUIREMENTS_BY_KEY.get(reader_key, KNOWLEDGE_READER_REQUIREMENTS_BY_KEY["auto"]))
            static_urls_raw = str(extras.get("staticUrls") or "").strip()
            if static_urls_raw:
                requirements.extend(KNOWLEDGE_URL_REQUIREMENTS)
                url_lines = [line.strip().lower() for line in static_urls_raw.splitlines() if line.strip()]
                if any("youtube.com" in line or "youtu.be" in line for line in url_lines):
                    requirements.append("youtube_transcript_api")
            continue

        if node.type == NodeType.SKILLS:
            requirements.extend(SKILLS_REQUIREMENTS)
            continue

        if node.type == NodeType.LEARNING_MACHINE:
            requirements.extend(collect_component_requirements(str(extras.get("learningMachineExpression") or "")))
            continue

        if node.type == NodeType.INTERFACE:
            interface_preset = str(extras.get("interfacePreset") or "").strip().lower()
            requirements.extend(INTERFACE_REQUIREMENTS_BY_PRESET.get(interface_preset, []))
            requirements.extend(collect_component_requirements(str(extras.get("interfaceExpression") or "")))
            continue

        if node.type != NodeType.TOOL:
            continue

        tool_mode = extras.get("toolMode", "builtin")

        if tool_mode == "builtin":
            tool_key = str(extras.get("builtinToolKey") or "")
            requirements.extend(TOOL_REQUIREMENTS_BY_KEY.get(tool_key, []))
            continue

        function_name = str(extras.get("functionName") or "")
        requirements.extend(FUNCTION_TOOL_REQUIREMENTS_BY_NAME.get(function_name, []))

    if needs_requests:
        requirements.append("requests")

    return unique_requirements(requirements)
