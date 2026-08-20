#!/bin/bash
set -u

# Google Chat Webhook Configuration
GG_TOKEN='_Gb4MAZgegM5Jbwv3aaFbd6aHS4JUlms1nsCTHqIfDw%3D'
GG_KEY='AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI'
URI_GGCHAT="https://chat.googleapis.com/v1/spaces/AAAAXAWH9_g/messages?key=${GG_KEY}&token=${GG_TOKEN}"

BUILD_STATUS="${1:-UNKNOWN}"
BUILD_NUMBER="${2:-}"
FULL_IMAGE="${3:-}"
ENVIRONMENT="${4:-}"
MESSAGE="${5:-}"
BUILD_URL="${6:-}"
GIT_AUTHOR="${7:-}"
BRANCH_NAME="${8:-}"
RELEASE_TAG="${9:-}"
ARGOCD_APP="${10:-}"
DEPLOY_REPO_PATH="${11:-}"

if [ "${BUILD_STATUS}" = "SUCCESS" ]; then
  STATUS_EMOJI="✅"
  STATUS_TEXT="Jenkins SUCCESS"
else
  STATUS_EMOJI="❌"
  STATUS_TEXT="Jenkins FAILURE"
fi

escape_json() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])'
}

FULL_IMAGE_ESC="$(printf "%s" "${FULL_IMAGE}" | escape_json)"
ENVIRONMENT_ESC="$(printf "%s" "${ENVIRONMENT}" | escape_json)"
MESSAGE_ESC="$(printf "%s" "${MESSAGE}" | escape_json)"
BUILD_URL_ESC="$(printf "%s" "${BUILD_URL}" | escape_json)"
GIT_AUTHOR_ESC="$(printf "%s" "${GIT_AUTHOR}" | escape_json)"
BRANCH_NAME_ESC="$(printf "%s" "${BRANCH_NAME}" | escape_json)"
RELEASE_TAG_ESC="$(printf "%s" "${RELEASE_TAG}" | escape_json)"
ARGOCD_APP_ESC="$(printf "%s" "${ARGOCD_APP}" | escape_json)"
DEPLOY_REPO_PATH_ESC="$(printf "%s" "${DEPLOY_REPO_PATH}" | escape_json)"

BUTTON_WIDGET=""
if [ -n "${BUILD_URL}" ]; then
  BUTTON_WIDGET=",
          {
            \"buttonList\": {
              \"buttons\": [{
                \"text\": \"View Jenkins Build\",
                \"onClick\": {
                  \"openLink\": {
                    \"url\": \"${BUILD_URL_ESC}\"
                  }
                }
              }]
            }
          }"
fi

CARD_JSON="{
  \"cardsV2\": [{
    \"cardId\": \"jenkins-build-${BUILD_NUMBER}\",
    \"card\": {
      \"header\": {
        \"title\": \"${STATUS_EMOJI} ${STATUS_TEXT}\",
        \"subtitle\": \"Build #${BUILD_NUMBER}\",
        \"imageType\": \"CIRCLE\"
      },
      \"sections\": [{
        \"widgets\": [
          {
            \"decoratedText\": {
              \"topLabel\": \"Environment\",
              \"text\": \"${ENVIRONMENT_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"Image\",
              \"text\": \"${FULL_IMAGE_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"Release Tag\",
              \"text\": \"${RELEASE_TAG_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"Message\",
              \"text\": \"${MESSAGE_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"Author\",
              \"text\": \"${GIT_AUTHOR_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"Branch\",
              \"text\": \"${BRANCH_NAME_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"ArgoCD App\",
              \"text\": \"${ARGOCD_APP_ESC}\"
            }
          },
          {
            \"decoratedText\": {
              \"topLabel\": \"Deploy Repo Path\",
              \"text\": \"${DEPLOY_REPO_PATH_ESC}\"
            }
          }${BUTTON_WIDGET}
        ]
      }]
    }
  }]
}"

RESPONSE="$(curl -H "Content-Type: application/json" \
  -X POST \
  -d "${CARD_JSON}" \
  -s "${URI_GGCHAT}" \
  -w "\n%{http_code}")"

HTTP_CODE="$(echo "${RESPONSE}" | tail -n 1)"
RESPONSE_BODY="$(echo "${RESPONSE}" | sed '$d')"

echo "Google Chat response: ${RESPONSE_BODY}"
echo "Google Chat HTTP code: ${HTTP_CODE}"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "WARN: Failed to send Google Chat notification HTTP ${HTTP_CODE}"
  exit 0
fi

echo "Google Chat notification sent"