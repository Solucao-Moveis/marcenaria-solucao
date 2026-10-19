# syntax=docker/dockerfile:1
# Multi-stage build for self-hosting the TanStack Start SSR app on Bun.
# Used for the EasyPanel deploy, running in PARALLEL to the Cloudflare deploy.

# ---- Build stage: install deps + produce dist/ (client + server) ----
FROM oven/bun:1 AS build
WORKDIR /app

# Install with the committed lockfile so the build is reproducible.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source and build. VITE_* public vars are baked in here
# from the versioned .env (Vite inlines them at build time).
COPY . .
RUN bun run build

# ---- Runtime stage: only what the server needs at runtime ----
FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# node_modules is copied for safety in case any dependency is loaded lazily at
# runtime (the SSR bundle is mostly self-contained, but this guarantees parity).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY server.mjs ./server.mjs

EXPOSE 3000

# Server-side env (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
# SUPABASE_SERVICE_ROLE_KEY) are injected by EasyPanel at runtime via process.env.
CMD ["bun", "server.mjs"]
