FROM oven/bun:1.4.0 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --network-concurrency=4

FROM dependencies AS build
COPY . .
RUN bun run build

FROM dependencies AS production-dependencies
RUN bun install --frozen-lockfile --production --network-concurrency=4

FROM oven/bun:1.4.0 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json bun.lock ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY db ./db
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e 'const response = await fetch("http://127.0.0.1:3000/api/health"); if (!response.ok) process.exit(1)'
CMD ["sh", "-c", "bun run db:migrate && cd dist && bun index.js"]
