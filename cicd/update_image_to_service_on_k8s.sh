#!/bin/bash
K8SCLS=$1
WORKSPACE=$2
DEPLOYMENT=$3
IMAGE_NAME=$4
IMAGE_VERSION=$5
REPO_URL=$6

FULL_IMAGE="${REPO_URL}/${WORKSPACE}-${IMAGE_NAME}:${IMAGE_VERSION}"

echo "Cluster: ${K8SCLS}"
echo "Namespace: ${WORKSPACE}"
echo "Deployment: ${DEPLOYMENT}"
echo "Image: ${FULL_IMAGE}"

kubectl set image deployment/${DEPLOYMENT} ${DEPLOYMENT}=${FULL_IMAGE} \
    -n ${WORKSPACE} \
    --record

kubectl rollout status deployment/${DEPLOYMENT} \
    -n ${WORKSPACE} \
    --timeout=300s