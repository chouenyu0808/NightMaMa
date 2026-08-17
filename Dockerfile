FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests from frontend directory
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Build arguments for Next.js NEXT_PUBLIC_ variables
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ARG NEXT_PUBLIC_GEMINI_KEY
ARG NEXT_PUBLIC_LINE_NOTIFY_TOKEN

ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GEMINI_KEY=$NEXT_PUBLIC_GEMINI_KEY
ENV NEXT_PUBLIC_LINE_NOTIFY_TOKEN=$NEXT_PUBLIC_LINE_NOTIFY_TOKEN

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 8080
CMD ["node", "server.js"]
