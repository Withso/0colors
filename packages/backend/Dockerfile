FROM node:20-alpine

WORKDIR /app

# In a monorepo, we need the root package-lock.json to use npm ci
# Or we can just use npm install if we don't copy the lockfile
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 4455

CMD ["npm", "run", "start"]
