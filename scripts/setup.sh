#!/bin/bash
set -e

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "Please edit .env and set a real AES_KEY (64 hex chars)."
  echo "You can generate one with: openssl rand -hex 32"
fi

npm install
echo "Setup complete. Run: cd packages/mcp-server && npm run dev"
