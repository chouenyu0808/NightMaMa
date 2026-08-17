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
set -a
source .env.local 2>/dev/null || true
set +a

# 瀏覽器端金鑰：build 時注入（會編進 client bundle，屬預期行為）
MAPS_KEY="${NEXT_PUBLIC_GOOGLE_MAPS_KEY:-}"
# 伺服器端金鑰：只在 Cloud Run runtime 注入，絕不進 image build layer
GEMINI_KEY="${GEMINI_API_KEY:-}"
LINE_TOKEN="${LINE_CHANNEL_ACCESS_TOKEN:-}"
# 安全評分後端（backend/deploy.sh 部署後會印出網址）
BACKEND="${BACKEND_URL:-}"
# ────────────────────────────────────────────────────

if [ -z "$MAPS_KEY" ]; then
  echo "❌ 找不到 NEXT_PUBLIC_GOOGLE_MAPS_KEY，請確認 .env.local 存在"
  exit 1
fi

if [ -z "$BACKEND" ]; then
  echo "⚠️  未設定 BACKEND_URL — 路線的夜間安全評分將顯示為「無法取得」"
  echo "    請先執行 cd ../backend && bash deploy.sh 取得後端網址"
fi

if [ -z "$GEMINI_KEY" ]; then
  echo "⚠️  未設定 GEMINI_API_KEY — AI 陪伴與語音功能將無法使用"
fi

if [ -z "$LINE_TOKEN" ]; then
  echo "⚠️  未設定 LINE_CHANNEL_ACCESS_TOKEN — SOS 與不安通報的 LINE 推播將無法送出"
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

# 5. 建置 Docker image（只注入瀏覽器端金鑰）
echo "📋 Step 4: 建置 Docker Image..."
docker build \
  --build-arg NEXT_PUBLIC_GOOGLE_MAPS_KEY="$MAPS_KEY" \
  --build-arg NEXT_PUBLIC_BACKEND_URL="$BACKEND" \
  -t $IMAGE .

# 6. 推送 image
echo "📋 Step 5: 推送 Image 到 Container Registry..."
docker push $IMAGE

# 7. 部署到 Cloud Run（伺服器端金鑰在此以 runtime 環境變數注入）
echo "📋 Step 6: 部署到 Cloud Run..."
#
# 註：--set-env-vars 的值會顯示在 Cloud Run 服務設定頁與 gcloud describe 輸出中。
# 正式環境建議改用 Secret Manager：
#   gcloud run deploy ... --set-secrets GEMINI_API_KEY=gemini-api-key:latest
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
  --set-env-vars "GEMINI_API_KEY=$GEMINI_KEY,LINE_CHANNEL_ACCESS_TOKEN=$LINE_TOKEN,BACKEND_URL=$BACKEND" \
  --quiet

echo ""
echo "✅ 部署完成！"
echo "🌐 服務網址:"
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
