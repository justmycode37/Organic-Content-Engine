FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation fonts-noto-core tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app/chatgpt-site
COPY chatgpt-site/package.json chatgpt-site/package-lock.json ./
RUN npm ci
COPY chatgpt-site/src/studio ./src/studio
COPY chatgpt-site/scripts/render-page.ts chatgpt-site/scripts/render-worker.mjs ./scripts/
ENV CHROME_PATH=/usr/bin/chromium
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/render-worker.mjs"]
