# Build stage: install everything and build the web UI
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: server deps only + built UI; Node 24 runs the TS sources directly
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production CLOUD_CLONE_DATA=/data
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src server/src
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3131
USER node
CMD ["node", "server/src/index.ts"]
