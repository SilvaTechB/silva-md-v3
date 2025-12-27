// lib/status.js - Status Handler for Silva MD Bot
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
        
        console.log('[STATUS HANDLER] Initialized');
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
                console.log(`[STATUS HANDLER] Cleaned ${cleaned} old files`);
            }
        } catch (error) {
            console.error('[STATUS HANDLER] Cleanup error:', error.message);
        }
    }

    async handle({ messages, type, sock, config, logMessage }) {
        try {
            if (!messages || messages.length === 0) {
                return;
            }

            console.log(`[STATUS HANDLER] Processing ${messages.length} message(s), type: ${type}`);

            for (const message of messages) {
                try {
                    // Check if this is a status update
                    const jid = message.key.remoteJid;
                    console.log(`[STATUS HANDLER] Message JID: ${jid}`);
                    
                    // Status updates come from status@broadcast
                    if (jid !== 'status@broadcast') {
                        console.log(`[STATUS HANDLER] Not a status broadcast, skipping`);
                        continue;
                    }

                    console.log('[STATUS HANDLER] ✅ Status broadcast detected!');
                    
                    // Skip if already processed
                    const statusId = message.key.id;
                    if (this.processedStatuses.has(statusId)) {
                        console.log(`[STATUS HANDLER] Already processed: ${statusId}`);
                        continue;
                    }
                    
                    // Mark as processed
                    this.processedStatuses.add(statusId);
                    
                    // Auto-cleanup processed set after 5 minutes
                    setTimeout(() => {
                        this.processedStatuses.delete(statusId);
                    }, 5 * 60 * 1000);

                    const sender = message.key.participant;
                    const senderNumber = sender.split('@')[0];
                    
                    console.log(`[STATUS HANDLER] 📊 Status from: ${senderNumber}`);

                    // Get status content type
                    const contentType = getContentType(message.message);
                    let statusType = 'unknown';
                    
                    if (message.message?.imageMessage) statusType = 'image';
                    else if (message.message?.videoMessage) statusType = 'video';
                    else if (message.message?.audioMessage) statusType = 'audio';
                    else if (message.message?.extendedTextMessage) statusType = 'text';
                    else if (message.message?.conversation) statusType = 'text';

                    console.log(`[STATUS HANDLER] Status type: ${statusType}`);

                    // =====================================
                    // AUTO VIEW STATUS
                    // =====================================
                    if (config.AUTO_STATUS_SEEN === 'true' || config.AUTO_STATUS_SEEN === true) {
                        try {
                            await sock.readMessages([message.key]);
                            console.log(`[STATUS HANDLER] ✅ Auto-viewed status from: ${senderNumber}`);
                        } catch (error) {
                            console.error(`[STATUS HANDLER] Failed to auto-view:`, error.message);
                        }
                    }

                    // =====================================
                    // AUTO REACT TO STATUS
                    // =====================================
                    if (config.AUTO_STATUS_REACT === 'true' || config.AUTO_STATUS_REACT === true) {
                        try {
                            const emojis = config.CUSTOM_REACT_EMOJIS 
                                ? config.CUSTOM_REACT_EMOJIS.split(',').map(e => e.trim())
                                : ['❤️', '🔥', '💯', '😍', '👏', '💖', '🎉', '✨'];
                            
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            
                            // Wait a bit to seem more natural (1-3 seconds)
                            await this.delay(1000 + Math.random() * 2000);
                            
                            await sock.sendMessage('status@broadcast', {
                                react: {
                                    text: randomEmoji,
                                    key: message.key
                                }
                            });
                            
                            console.log(`[STATUS HANDLER] ${randomEmoji} Reacted to status from: ${senderNumber}`);
                        } catch (error) {
                            console.error(`[STATUS HANDLER] Failed to react:`, error.message);
                        }
                    }

                    // =====================================
                    // AUTO REPLY TO STATUS
                    // =====================================
                    if (config.AUTO_STATUS_REPLY === 'true' || config.AUTO_STATUS_REPLY === true) {
                        try {
                            const replyMsg = config.AUTO_STATUS_MSG || 
                                           config.STATUS_MSG || 
                                           '✅ Status viewed by Silva MD 💖';
                            
                            // Wait a bit to seem more natural (2-4 seconds)
                            await this.delay(2000 + Math.random() * 2000);
                            
                            await sock.sendMessage('status@broadcast', {
                                text: replyMsg
                            }, {
                                quoted: message
                            });
                            
                            console.log(`[STATUS HANDLER] 💬 Replied to status from: ${senderNumber}`);
                        } catch (error) {
                            console.error(`[STATUS HANDLER] Failed to reply:`, error.message);
                        }
                    }

                    // =====================================
                    // SAVE STATUS (Download media)
                    // =====================================
                    if (config.Status_Saver === 'true' || config.Status_Saver === true) {
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
                                        logger: console,
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
                                console.log(`[STATUS HANDLER] 💾 Status saved: ${fileName}`);

                                // Forward to owner if configured
                                if (config.OWNER_NUMBER) {
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
┃   sᴛᴀᴛᴜs sᴀᴠᴇᴅ     ┃
┗━━━━━━━━━━━━━━━━━━━━┛

📤 From: ${senderNumber}
📅 Date: ${new Date().toLocaleString()}
📦 Type: ${statusType}

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
                                                    caption: forwardCaption
                                                });
                                            }
                                            
                                            console.log(`[STATUS HANDLER] 📨 Status forwarded to owner: ${ownerNum}`);
                                        }
                                    } catch (error) {
                                        console.error(`[STATUS HANDLER] Failed to forward to owner:`, error.message);
                                    }
                                }
                            } else if (statusType === 'text') {
                                // Save text status
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
┃   sᴛᴀᴛᴜs sᴀᴠᴇᴅ     ┃
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
                            }
                        } catch (error) {
                            console.error(`[STATUS HANDLER] Failed to save status:`, error.message);
                        }
                    }

                } catch (error) {
                    console.error('[STATUS HANDLER] Error processing individual message:', error.message);
                }
            }
        } catch (error) {
            console.error('[STATUS HANDLER] Main handler error:', error.message);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Create singleton instance
const statusHandler = new StatusHandler();

module.exports = statusHandler;
