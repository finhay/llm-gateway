# Finhay MCP Hub — separate runtime from the LLM gateway.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=20130 DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
RUN addgroup -S hub && adduser -S hub -G hub && mkdir -p /app/data && chown hub:hub /app/data
USER hub
EXPOSE 20130
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:20130/healthz || exit 1
CMD ["node", "src/index.js"]
