FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gnupg \
  && curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
  && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | tee /etc/apt/sources.list.d/ngrok.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends ngrok \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user — Claude Code blocks bypassPermissions when running as root
RUN useradd -m -u 1001 boop

COPY package*.json ./
RUN npm ci && npm install -g @anthropic-ai/claude-code

COPY . .

RUN mkdir -p /home/boop/.claude /home/boop/.convex /home/boop/.sendblue \
    && chown -R boop:boop /app /home/boop

USER boop

EXPOSE 3456 5173

CMD ["npm", "run", "dev"]
