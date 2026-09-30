FROM node:22-bookworm-slim

WORKDIR /usr/src/app

COPY app/package*.json ./
RUN npm install --omit=dev

COPY app/ ./

EXPOSE 3000

CMD ["node", "app.js"]
