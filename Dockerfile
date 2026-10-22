FROM node:22.23.3-bookworm-slim

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app/ ./

RUN mkdir -p /data && chown -R node:node /usr/src/app /data
USER node

EXPOSE 3000

CMD ["node", "app.js"]
