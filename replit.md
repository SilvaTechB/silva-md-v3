# Silva MD Bot

## Overview
Silva MD Bot is a WhatsApp bot built with Node.js using the Baileys library. It features a plugin system with 41+ commands for media downloading, AI interactions, group management, and more.

## Project Architecture
- **Runtime**: Node.js 20.x
- **Entry Point**: `index.js` (obfuscated) - starts HTTP health check server and bot
- **Bot Logic**: `silva.js` - main WhatsApp connection and message handling
- **Config**: `config.js` - bot configuration via environment variables
- **Plugins**: `silvaxlab/` directory - individual command plugins
- **Libraries**: `lib/` - utility functions (antidelete, events, logger, etc.)

## Configuration
Environment variables (see `.env.example`):
- `SESSION_ID` - WhatsApp session credentials (required to connect)
- `PREFIX` - Command prefix (default: `.`)
- `BOT_NAME` - Bot display name
- `OWNER_NUMBER` - Bot owner's WhatsApp number
- `PORT` - HTTP server port (set to 5000 for Replit)
- `HOST` - Server host (set to 0.0.0.0)

## Running
The bot runs via `node index.js` which starts both the HTTP health check server (port 5000) and the WhatsApp bot connection.

## Recent Changes
- 2026-02-08: Initial Replit setup - configured PORT=5000, installed dependencies including system packages (vips, python3) for sharp image processing
