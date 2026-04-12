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

# Build (output: export → produces /app/out)
COPY . .
RUN npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /app/out ./out
COPY serve.json .

EXPOSE 3000

CMD ["serve", "out", "-l", "3000", "--no-clipboard"]
