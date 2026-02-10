# Silva MD Bot

## Overview
Silva MD Bot is a WhatsApp bot built with Node.js using the Baileys library. It features a plugin system with 80+ commands for media downloading, AI interactions, group management, protection, fun games, and more. Includes its own media API server for reliable YouTube/TikTok/Instagram downloads.

## Project Architecture
- **Runtime**: Node.js 20.x
- **Entry Point**: `index.js` (obfuscated) - starts HTTP health check server and bot
- **Bot Logic**: `silva.js` - main WhatsApp connection and message handling
- **Config**: `config.js` - bot configuration via environment variables
- **Plugins**: `silvaxlab/` directory - individual command plugins (80+)
- **Libraries**: `lib/` - utility functions (antidelete, status handler, events, logger, media API)
- **Media API**: `lib/mediaApi.js` - self-hosted Express API server on port 3001 for YouTube/TikTok/Instagram/Facebook downloads using yt-dlp

## Key Features
- **Auto Status View**: Automatically views all WhatsApp statuses (enabled by default)
- **Auto Status React**: Automatically likes/reacts to statuses with random emojis (enabled by default)
- **Anti-Delete**: Recovers deleted messages with media and forwards to owner (enabled by default, setup in setupEvents for reconnection support)
- **Newsletter Auto-Follow**: Automatically follows configured newsletters on connection
- **QR Code Auth**: Uses QR code for authentication, or SESSION_ID env var to restore sessions
- **Anti-Link**: Detects and removes link messages from non-admins in groups
- **Anti-Call**: Automatically rejects incoming calls (except from owner)
- **Anti-Spam**: Detects and warns spam behavior in groups
- **Welcome/Goodbye**: Configurable welcome and goodbye messages per group
- **Plugin System**: 80+ commands loaded from `silvaxlab/` directory
- **Self-Hosted Media API**: Express server on port 3001 using yt-dlp for reliable media downloads
- **AI Chat**: GPT/AI integration for conversational AI
- **TTS**: Text-to-speech in 19+ languages
- **Fancy Text**: 10 Unicode font styles
- **Ban System**: Owner can ban/unban users from bot usage
- **Bug Sender**: 10 bug types (text bomb, emoji flood, blank bomb, zalgo, reverse, vcard bomb, contact array, forward flood, location spam, giant wall)
- **Sticker Maker**: Real sticker creation from images and videos using sharp + ffmpeg
- **Music/Video Player**: YouTube search + audio/video download via self-hosted API with external fallbacks
- **Video Download**: Dedicated YouTube video downloader
- **APK Download**: Search and download Android apps from Play Store
- **Profile Picture**: View anyone's profile picture
- **User Info (Whois)**: Detailed user info lookup with status, group role, etc.
- **Group Info**: Full group metadata display
- **Group Link**: Get group invite link
- **Set Group Picture**: Change group profile picture
- **Mute/Unmute**: Mute/unmute group chat
- **Everyone/Hidetag**: Tag all members without showing mentions
- **Fun & Games**: Truth/Dare, 8-Ball, Jokes, Riddles, Coin Flip, RPS, Love Meter, Facts, Quotes
- **Interactive Menu**: List messages with categorized command sections and quick-reply buttons

## Configuration
Environment variables:
- `SESSION_ID` - WhatsApp session credentials (required to connect)
- `PREFIX` - Command prefix (default: `.`)
- `BOT_NAME` - Bot display name
- `OWNER_NUMBER` - Bot owner's WhatsApp number
- `PORT` - HTTP server port (set to 5000 for Replit)
- `HOST` - Server host (set to 0.0.0.0)
- `AUTO_STATUS_VIEW` - Auto view statuses (default: true)
- `AUTO_STATUS_REACT` - Auto react to statuses (default: true)
- `ANTI_DELETE` - Anti-delete feature (default: true)
- `ANTI_CALL` - Auto-reject calls (default: true)
- `NEWSLETTER_IDS` - Comma-separated newsletter JIDs to auto-follow

## Running
The bot runs via `node index.js` which starts:
1. HTTP health check server on port 5000
2. Silva Media API server on port 3001 (internal)
3. WhatsApp bot connection via Baileys

## Technical Notes
- **Antidelete fix**: Setup moved to `setupEvents()` so it re-registers on every reconnection. Uses `currentSetupId` to prevent duplicate handlers from old sockets.
- **Media API**: Uses yt-dlp system binary as primary download method, falls back to external APIs. Auto-cleans temp files older than 10 minutes.
- **Package.json**: Uses `dgxeon-soket` (custom Baileys fork). Express added for API server.

## Recent Changes
- 2026-02-10: Major upgrade v3.1 - Fixed antidelete (moved setup to setupEvents for reconnection support, added setupId to prevent duplicate handlers). Created self-hosted Media API server (lib/mediaApi.js) using Express + yt-dlp for YouTube/TikTok/Instagram/Facebook downloads on port 3001. Enhanced bug plugin (10 types: text bomb, emoji, blank, zalgo, reverse, vcard bomb, contact array, forward flood, location spam, giant wall). Added 10 new plugins: video download, APK download, profile picture viewer, whois/user info, group info, mute/unmute, group link, set group picture, everyone/hidetag, antispam. Cleaned up package.json. Updated music plugin to use self-hosted API first. Updated menu with all 80+ commands. Total: 80 plugins.
- 2026-02-10: Fixed sticker plugin, music plugin, added 9 fun plugins, interactive buttons. Total: 70 plugins.
- 2026-02-09: Speed & fix update, ban system, antilink, anticall, bug plugin. Total: 61 plugins.
- 2026-02-09: Fixed command handling, antidelete, added 13 new plugins. Total: 55+ plugins.
- 2026-02-08: Initial Replit setup
