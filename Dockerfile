# 0colors — monorepo Dockerfile (single service)
#
# Builds the Vite SPA and the Hono backend together, then runs the backend
# which also serves the SPA from packages/backend/dist/public/. One image,
# one process, one port. Used by the Railway template.

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy everything (.dockerignore filters out node_modules, build outputs, QA, etc.)
COPY . .

# Workspaces: install full dep tree (we need devDeps for vite/tsc at build time).
# --include=dev forces inclusion even when NODE_ENV=production.
RUN npm ci --include=dev

# Build frontend, then backend (backend's bundle:spa step copies the SPA into dist/public).
RUN npm run build

# Hono listens on $PORT (Railway injects this). Default to 4455 for local docker runs.
ENV PORT=4455
EXPOSE 4455

CMD ["node", "packages/backend/dist/server.js"]
