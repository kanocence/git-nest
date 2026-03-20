FROM node:20-alpine AS build-stage

WORKDIR /app
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# SSR
FROM node:20-alpine AS production-stage

WORKDIR /app

COPY --from=build-stage /app/.output ./.output

# Nuxt runtimeConfig 通过 NUXT_ 前缀的环境变量在运行时覆盖
# 例如: NUXT_GIT_RUNNER_HOST, NUXT_GIT_RUNNER_PORT, NUXT_GIT_RUNNER_SECRET

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
