// Silva MD Bot Menu Plugin
const config = require('../config')

const handler = {
    help: ['menu'],
    tags: ['main'],
    command: /^(menu)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message }) => {
        try {
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            const pushname = message.pushName || 'User'

            const bannerImage = 'https://files.catbox.moe/riwqjf.png'

            const menuText = `
╭━━━━━━━━━━━━━━━━━━━━╮
┃   sɪʟᴠᴀ ᴍᴅ ʙᴏᴛ    ┃
┃  ᴠᴇʀsɪᴏɴ 2.1.0     ┃
╰━━━━━━━━━━━━━━━━━━━━╯

┏━━━━━━━━━━━━━━━━━━━━┓
┃ ᴜsᴇʀ: ${pushname}
┃ ᴍᴏᴅᴇ: PUBLIC
┃ ᴘʀᴇғɪx: ${config.PREFIX}
┗━━━━━━━━━━━━━━━━━━━━┛

┏─『 ᴅᴏᴡɴʟᴏᴀᴅ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}song
│ ${config.PREFIX}video
│ ${config.PREFIX}tiktok
│ ${config.PREFIX}fb
│ ${config.PREFIX}apk
│ ${config.PREFIX}img
┗──────────────⊷

┏─『 sᴇᴀʀᴄʜ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}yts
│ ${config.PREFIX}lyrics
┗──────────────⊷

┏─『 ᴍᴀɪɴ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}alive
│ ${config.PREFIX}ping
│ ${config.PREFIX}uptime
│ ${config.PREFIX}system
│ ${config.PREFIX}help
│ ${config.PREFIX}owner
┗──────────────⊷

┏─『 ᴜᴛɪʟɪᴛʏ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}vv
│ ${config.PREFIX}delete
┗──────────────⊷

┏─『 ɢʀᴏᴜᴘ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}hidetag
│ ${config.PREFIX}delete
│ ${config.PREFIX}mute
│ ${config.PREFIX}unmute
┗──────────────⊷

┏─『 ᴀɪ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}ai
│ ${config.PREFIX}gpt
┗──────────────⊷

┏─『 ᴄᴏɴᴠᴇʀᴛ ᴍᴇɴᴜ 』──⊷
│ ${config.PREFIX}tts
┗──────────────⊷

╭━━━━━━━━━━━━━━━━━━━━╮
┃ ᴅᴇᴠᴇʟᴏᴘᴇʀ ɪɴғᴏ    ┃
╰━━━━━━━━━━━━━━━━━━━━╯
github.com/SilvaTechB
pay.silvatech.top

ᴘᴏᴡᴇʀᴇᴅ ʙʏ sɪʟᴠᴀ ᴍᴅ
`

            const menuMessage = {
                image: { url: bannerImage },
                caption: menuText,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363200367779016@newsletter',
                        newsletterName: 'SILVATRIX',
                        serverMessageId: Math.floor(Math.random() * 1000)
                    }
                }
            }

            // Send to user's DM
            await sock.sendMessage(sender, menuMessage, { quoted: message })

            // Also send to group if command used there
            if (from.endsWith('@g.us')) {
                await sock.sendMessage(from, menuMessage)
            }

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ Error loading menu:\n${err.message}`
            }, { quoted: message })
        }
    }
}

module.exports = { handler }
