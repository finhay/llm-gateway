#!/bin/bash

# Google Chat Webhook Configuration
GG_TOKEN='_Gb4MAZgegM5Jbwv3aaFbd6aHS4JUlms1nsCTHqIfDw%3D'
GG_KEY='AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI'
URI_GGCHAT="https://chat.googleapis.com/v1/spaces/AAAAXAWH9_g/messages?key=${GG_KEY}&token=${GG_TOKEN}"

# Parse arguments
BUILD_STATUS=$1      # SUCCESS or FAILURE
BUILD_NUMBER=$2      # Jenkins build number
IMAGE_NAME=$3        # Docker image name
ENVIRONMENT=$4       # Environment (e.g., FCI-cls1-products)
COMMIT_MESSAGE=$5    # Git commit message
BUILD_URL=$6         # Jenkins build URL (optional)
GIT_AUTHOR=$7        # Git author (optional)
BRANCH_NAME=$8       # Git branch name (optional)

# Set color and icon based on status
if [ "$BUILD_STATUS" = "SUCCESS" ]; then
  STATUS_COLOR="#0F9D58"  # Green
  STATUS_ICON="STAR"
  STATUS_EMOJI="✅"
else
  STATUS_COLOR="#DB4437"  # Red
  STATUS_ICON="BOOKMARK"
  STATUS_EMOJI="❌"
fi

# Build button section (only if BUILD_URL is provided)
BUTTON_WIDGET=""
if [ -n "$BUILD_URL" ]; then
  BUTTON_WIDGET=",
          {
            \"buttonList\": {
              \"buttons\": [{
                \"text\": \"View Build Logs\",
                \"onClick\": {
                  \"openLink\": {
                    \"url\": \"$BUILD_URL\"
                  }
                }
              }]
            }
          }"
fi

# Build commit info (if available)
COMMIT_WIDGET=""
if [ -n "$COMMIT_MESSAGE" ]; then
  # Escape quotes and newlines in commit message (compatible with both macOS and Linux)
  ESCAPED_COMMIT=$(echo "$COMMIT_MESSAGE" | sed 's/"/\\"/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')
  COMMIT_BOTTOM=""
  if [ -n "$GIT_AUTHOR" ]; then
    COMMIT_BOTTOM=",\"bottomLabel\": \"by $GIT_AUTHOR\""
  fi
  COMMIT_WIDGET=",
          {
            \"decoratedText\": {
              \"topLabel\": \"Commit Message\",
              \"text\": \"$ESCAPED_COMMIT\"$COMMIT_BOTTOM
            }
          }"
fi

# Build branch info (if available)
BRANCH_WIDGET=""
if [ -n "$BRANCH_NAME" ]; then
  BRANCH_WIDGET=",
          {
            \"decoratedText\": {
              \"topLabel\": \"Branch\",
              \"text\": \"$BRANCH_NAME\"
            }
          }"
fi

# Create card-based JSON payload
read -r -d '' CARD_JSON <<EOFCARD
{
  "cardsV2": [{
    "cardId": "build-notification-$BUILD_NUMBER",
    "card": {
      "header": {
        "title": "$STATUS_EMOJI Build $BUILD_STATUS",
        "subtitle": "$IMAGE_NAME #$BUILD_NUMBER",
        "imageType": "CIRCLE"
      },
      "sections": [{
        "widgets": [
          {
            "decoratedText": {
              "topLabel": "Environment",
              "text": "$ENVIRONMENT",
              "startIcon": {
                "knownIcon": "INVITE"
              }
            }
          },
          {
            "decoratedText": {
              "topLabel": "Image",
              "text": "$IMAGE_NAME:$BUILD_NUMBER"
            }
          }$BRANCH_WIDGET$COMMIT_WIDGET$BUTTON_WIDGET
        ]
      }]
    }
  }]
}
EOFCARD

# Send notification to Google Chat
RESPONSE=$(curl -H "Content-Type: application/json" -X POST -d "$CARD_JSON" -s "$URI_GGCHAT" -w "\n%{http_code}")

# Extract HTTP status code (last line) - macOS compatible
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response: $RESPONSE_BODY"
echo "HTTP Code: $HTTP_CODE"

if [ "$HTTP_CODE" = "403" ]; then
  echo "ERROR: The caller does not have permission"
  exit 1
elif [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Failed to send notification (HTTP $HTTP_CODE)"
  exit 1
fi

echo "Notification sent successfully!"
