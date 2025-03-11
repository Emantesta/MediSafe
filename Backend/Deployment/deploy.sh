#!/bin/bash

# Build and deploy with Docker Compose
echo "Deploying Telemedicine Backend..."
docker-compose down
docker-compose build
docker-compose up -d

# Verify deployment
if [ $? -eq 0 ]; then
  echo "Deployment successful!"
else
  echo "Deployment failed!"
  exit 1
fi
