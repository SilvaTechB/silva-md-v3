// Alive plugin
const handler = {
    help: ['alive'],
    tags: ['main'],
    command: /^(alive)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message }) => {
        try {
            const sender = message.key.participant || message.key.remoteJid
            const pushName =
                message.pushName ||
                sender?.split('@')[0] ||
                'User'

            // Media & links
            const vn = 'https://cdn.jsdelivr.net/gh/SilvaTechB/silva-md-bot@original/media/Alive.mp3'
            const img = 'https://files.catbox.moe/8324jm.jpg'

            // Fake contact quote (classic Silva style)
            const quotedContact = {
                key: {
                    fromMe: false,
                    participant: sender,
                    remoteJid: '254700143167@s.whatsapp.net',
                },
                message: {
                    contactMessage: {
                        displayName: pushName,
                        vcard: `BEGIN:VCARD
VERSION:3.0
N:;${pushName};;;
FN:${pushName}
item1.TEL;waid=${sender.split('@')[0]}:${sender.split('@')[0]}
item1.X-ABLabel:Ponsel
END:VCARD`,
                    },
                },
            }

            const aliveMessage = {
                audio: { url: vn },
                mimetype: 'audio/mpeg',
                ptt: true,
                waveform: [100, 0, 100, 0, 100, 0, 100],
                fileName: 'silva-alive',

                contextInfo: {
                    mentionedJid: [sender],
                    externalAdReply: {
                        title: 'Hallelujah — Silva MD Bot Alive',
                        body: 'SILVA MD BOT • 2025',
                        thumbnailUrl: img,
                        sourceUrl: 'https://whatsapp.com/channel/0029VaAkETLLY6d8qhLmZt2v',
                        mediaType: 1,
                        renderLargerThumbnail: true,
                    },
                },
            }

            await sock.sendMessage(jid, aliveMessage, { quoted: quotedContact })

            try {
                const config = require('../config')
                const p = config.PREFIX
                await sock.sendMessage(jid, {
                    text: `🤖 *${config.BOT_NAME || 'Silva MD'} is Alive!*\n\n_Quick Actions:_`,
                    footer: `${config.BOT_NAME || 'Silva MD'} v${config.VERSION || '3.0.0'}`,
                    templateButtons: [
                        { index: 1, urlButton: { displayText: '📢 Join Channel', url: 'https://whatsapp.com/channel/0029VaAkETLLY6d8qhLmZt2v' } },
                        { index: 2, quickReplyButton: { displayText: '📋 Menu', id: `${p}menu` } },
                        { index: 3, quickReplyButton: { displayText: '🏓 Ping', id: `${p}ping` } }
                    ]
                })
            } catch (e) {}

        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Alive command failed:\n${error.message}`
            }, { quoted: message })
        }
    }
}

module.exports = { handler }
