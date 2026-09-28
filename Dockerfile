FROM oven/bun:1.2.12

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./

RUN bun install --frozen-lockfile --production

COPY src ./src
COPY scripts ./scripts
COPY agent_skills ./agent_skills
COPY agent_config.json ./agent_config.json
COPY knowledge_base ./knowledge_base
# Frozen corpus + lineage relations for search_versioned_guidelines_tool (see agent_config.json).
COPY experiments/version_aware_rag/data/v6_corpus_frozen/chunks.jsonl ./experiments/version_aware_rag/data/v6_corpus_frozen/chunks.jsonl
COPY experiments/version_aware_rag/data/v6_repair_diagnostic/V6R_RUNTIME_RELATIONS.jsonl ./experiments/version_aware_rag/data/v6_repair_diagnostic/V6R_RUNTIME_RELATIONS.jsonl

RUN mkdir -p users_images knowledge_base/uploads knowledge_base/ingested_markdown data

ENV NODE_ENV=production
ENV PORT=8001
ENV STORAGE_BACKEND=sqlite
ENV SQLITE_DB_PATH=/app/data/healthy-diet-agent.db

EXPOSE 8001

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8001') + '/ping').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "start"]
