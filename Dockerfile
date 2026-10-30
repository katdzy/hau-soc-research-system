FROM node:22-alpine

WORKDIR /app

# Dependencies are installed in the image (Linux builds), then docker-compose.yml
# keeps them in named volumes over the bind-mounted source. Installing here
# rather than into the bind mount is what keeps a first start on Windows quick.
# scripts/docker/deps.sh reinstalls when package.json or the lock changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY functions/package.json functions/package-lock.json functions/
RUN npm --prefix functions ci --no-audit --no-fund
COPY scripts/docker/deps.sh scripts/docker/
RUN tr -d '\r' < scripts/docker/deps.sh | sh -s -- --stamp-only

COPY . .

EXPOSE 5180

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
