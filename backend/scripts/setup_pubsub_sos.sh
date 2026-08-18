#!/bin/bash
# NightMaMa — 建立 SOS 通知用的 Pub/Sub topic 與 push subscription（一次性）。
#
# 使用方式：
#   bash backend/scripts/setup_pubsub_sos.sh
#
# 這支腳本是冪等的：已經存在的資源會跳過，可以重複執行。
#
# 做完之後的流向：
#   POST /sos  →  Pub/Sub topic  →  push subscription（帶 OIDC token）
#              →  POST {API_URL}/internal/pubsub/sos  →  LINE 推播給緊急聯絡人
#
# 為什麼要一個專屬服務帳號：後端是 --allow-unauthenticated，/internal/pubsub/sos
# 在公網上打得到。後端會驗 OIDC token 的 audience 與 email，只有這個帳號推來的
# 請求才受理 —— 否則任何人都能拿它當免費的 LINE 推播閘道。

set -euo pipefail

PROJECT="${GCP_PROJECT:-nightmama}"
REGION="${REGION:-asia-east1}"
API_SERVICE="${API_SERVICE:-nightmama-api}"
TOPIC="${PUBSUB_TOPIC_SOS:-sos-triggered}"
SA_NAME="${SOS_PUSH_SA:-pubsub-sos-push}"
SUBSCRIPTION="${TOPIC}-push"

SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT" --quiet

echo "📋 Step 1: 啟用 Pub/Sub API..."
gcloud services enable pubsub.googleapis.com --quiet

echo "📋 Step 2: 建立 topic $TOPIC..."
gcloud pubsub topics create "$TOPIC" --quiet 2>/dev/null || echo "   （已存在，跳過）"

echo "📋 Step 3: 建立 push 用的服務帳號 $SA_EMAIL..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="NightMaMa SOS Pub/Sub push" --quiet 2>/dev/null \
  || echo "   （已存在，跳過）"

# 後端服務網址。push endpoint 與 OIDC audience 都用它。
API_URL=$(gcloud run services describe "$API_SERVICE" --region "$REGION" --format 'value(status.url)')
if [ -z "$API_URL" ]; then
  echo "❌ 找不到 Cloud Run 服務 $API_SERVICE，請先部署後端"
  exit 1
fi
echo "   後端網址：$API_URL"

echo "📋 Step 4: 建立 push subscription $SUBSCRIPTION..."
# --push-auth-token-audience 必須與後端的 PUBSUB_PUSH_AUDIENCE 完全一致。
#
# --ack-deadline 60：一次通知要跑反向地理編碼加上 N 個聯絡人的 LINE push。
# --min/max-retry-delay：LINE 短暫故障時不要瘋狂重打，但也不要拖太久 ——
# 求救訊息晚 10 分鐘送到跟沒送到差不多。
gcloud pubsub subscriptions create "$SUBSCRIPTION" \
  --topic="$TOPIC" \
  --push-endpoint="${API_URL}/internal/pubsub/sos" \
  --push-auth-service-account="$SA_EMAIL" \
  --push-auth-token-audience="$API_URL" \
  --ack-deadline=60 \
  --min-retry-delay=5s \
  --max-retry-delay=60s \
  --message-retention-duration=10m \
  --quiet 2>/dev/null || echo "   （已存在，跳過。要改設定請用 subscriptions update）"

echo "📋 Step 5: 授權..."
# Pub/Sub 服務代理需要能簽發上面那個帳號的 OIDC token
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator --quiet > /dev/null

# 後端的執行身分要能 publish
RUN_SA=$(gcloud run services describe "$API_SERVICE" --region "$REGION" \
  --format 'value(spec.template.spec.serviceAccountName)')
RUN_SA="${RUN_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
gcloud pubsub topics add-iam-policy-binding "$TOPIC" \
  --member="serviceAccount:$RUN_SA" \
  --role=roles/pubsub.publisher --quiet > /dev/null

echo ""
echo "✅ 完成。後端需要以下環境變數（cloudbuild.yaml 的 deploy-api 已經帶上）："
echo "     PUBSUB_TOPIC_SOS=$TOPIC"
echo "     PUBSUB_PUSH_AUDIENCE=$API_URL"
echo "     PUBSUB_PUSH_SA_EMAIL=$SA_EMAIL"
echo ""
echo "👉 還缺一步：後端要能推 LINE，把 Channel Access Token 掛給它"
echo "     （前端已經在用同一個 secret，這裡直接沿用）："
echo "     LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest"
