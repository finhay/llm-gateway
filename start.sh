docker stop llm-gateway
docker rm llm-gateway
docker build -t llm-gateway .
docker run -d --name llm-gateway -p 20128:20128 --env-file .env -v llm-gateway-data:/app/data llm-gateway