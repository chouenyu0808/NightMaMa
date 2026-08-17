FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm i --legacy-peer-deps
COPY . .

# 只有 Google Maps 瀏覽器金鑰需要在 build 時注入（NEXT_PUBLIC_ 會編進 client bundle）。
# 伺服器端金鑰（GEMINI_API_KEY / LINE_CHANNEL_ACCESS_TOKEN）請用 runtime 環境變數注入。
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY

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
