# NightMaMa GCP Cloud Build Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests from frontend directory
COPY frontend/package*.json ./
RUN npm i --legacy-peer-deps

# Copy frontend source code
COPY frontend/ ./

# 只有 Google Maps 瀏覽器金鑰需要在 build 時注入（NEXT_PUBLIC_ 會編進 client bundle，
# 這是 Maps JS SDK 的必然限制，靠 GCP Console 的 HTTP referrer 限制來防護）。
#
# GEMINI_API_KEY 與 LINE_CHANNEL_ACCESS_TOKEN 一律「不要」放在這裡：
# 它們只在 server 端使用，請在 Cloud Run 以 runtime 環境變數 / Secret Manager 注入，
# 加上 NEXT_PUBLIC_ 前綴或寫成 build arg 都會讓它們外洩到瀏覽器與 image layer。
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY

ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

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
