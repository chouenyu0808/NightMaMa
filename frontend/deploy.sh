#!/bin/bash
# NightMaMa — 一鍵部署到 GCP Cloud Run
# 使用方式: bash deploy.sh

set -e

# ─── 設定區（請修改）────────────────────────────────
GCP_PROJECT="nightmama"                      # GCP 專案 ID
REGION="asia-east1"                          # 台灣最近的 region（台灣/香港）
SERVICE_NAME="nightmama-web"
IMAGE="gcr.io/$GCP_PROJECT/$SERVICE_NAME"

# API Keys（從 .env.local 讀取）
source .env.local 2>/dev/null || true

MAPS_KEY="${NEXT_PUBLIC_GOOGLE_MAPS_KEY:-}"
GEMINI_KEY="${NEXT_PUBLIC_GEMINI_KEY:-}"
LINE_TOKEN="${NEXT_PUBLIC_LINE_NOTIFY_TOKEN:-}"
# ────────────────────────────────────────────────────

if [ -z "$MAPS_KEY" ]; then
  echo "❌ 找不到 NEXT_PUBLIC_GOOGLE_MAPS_KEY，請確認 .env.local 存在"
  exit 1
fi

echo "🚀 開始部署 NightMaMa 到 Cloud Run..."
echo "   專案: $GCP_PROJECT"
echo "   Region: $REGION"
echo ""

# 1. 確認 gcloud 登入
echo "📋 Step 1: 確認 GCP 登入狀態..."
gcloud auth print-access-token > /dev/null || gcloud auth login

# 2. 設定專案
gcloud config set project $GCP_PROJECT

# 3. 啟用必要 API
echo "📋 Step 2: 啟用 GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --quiet

# 4. 設定 Docker 認證
echo "📋 Step 3: 設定 Docker 認證..."
gcloud auth configure-docker --quiet

# 5. 建置 Docker image（注入 API Keys）
echo "📋 Step 4: 建置 Docker Image..."
docker build \
  --build-arg NEXT_PUBLIC_GOOGLE_MAPS_KEY="$MAPS_KEY" \
  --build-arg NEXT_PUBLIC_GEMINI_KEY="$GEMINI_KEY" \
  --build-arg NEXT_PUBLIC_LINE_NOTIFY_TOKEN="$LINE_TOKEN" \
  -t $IMAGE .

# 6. 推送 image
echo "📋 Step 5: 推送 Image 到 Container Registry..."
docker push $IMAGE

# 7. 部署到 Cloud Run
echo "📋 Step 6: 部署到 Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --quiet

echo ""
echo "✅ 部署完成！"
echo "🌐 服務網址:"
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
