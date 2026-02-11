const { delay, downloadMediaMessage } = require("@whiskeysockets/baileys");

const deletedMessages = new Map();

function setup(socket, config) {
    console.log('🔧 Setting up Antidelete Handler...');

    const isEnabled = config.ANTI_DELETE || config.ANTIDELETE;
    if (!isEnabled) {
        console.log('⚠️ Antidelete disabled in config');
        return;
    }

    console.log('✅ Antidelete Handler ENABLED');

    socket.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages) return;

        for (const message of messages) {
            try {
                if (!message.key || !message.key.remoteJid) continue;
                if (message.key.remoteJid === 'status@broadcast' || 
                    message.key.remoteJid.includes('@newsletter')) {
                    continue;
                }
                if (message.key.fromMe) continue;

                const jid = message.key.remoteJid;
                const isGroup = jid.endsWith('@g.us');
                
                if (isGroup && !config.ANTI_DELETE_GROUP) continue;
                if (!isGroup && !config.ANTI_DELETE_PRIVATE) continue;

                deletedMessages.set(message.key.id, {
                    message,
                    timestamp: Date.now(),
                    jid,
                    sender: message.key.participant || jid
                });

                const now = Date.now();
                for (const [key, value] of deletedMessages.entries()) {
                    if (now - value.timestamp > 10 * 60 * 1000) {
                        deletedMessages.delete(key);
                    }
                }

            } catch (err) {
                console.error('❌ Antidelete store error:', err.message);
            }
        }
    });

    socket.ev.on('messages.update', async (updates) => {
        try {
            for (const update of updates) {
                if (!update.update?.messageStubType) continue;
                if (update.update.messageStubType !== 1 && update.update.messageStubType !== 68) continue;
                
                const stored = deletedMessages.get(update.key.id);
                if (!stored) continue;

                await handleDeletedMessage(socket, config, stored, update.key);
            }
        } catch (err) {
            console.error('❌ Antidelete update error:', err.message);
        }
    });

    socket.ev.on('messages.delete', async (deleteData) => {
        try {
            const keys = deleteData.keys || (deleteData.key ? [deleteData.key] : []);
            if (!keys.length) return;

            for (const key of keys) {
                const stored = deletedMessages.get(key.id);
                if (!stored) continue;

                await handleDeletedMessage(socket, config, stored, key);
            }
        } catch (err) {
            console.error('❌ Antidelete error:', err.message);
        }
    });

    console.log('✅ Antidelete Handler Setup Complete');
}

async function handleDeletedMessage(socket, config, stored, key) {
    try {
        const { message, jid, sender } = stored;
        
        deletedMessages.delete(key.id);

        const isGroup = jid.endsWith('@g.us');

        console.log(`🗑️ Message deleted in ${isGroup ? 'group' : 'private'}: ${jid}`);

        let content = '';
        let mediaType = null;
        let mediaBuffer = null;

        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            content = message.message.imageMessage.caption || '';
            mediaType = 'image';
        } else if (message.message?.videoMessage) {
            content = message.message.videoMessage.caption || '';
            mediaType = 'video';
        } else if (message.message?.audioMessage) {
            content = '🎵 Audio Message';
            mediaType = 'audio';
        } else if (message.message?.documentMessage) {
            content = message.message.documentMessage.fileName || '📄 Document';
            mediaType = 'document';
        } else if (message.message?.stickerMessage) {
            content = '🎨 Sticker';
            mediaType = 'sticker';
        }

        if (!content && !mediaType) {
            content = '📦 Unknown content type';
        }

        const senderName = sender.split('@')[0];

        const alertMessage = `⚠️ *ANTI-DELETE ALERT*

👤 *Sender:* @${senderName}
💬 *Chat:* ${isGroup ? 'Group' : 'Private'}
📝 *Content:* ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}
⏰ *Time:* ${new Date().toLocaleTimeString()}

_Recovered by Silva MD Bot_`;

        // Try to download and forward media
        if (mediaType && message.message) {
            try {
                mediaBuffer = await downloadMediaMessage(message, 'buffer', {}, {
                    logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
                    reuploadRequest: socket.updateMediaMessage
                });
            } catch (e) {
                console.log('Could not download deleted media:', e.message);
            }
        }

        // Send to owner
        if (config.OWNER_NUMBER) {
            const ownerNum = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER[0] : config.OWNER_NUMBER;
            const ownerJid = ownerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            
            if (mediaBuffer && mediaType) {
                const mediaMsg = {};
                if (mediaType === 'image') {
                    mediaMsg.image = mediaBuffer;
                    mediaMsg.caption = alertMessage;
                } else if (mediaType === 'video') {
                    mediaMsg.video = mediaBuffer;
                    mediaMsg.caption = alertMessage;
                } else if (mediaType === 'audio') {
                    mediaMsg.audio = mediaBuffer;
                    mediaMsg.mimetype = 'audio/mp4';
                    mediaMsg.ptt = message.message?.audioMessage?.ptt || false;
                } else if (mediaType === 'sticker') {
                    mediaMsg.sticker = mediaBuffer;
                } else if (mediaType === 'document') {
                    mediaMsg.document = mediaBuffer;
                    mediaMsg.mimetype = message.message?.documentMessage?.mimetype || 'application/octet-stream';
                    mediaMsg.fileName = message.message?.documentMessage?.fileName || 'document';
                }
                
                try {
                    await socket.sendMessage(ownerJid, mediaMsg);
                    if (mediaType === 'audio' || mediaType === 'sticker') {
                        await socket.sendMessage(ownerJid, { text: alertMessage, mentions: [sender] });
                    }
                } catch (e) {
                    await socket.sendMessage(ownerJid, { text: alertMessage, mentions: [sender] });
                }
            } else {
                await socket.sendMessage(ownerJid, { text: alertMessage, mentions: [sender] });
            }
        }

        // Notify in group if enabled
        if (isGroup && config.ANTI_DELETE_GROUP) {
            await delay(1000);
            const groupAlert = `⚠️ *Message Deleted*

👤 @${senderName} deleted a message
📝 ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`;
            
            await socket.sendMessage(jid, { text: groupAlert, mentions: [sender] });
            
            if (mediaBuffer && mediaType) {
                try {
                    if (mediaType === 'image') {
                        await socket.sendMessage(jid, { image: mediaBuffer, caption: '🔄 Recovered deleted media' });
                    } else if (mediaType === 'video') {
                        await socket.sendMessage(jid, { video: mediaBuffer, caption: '🔄 Recovered deleted media' });
                    } else if (mediaType === 'audio') {
                        await socket.sendMessage(jid, { audio: mediaBuffer, mimetype: 'audio/mp4', ptt: message.message?.audioMessage?.ptt || false });
                    }
                } catch (e) {
                    console.log('Could not forward deleted media to group:', e.message);
                }
            }
        }
    } catch (err) {
        console.error('❌ Handle deleted message error:', err.message);
    }
}

module.exports = {
    setup
};
