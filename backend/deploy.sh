#!/bin/bash
# NightMaMa 後端 — 部署安全評分 API 到 GCP Cloud Run
# 使用方式: cd backend && bash deploy.sh
#
# 前置作業（各做一次即可）：
#   1. 把開放資料匯入 BigQuery：
#        cd backend && python scripts/import_bigquery.py
#   2. 確認 Cloud Run 的服務帳號具備 BigQuery Job User + Data Viewer 權限
#   3. backend/.env 內設定 GOOGLE_MAPS_API_KEY（給 Places API 用）

set -e

# ─── 設定區（請修改）────────────────────────────────
GCP_PROJECT="nightmama"
REGION="asia-east1"
SERVICE_NAME="nightmama-api"
IMAGE="gcr.io/$GCP_PROJECT/$SERVICE_NAME"

# 前端的 Cloud Run 網址，用來設定 CORS 白名單。
# 前端若全部透過 /api/score 代理（預設作法），瀏覽器不會直連後端，
# 這個值只是保險；仍請勿設成 "*"。
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://nightmama-321739351322.asia-east1.run.app}"
# ────────────────────────────────────────────────────

set -a
source .env 2>/dev/null || true
set +a

if [ -z "${GOOGLE_MAPS_API_KEY:-}" ]; then
  echo "❌ 找不到 GOOGLE_MAPS_API_KEY，請確認 backend/.env 存在（Places API 需要）"
  exit 1
fi

echo "🚀 開始部署 NightMaMa 後端到 Cloud Run..."
echo "   專案: $GCP_PROJECT / Region: $REGION / 服務: $SERVICE_NAME"

gcloud auth print-access-token > /dev/null || gcloud auth login
gcloud config set project $GCP_PROJECT

echo "📋 Step 1: 啟用必要 APIs..."
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  bigquery.googleapis.com \
  places.googleapis.com \
  --quiet

echo "📋 Step 2: 建置並推送 Image..."
gcloud auth configure-docker --quiet
docker build -t $IMAGE .
docker push $IMAGE

echo "📋 Step 3: 部署到 Cloud Run..."
#
# 註：--set-env-vars 的值會顯示在服務設定頁。正式環境建議改用 Secret Manager：
#   --set-secrets GOOGLE_MAPS_API_KEY=maps-api-key:latest
#
# 記憶體給 1Gi：BigQuery 用戶端加上並行的 Places 查詢比預設 512Mi 吃得多。
# 逾時 60s：一次 /score 要跑兩個 BigQuery job 加上數十個 Places 呼叫。
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "GCP_PROJECT_ID=$GCP_PROJECT,GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY,CORS_ORIGINS=[\"$FRONTEND_ORIGIN\"]" \
  --quiet

echo ""
echo "✅ 後端部署完成！"
BACKEND_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "🌐 後端網址: $BACKEND_URL"
echo ""
echo "👉 下一步：把這個網址寫進 frontend/.env.local 的 BACKEND_URL，再部署前端："
echo "     BACKEND_URL=$BACKEND_URL"
echo "     cd ../frontend && bash deploy.sh"
