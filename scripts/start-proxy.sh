#!/bin/bash

# Load environment variables from .env.local
if [ -f .env.local ]; then
  set -a
  # shellcheck source=/dev/null
  . /dev/stdin <<EOF
$(grep -v '^#' .env.local | sed 's/[[:space:]]*#.*//')
EOF
  set +a
fi

# Ensure mandatory keys are set for LiteLLM
export OPENAI_API_KEY=${OPENAI_API_KEY:-""}
export GEMINI_API_KEY=${GEMINI_API_KEY:-$GOOGLE_API_KEY}
export LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY:-"sk-local-dev-key"}

# LiteLLM runs on 4001; the thin proxy runs on 4000 and intercepts
# count_tokens (which LiteLLM+Gemini mishandles → 500).
# ANTHROPIC_BASE_URL stays at http://localhost:4000 (the proxy).
echo "Starting LiteLLM on port 4001..."
litellm --config ./litellm.config.yaml --host 127.0.0.1 --port 4001 &
LITELLM_PID=$!

echo "Starting Anthropic proxy on port 4000..."
LITELLM_PORT=4001 node scripts/anthropic-proxy.mjs &
PROXY_PID=$!

# Forward signals so both children die cleanly
trap "kill $LITELLM_PID $PROXY_PID 2>/dev/null" INT TERM EXIT

wait
