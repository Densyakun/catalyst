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
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g opencode-ai@latest

USER node
