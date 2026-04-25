FROM node:24-alpine AS build-stage

WORKDIR /app
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# SSR
FROM node:24-alpine AS production-stage

WORKDIR /app

# Install runtime dependencies for agent integration
RUN apk add --no-cache ca-certificates git curl bzip2

# Download static Docker CLI binary (Debian repos don't have docker-ce-cli)
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) docker_arch="x86_64" ;; \
      arm64) docker_arch="aarch64" ;; \
      *) echo "Unsupported Docker CLI architecture: ${TARGETARCH:-unknown}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-27.3.1.tgz" -o /tmp/docker.tgz && \
    tar -xzf /tmp/docker.tgz -C /tmp docker/docker && \
    mv /tmp/docker/docker /usr/local/bin/docker && \
    rm -rf /tmp/docker /tmp/docker.tgz && \
    docker --version

# git-runner/code-server/agent share bind mounts through PUID/PGID.
# Trust Git Nest data mounts so git worktree/status can operate on those repos.
RUN git config --system --add safe.directory "*"

COPY --from=build-stage /app/.output ./.output

# Nuxt runtimeConfig 通过 NUXT_ 前缀的环境变量在运行时覆盖
# 例如: NUXT_GIT_RUNNER_HOST, NUXT_GIT_RUNNER_PORT, NUXT_GIT_RUNNER_SECRET

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
