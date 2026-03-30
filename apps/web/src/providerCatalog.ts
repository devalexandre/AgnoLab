export interface ProviderDefinition {
  id: string;
  name: string;
  model: string;
  key: string;
  url: string;
  baseUrlEnv?: string;
  supportsLocalModels?: boolean;
  aliases?: string[];
}

function slugifyProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-4.1-mini",
    key: "OPENAI_API_KEY",
    url: "https://api.openai.com/v1",
    baseUrlEnv: "OPENAI_BASE_URL",
    aliases: ["oai"],
  },
  {
    id: "openai-responses",
    name: "OpenAI Responses",
    model: "gpt-4.1-mini",
    key: "OPENAI_API_KEY",
    url: "https://api.openai.com/v1",
    baseUrlEnv: "OPENAI_BASE_URL",
    aliases: ["openai-resp"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    model: "claude-3-5-sonnet-latest",
    key: "ANTHROPIC_API_KEY",
    url: "",
    aliases: ["claude"],
  },
  {
    id: "google",
    name: "Google Gemini",
    model: "gemini-2.0-flash-001",
    key: "GOOGLE_API_KEY",
    url: "",
    aliases: ["gemini"],
  },
  {
    id: "google-vertex",
    name: "Google Gemini Vertex",
    model: "gemini-2.0-flash-001",
    key: "",
    url: "",
    aliases: ["vertexai", "gemini-vertex"],
  },
  {
    id: "ollama",
    name: "Ollama",
    model: "llama3.1",
    key: "",
    url: "http://localhost:11434",
    baseUrlEnv: "OLLAMA_HOST",
    supportsLocalModels: true,
    aliases: ["ollama-chat"],
  },
  {
    id: "ollama-responses",
    name: "Ollama Responses",
    model: "llama3.1",
    key: "",
    url: "http://localhost:11434",
    baseUrlEnv: "OLLAMA_HOST",
    supportsLocalModels: true,
    aliases: ["ollama-response"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    model: "openai/gpt-4.1-mini",
    key: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1",
    baseUrlEnv: "OPENROUTER_BASE_URL",
  },
  {
    id: "openrouter-responses",
    name: "OpenRouter Responses",
    model: "openai/gpt-4.1-mini",
    key: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1",
    baseUrlEnv: "OPENROUTER_BASE_URL",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    model: "deepseek-chat",
    key: "DEEPSEEK_API_KEY",
    url: "https://api.deepseek.com",
  },
  {
    id: "groq",
    name: "Groq",
    model: "llama-3.1-70b-versatile",
    key: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1",
  },
  {
    id: "mistral",
    name: "Mistral",
    model: "mistral-large-latest",
    key: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1",
    baseUrlEnv: "MISTRAL_BASE_URL",
  },
  {
    id: "cohere",
    name: "Cohere",
    model: "command-r-plus",
    key: "CO_API_KEY",
    url: "",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    model: "llama-3.3-70b",
    key: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1",
  },
  {
    id: "cerebras-openai",
    name: "Cerebras OpenAI",
    model: "llama-3.3-70b",
    key: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1",
  },
  {
    id: "xai",
    name: "xAI",
    model: "grok-3-mini",
    key: "XAI_API_KEY",
    url: "https://api.x.ai/v1",
  },
  {
    id: "vllm",
    name: "vLLM",
    model: "llama-3.1-8b-instruct",
    key: "VLLM_API_KEY",
    url: "http://localhost:8000/v1",
    baseUrlEnv: "VLLM_BASE_URL",
    supportsLocalModels: true,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    model: "llama-3.1-8b-instruct",
    key: "",
    url: "http://127.0.0.1:1234/v1",
    baseUrlEnv: "LMSTUDIO_BASE_URL",
    supportsLocalModels: true,
  },
  {
    id: "llamacpp",
    name: "Llama.cpp",
    model: "llama-3.1-8b-instruct",
    key: "",
    url: "http://127.0.0.1:8080/v1",
    baseUrlEnv: "LLAMA_CPP_BASE_URL",
    supportsLocalModels: true,
    aliases: ["llama-cpp"],
  },
  {
    id: "nexus",
    name: "Nexus",
    model: "llama-3.1-8b-instruct",
    key: "",
    url: "http://localhost:8000/llm/v1/",
    baseUrlEnv: "NEXUS_BASE_URL",
    supportsLocalModels: true,
  },
  {
    id: "requesty",
    name: "Requesty",
    model: "gpt-4.1-mini",
    key: "REQUESTY_API_KEY",
    url: "https://router.requesty.ai/v1",
  },
  {
    id: "dashscope",
    name: "DashScope",
    model: "qwen-plus",
    key: "DASHSCOPE_API_KEY",
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "cometapi",
    name: "CometAPI",
    model: "gpt-4.1-mini",
    key: "COMETAPI_KEY",
    url: "https://api.cometapi.com/v1",
    aliases: ["comet-api"],
  },
  {
    id: "sambanova",
    name: "SambaNova",
    model: "llama-3.1-70b",
    key: "SAMBANOVA_API_KEY",
    url: "https://api.sambanova.ai/v1",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    model: "Qwen/Qwen2.5-72B-Instruct",
    key: "SILICONFLOW_API_KEY",
    url: "https://api.siliconflow.cn/v1",
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    key: "DEEPINFRA_API_KEY",
    url: "https://api.deepinfra.com/v1/openai",
  },
  {
    id: "fireworks",
    name: "Fireworks",
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    key: "FIREWORKS_API_KEY",
    url: "https://api.fireworks.ai/inference/v1",
  },
  {
    id: "together",
    name: "Together",
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    key: "TOGETHER_API_KEY",
    url: "https://api.together.xyz/v1",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    model: "sonar",
    key: "PERPLEXITY_API_KEY",
    url: "https://api.perplexity.ai/",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    model: "meta-llama/Meta-Llama-3-8B-Instruct",
    key: "HF_TOKEN",
    url: "",
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    model: "meta/llama-3.1-70b-instruct",
    key: "NVIDIA_API_KEY",
    url: "https://integrate.api.nvidia.com/v1",
  },
  {
    id: "n1n",
    name: "N1N",
    model: "gpt-4o",
    key: "N1N_API_KEY",
    url: "https://api.n1n.ai/v1",
  },
  {
    id: "neosantara",
    name: "Neosantara",
    model: "gpt-4o-mini",
    key: "NEOSANTARA_API_KEY",
    url: "https://api.neosantara.xyz/v1",
  },
  {
    id: "aimlapi",
    name: "AIMLAPI",
    model: "gpt-4o-mini",
    key: "AIMLAPI_API_KEY",
    url: "https://api.aimlapi.com/v1",
    aliases: ["ai-ml-api"],
  },
  {
    id: "meta",
    name: "Meta Llama",
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    key: "LLAMA_API_KEY",
    url: "https://api.llama.com/v1",
    aliases: ["llama"],
  },
  {
    id: "moonshot",
    name: "Moonshot",
    model: "moonshot-v1-8k",
    key: "MOONSHOT_API_KEY",
    url: "https://api.moonshot.ai/v1",
  },
  {
    id: "internlm",
    name: "InternLM",
    model: "internlm2.5-latest",
    key: "INTERNLM_API_KEY",
    url: "https://internlm-chat.intern-ai.org.cn/puyu/api/v1/chat/completions",
  },
  {
    id: "nebius",
    name: "Nebius",
    model: "meta-llama/Llama-3.1-70B-Instruct",
    key: "NEBIUS_API_KEY",
    url: "https://api.tokenfactory.nebius.com/v1/",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    model: "gpt-4.1-mini",
    key: "AZURE_OPENAI_API_KEY",
    url: "https://<your-resource-name>.openai.azure.com/",
    baseUrlEnv: "AZURE_OPENAI_ENDPOINT",
    aliases: ["azure-open-ai"],
  },
  {
    id: "azure-ai-foundry",
    name: "Azure AI Foundry",
    model: "gpt-4o",
    key: "AZURE_API_KEY",
    url: "https://<your-host-name>.<your-azure-region>.models.ai.azure.com/models",
    baseUrlEnv: "AZURE_ENDPOINT",
    aliases: ["azure-foundry"],
  },
  {
    id: "aws-bedrock",
    name: "AWS Bedrock",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    key: "",
    url: "",
    supportsLocalModels: false,
    aliases: ["bedrock", "aws"],
  },
  {
    id: "bedrock-claude",
    name: "AWS Bedrock Claude",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    key: "",
    url: "",
    aliases: ["bedrock-claude"],
  },
  {
    id: "vertex-claude",
    name: "Vertex Claude",
    model: "claude-3-5-sonnet-20240620",
    key: "",
    url: "",
    baseUrlEnv: "ANTHROPIC_VERTEX_BASE_URL",
    aliases: ["claude-vertex"],
  },
  {
    id: "watsonx",
    name: "IBM WatsonX",
    model: "ibm/granite-20b-code-instruct",
    key: "IBM_WATSONX_API_KEY",
    url: "https://eu-de.ml.cloud.ibm.com",
    baseUrlEnv: "IBM_WATSONX_URL",
    aliases: ["ibm-watsonx", "watsonx-ai"],
  },
  {
    id: "portkey",
    name: "Portkey",
    model: "gpt-4o-mini",
    key: "PORTKEY_API_KEY",
    url: "",
    baseUrlEnv: "PORTKEY_BASE_URL",
    aliases: ["port-key"],
  },
  {
    id: "langdb",
    name: "LangDB",
    model: "gpt-4o-mini",
    key: "LANGDB_API_KEY",
    url: "https://api.us-east-1.langdb.ai",
    baseUrlEnv: "LANGDB_API_BASE_URL",
  },
  {
    id: "litellm",
    name: "LiteLLM",
    model: "gpt-4o-mini",
    key: "LITELLM_API_KEY",
    url: "",
    baseUrlEnv: "LITELLM_BASE_URL",
  },
  {
    id: "litellm-openai",
    name: "LiteLLM OpenAI",
    model: "gpt-4o-mini",
    key: "LITELLM_API_KEY",
    url: "http://localhost:4000",
    baseUrlEnv: "LITELLM_BASE_URL",
    aliases: ["litellm-open-ai"],
  },
  {
    id: "v0",
    name: "Vercel v0",
    model: "v0-1.0-md",
    key: "V0_API_KEY",
    url: "https://api.v0.dev/v1/",
    aliases: ["vercel"],
  },
];

const PROVIDER_ALIAS_MAP = new Map<string, string>();

for (const definition of PROVIDER_DEFINITIONS) {
  PROVIDER_ALIAS_MAP.set(slugifyProviderId(definition.id), definition.id);
  for (const alias of definition.aliases ?? []) {
    PROVIDER_ALIAS_MAP.set(slugifyProviderId(alias), definition.id);
  }
}

export const PROVIDER_PROFILE_OPTIONS = PROVIDER_DEFINITIONS.map((provider) => ({
  label: `${provider.name} (${provider.id})`,
  value: provider.id,
}));

export const PROVIDER_ID_OPTIONS = PROVIDER_DEFINITIONS.map((provider) => provider.id);

export function normalizeProviderId(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const normalized = slugifyProviderId(value);
  return PROVIDER_ALIAS_MAP.get(normalized) ?? normalized;
}

export function getProviderDefinition(providerId: string | null | undefined): ProviderDefinition | undefined {
  const normalized = normalizeProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  return PROVIDER_DEFINITIONS.find((provider) => provider.id === normalized);
}

export function buildProviderConfig(providerId: string | null | undefined): Record<string, string> {
  const definition = getProviderDefinition(providerId);
  if (!definition) {
    const normalized = normalizeProviderId(providerId);
    return {
      provider_profile: normalized,
      provider_api_key_env: "",
      provider_api_key: "",
      provider_base_url_env: "",
      provider_base_url: "",
      provider_execution_timeout_seconds: "",
      provider_env_json: "",
    };
  }

  return {
    provider_profile: definition.id,
    provider_api_key_env: definition.key,
    provider_api_key: "",
    provider_base_url_env: definition.baseUrlEnv ?? "",
    provider_base_url: definition.url ?? "",
    provider_execution_timeout_seconds: definition.supportsLocalModels ? "120" : "",
    provider_env_json: "",
  };
}
