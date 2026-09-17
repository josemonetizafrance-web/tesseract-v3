FROM node:20-alpine

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]