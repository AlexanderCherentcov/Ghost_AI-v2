FROM node:20-alpine AS builder

WORKDIR /app

# Build-time env vars (NEXT_PUBLIC_* baked into the bundle)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TG_BOT_USERNAME
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_TG_BOT_USERNAME=$NEXT_PUBLIC_TG_BOT_USERNAME

# Install deps
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Build (output: standalone → produces /app/.next/standalone)
COPY . .
RUN npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
# Copy static assets (required by standalone server)
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
