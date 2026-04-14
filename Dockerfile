# ── Stage 1: build client ───────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps for better-sqlite3 (only used in runtime stage, but npm ci also compiles here)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Runtime: need docker CLI so we can "docker compose up -d" inside birth.sh-invoked containers
RUN apk add --no-cache python3 make g++ docker-cli docker-cli-compose bash

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy built client + server code
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY tsconfig.json ./

RUN mkdir -p /app/data

EXPOSE 3006
ENV NODE_ENV=production

CMD ["npx", "tsx", "server/index.ts"]
