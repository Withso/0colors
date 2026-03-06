FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc
RUN npm prune --production

EXPOSE 4455

CMD ["node", "dist/server.js"]
