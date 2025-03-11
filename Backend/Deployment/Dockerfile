# Use Node.js 16 as the base image
FROM node:16

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy application files, including config.js
COPY server.js ./
COPY config.js ./
COPY routes/ ./routes/
COPY models/ ./models/
COPY .env ./

# Expose the port (default 8080, configurable via .env)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
