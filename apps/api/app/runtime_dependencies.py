from __future__ import annotations

from collections.abc import Iterable

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
    return unique_requirements([*API_BASE_REQUIREMENTS, *extras, *starter_extras])


def graph_runtime_requirements(graph: CanvasGraph) -> list[str]:
    requirements: list[str] = [*FLOW_BASE_REQUIREMENTS]
    needs_requests = False

    for node in graph.nodes:
        if node.type == NodeType.OUTPUT_API:
            needs_requests = True

        if node.type != NodeType.TOOL:
            continue

        extras = node.data.extras or {}
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
