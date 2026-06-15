# Build stage
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app
# Install build tools to compile native modules like sqlite3 from source
RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev --build-from-source
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
EXPOSE 80
ENV PORT=80
CMD ["node", "server/index.js"]
