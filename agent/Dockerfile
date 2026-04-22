FROM node:24-alpine

ARG TARGETARCH

RUN apk add --no-cache ca-certificates git curl bzip2

# Download static Docker CLI binary (Debian repos don't have docker-ce-cli)
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

RUN npm install -g pnpm@10.8.0 && npm cache clean --force

# git-runner/code-server/agent share bind mounts through PUID/PGID.
# Trust Git Nest data mounts so git worktree/status can operate on those repos.
RUN git config --system --add safe.directory "*"

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile && pnpm rebuild

COPY tsconfig.json tsconfig.test.json ./
COPY scripts ./scripts
COPY src ./src
RUN pnpm run build

RUN pnpm prune --production && pnpm store prune

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
