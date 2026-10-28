# ==============================================================================
# STAGE 1: Install Dependencies
# ==============================================================================
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ==============================================================================
# STAGE 2: Build Application (Next.js Standalone with distDir .next_fresh)
# ==============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build_dummy:build_dummy@localhost:5432/build_dummy"

RUN npm run build

# ==============================================================================
# STAGE 3: Production Runner
# ==============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl postgresql-client bash tzdata

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root security user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Salin aset publik
COPY --from=builder /app/public ./public

# Salin standalone Next.js ke root /app (berisi server.js, package.json, minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next_fresh/standalone ./

# Salin aset statis ke direktori yang dicari oleh server standalone Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next_fresh/static ./.next_fresh/static

# Salin skrip migrasi dan entrypoint
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
