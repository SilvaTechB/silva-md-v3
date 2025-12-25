const config = require('../config')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')

const handler = {
    help: ['vv'],
    tags: ['extra'],
    command: /^(vv|viewonce)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message }) => {
        try {
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            const pushname = message.pushName || 'there'

            // Must reply to a message
            if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                return await sock.sendMessage(
                    jid,
                    { text: '❌ Reply to a view-once image or video.' },
                    { quoted: message }
                )
            }

            const quoted =
                message.message.extendedTextMessage.contextInfo.quotedMessage

            // Detect view-once message
            const viewOnceMsg =
                quoted.viewOnceMessageV2 ||
                quoted.viewOnceMessageV2Extension

            if (!viewOnceMsg) {
                return await sock.sendMessage(
                    jid,
                    { text: '❌ That is not a view-once message.' },
                    { quoted: message }
                )
            }

            const mediaType = viewOnceMsg.message.imageMessage
                ? 'image'
                : viewOnceMsg.message.videoMessage
                ? 'video'
                : null

            if (!mediaType) {
                return await sock.sendMessage(
                    jid,
                    { text: '❌ Unsupported view-once media type.' },
                    { quoted: message }
                )
            }

            // Download media
            const buffer = await downloadMediaMessage(
                {
                    key: {
                        remoteJid: from,
                        id: message.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: message.message.extendedTextMessage.contextInfo.participant
                    },
                    message: viewOnceMsg.message
                },
                'buffer',
                {},
                { logger: console }
            )

            const caption = `
✨ *VIEW-ONCE UNLOCKED*
👤 Requested by: ${pushname}
⚡ Powered by SILVA MD
`

            const mediaMessage =
                mediaType === 'image'
                    ? { image: buffer, caption }
                    : { video: buffer, caption }

            // Send media with contextInfo
            await sock.sendMessage(
                jid,
                {
                    ...mediaMessage,
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 777,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363200367779016@newsletter',
                            newsletterName: 'SILVA • VIEWONCE',
                            serverMessageId: Math.floor(Math.random() * 1000)
                        }
                    }
                },
                { quoted: message }
            )

        } catch (err) {
            await sock.sendMessage(
                jid,
                { text: `❌ View-once error:\n${err.message}` },
                { quoted: message }
            )
        }
    }
}

module.exports = { handler }