# portfolio-api image (ADR-022, SDD-AICHAT-001 §5.6, §5.7). Build from the repository root after `npm run build`, so the
# knowledge snapshot in generated/ai/ is current:
#   docker buildx build --platform linux/arm64 -f backend/Dockerfile -t portfolio-api:<version> .
# No secrets at build time: keys arrive at run time as environment variables (deployment-contract §4).
# node:22-alpine, multi-arch index digest, checked on 2026-10-08. Update it on purpose, never by floating the tag.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

ENV NODE_ENV=production \
    PORT=3000 \
    KNOWLEDGE_DIR=/app/knowledge \
    STATE_DIR=/app/state

WORKDIR /app
COPY backend/package.json backend/package.json
COPY backend/src backend/src
COPY shared/ai shared/ai
COPY generated/ai knowledge
# The state volume (daily counter) inherits this owner on first use.
RUN mkdir -p /app/state && chown 10001:10001 /app/state

USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'x-origin-key':process.env.PORTFOLIO_ORIGIN_KEY||''}}).then(r=>r.json()).then(b=>process.exit(b.status==='unavailable'?1:0)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.mjs"]
