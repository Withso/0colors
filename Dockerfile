# 0colors — static site image for Railway.
#
# Stage 1 builds the Vite app; stage 2 serves dist/ with Caddy.
# No Node.js at runtime, no database, no migrations.

# ── Build ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first so this layer stays cached between source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── Serve ────────────────────────────────────────────────────
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# Railway injects $PORT at runtime; the Caddyfile falls back to 8080 locally.
EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
