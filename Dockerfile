# ---- Stage 1: install deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build debug UI bundle ----
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# convex/_generated is gitignored, so it's not in the build context.
# Generate it inside the image so the debug UI build (which imports types
# from ../convex/_generated/api) can resolve them.
RUN npx convex codegen --typecheck=disable
RUN npm run build:debug

# ---- Stage 3: runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/convex ./convex
COPY --from=build /app/debug/dist ./debug/dist
COPY --from=build /app/scripts/preflight.mjs ./scripts/preflight.mjs
COPY package.json tsconfig.json ./
EXPOSE 3456
USER node
CMD ["npx", "tsx", "server/index.ts"]
