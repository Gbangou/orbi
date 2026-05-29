FROM node:22.14.0-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
COPY apps/backend/package.json apps/backend/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @orbi/domain build
RUN ls packages/domain/dist/index.js

RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

EXPOSE 3000

CMD ["node", "./apps/backend/dist/src/main.js"]
