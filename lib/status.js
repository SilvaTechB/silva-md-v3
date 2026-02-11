// lib/status.js - FIXED Status Handler for Silva MD Bot
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');

class StatusHandler {
    constructor() {
        this.statusDir = path.join(__dirname, '../temp/status');
        this.processedStatuses = new Set();
        this.cleanupInterval = null;
        
        // Create status directory if it doesn't exist
        if (!fs.existsSync(this.statusDir)) {
            fs.mkdirSync(this.statusDir, { recursive: true });
        }
        
        // Start cleanup interval (clean old files every 10 minutes)
        this.startCleanupInterval();
        
        console.log('[STATUS HANDLER] ✅ Initialized successfully');
    }

    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldFiles();
        }, 10 * 60 * 1000); // 10 minutes
    }

    cleanupOldFiles() {
        try {
            if (!fs.existsSync(this.statusDir)) return;
            
            const files = fs.readdirSync(this.statusDir);
            const now = Date.now();
            const maxAge = 30 * 60 * 1000; // 30 minutes
            
            let cleaned = 0;
            for (const file of files) {
                const filePath = path.join(this.statusDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                console.log(`[STATUS HANDLER] 🧹 Cleaned ${cleaned} old files`);
            }
        } catch (error) {
            console.error('[STATUS HANDLER] ❌ Cleanup error:', error.message);
        }
    }

    // FIXED: Better config value checking
    isEnabled(configValue) {
        if (configValue === true || configValue === 'true' || configValue === '1' || configValue === 1) {
            return true;
        }
        return false;
    }

    async handle({ messages, type, sock, config, logMessage }) {
        try {
            if (!messages || messages.length === 0) {
                return;
            }

            // Filter ONLY status broadcasts
            const statusMessages = messages.filter(msg => 
                msg.key && msg.key.remoteJid === 'status@broadcast'
            );

            if (statusMessages.length === 0) {
                return;
            }

            console.log(`[STATUS HANDLER] 📊 Processing ${statusMessages.length} status update(s)`);

            for (const message of statusMessages) {
                try {
                    // Skip if already processed
                    const statusId = message.key.id;
                    if (this.processedStatuses.has(statusId)) {
                        console.log(`[STATUS HANDLER] ⏭️ Already processed: ${statusId}`);
                        continue;
                    }
                    
                    // Mark as processed
                    this.processedStatuses.add(statusId);
                    
                    // Auto-cleanup processed set after 5 minutes
                    setTimeout(() => {
                        this.processedStatuses.delete(statusId);
                    }, 5 * 60 * 1000);

                    const sender = message.key.participant;
                    const senderNumber = sender ? sender.split('@')[0] : 'Unknown';
                    
                    console.log(`[STATUS HANDLER] 👤 Status from: ${senderNumber}`);

                    // Get status content type
                    const contentType = getContentType(message.message);
                    let statusType = 'unknown';
                    
                    if (message.message?.imageMessage) statusType = 'image';
                    else if (message.message?.videoMessage) statusType = 'video';
                    else if (message.message?.audioMessage) statusType = 'audio';
                    else if (message.message?.extendedTextMessage) statusType = 'text';
                    else if (message.message?.conversation) statusType = 'text';

                    console.log(`[STATUS HANDLER] 📝 Status type: ${statusType}`);

                    // =====================================
                    // AUTO VIEW STATUS (FIXED)
                    // =====================================
                    const autoView = this.isEnabled(config.AUTO_STATUS_VIEW) || this.isEnabled(config.AUTO_STATUS_SEEN);
                    console.log(`[STATUS HANDLER] 👁️ AUTO_STATUS_VIEW config: ${config.AUTO_STATUS_VIEW} -> ${autoView}`);
                    
                    if (autoView) {
                        try {
                            // Method 1: Read messages
                            await sock.readMessages([message.key]);
                            console.log(`[STATUS HANDLER] ✅ Auto-viewed status from: ${senderNumber}`);
                            
                            // Small delay to ensure it processes
                            await this.delay(500);
                        } catch (error) {
                            console.error(`[STATUS HANDLER] ❌ Failed to auto-view:`, error.message);
                            
                            // Try alternative method: Send presence update
                            try {
                                await sock.sendPresenceUpdate('available', 'status@broadcast');
                                console.log(`[STATUS HANDLER] ✅ Sent presence update for status view`);
                            } catch (err2) {
                                console.error(`[STATUS HANDLER] ❌ Alternative view method failed:`, err2.message);
                            }
                        }
                    } else {
                        console.log(`[STATUS HANDLER] ⏭️ Auto-view disabled in config`);
                    }

                    // =====================================
                    // AUTO REACT TO STATUS (FIXED)
                    // =====================================
                    const autoLike = this.isEnabled(config.AUTO_STATUS_LIKE) || this.isEnabled(config.AUTO_STATUS_REACT);
                    console.log(`[STATUS HANDLER] ❤️ AUTO_STATUS_LIKE config: ${config.AUTO_STATUS_LIKE} -> ${autoLike}`);
                    
                    if (autoLike) {
                        try {
                            const emojiStr = config.CUSTOM_REACT_EMOJIS || '❤️,🔥,💯,😍,👏,💖,🎉,✨,👍,⭐';
                            const emojis = emojiStr.split(',').map(e => e.trim());
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            
                            await this.delay(1000 + Math.random() * 2000);
                            
                            await sock.sendMessage(sender, {
                                react: {
                                    text: randomEmoji,
                                    key: {
                                        remoteJid: 'status@broadcast',
                                        id: statusId,
                                        participant: sender
                                    }
                                }
                            });
                            
                            console.log(`[STATUS HANDLER] ${randomEmoji} Reacted to status from: ${senderNumber}`);
                        } catch (error) {
                            console.error(`[STATUS HANDLER] ❌ Failed to react:`, error.message);
                        }
                    } else {
                        console.log(`[STATUS HANDLER] ⏭️ Auto-like disabled in config`);
                    }

                    // =====================================
                    // SAVE STATUS (FIXED)
                    // =====================================
                    const statusSaver = this.isEnabled(config.STATUS_SAVER);
                    console.log(`[STATUS HANDLER] 💾 STATUS_SAVER config: ${config.STATUS_SAVER} -> ${statusSaver}`);
                    
                    if (statusSaver) {
                        try {
                            // Only save media statuses (image, video, audio)
                            if (statusType === 'image' || statusType === 'video' || statusType === 'audio') {
                                console.log(`[STATUS HANDLER] 💾 Saving ${statusType} status from: ${senderNumber}`);
                                
                                // Download media
                                const buffer = await downloadMediaMessage(
                                    message,
                                    'buffer',
                                    {},
                                    {
                                        logger: {
                                            error: () => {},
                                            warn: () => {},
                                            info: () => {},
                                            debug: () => {}
                                        },
                                        reuploadRequest: sock.updateMediaMessage
                                    }
                                );

                                // Determine file extension
                                let ext = 'bin';
                                if (statusType === 'image') ext = 'jpg';
                                else if (statusType === 'video') ext = 'mp4';
                                else if (statusType === 'audio') ext = 'mp3';

                                const fileName = `status_${senderNumber}_${Date.now()}.${ext}`;
                                const filePath = path.join(this.statusDir, fileName);

                                // Save to disk
                                fs.writeFileSync(filePath, buffer);
                                console.log(`[STATUS HANDLER] 💾 Status saved: ${fileName} (${this.formatBytes(buffer.length)})`);

                                // Forward to owner if configured
                                if (config.OWNER_NUMBER) {
                                    await this.forwardMediaToOwner(sock, config, message, buffer, statusType, senderNumber);
                                }
                            } else if (statusType === 'text') {
                                await this.saveTextStatus(sock, config, message, senderNumber);
                            }
                        } catch (error) {
                            console.error(`[STATUS HANDLER] ❌ Failed to save status:`, error.message);
                        }
                    } else {
                        console.log(`[STATUS HANDLER] ⏭️ Status saver disabled in config`);
                    }

                } catch (error) {
                    console.error('[STATUS HANDLER] ❌ Error processing individual message:', error.message);
                }
            }
        } catch (error) {
            console.error('[STATUS HANDLER] ❌ Main handler error:', error.message);
            console.error(error.stack);
        }
    }

    async forwardMediaToOwner(sock, config, message, buffer, statusType, senderNumber) {
        try {
            const ownerNumbers = Array.isArray(config.OWNER_NUMBER)
                ? config.OWNER_NUMBER
                : [config.OWNER_NUMBER];

            for (const ownerNum of ownerNumbers) {
                const ownerJid = ownerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                
                // Get caption if exists
                let caption = '';
                if (message.message?.imageMessage?.caption) {
                    caption = message.message.imageMessage.caption;
                } else if (message.message?.videoMessage?.caption) {
                    caption = message.message.videoMessage.caption;
                }

                const forwardCaption = `┏━━━━━━━━━━━━━━━━━━━━┓
┃   STATUS SAVED      ┃
┗━━━━━━━━━━━━━━━━━━━━┛

📤 From: ${senderNumber}
📅 Date: ${new Date().toLocaleString()}
📦 Type: ${statusType}
💾 Size: ${this.formatBytes(buffer.length)}

${caption ? `💬 Caption:\n${caption}\n\n` : ''}⚡ Saved by Silva MD`;

                // Send based on type
                if (statusType === 'image') {
                    await sock.sendMessage(ownerJid, {
                        image: buffer,
                        caption: forwardCaption
                    });
                } else if (statusType === 'video') {
                    await sock.sendMessage(ownerJid, {
                        video: buffer,
                        caption: forwardCaption
                    });
                } else if (statusType === 'audio') {
                    await sock.sendMessage(ownerJid, {
                        audio: buffer,
                        mimetype: 'audio/mp4',
                        ptt: false
                    });
                    // Send caption separately for audio
                    await sock.sendMessage(ownerJid, {
                        text: forwardCaption
                    });
                }
                
                console.log(`[STATUS HANDLER] 📨 Status forwarded to owner: ${ownerNum}`);
            }
        } catch (error) {
            console.error(`[STATUS HANDLER] ❌ Failed to forward to owner:`, error.message);
        }
    }

    async saveTextStatus(sock, config, message, senderNumber) {
        try {
            let textContent = '';
            if (message.message?.conversation) {
                textContent = message.message.conversation;
            } else if (message.message?.extendedTextMessage?.text) {
                textContent = message.message.extendedTextMessage.text;
            }

            if (textContent && config.OWNER_NUMBER) {
                console.log(`[STATUS HANDLER] 💾 Saving text status from: ${senderNumber}`);
                
                const ownerNumbers = Array.isArray(config.OWNER_NUMBER)
                    ? config.OWNER_NUMBER
                    : [config.OWNER_NUMBER];

                for (const ownerNum of ownerNumbers) {
                    const ownerJid = ownerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    
                    const forwardText = `┏━━━━━━━━━━━━━━━━━━━━┓
┃   STATUS SAVED      ┃
┗━━━━━━━━━━━━━━━━━━━━┛

📤 From: ${senderNumber}
📅 Date: ${new Date().toLocaleString()}
📦 Type: Text Status

💬 Content:
${textContent}

⚡ Saved by Silva MD`;

                    await sock.sendMessage(ownerJid, {
                        text: forwardText
                    });
                    
                    console.log(`[STATUS HANDLER] 📨 Text status forwarded to owner: ${ownerNum}`);
                }
            }
        } catch (error) {
            console.error(`[STATUS HANDLER] ❌ Failed to save text status:`, error.message);
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            console.log('[STATUS HANDLER] 🛑 Cleanup interval stopped');
        }
    }
}

// Create singleton instance
const statusHandler = new StatusHandler();

module.exports = statusHandler;
