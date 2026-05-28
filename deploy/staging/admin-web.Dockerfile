FROM node:22.14.0-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_API_VERSION=v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_VERSION=$NEXT_PUBLIC_API_VERSION

RUN pnpm --filter @orbi/admin-web build

EXPOSE 3001

CMD ["pnpm", "--filter", "@orbi/admin-web", "start"]
