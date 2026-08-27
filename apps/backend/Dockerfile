# syntax=docker/dockerfile:1

# The backend is one package inside a pnpm workspace, so the build stage needs
# the workspace root — not just apps/backend. `pnpm deploy` then assembles a
# self-contained tree in which @pet/shared sits in node_modules as built JS,
# which is what the runtime stage ships. Build context is the repo root.

FROM node:22-alpine AS build
RUN npm install -g pnpm@9.15.4
WORKDIR /repo

# Manifests first, so a source-only change does not re-run the install.
# .npmrc matters here: `pnpm deploy` behaves differently without it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/extension/package.json apps/extension/
RUN pnpm install --frozen-lockfile --filter @pet/backend...

COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @pet/shared build \
 && pnpm --filter @pet/backend build \
 && pnpm deploy --filter @pet/backend --prod /app

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4100
WORKDIR /app

COPY --from=build /app ./

# Nothing is written to disk at runtime, so the app never needs root.
USER node
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
