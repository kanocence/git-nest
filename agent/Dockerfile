FROM node:24-bookworm-slim

ARG GO_TARBALL_URL=https://go.dev/dl/go1.24.13.linux-amd64.tar.gz

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends ca-certificates git python3 make g++ ripgrep curl bzip2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.8.0 && npm cache clean --force

# git-runner/code-server/agent share bind mounts through PUID/PGID.
# Trust Git Nest data mounts so git worktree/status can operate on those repos.
RUN git config --system --add safe.directory "*"

RUN curl -fsSL "$GO_TARBALL_URL" -o /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz
ENV PATH=$PATH:/usr/local/go/bin

# install Goose CLI (non-interactive; avoid goose-configure during docker build)
RUN set -eux; \
    curl -fsSL \
      -o /tmp/goose.tar.bz2 \
      https://github.com/aaif-goose/goose/releases/download/stable/goose-x86_64-unknown-linux-gnu.tar.bz2; \
    tar -xjf /tmp/goose.tar.bz2 -C /usr/local/bin --no-same-owner; \
    rm -f /tmp/goose.tar.bz2; \
    if [ ! -f /usr/local/bin/goose ]; then \
      goose_path="$(find /usr/local/bin -maxdepth 3 -type f -name goose -print -quit)"; \
      test -n "$goose_path"; \
      mv "$goose_path" /usr/local/bin/goose; \
    fi; \
    chmod 0755 /usr/local/bin/goose; \
    /usr/local/bin/goose --version

# install Goose CLI from local file
# COPY ./goose /usr/local/bin/goose
# RUN chmod +x /usr/local/bin/goose && \
#     goose --version

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
