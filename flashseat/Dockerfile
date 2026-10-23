# syntax=docker/dockerfile:1.7

# ─────────────── base: OS libs Prisma's query engine needs ───────────────
FROM node:22-bookworm-slim AS base
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─────────────── deps: ALL dependencies (incl. prisma CLI + tsx) ───────────────
# Also the image used by the one-shot `migrate` and `seed` Compose services.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# ─────────────── build: generate Prisma client + compile TypeScript ───────────────
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ─────────────── runner: minimal production image (API + worker) ───────────────
FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
# The generated client (+ native query engine) comes from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
