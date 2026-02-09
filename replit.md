# Silva MD Bot

## Overview
Silva MD Bot is a WhatsApp bot built with Node.js using the Baileys library. It features a plugin system with 55+ commands for media downloading, AI interactions, group management, protection, and more.

## Project Architecture
- **Runtime**: Node.js 20.x
- **Entry Point**: `index.js` (obfuscated) - starts HTTP health check server and bot
- **Bot Logic**: `silva.js` - main WhatsApp connection and message handling
- **Config**: `config.js` - bot configuration via environment variables
- **Plugins**: `silvaxlab/` directory - individual command plugins
- **Libraries**: `lib/` - utility functions (antidelete, status handler, events, logger, etc.)

## Key Features
- **Auto Status View**: Automatically views all WhatsApp statuses (enabled by default)
- **Auto Status React**: Automatically likes/reacts to statuses with random emojis (enabled by default)
- **Anti-Delete**: Recovers deleted messages with media and forwards to owner (enabled by default)
- **Newsletter Auto-Follow**: Automatically follows configured newsletters on connection
- **QR Code Auth**: Uses QR code for authentication, or SESSION_ID env var to restore sessions
- **Anti-Link**: Detects and removes link messages from non-admins in groups
- **Welcome/Goodbye**: Configurable welcome and goodbye messages per group
- **Plugin System**: 55+ commands loaded from `silvaxlab/` directory
- **AI Chat**: GPT/AI integration for conversational AI
- **TTS**: Text-to-speech in 19+ languages
- **Fancy Text**: 10 Unicode font styles
- **Ban System**: Owner can ban/unban users from bot usage
- **Broadcast**: Owner can broadcast messages to all groups

## Configuration
Environment variables:
- `SESSION_ID` - WhatsApp session credentials (required to connect)
- `PREFIX` - Command prefix (default: `.`)
- `BOT_NAME` - Bot display name
- `OWNER_NUMBER` - Bot owner's WhatsApp number
- `PORT` - HTTP server port (set to 5000 for Replit)
- `HOST` - Server host (set to 0.0.0.0)
- `AUTO_STATUS_VIEW` - Auto view statuses (default: true, set to 'false' to disable)
- `AUTO_STATUS_REACT` - Auto react to statuses (default: true, set to 'false' to disable)
- `ANTI_DELETE` - Anti-delete feature (default: true, set to 'false' to disable)
- `NEWSLETTER_IDS` - Comma-separated newsletter JIDs to auto-follow

## Running
The bot runs via `node index.js` which starts both the HTTP health check server (port 5000) and the WhatsApp bot connection.

## Recent Changes
- 2026-02-09: Major upgrade - fixed antidelete with pre-download media buffering, fixed antidemote (removed broken permissions dependency), fixed eval (owner-only security). Added 13 new plugins: owner, delete, tts, quote, broadcast, ban, antilink, clear, gpt, take, kick, promote/demote, welcome/goodbye, fancy text. Updated menu with all 55+ commands. Removed pair code auth (QR + SESSION_ID only)
- 2026-02-08: Initial Replit setup - configured PORT=5000, installed dependencies including system packages (vips, python3) for sharp image processing
