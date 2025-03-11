#!/bin/bash

# Check if the server is running
if ! docker ps | grep telemedicine-backend_app; then
  echo "Server is down! Restarting..."
  docker-compose up -d
fi

# Check logs for errors
docker logs telemedicine-backend_app | grep "error" > error.log
if [ -s error.log ]; then
  echo "Errors detected in logs. Check error.log"
fi
