FROM node:22.23.4-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM dependencies AS checks
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
CMD ["sh", "-c", "npm run lint && npm run typecheck && npm test -- --run"]

FROM checks AS build
RUN npm run lint && npm run typecheck && npm test -- --run && npm run build

FROM node:22.23.4-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
