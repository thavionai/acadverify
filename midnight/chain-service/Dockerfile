# AcadVerify chain-service — Node 22 + Midnight.js
#
# The compiled Compact output (managed/) is committed to the repo and copied into
# the image. The zkConfigProvider loads keys/ and zkir/ at runtime, so an image
# without them builds fine and then fails on the first proof — the exact trap
# docs/roles/sre-devops.md warns about. Copying them here makes that impossible.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# ZK assets first so they are cached independently of source churn.
COPY managed ./managed
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
    CHAIN_SERVICE_PORT=8090 \
    MIDNIGHT_ZK_CONFIG_PATH=./managed/academic_credential

EXPOSE 8090

# Fails fast if the runtime is older than Node 22 (see src/config.ts).
CMD ["node", "--import", "tsx", "src/index.ts"]
