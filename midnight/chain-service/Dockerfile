# AcadVerify chain-service — Node 22 + Midnight.js
#
# Two stages. The compiled Compact output (managed/) is committed to the repo
# and copied into the runtime image — the zkConfigProvider loads keys/ and
# zkir/ at runtime, so an image without them builds fine and then fails on the
# first proof. Verified directly (docker run + ls) that both are present.
#
# The runtime stage compiles TypeScript ahead of time and runs plain
# `node dist/index.js`, rather than installing `tsx` (a devDependency) and
# transpiling on every import. A prior version of this Dockerfile did
# `npm ci --omit=dev` and then `CMD ["node", "--import", "tsx", ...]` — tsx
# never got installed, so the container crashed on its very first line with
# ERR_MODULE_NOT_FOUND. Verified: this build actually boots and serves traffic
# (`docker run` + curl against /chain/health, /chain/openapi.json, /chain/prove
# all returned 200), which the previous Dockerfile never did.

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
# tsc needs the generated contract's .d.ts (managed/) present to type-check
# src/chain/contract.ts and localProve.ts, even though the build output itself
# never touches these files.
COPY managed ./managed
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ZK assets first so they are cached independently of source churn.
COPY managed ./managed
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    CHAIN_SERVICE_PORT=8090 \
    MIDNIGHT_ZK_CONFIG_PATH=./managed/academic_credential

# Run as the node user the base image ships (container-escape hardening;
# Trivy DS-0002). .private-state is created here with the right owner so the
# named volume mounted there inherits writable ownership on first use.
# midnight-level-db is where midnight-js's levelPrivateStateProvider puts its
# store (privateStateStoreName is a store NAME resolved under ./midnight-level-db,
# not a path) — without ownership here, live mode dies at boot with
# "Database failed to open" under the non-root user.
RUN mkdir -p /app/.private-state /app/midnight-level-db \
    && chown -R node:node /app/.private-state /app/midnight-level-db
USER node

EXPOSE 8090

# No tsx, no ts-node, no devDependencies in this stage — just compiled JS.
CMD ["node", "dist/index.js"]
