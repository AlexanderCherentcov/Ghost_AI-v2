FROM node:20-alpine AS builder

WORKDIR /app

# npm 10.8.2 (bundled with node:20-alpine) has a reproducible arborist crash
# ("Cannot read properties of null (reading 'edgesOut')") resolving this
# project's lockfile — fixed in npm 11. Confirmed live on 2026-10-22.
RUN npm install -g npm@11

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# OpenSSL required by Prisma on Alpine
RUN apk add --no-cache openssl ffmpeg

# Same npm 10.8.2 arborist bug as the builder stage above
RUN npm install -g npm@11

# Install only production deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy built files and prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
