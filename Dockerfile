FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://postgres:dummy@localhost:5432/studiorepro"
RUN npx prisma generate
RUN npm run build
# Kopiera node_modules för runtime-beroenden
RUN cp -r node_modules/.prisma .next/standalone/node_modules/ 2>/dev/null || true
RUN cp -r node_modules/@prisma .next/standalone/node_modules/ 2>/dev/null || true
RUN cp -r node_modules/@node-rs .next/standalone/node_modules/ 2>/dev/null || true
RUN cp -r node_modules/bcryptjs .next/standalone/node_modules/ 2>/dev/null || true

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
