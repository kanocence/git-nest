FROM node:24-bookworm-slim

ARG GO_VERSION=1.24.13
ARG GO_TARBALL_URL=
ARG TARGETARCH

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends ca-certificates git python3 make g++ ripgrep curl bzip2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

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

RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) go_arch="amd64" ;; \
      arm64) go_arch="arm64" ;; \
      *) echo "Unsupported Go architecture: ${TARGETARCH:-unknown}" >&2; exit 1 ;; \
    esac; \
    go_url="${GO_TARBALL_URL:-https://go.dev/dl/go${GO_VERSION}.linux-${go_arch}.tar.gz}"; \
    curl -fsSL "$go_url" -o /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz
ENV PATH=$PATH:/usr/local/go/bin

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile && pnpm rebuild

COPY tsconfig.json tsconfig.test.json ./
COPY scripts ./scripts
COPY src ./src
RUN pnpm run build

RUN pnpm prune --production && pnpm store prune

ENV NODE_ENV=production
ENV PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CMD ["node", "dist/index.js"]
