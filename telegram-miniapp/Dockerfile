# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .

# Bake env vars into static build
ARG NEXT_PUBLIC_API_URL=https://api.ghostlineai.ru
ARG NEXT_PUBLIC_WS_URL=wss://api.ghostlineai.ru
ARG NEXT_PUBLIC_SUPPORT_GROUP_URL=https://t.me/GhostLineSupport_bot

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_SUPPORT_GROUP_URL=$NEXT_PUBLIC_SUPPORT_GROUP_URL

RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/out /usr/share/nginx/html

# SPA fallback: map /chat → out/chat.html, unknown paths → 404
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3001
