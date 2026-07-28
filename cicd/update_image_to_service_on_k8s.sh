#!/bin/bash

K8SCLS=$1
WORKSPACE=$2
DEPLOYMENTNAME=$3
IMAGE_NAME=$4
IMAGE_VERSION=$5
REPO_URL=$6

export KUBECONFIG=/var/lib/jenkins/.kube/$K8SCLS
kubectl cluster-info

echo "START UPDATE IMAGES $IMAGE_VERSION ON $WORKSPAICE - $DEPLOYMENTNAME"
kubectl set image deployment/${DEPLOYMENTNAME} ${DEPLOYMENTNAME}=${REPO_URL}/${IMAGE_NAME}:${IMAGE_VERSION} --record -n $WORKSPACE
# STRCOMAND=""
echo "STRCOMAND: " $STRCOMAND
# ansible masters -a "$STRCOMAND" -i /var/lib/jenkins/hostsk8scluster