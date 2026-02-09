const config = require('../config')
const os = require('os')

const handler = {
    help: ['menu', 'help'],
    tags: ['main'],
    command: /^(menu|help)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message }) => {
        try {
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            const pushname = message.pushName || 'User'

            const uptime = formatUptime(process.uptime())
            const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
            const platform = os.platform()
            const p = config.PREFIX

            const bannerImage = 'https://files.catbox.moe/riwqjf.png'

            const menuText = `╭━━━━━━━━━━━━━━━━━━━━╮
┃   ${config.BOT_NAME || 'SILVA MD'} v${config.VERSION || '3.0.0'}
╰━━━━━━━━━━━━━━━━━━━━╯

👋 *Hey ${pushname}!*

┏━━━ *BOT INFO* ━━━
┃ 📡 Mode: ${config.BOT_MODE || 'public'}
┃ ⏰ Uptime: ${uptime}
┃ 💾 RAM: ${ram}MB
┃ 🔌 Prefix: ${p}
┗━━━━━━━━━━━━━━━━━━

╭─『 📥 DOWNLOAD 』──⊷
│ ${p}song <title>
│ ${p}video <title>
│ ${p}tiktok <url>
│ ${p}fb <url>
│ ${p}ig <url>
│ ${p}capcut <url>
│ ${p}yts <search>
╰──────────────⊷

╭─『 🤖 AI 』──⊷
│ ${p}ai <prompt>
│ ${p}gpt <question>
│ ${p}ask <question>
╰──────────────⊷

╭─『 🛠️ UTILITY 』──⊷
│ ${p}sticker / ${p}s
│ ${p}take <pack> <author>
│ ${p}tts <lang> <text>
│ ${p}translate <lang> <text>
│ ${p}weather <city>
│ ${p}lyrics <song>
│ ${p}tourl (reply to media)
│ ${p}vv (view once)
│ ${p}delete / ${p}del
│ ${p}fancy <style> <text>
│ ${p}short <url>
╰──────────────⊷

╭─『 😎 FUN 』──⊷
│ ${p}quote <category>
│ ${p}movie <title>
│ ${p}element <name>
╰──────────────⊷

╭─『 👥 GROUP 』──⊷
│ ${p}kick @user
│ ${p}promote @user
│ ${p}demote @user
│ ${p}tagall <message>
│ ${p}hidetag <message>
│ ${p}mute / ${p}unmute
│ ${p}antilink on/off
│ ${p}antidemote on/off
│ ${p}welcome on/off
│ ${p}goodbye on/off
│ ${p}clear
│ ${p}jid
╰──────────────⊷

╭─『 🛡️ PROTECTION 』──⊷
│ ${p}protect @user
│ ${p}unprotect @user
│ ${p}protected
│ ${p}antidelete
│ ${p}anticall on/off
│ ${p}checkban
╰──────────────⊷

╭─『 ⚙️ SYSTEM 』──⊷
│ ${p}alive
│ ${p}ping
│ ${p}uptime
│ ${p}menu
│ ${p}owner
│ ${p}repo
╰──────────────⊷

╭─『 👑 OWNER 』──⊷
│ ${p}eval <code>
│ ${p}broadcast <msg>
│ ${p}ban @user
│ ${p}unban @user
│ ${p}banlist
│ ${p}bug @user <type>
│ ${p}settings
╰──────────────⊷

╭━━━━━━━━━━━━━━━━━━━━╮
┃ github.com/SilvaTechB
┃ Powered by ${config.BOT_NAME || 'Silva MD'}
╰━━━━━━━━━━━━━━━━━━━━╯`

            const menuMessage = {
                image: { url: bannerImage },
                caption: menuText,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363200367779016@newsletter',
                        newsletterName: config.BOT_NAME || 'SILVA MD',
                        serverMessageId: Math.floor(Math.random() * 1000)
                    }
                }
            }

            await sock.sendMessage(jid, menuMessage, { quoted: message })

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ Error loading menu:\n${err.message}`
            }, { quoted: message })
        }
    }
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    parts.push(`${s}s`)
    return parts.join(' ')
}

module.exports = { handler }
