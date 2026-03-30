from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any


@dataclass(frozen=True)
class ProviderImport:
    module: str
    class_name: str
    alias: str | None = None


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    name: str
    model: str
    module: str
    class_name: str
    api_key_param: str | None = "api_key"
    api_key_env: str | None = None
    base_url_param: str | None = None
    base_url_env: str | None = None
    base_url: str | None = None
    temperature_supported: bool = True
    temperature_in_options: bool = False
    fixed_kwargs: dict[str, Any] = field(default_factory=dict)
    extra_kwargs_env: dict[str, str] = field(default_factory=dict)
    supports_local_models: bool = False
    aliases: tuple[str, ...] = ()
    import_alias: str | None = None


def _provider(
    *,
    id: str,
    name: str,
    model: str,
    module: str,
    class_name: str,
    api_key_param: str | None = "api_key",
    api_key_env: str | None = None,
    base_url_param: str | None = None,
    base_url_env: str | None = None,
    base_url: str | None = None,
    temperature_supported: bool = True,
    temperature_in_options: bool = False,
    fixed_kwargs: dict[str, Any] | None = None,
    extra_kwargs_env: dict[str, str] | None = None,
    supports_local_models: bool = False,
    aliases: tuple[str, ...] = (),
    import_alias: str | None = None,
) -> ProviderDefinition:
    return ProviderDefinition(
        id=id,
        name=name,
        model=model,
        module=module,
        class_name=class_name,
        api_key_param=api_key_param,
        api_key_env=api_key_env,
        base_url_param=base_url_param,
        base_url_env=base_url_env,
        base_url=base_url,
        temperature_supported=temperature_supported,
        temperature_in_options=temperature_in_options,
        fixed_kwargs=fixed_kwargs or {},
        extra_kwargs_env=extra_kwargs_env or {},
        supports_local_models=supports_local_models,
        aliases=aliases,
        import_alias=import_alias,
    )


def _openai_like_provider(
    *,
    id: str,
    name: str,
    model: str,
    module: str,
    class_name: str,
    api_key_env: str | None = None,
    base_url: str | None = None,
    base_url_env: str | None = None,
    base_url_param: str | None = "base_url",
    aliases: tuple[str, ...] = (),
    import_alias: str | None = None,
    api_key_param: str | None = "api_key",
    temperature_supported: bool = True,
    extra_kwargs_env: dict[str, str] | None = None,
    fixed_kwargs: dict[str, Any] | None = None,
) -> ProviderDefinition:
    return _provider(
        id=id,
        name=name,
        model=model,
        module=module,
        class_name=class_name,
        api_key_param=api_key_param,
        api_key_env=api_key_env,
        base_url_param=base_url_param,
        base_url_env=base_url_env,
        base_url=base_url,
        temperature_supported=temperature_supported,
        fixed_kwargs=fixed_kwargs,
        extra_kwargs_env=extra_kwargs_env,
        aliases=aliases,
        import_alias=import_alias,
    )


def _ollama_provider(
    *,
    id: str,
    name: str,
    model: str,
    module: str,
    class_name: str,
    api_key_env: str | None = None,
    base_url: str | None = "http://localhost:11434",
    base_url_env: str | None = "OLLAMA_HOST",
    temperature_supported: bool = True,
    temperature_in_options: bool = True,
    aliases: tuple[str, ...] = (),
    import_alias: str | None = None,
) -> ProviderDefinition:
    return _provider(
        id=id,
        name=name,
        model=model,
        module=module,
        class_name=class_name,
        api_key_env=api_key_env,
        base_url_param="host",
        base_url_env=base_url_env,
        base_url=base_url,
        temperature_supported=temperature_supported,
        temperature_in_options=temperature_in_options,
        supports_local_models=True,
        aliases=aliases,
        import_alias=import_alias,
    )


PROVIDER_DEFINITIONS: list[ProviderDefinition] = [
    _openai_like_provider(
        id="openai",
        name="OpenAI",
        model="gpt-4.1-mini",
        module="agno.models.openai",
        class_name="OpenAIChat",
        api_key_env="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        base_url_env="OPENAI_BASE_URL",
        aliases=("oai",),
    ),
    _openai_like_provider(
        id="openai-responses",
        name="OpenAI Responses",
        model="gpt-4.1-mini",
        module="agno.models.openai",
        class_name="OpenAIResponses",
        api_key_env="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        base_url_env="OPENAI_BASE_URL",
        aliases=("openai-resp",),
    ),
    _openai_like_provider(
        id="anthropic",
        name="Anthropic",
        model="claude-3-5-sonnet-latest",
        module="agno.models.anthropic.claude",
        class_name="Claude",
        api_key_env="ANTHROPIC_API_KEY",
        aliases=("claude",),
        import_alias="AnthropicClaude",
    ),
    _openai_like_provider(
        id="google",
        name="Google Gemini",
        model="gemini-2.0-flash-001",
        module="agno.models.google.gemini",
        class_name="Gemini",
        api_key_env="GOOGLE_API_KEY",
        aliases=("gemini",),
    ),
    _provider(
        id="google-vertex",
        name="Google Gemini Vertex",
        model="gemini-2.0-flash-001",
        module="agno.models.google.gemini",
        class_name="Gemini",
        api_key_param=None,
        api_key_env=None,
        base_url_param=None,
        base_url_env=None,
        base_url=None,
        fixed_kwargs={"vertexai": True},
        extra_kwargs_env={
            "project_id": "GOOGLE_CLOUD_PROJECT",
            "location": "GOOGLE_CLOUD_LOCATION",
        },
        import_alias="VertexGemini",
        aliases=("vertexai", "gemini-vertex"),
    ),
    _ollama_provider(
        id="ollama",
        name="Ollama",
        model="llama3.1",
        module="agno.models.ollama.chat",
        class_name="Ollama",
        aliases=("ollama-chat",),
    ),
    _ollama_provider(
        id="ollama-responses",
        name="Ollama Responses",
        model="llama3.1",
        module="agno.models.ollama.responses",
        class_name="OllamaResponses",
        temperature_supported=False,
        aliases=("ollama-response",),
    ),
    _openai_like_provider(
        id="openrouter",
        name="OpenRouter",
        model="openai/gpt-4.1-mini",
        module="agno.models.openrouter.openrouter",
        class_name="OpenRouter",
        api_key_env="OPENROUTER_API_KEY",
        base_url="https://openrouter.ai/api/v1",
        base_url_env="OPENROUTER_BASE_URL",
    ),
    _openai_like_provider(
        id="openrouter-responses",
        name="OpenRouter Responses",
        model="openai/gpt-4.1-mini",
        module="agno.models.openrouter.responses",
        class_name="OpenRouterResponses",
        api_key_env="OPENROUTER_API_KEY",
        base_url="https://openrouter.ai/api/v1",
        base_url_env="OPENROUTER_BASE_URL",
    ),
    _openai_like_provider(
        id="deepseek",
        name="DeepSeek",
        model="deepseek-chat",
        module="agno.models.deepseek.deepseek",
        class_name="DeepSeek",
        api_key_env="DEEPSEEK_API_KEY",
        base_url="https://api.deepseek.com",
    ),
    _openai_like_provider(
        id="groq",
        name="Groq",
        model="llama-3.1-70b-versatile",
        module="agno.models.groq.groq",
        class_name="Groq",
        api_key_env="GROQ_API_KEY",
        base_url="https://api.groq.com/openai/v1",
    ),
    _openai_like_provider(
        id="mistral",
        name="Mistral",
        model="mistral-large-latest",
        module="agno.models.mistral.mistral",
        class_name="MistralChat",
        api_key_env="MISTRAL_API_KEY",
        base_url="https://api.mistral.ai/v1",
        base_url_env="MISTRAL_BASE_URL",
        base_url_param="endpoint",
    ),
    _openai_like_provider(
        id="cohere",
        name="Cohere",
        model="command-r-plus",
        module="agno.models.cohere.chat",
        class_name="Cohere",
        api_key_env="CO_API_KEY",
        base_url_param=None,
    ),
    _openai_like_provider(
        id="cerebras",
        name="Cerebras",
        model="llama-3.3-70b",
        module="agno.models.cerebras.cerebras",
        class_name="Cerebras",
        api_key_env="CEREBRAS_API_KEY",
        base_url="https://api.cerebras.ai/v1",
    ),
    _openai_like_provider(
        id="cerebras-openai",
        name="Cerebras OpenAI",
        model="llama-3.3-70b",
        module="agno.models.cerebras.cerebras_openai",
        class_name="CerebrasOpenAI",
        api_key_env="CEREBRAS_API_KEY",
        base_url="https://api.cerebras.ai/v1",
    ),
    _openai_like_provider(
        id="xai",
        name="xAI",
        model="grok-3-mini",
        module="agno.models.xai.xai",
        class_name="xAI",
        api_key_env="XAI_API_KEY",
        base_url="https://api.x.ai/v1",
    ),
    _openai_like_provider(
        id="vllm",
        name="vLLM",
        model="llama-3.1-8b-instruct",
        module="agno.models.vllm.vllm",
        class_name="VLLM",
        api_key_env="VLLM_API_KEY",
        base_url="http://localhost:8000/v1",
        base_url_env="VLLM_BASE_URL",
    ),
    _openai_like_provider(
        id="lmstudio",
        name="LM Studio",
        model="llama-3.1-8b-instruct",
        module="agno.models.lmstudio.lmstudio",
        class_name="LMStudio",
        api_key_param=None,
        base_url="http://127.0.0.1:1234/v1",
        base_url_env="LMSTUDIO_BASE_URL",
    ),
    _openai_like_provider(
        id="llamacpp",
        name="Llama.cpp",
        model="llama-3.1-8b-instruct",
        module="agno.models.llama_cpp.llama_cpp",
        class_name="LlamaCpp",
        api_key_param=None,
        base_url="http://127.0.0.1:8080/v1",
        base_url_env="LLAMA_CPP_BASE_URL",
        aliases=("llama-cpp",),
    ),
    _openai_like_provider(
        id="nexus",
        name="Nexus",
        model="llama-3.1-8b-instruct",
        module="agno.models.nexus.nexus",
        class_name="Nexus",
        api_key_param=None,
        base_url="http://localhost:8000/llm/v1/",
        base_url_env="NEXUS_BASE_URL",
    ),
    _openai_like_provider(
        id="requesty",
        name="Requesty",
        model="gpt-4.1-mini",
        module="agno.models.requesty.requesty",
        class_name="Requesty",
        api_key_env="REQUESTY_API_KEY",
        base_url="https://router.requesty.ai/v1",
    ),
    _openai_like_provider(
        id="dashscope",
        name="DashScope",
        model="qwen-plus",
        module="agno.models.dashscope.dashscope",
        class_name="DashScope",
        api_key_env="DASHSCOPE_API_KEY",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    ),
    _openai_like_provider(
        id="cometapi",
        name="CometAPI",
        model="gpt-4.1-mini",
        module="agno.models.cometapi.cometapi",
        class_name="CometAPI",
        api_key_env="COMETAPI_KEY",
        base_url="https://api.cometapi.com/v1",
        aliases=("comet-api",),
    ),
    _openai_like_provider(
        id="sambanova",
        name="SambaNova",
        model="llama-3.1-70b",
        module="agno.models.sambanova.sambanova",
        class_name="Sambanova",
        api_key_env="SAMBANOVA_API_KEY",
        base_url="https://api.sambanova.ai/v1",
    ),
    _openai_like_provider(
        id="siliconflow",
        name="SiliconFlow",
        model="Qwen/Qwen2.5-72B-Instruct",
        module="agno.models.siliconflow.siliconflow",
        class_name="Siliconflow",
        api_key_env="SILICONFLOW_API_KEY",
        base_url="https://api.siliconflow.cn/v1",
    ),
    _openai_like_provider(
        id="deepinfra",
        name="DeepInfra",
        model="meta-llama/Llama-3.3-70B-Instruct",
        module="agno.models.deepinfra.deepinfra",
        class_name="DeepInfra",
        api_key_env="DEEPINFRA_API_KEY",
        base_url="https://api.deepinfra.com/v1/openai",
    ),
    _openai_like_provider(
        id="fireworks",
        name="Fireworks",
        model="accounts/fireworks/models/llama-v3p1-70b-instruct",
        module="agno.models.fireworks.fireworks",
        class_name="Fireworks",
        api_key_env="FIREWORKS_API_KEY",
        base_url="https://api.fireworks.ai/inference/v1",
    ),
    _openai_like_provider(
        id="together",
        name="Together",
        model="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        module="agno.models.together.together",
        class_name="Together",
        api_key_env="TOGETHER_API_KEY",
        base_url="https://api.together.xyz/v1",
    ),
    _openai_like_provider(
        id="perplexity",
        name="Perplexity",
        model="sonar",
        module="agno.models.perplexity.perplexity",
        class_name="Perplexity",
        api_key_env="PERPLEXITY_API_KEY",
        base_url="https://api.perplexity.ai/",
    ),
    _openai_like_provider(
        id="huggingface",
        name="Hugging Face",
        model="meta-llama/Meta-Llama-3-8B-Instruct",
        module="agno.models.huggingface.huggingface",
        class_name="HuggingFace",
        api_key_env="HF_TOKEN",
        base_url_param="base_url",
    ),
    _openai_like_provider(
        id="nvidia",
        name="NVIDIA",
        model="meta/llama-3.1-70b-instruct",
        module="agno.models.nvidia.nvidia",
        class_name="Nvidia",
        api_key_env="NVIDIA_API_KEY",
        base_url="https://integrate.api.nvidia.com/v1",
    ),
    _openai_like_provider(
        id="n1n",
        name="N1N",
        model="gpt-4o",
        module="agno.models.n1n.n1n",
        class_name="N1N",
        api_key_env="N1N_API_KEY",
        base_url="https://api.n1n.ai/v1",
    ),
    _openai_like_provider(
        id="neosantara",
        name="Neosantara",
        model="gpt-4o-mini",
        module="agno.models.neosantara.neosantara",
        class_name="Neosantara",
        api_key_env="NEOSANTARA_API_KEY",
        base_url="https://api.neosantara.xyz/v1",
    ),
    _openai_like_provider(
        id="aimlapi",
        name="AIMLAPI",
        model="gpt-4o-mini",
        module="agno.models.aimlapi.aimlapi",
        class_name="AIMLAPI",
        api_key_env="AIMLAPI_API_KEY",
        base_url="https://api.aimlapi.com/v1",
        aliases=("ai-ml-api",),
    ),
    _openai_like_provider(
        id="meta",
        name="Meta Llama",
        model="meta-llama/Meta-Llama-3.1-70B-Instruct",
        module="agno.models.meta.llama_openai",
        class_name="LlamaOpenAI",
        api_key_env="LLAMA_API_KEY",
        base_url="https://api.llama.com/v1",
        aliases=("llama",),
    ),
    _openai_like_provider(
        id="moonshot",
        name="Moonshot",
        model="moonshot-v1-8k",
        module="agno.models.moonshot.moonshot",
        class_name="MoonShot",
        api_key_env="MOONSHOT_API_KEY",
        base_url="https://api.moonshot.ai/v1",
    ),
    _openai_like_provider(
        id="internlm",
        name="InternLM",
        model="internlm2.5-latest",
        module="agno.models.internlm.internlm",
        class_name="InternLM",
        api_key_env="INTERNLM_API_KEY",
        base_url="https://internlm-chat.intern-ai.org.cn/puyu/api/v1/chat/completions",
    ),
    _openai_like_provider(
        id="nebius",
        name="Nebius",
        model="meta-llama/Llama-3.1-70B-Instruct",
        module="agno.models.nebius.nebius",
        class_name="Nebius",
        api_key_env="NEBIUS_API_KEY",
        base_url="https://api.tokenfactory.nebius.com/v1/",
    ),
    _provider(
        id="azure-openai",
        name="Azure OpenAI",
        model="gpt-4.1-mini",
        module="agno.models.azure.openai_chat",
        class_name="AzureOpenAI",
        api_key_env="AZURE_OPENAI_API_KEY",
        base_url_param="azure_endpoint",
        base_url_env="AZURE_OPENAI_ENDPOINT",
        base_url="https://<your-resource-name>.openai.azure.com/",
        extra_kwargs_env={
            "api_version": "AZURE_OPENAI_API_VERSION",
            "azure_deployment": "AZURE_OPENAI_DEPLOYMENT",
        },
        aliases=("azure-open-ai",),
    ),
    _provider(
        id="azure-ai-foundry",
        name="Azure AI Foundry",
        model="gpt-4o",
        module="agno.models.azure.ai_foundry",
        class_name="AzureAIFoundry",
        api_key_env="AZURE_API_KEY",
        base_url_param="azure_endpoint",
        base_url_env="AZURE_ENDPOINT",
        base_url="https://<your-host-name>.<your-azure-region>.models.ai.azure.com/models",
        extra_kwargs_env={"api_version": "AZURE_API_VERSION"},
        aliases=("azure-foundry",),
    ),
    _provider(
        id="aws-bedrock",
        name="AWS Bedrock",
        model="anthropic.claude-3-5-sonnet-20241022-v2:0",
        module="agno.models.aws.bedrock",
        class_name="AwsBedrock",
        api_key_param=None,
        fixed_kwargs={},
        extra_kwargs_env={
            "aws_region": "AWS_REGION",
            "aws_access_key_id": "AWS_ACCESS_KEY_ID",
            "aws_secret_access_key": "AWS_SECRET_ACCESS_KEY",
            "aws_session_token": "AWS_SESSION_TOKEN",
        },
        aliases=("bedrock", "aws"),
    ),
    _provider(
        id="bedrock-claude",
        name="AWS Bedrock Claude",
        model="anthropic.claude-3-5-sonnet-20241022-v2:0",
        module="agno.models.aws.claude",
        class_name="Claude",
        api_key_param=None,
        extra_kwargs_env={
            "aws_region": "AWS_REGION",
            "aws_access_key": "AWS_ACCESS_KEY_ID",
            "aws_secret_key": "AWS_SECRET_ACCESS_KEY",
            "aws_session_token": "AWS_SESSION_TOKEN",
        },
        import_alias="AwsClaude",
        aliases=("bedrock-claude",),
    ),
    _provider(
        id="vertex-claude",
        name="Vertex Claude",
        model="claude-3-5-sonnet-20240620",
        module="agno.models.vertexai.claude",
        class_name="Claude",
        api_key_param=None,
        base_url_param="base_url",
        base_url_env="ANTHROPIC_VERTEX_BASE_URL",
        extra_kwargs_env={
            "region": "CLOUD_ML_REGION",
            "project_id": "ANTHROPIC_VERTEX_PROJECT_ID",
        },
        import_alias="VertexClaude",
        aliases=("claude-vertex",),
    ),
    _provider(
        id="watsonx",
        name="IBM WatsonX",
        model="ibm/granite-20b-code-instruct",
        module="agno.models.ibm.watsonx",
        class_name="WatsonX",
        api_key_env="IBM_WATSONX_API_KEY",
        base_url_param="url",
        base_url_env="IBM_WATSONX_URL",
        base_url="https://eu-de.ml.cloud.ibm.com",
        extra_kwargs_env={"project_id": "IBM_WATSONX_PROJECT_ID"},
        aliases=("ibm-watsonx", "watsonx-ai"),
    ),
    _provider(
        id="portkey",
        name="Portkey",
        model="gpt-4o-mini",
        module="agno.models.portkey.portkey",
        class_name="Portkey",
        api_key_param="portkey_api_key",
        api_key_env="PORTKEY_API_KEY",
        base_url_param="base_url",
        base_url_env="PORTKEY_BASE_URL",
        extra_kwargs_env={"virtual_key": "PORTKEY_VIRTUAL_KEY"},
        aliases=("port-key",),
    ),
    _provider(
        id="langdb",
        name="LangDB",
        model="gpt-4o-mini",
        module="agno.models.langdb.langdb",
        class_name="LangDB",
        api_key_env="LANGDB_API_KEY",
        base_url_param="base_host_url",
        base_url_env="LANGDB_API_BASE_URL",
        base_url="https://api.us-east-1.langdb.ai",
        extra_kwargs_env={"project_id": "LANGDB_PROJECT_ID"},
    ),
    _provider(
        id="litellm",
        name="LiteLLM",
        model="gpt-4o-mini",
        module="agno.models.litellm.chat",
        class_name="LiteLLM",
        api_key_env="LITELLM_API_KEY",
        base_url_param="api_base",
        base_url_env="LITELLM_BASE_URL",
        temperature_supported=True,
        aliases=("litellm-chat",),
    ),
    _openai_like_provider(
        id="litellm-openai",
        name="LiteLLM OpenAI",
        model="gpt-4o-mini",
        module="agno.models.litellm.litellm_openai",
        class_name="LiteLLMOpenAI",
        api_key_env="LITELLM_API_KEY",
        base_url="http://localhost:4000",
        base_url_env="LITELLM_BASE_URL",
        aliases=("litellm-open-ai",),
    ),
    _openai_like_provider(
        id="v0",
        name="Vercel v0",
        model="v0-1.0-md",
        module="agno.models.vercel.v0",
        class_name="V0",
        api_key_env="V0_API_KEY",
        base_url="https://api.v0.dev/v1/",
        aliases=("vercel",),
    ),
]


def _slugify_provider_id(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower())
    return cleaned.strip("-")


def _build_alias_map() -> dict[str, str]:
    alias_map: dict[str, str] = {}
    for definition in PROVIDER_DEFINITIONS:
        alias_map[_slugify_provider_id(definition.id)] = definition.id
        for alias in definition.aliases:
            alias_map[_slugify_provider_id(alias)] = definition.id
    return alias_map


PROVIDER_ALIAS_MAP = _build_alias_map()
PROVIDER_DEFINITIONS_BY_ID = {definition.id: definition for definition in PROVIDER_DEFINITIONS}
PROVIDER_PROFILE_OPTIONS = [{"label": f"{definition.name} ({definition.id})", "value": definition.id} for definition in PROVIDER_DEFINITIONS]
PROVIDER_ID_OPTIONS = sorted(PROVIDER_ALIAS_MAP.keys())


def normalize_provider_id(value: str | None) -> str:
    if not value:
        return ""
    normalized = _slugify_provider_id(value)
    return PROVIDER_ALIAS_MAP.get(normalized, normalized)


def get_provider_definition(provider_id: str | None) -> ProviderDefinition | None:
    normalized = normalize_provider_id(provider_id)
    if not normalized:
        return None
    return PROVIDER_DEFINITIONS_BY_ID.get(normalized)


def build_provider_config(provider_id: str | None) -> dict[str, str]:
    definition = get_provider_definition(provider_id)
    if not definition:
        normalized = normalize_provider_id(provider_id)
        return {
            "provider_profile": normalized,
            "provider_api_key_env": "",
            "provider_api_key": "",
            "provider_base_url_env": "",
            "provider_base_url": "",
            "provider_execution_timeout_seconds": "",
            "provider_env_json": "",
        }

    base_url = ""
    if definition.base_url_param or definition.base_url_env or definition.supports_local_models:
        base_url = definition.base_url or ""

    return {
        "provider_profile": definition.id,
        "provider_api_key_env": definition.api_key_env or "",
        "provider_api_key": "",
        "provider_base_url_env": definition.base_url_env or "",
        "provider_base_url": base_url,
        "provider_execution_timeout_seconds": "120" if definition.supports_local_models else "",
        "provider_env_json": "",
    }


def _config_value(
    provider_config: dict[str, Any],
    field_name: str,
    env_name: str | None,
    default_value: str | None = None,
) -> str | None:
    raw_value = provider_config.get(field_name)
    if isinstance(raw_value, str):
        raw_value = raw_value.strip()
    if raw_value not in (None, ""):
        return python_literal(raw_value)
    if env_name:
        env_expr = f"os.getenv({python_literal(env_name)})"
        if default_value not in (None, ""):
            return f"{env_expr} or {python_literal(default_value)}"
        return env_expr
    if default_value not in (None, ""):
        return python_literal(default_value)
    return None


def python_literal(value: Any) -> str:
    return repr(value)


def _render_kwargs(arguments: list[tuple[str, str]]) -> str:
    return ", ".join(f"{name}={value}" for name, value in arguments if value is not None)


def render_provider_model_expression(
    provider_id: str | None,
    model_name: str | None,
    temperature: float | None,
    provider_config: dict[str, Any] | None = None,
    class_ref: str | None = None,
) -> tuple[str, list[ProviderImport], list[str]]:
    warnings: list[str] = []
    config = provider_config if isinstance(provider_config, dict) else {}
    definition = get_provider_definition(provider_id)

    if definition is None:
        model = (model_name or "").strip() or "gpt-4.1-mini"
        normalized_provider = normalize_provider_id(provider_id)
        if normalized_provider and normalized_provider != "openai":
            warnings.append(f"Unknown provider '{provider_id or ''}'; using Agno provider string fallback.")
            return python_literal(f"{normalized_provider}:{model}"), [], warnings

        warnings.append(f"Unknown provider '{provider_id or ''}'; falling back to OpenAIChat.")
        imports = [ProviderImport(module="agno.models.openai", class_name="OpenAIChat")]
        kwargs = [("id", python_literal(model))]
        if temperature is not None:
            kwargs.append(("temperature", python_literal(temperature)))
        return f"OpenAIChat({_render_kwargs(kwargs)})", imports, warnings

    imports = [
        ProviderImport(
            module=definition.module,
            class_name=definition.class_name,
            alias=class_ref or definition.import_alias,
        )
    ]

    model = (model_name or "").strip() or definition.model
    kwargs: list[tuple[str, str]] = [("id", python_literal(model))]

    for key, value in definition.fixed_kwargs.items():
        kwargs.append((key, python_literal(value)))

    if temperature is not None and definition.temperature_supported:
        if definition.temperature_in_options:
            kwargs.append(("options", python_literal({"temperature": temperature})))
        else:
            kwargs.append(("temperature", python_literal(temperature)))

    api_key_env = str(config.get("provider_api_key_env") or definition.api_key_env or "").strip() or None
    api_key_expr = _config_value(config, "provider_api_key", api_key_env)
    if definition.api_key_param and api_key_expr is not None:
        kwargs.append((definition.api_key_param, api_key_expr))

    base_url_env = str(config.get("provider_base_url_env") or definition.base_url_env or "").strip() or None
    base_url_expr = _config_value(config, "provider_base_url", base_url_env, definition.base_url)
    if definition.base_url_param and base_url_expr is not None:
        kwargs.append((definition.base_url_param, base_url_expr))

    for arg_name, env_name in definition.extra_kwargs_env.items():
        kwargs.append((arg_name, f"os.getenv({python_literal(env_name)})"))

    return f"{definition.class_name}({_render_kwargs(kwargs)})", imports, warnings
