#!/bin/bash

# Build and deploy with Docker Compose
echo "Deploying Telemedicine Backend..."
docker-compose down
docker-compose build
docker-compose up -d

# Verify deployment
if [ $? -eq 0 ]; then
  echo "Deployment successful!"
  curl -k "https://localhost:${PORT:-8080}/health" || echo "Health check failed!"
else
  echo "Deployment failed!"
  exit 1
fi
