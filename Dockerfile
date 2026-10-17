FROM node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32 AS contributor
RUN apt-get update && apt-get install -y --no-install-recommends python3 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./

COPY packages/ packages/
COPY vendor/ vendor/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/ apps/
COPY fixtures/ fixtures/
COPY scripts/ scripts/
COPY tests/ tests/
# lt-5lb.5: tests/workflows validates the as-is workflow catalog against the copied sources.
COPY docs/workflows/ docs/workflows/
COPY tsconfig.json vite.config.ts vitest.config.ts ./
# nativeConfig's checkout exclusion expects a .git directory. This empty
# image-only sentinel protects /app without importing any host Git metadata.
RUN mkdir -p /app/.git /state /scratch /models /dictionary /home/node/.cache && chown -R node:node /app /state /scratch /models /dictionary /home/node/.cache
ENV LINGOTORTE_DATA_DIR=/state LINGOTORTE_SCRATCH_DIR=/scratch LINGOTORTE_MODEL_CACHE_DIR=/models \
    LINGOTORTE_GLOSS_DB_PATH=/dictionary/glosses-pl.sqlite \
    LINGOTORTE_PYTHON_PATH=python3 LINGOTORTE_ALLOW_ONLINE_PROVIDERS=false
USER node
CMD ["node", "apps/local-service/src/server.ts"]

FROM contributor AS runtime
ARG VITE_LOCAL_SERVICE_BASE_URL=/
ENV VITE_LOCAL_SERVICE_BASE_URL=${VITE_LOCAL_SERVICE_BASE_URL}
RUN node node_modules/vite/bin/vite.js build --config vite.config.ts

# lt-42o: Playwright runner for apps/web/e2e (tools profile). Browsers are baked into the
# official image matching the pinned @playwright/test version; nothing is downloaded at run time.
FROM mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07 AS e2e
COPY --from=contributor --chown=pwuser:pwuser /app /app
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER pwuser
ENTRYPOINT ["node", "node_modules/@playwright/test/cli.js", "test", "-c", "apps/web/e2e/playwright.config.ts"]
