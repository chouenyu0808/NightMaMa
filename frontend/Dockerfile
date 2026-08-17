FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Build args for API keys (injected at build time for Next.js NEXT_PUBLIC_ vars)
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
