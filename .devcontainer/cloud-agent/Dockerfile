FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gh \
        git \
        jq \
        ripgrep \
        sudo \
    && rm -rf /var/lib/apt/lists/*

ARG OPENCODE_VERSION=1.19.4
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}"

RUN (useradd --create-home --shell /bin/bash agent || true) \
    && echo 'Defaults:node !requiretty' > /etc/sudoers.d/katalyst-agent \
    && echo 'node ALL=(agent) NOPASSWD: ALL' >> /etc/sudoers.d/katalyst-agent \
    && chmod 0440 /etc/sudoers.d/katalyst-agent

USER node
