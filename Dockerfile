FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p /app/data

EXPOSE 7575

ENV PORT=7575
ENV NODE_ENV=production

CMD ["node", "server.js"]
