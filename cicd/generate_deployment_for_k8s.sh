#!/bin/bash

mkdir -p ../http-service-on-k8s
workspaces=(develop product)
servicename=$1
serviceport=$2
for i in "${!workspaces[@]}"; do

workspace=${workspaces[$i]}
echo 'workspace:' ${workspace}
echo 'servicename:' ${servicename}
echo 'serviceport:' ${serviceport}

cat << EOF > ../http-service-on-k8s/${workspace}-${servicename}.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${workspace}-${servicename}
  namespace: ${workspace}
  labels:
    app: ${workspace}-${servicename}
spec:
  selector:
    matchLabels:
      app: ${workspace}-${servicename}
  replicas: 1
  strategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: ${workspace}-${servicename}
    spec:
      containers:
      - name: ${workspace}-${servicename}
        image: dockerhub.finhay.lan/${workspace}-${servicename}:0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: ${serviceport}
        envFrom:
        - secretRef:
            name: ${workspace}-${servicename}
#         env:
#            - name: ENV_PRODUCT_RUN_ON
#              value: "${workspace}"
        resources:
         # requests ⇒ set minimum required resources when creating pods
          requests:
           # 250m ⇒ 0.25 CPU
           cpu: 250m
           memory: 512Mi
         # set maximum resorces
#          limits:
#           cpu: 1000m
#           memory: 2048Mi
        volumeMounts:
          - name: tz-config
            mountPath: /etc/localtime
      volumes:
        - name: tz-config
          hostPath:
            path: /usr/share/zoneinfo/Asia/Ho_Chi_Minh
      nodeSelector:
        k8spool: finhay-all-service
---
apiVersion: v1
kind: Service
metadata:
  name: ${workspace}-${servicename}
  namespace: ${workspace}
spec:
  selector:
    app: ${workspace}-${servicename}
  ports:
    - protocol: TCP
      port: ${serviceport}
      targetPort: ${serviceport}
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name:  ${workspace}-${servicename}
  namespace: ${workspace}
spec:
  rules:
  - host: "example-${workspace}-${servicename}.finhay.com.vn"
    http:
      paths:
        - path:
          backend:
            serviceName: ${workspace}-${servicename}
            servicePort: ${serviceport}
EOF
done