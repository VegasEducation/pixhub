FROM node:22-alpine

# Runtimes for screen scripts. A screen can be written in anything that prints
# JSON, so the common tools are here out of the box: sh and node come with the
# base image, and these cover the rest of what people reach for first.
#
# Drop this line if you only ever write JavaScript screens — it's about 60MB.
RUN apk add --no-cache python3 curl jq

WORKDIR /app

# pixhub itself has no runtime dependencies, so this is usually a no-op. It's
# here so a screen with a render.js that needs a package still installs cleanly.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY assets ./assets
COPY screens ./screens

RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    HTTP_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "src/index.js"]
