import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

export const KNOWN_AGENT_RAG_SOURCE_TYPES = [
  'nutrition_rules',
  'mohw_news',
  'uploaded_knowledge',
] as const;

const agentRagSourceTypeSchema = z.enum(KNOWN_AGENT_RAG_SOURCE_TYPES);

const rawAgentConfigSchema = z.object({
  agent: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    system_prompt_file: z.string().min(1),
    skills_index_file: z.string().min(1),
    rules_file: z.string().min(1),
  }),
  response_style: z.object({
    language: z.string().min(1),
    paragraph_style: z.enum(['short', 'medium', 'long']),
    use_numbered_lists_for_advice: z.boolean(),
    allow_markdown_tables: z.boolean(),
    allow_raw_json: z.boolean(),
  }),
  features: z.object({
    mohw_enabled: z.boolean(),
  }),
  rag: z.object({
    enabled_sources: z.array(agentRagSourceTypeSchema),
    paths: z.object({
      knowledge_base_dir: z.string().min(1),
      nutrition_rules_file: z.string().min(1),
      mohw_articles_dir: z.string().min(1),
      uploaded_markdown_dir: z.string().min(1),
    }),
    search: z.object({
      cache_ttl_ms: z.number().int().nonnegative(),
      max_keywords: z.number().int().positive(),
      chunk_chars: z.number().int().positive(),
      default_top_k: z.number().int().positive(),
      max_top_k: z.number().int().positive(),
    }).refine((search) => search.default_top_k <= search.max_top_k, {
      message: 'default_top_k must be less than or equal to max_top_k',
      path: ['default_top_k'],
    }),
  }),
  version_aware_rag: z.object({
    enabled: z.boolean(),
    chunks_file: z.string().min(1),
    relations_file: z.string().min(1),
    default_top_k: z.number().int().positive(),
    max_top_k: z.number().int().positive().max(20),
  }).refine((rag) => rag.default_top_k <= rag.max_top_k, {
    message: 'default_top_k must be less than or equal to max_top_k',
    path: ['default_top_k'],
  }).optional(),
});

export type RawAgentConfig = z.infer<typeof rawAgentConfigSchema>;

export type AgentConfig = {
  agent: {
    name: string;
    description: string;
    systemPromptFile: string;
    skillsIndexFile: string;
    rulesFile: string;
  };
  responseStyle: {
    language: string;
    paragraphStyle: RawAgentConfig['response_style']['paragraph_style'];
    useNumberedListsForAdvice: boolean;
    allowMarkdownTables: boolean;
    allowRawJson: boolean;
  };
  features: {
    mohwEnabled: boolean;
  };
  rag: {
    enabledSources: Array<(typeof KNOWN_AGENT_RAG_SOURCE_TYPES)[number]>;
    paths: {
      knowledgeBaseDir: string;
      nutritionRulesFile: string;
      mohwArticlesDir: string;
      uploadedMarkdownDir: string;
    };
    search: {
      cacheTtlMs: number;
      maxKeywords: number;
      chunkChars: number;
      defaultTopK: number;
      maxTopK: number;
    };
  };
  versionAwareRag: {
    enabled: boolean;
    chunksFile: string;
    relationsFile: string;
    defaultTopK: number;
    maxTopK: number;
  } | null;
};

export const DEFAULT_AGENT_CONFIG_PATH = fileURLToPath(new URL('../../agent_config.json', import.meta.url));

function resolvePathFromConfigDir(configDir: string, configPathValue: string): string {
  if (path.isAbsolute(configPathValue)) {
    throw new Error(`Config path must be relative: ${configPathValue}`);
  }

  const resolvedPath = path.resolve(configDir, configPathValue);
  const relativeToConfigDir = path.relative(configDir, resolvedPath);

  if (relativeToConfigDir.startsWith('..') || path.isAbsolute(relativeToConfigDir)) {
    throw new Error(`Config path must stay within the config directory: ${configPathValue}`);
  }

  return resolvedPath;
}

export function resolveAgentConfig(rawConfig: RawAgentConfig, configDir: string): AgentConfig {
  return {
    agent: {
      name: rawConfig.agent.name,
      description: rawConfig.agent.description,
      systemPromptFile: resolvePathFromConfigDir(configDir, rawConfig.agent.system_prompt_file),
      skillsIndexFile: resolvePathFromConfigDir(configDir, rawConfig.agent.skills_index_file),
      rulesFile: resolvePathFromConfigDir(configDir, rawConfig.agent.rules_file),
    },
    responseStyle: {
      language: rawConfig.response_style.language,
      paragraphStyle: rawConfig.response_style.paragraph_style,
      useNumberedListsForAdvice: rawConfig.response_style.use_numbered_lists_for_advice,
      allowMarkdownTables: rawConfig.response_style.allow_markdown_tables,
      allowRawJson: rawConfig.response_style.allow_raw_json,
    },
    features: {
      mohwEnabled: rawConfig.features.mohw_enabled,
    },
    rag: {
      enabledSources: rawConfig.rag.enabled_sources,
      paths: {
        knowledgeBaseDir: resolvePathFromConfigDir(configDir, rawConfig.rag.paths.knowledge_base_dir),
        nutritionRulesFile: resolvePathFromConfigDir(configDir, rawConfig.rag.paths.nutrition_rules_file),
        mohwArticlesDir: resolvePathFromConfigDir(configDir, rawConfig.rag.paths.mohw_articles_dir),
        uploadedMarkdownDir: resolvePathFromConfigDir(configDir, rawConfig.rag.paths.uploaded_markdown_dir),
      },
      search: {
        cacheTtlMs: rawConfig.rag.search.cache_ttl_ms,
        maxKeywords: rawConfig.rag.search.max_keywords,
        chunkChars: rawConfig.rag.search.chunk_chars,
        defaultTopK: rawConfig.rag.search.default_top_k,
        maxTopK: rawConfig.rag.search.max_top_k,
      },
    },
    versionAwareRag: rawConfig.version_aware_rag
      ? {
          enabled: rawConfig.version_aware_rag.enabled,
          chunksFile: resolvePathFromConfigDir(configDir, rawConfig.version_aware_rag.chunks_file),
          relationsFile: resolvePathFromConfigDir(configDir, rawConfig.version_aware_rag.relations_file),
          defaultTopK: rawConfig.version_aware_rag.default_top_k,
          maxTopK: rawConfig.version_aware_rag.max_top_k,
        }
      : null,
  };
}

export async function loadAgentConfig(configPath: string): Promise<AgentConfig> {
  const fileContents = await readFile(configPath, 'utf8');
  const rawConfig = rawAgentConfigSchema.parse(JSON.parse(fileContents));
  return resolveAgentConfig(rawConfig, path.dirname(path.resolve(configPath)));
}

export async function loadDefaultAgentConfig(): Promise<AgentConfig> {
  return loadAgentConfig(DEFAULT_AGENT_CONFIG_PATH);
}
