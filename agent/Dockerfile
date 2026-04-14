FROM node:24-bookworm-slim

ARG GO_TARBALL_URL=https://go.dev/dl/go1.24.13.linux-amd64.tar.gz

# use China mirror by default
ARG USE_CHINA_MIRROR=true

RUN if [ "$USE_CHINA_MIRROR" = "true" ]; then \
      rm -f /etc/apt/sources.list.d/debian.sources && \
      echo 'deb http://mirrors.aliyun.com/debian bookworm main contrib non-free non-free-firmware' > /etc/apt/sources.list && \
      echo 'deb http://mirrors.aliyun.com/debian-security bookworm-security main contrib non-free non-free-firmware' >> /etc/apt/sources.list && \
      npm config set registry https://registry.npmmirror.com; \
    fi && \
    apt-get update -qq && \
    apt-get install -y --no-install-recommends ca-certificates git python3 make g++ ripgrep curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.8.0 && npm cache clean --force
RUN if [ "$USE_CHINA_MIRROR" = "true" ]; then pnpm config set registry https://registry.npmmirror.com; fi

# git-runner/code-server may create mounted repositories as PUID/PGID while agent runs as root.
# Trust only Git Nest data mounts so git worktree/status can operate on those repos.
RUN git config --system --add safe.directory "*"

RUN curl -fsSL "$GO_TARBALL_URL" -o /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz
ENV PATH=$PATH:/usr/local/go/bin

# install Goose CLI
ENV PATH=/root/.local/bin:$PATH
RUN curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash && \
    goose --version

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

CMD ["node", "dist/index.js"]
