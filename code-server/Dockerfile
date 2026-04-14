FROM linuxserver/code-server:latest

# 安装必备环境: Node.js 24.x, Git, 以及 pnpm
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg git && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update -qq && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g pnpm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 拷贝初始化脚本并确保其拥有执行权限
COPY ./*.sh /custom-cont-init.d/
RUN chmod +x /custom-cont-init.d/*.sh

# 预创建配置目录并开放权限，确保 named volume 首次挂载时不会 EACCES
RUN mkdir -p /config/.config /config/data /config/extensions /config/workspace && \
    chmod -R 777 /config
