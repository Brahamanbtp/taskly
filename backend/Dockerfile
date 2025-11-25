# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# copy only package manifests first for faster builds
COPY package*.json ./
# if you're using package-lock.json, copy it as well

RUN npm ci --production

COPY . .

ENV PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
