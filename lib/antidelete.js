const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const deletedMessages = new Map();
const MAX_STORE_SIZE = 1000;
const MAX_AGE_MS = 60 * 60 * 1000;

let currentSetupId = 0;

function setup(socket, config) {
    currentSetupId++;
    const setupId = currentSetupId;

    console.log('🔧 Setting up Antidelete Handler...');

    const isEnabled = config.ANTI_DELETE !== false && config.ANTIDELETE !== false;
    if (!isEnabled) {
        console.log('⚠️ Antidelete disabled in config');
        return;
    }

    console.log('✅ Antidelete Handler ENABLED');

    let botJid = null;
    if (socket.user && socket.user.id) {
        botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    }

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (setupId !== currentSetupId) return;
        if (!messages) return;

        if (!botJid && socket.user && socket.user.id) {
            botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
        }

        for (const message of messages) {
            try {
                if (!message.key || !message.key.remoteJid) continue;
                if (message.key.remoteJid === 'status@broadcast' ||
                    message.key.remoteJid.includes('@newsletter')) {
                    continue;
                }

                if (message.messageStubType === 1 || message.messageStubType === 132) {
                    const stored = deletedMessages.get(message.key.id);
                    if (stored) {
                        console.log(`🗑️ [ANTIDELETE] Deleted message detected via upsert stub: ${message.key.id}`);
                        await handleDeletedMessage(socket, config, stored, message.key, botJid);
                    }
                    continue;
                }

                if (message.key.fromMe) continue;
                if (!message.message) continue;

                const jid = message.key.remoteJid;
                const isGroup = jid.endsWith('@g.us');

                if (isGroup && config.ANTI_DELETE_GROUP === false) continue;
                if (!isGroup && config.ANTI_DELETE_PRIVATE === false) continue;

                let mediaBuffer = null;
                let msgContent = message.message;
                if (msgContent?.ephemeralMessage?.message) msgContent = msgContent.ephemeralMessage.message;
                if (msgContent?.viewOnceMessage?.message) msgContent = msgContent.viewOnceMessage.message;
                if (msgContent?.viewOnceMessageV2?.message) msgContent = msgContent.viewOnceMessageV2.message;
                if (msgContent?.viewOnceMessageV2Extension?.message) msgContent = msgContent.viewOnceMessageV2Extension.message;
                if (msgContent?.documentWithCaptionMessage?.message) msgContent = msgContent.documentWithCaptionMessage.message;

                const hasMedia = msgContent?.imageMessage || msgContent?.videoMessage ||
                                msgContent?.audioMessage || msgContent?.documentMessage ||
                                msgContent?.stickerMessage;

                if (hasMedia) {
                    try {
                        mediaBuffer = await downloadMediaMessage(message, 'buffer', {}, {
                            logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
                            reuploadRequest: socket.updateMediaMessage
                        });
                    } catch (e) {
                        console.log(`⚠️ [ANTIDELETE] Could not pre-download media: ${e.message}`);
                    }
                }

                deletedMessages.set(message.key.id, {
                    message,
                    mediaBuffer,
                    timestamp: Date.now(),
                    jid,
                    sender: message.key.participant || jid
                });

                if (deletedMessages.size > MAX_STORE_SIZE) {
                    const oldest = deletedMessages.keys().next().value;
                    deletedMessages.delete(oldest);
                }

            } catch (err) {
                console.error('❌ Antidelete store error:', err.message);
            }
        }
    });

    socket.ev.on('messages.update', async (updates) => {
        if (setupId !== currentSetupId) return;
        try {
            for (const update of updates) {
                if (!update.update?.messageStubType) continue;
                const stubType = update.update.messageStubType;
                if (stubType !== 1 && stubType !== 132) continue;

                const stored = deletedMessages.get(update.key.id);
                if (!stored) {
                    console.log(`⚠️ [ANTIDELETE] Delete detected but message not in store: ${update.key.id}`);
                    continue;
                }

                console.log(`🗑️ [ANTIDELETE] Deleted message detected via messages.update: ${update.key.id}`);
                await handleDeletedMessage(socket, config, stored, update.key, botJid);
            }
        } catch (err) {
            console.error('❌ Antidelete update error:', err.message);
        }
    });

    socket.ev.on('messages.delete', async (deleteData) => {
        if (setupId !== currentSetupId) return;
        try {
            const keys = deleteData.keys || (deleteData.key ? [deleteData.key] : []);
            if (!keys.length && deleteData.id) {
                keys.push({ id: deleteData.id, remoteJid: deleteData.remoteJid });
            }
            if (!keys.length) return;

            for (const key of keys) {
                const stored = deletedMessages.get(key.id);
                if (!stored) {
                    console.log(`⚠️ [ANTIDELETE] Delete detected but message not in store: ${key.id}`);
                    continue;
                }

                console.log(`🗑️ [ANTIDELETE] Deleted message detected via messages.delete: ${key.id}`);
                await handleDeletedMessage(socket, config, stored, key, botJid);
            }
        } catch (err) {
            console.error('❌ Antidelete delete error:', err.message);
        }
    });

    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of deletedMessages.entries()) {
            if (now - value.timestamp > MAX_AGE_MS) {
                deletedMessages.delete(key);
            }
        }
    }, 5 * 60 * 1000);

    console.log('✅ Antidelete Handler Setup Complete');
}

async function handleDeletedMessage(socket, config, stored, key, botJid) {
    try {
        const { message, jid, sender, mediaBuffer: preDownloaded } = stored;

        deletedMessages.delete(key.id);

        const isGroup = jid.endsWith('@g.us');
        const senderName = sender.split('@')[0];

        let groupName = '';
        if (isGroup) {
            try {
                const metadata = await socket.groupMetadata(jid);
                groupName = metadata.subject || jid;
            } catch (e) {
                groupName = jid;
            }
        }

        let content = '';
        let mediaType = null;

        let msg = message.message;
        if (msg?.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
        if (msg?.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
        if (msg?.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
        if (msg?.viewOnceMessageV2Extension?.message) msg = msg.viewOnceMessageV2Extension.message;
        if (msg?.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;
        if (msg?.editedMessage?.message) msg = msg.editedMessage.message;

        if (msg?.conversation) {
            content = msg.conversation;
        } else if (msg?.extendedTextMessage?.text) {
            content = msg.extendedTextMessage.text;
        } else if (msg?.imageMessage) {
            content = msg.imageMessage.caption || '';
            mediaType = 'image';
        } else if (msg?.videoMessage) {
            content = msg.videoMessage.caption || '';
            mediaType = 'video';
        } else if (msg?.audioMessage) {
            content = '🎵 Voice/Audio Message';
            mediaType = 'audio';
        } else if (msg?.documentMessage) {
            content = `📄 ${msg.documentMessage.fileName || 'Document'}`;
            mediaType = 'document';
        } else if (msg?.stickerMessage) {
            content = '🎨 Sticker';
            mediaType = 'sticker';
        } else if (msg?.contactMessage) {
            content = `👤 Contact: ${msg.contactMessage.displayName || 'Unknown'}`;
        } else if (msg?.locationMessage) {
            content = `📍 Location: ${msg.locationMessage.degreesLatitude}, ${msg.locationMessage.degreesLongitude}`;
        } else if (msg?.pollCreationMessage || msg?.pollCreationMessageV3) {
            const poll = msg.pollCreationMessage || msg.pollCreationMessageV3;
            content = `📊 Poll: ${poll.name || 'Unknown'}`;
        }

        if (!content && !mediaType) {
            content = '📦 Unknown content type';
        }

        let mediaBuffer = preDownloaded;
        if (!mediaBuffer && mediaType && message.message) {
            try {
                mediaBuffer = await downloadMediaMessage(message, 'buffer', {}, {
                    logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
                    reuploadRequest: socket.updateMediaMessage
                });
            } catch (e) {
                console.log(`⚠️ [ANTIDELETE] Could not download media on recovery: ${e.message}`);
            }
        }

        const ownerNum = config.OWNER_NUMBER;
        let ownerJid = null;
        if (ownerNum) {
            const cleanNum = (Array.isArray(ownerNum) ? ownerNum[0] : ownerNum).replace(/[^0-9]/g, '');
            if (cleanNum) {
                ownerJid = cleanNum + '@s.whatsapp.net';
            }
        }
        if (!ownerJid && botJid) {
            ownerJid = botJid;
            console.log(`ℹ️ [ANTIDELETE] No OWNER_NUMBER set, using bot number as owner: ${botJid}`);
        }

        const alertMessage = `⚠️ *ANTI-DELETE ALERT* ⚠️

┏━━━━━━━━━━━━━━━━━━━━
┃ 👤 *From:* @${senderName}
┃ 💬 *Chat:* ${isGroup ? `Group: ${groupName}` : 'Private Chat'}
┃ 📝 *Type:* ${mediaType ? mediaType.charAt(0).toUpperCase() + mediaType.slice(1) : 'Text'}
┃ ⏰ *Time:* ${new Date().toLocaleString()}
┗━━━━━━━━━━━━━━━━━━━━

📝 *Deleted Content:*
${content || '(no text content)'}

_🛡️ Recovered by Silva MD Bot_`;

        if (ownerJid) {
            try {
                if (mediaBuffer && mediaType) {
                    const mediaMsg = {};
                    if (mediaType === 'image') {
                        mediaMsg.image = mediaBuffer;
                        mediaMsg.caption = alertMessage;
                        mediaMsg.mentions = [sender];
                    } else if (mediaType === 'video') {
                        mediaMsg.video = mediaBuffer;
                        mediaMsg.caption = alertMessage;
                        mediaMsg.mentions = [sender];
                    } else if (mediaType === 'audio') {
                        mediaMsg.audio = mediaBuffer;
                        mediaMsg.mimetype = msg?.audioMessage?.mimetype || 'audio/mp4';
                        mediaMsg.ptt = msg?.audioMessage?.ptt || false;
                    } else if (mediaType === 'sticker') {
                        mediaMsg.sticker = mediaBuffer;
                    } else if (mediaType === 'document') {
                        mediaMsg.document = mediaBuffer;
                        mediaMsg.mimetype = msg?.documentMessage?.mimetype || 'application/octet-stream';
                        mediaMsg.fileName = msg?.documentMessage?.fileName || 'document';
                    }

                    await socket.sendMessage(ownerJid, mediaMsg);
                    if (mediaType === 'audio' || mediaType === 'sticker') {
                        await socket.sendMessage(ownerJid, { text: alertMessage, mentions: [sender] });
                    }
                } else {
                    await socket.sendMessage(ownerJid, { text: alertMessage, mentions: [sender] });
                }

                console.log(`✅ [ANTIDELETE] Alert sent to owner: ${ownerJid}`);
            } catch (e) {
                console.error(`❌ [ANTIDELETE] Failed to send to owner: ${e.message}`);
                try {
                    await socket.sendMessage(ownerJid, { text: alertMessage, mentions: [sender] });
                } catch (e2) {
                    console.error(`❌ [ANTIDELETE] Fallback text also failed: ${e2.message}`);
                }
            }
        }

        if (isGroup) {
            try {
                const groupAlert = `⚠️ *Message Deleted*\n\n👤 @${senderName} deleted a message\n📝 ${content ? content.substring(0, 300) : '(media)'}${content && content.length > 300 ? '...' : ''}`;

                await socket.sendMessage(jid, { text: groupAlert, mentions: [sender] });

                if (mediaBuffer && mediaType && mediaType !== 'sticker') {
                    const mediaMsg = {};
                    if (mediaType === 'image') {
                        mediaMsg.image = mediaBuffer;
                        mediaMsg.caption = '🔄 Recovered deleted media';
                    } else if (mediaType === 'video') {
                        mediaMsg.video = mediaBuffer;
                        mediaMsg.caption = '🔄 Recovered deleted media';
                    } else if (mediaType === 'audio') {
                        mediaMsg.audio = mediaBuffer;
                        mediaMsg.mimetype = msg?.audioMessage?.mimetype || 'audio/mp4';
                        mediaMsg.ptt = msg?.audioMessage?.ptt || false;
                    } else if (mediaType === 'document') {
                        mediaMsg.document = mediaBuffer;
                        mediaMsg.fileName = msg?.documentMessage?.fileName || 'document';
                    }
                    await socket.sendMessage(jid, mediaMsg);
                }
                console.log(`✅ [ANTIDELETE] Group alert sent to: ${jid}`);
            } catch (e) {
                console.error(`❌ [ANTIDELETE] Group alert failed: ${e.message}`);
            }
        } else {
            try {
                const chatAlert = `⚠️ *Message Deleted*\n\n👤 @${senderName} deleted a message\n📝 ${content ? content.substring(0, 300) : '(media)'}${content && content.length > 300 ? '...' : ''}`;

                await socket.sendMessage(jid, { text: chatAlert, mentions: [sender] });

                if (mediaBuffer && mediaType && mediaType !== 'sticker') {
                    const mediaMsg = {};
                    if (mediaType === 'image') {
                        mediaMsg.image = mediaBuffer;
                        mediaMsg.caption = '🔄 Recovered deleted media';
                    } else if (mediaType === 'video') {
                        mediaMsg.video = mediaBuffer;
                        mediaMsg.caption = '🔄 Recovered deleted media';
                    } else if (mediaType === 'audio') {
                        mediaMsg.audio = mediaBuffer;
                        mediaMsg.mimetype = msg?.audioMessage?.mimetype || 'audio/mp4';
                        mediaMsg.ptt = msg?.audioMessage?.ptt || false;
                    } else if (mediaType === 'document') {
                        mediaMsg.document = mediaBuffer;
                        mediaMsg.fileName = msg?.documentMessage?.fileName || 'document';
                    }
                    await socket.sendMessage(jid, mediaMsg);
                }
                console.log(`✅ [ANTIDELETE] Private chat alert sent to: ${jid}`);
            } catch (e) {
                console.error(`❌ [ANTIDELETE] Private chat alert failed: ${e.message}`);
            }
        }
    } catch (err) {
        console.error('❌ [ANTIDELETE] Handle deleted message error:', err.message);
    }
}

module.exports = {
    setup,
    deletedMessages
};
