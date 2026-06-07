FROM mcr.microsoft.com/devcontainers/javascript-node:0-20

# Instala Python y pip para poder usar awscli si es necesario
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

USER vscode

EXPOSE 5173
