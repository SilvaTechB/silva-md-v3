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
│ ${p}play <song name>
│ ${p}song <title>
│ ${p}video <name>
│ ${p}tiktok <url>
│ ${p}fb <url>
│ ${p}ig <url>
│ ${p}capcut <url>
│ ${p}yts <search>
│ ${p}apk <app name>
│ ${p}spotify <query>
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
│ ${p}whois @user
│ ${p}pp @user
│ ${p}movie <title>
│ ${p}element <name>
╰──────────────⊷

╭─『 🎮 FUN & GAMES 』──⊷
│ ${p}truth - Truth question
│ ${p}dare - Dare challenge
│ ${p}tod - Truth or Dare
│ ${p}joke - Random joke
│ ${p}8ball <question> - Magic 8-Ball
│ ${p}flip <heads/tails> - Coin flip
│ ${p}rps <rock/paper/scissors>
│ ${p}riddle - Brain teaser
│ ${p}ship @user1 @user2 - Love meter
│ ${p}inspire - Motivation quote
│ ${p}fact - Random fact
│ ${p}quote <category>
╰──────────────⊷

╭─『 👥 GROUP 』──⊷
│ ${p}kick @user
│ ${p}promote @user
│ ${p}demote @user
│ ${p}tagall <message>
│ ${p}everyone / ${p}hidetag
│ ${p}mute / ${p}unmute
│ ${p}ginfo - Group info
│ ${p}linkgroup - Group link
│ ${p}setpp - Set group pic
│ ${p}antilink on/off
│ ${p}antidemote on/off
│ ${p}antispam on/off
│ ${p}welcome on/off
│ ${p}goodbye on/off
│ ${p}clear
│ ${p}jid
╰──────────────⊷

╭─『 🛡️ PROTECTION 』──⊷
│ ${p}antidelete
│ ${p}anticall on/off
│ ${p}antispam on/off
│ ${p}checkban @user
╰──────────────⊷

╭─『 ⚙️ SYSTEM 』──⊷
│ ${p}alive
│ ${p}ping
│ ${p}uptime
│ ${p}menu / ${p}help
│ ${p}owner
│ ${p}repo
╰──────────────⊷

╭─『 👑 OWNER 』──⊷
│ ${p}eval <code>
│ ${p}broadcast <msg>
│ ${p}ban @user
│ ${p}unban @user
│ ${p}banlist
│ ${p}bug @user <1-10>
│ ${p}settings
╰──────────────⊷

╭━━━━━━━━━━━━━━━━━━━━╮
┃ github.com/SilvaTechB
┃ Powered by ${config.BOT_NAME || 'Silva MD'}
╰━━━━━━━━━━━━━━━━━━━━╯`

            await sock.sendMessage(jid, {
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
            }, { quoted: message })

            try {
                const sections = [
                    {
                        title: '📥 Download',
                        rows: [
                            { title: `${p}play`, description: 'Play a song from YouTube' },
                            { title: `${p}video`, description: 'Download YouTube video' },
                            { title: `${p}tiktok`, description: 'Download TikTok video' },
                            { title: `${p}ig`, description: 'Download Instagram media' },
                            { title: `${p}fb`, description: 'Download Facebook video' },
                            { title: `${p}apk`, description: 'Download Android APK' },
                            { title: `${p}yts`, description: 'Search YouTube videos' }
                        ]
                    },
                    {
                        title: '🎮 Fun & Games',
                        rows: [
                            { title: `${p}truth`, description: 'Get a truth question' },
                            { title: `${p}dare`, description: 'Get a dare challenge' },
                            { title: `${p}joke`, description: 'Get a random joke' },
                            { title: `${p}8ball`, description: 'Ask the magic 8-ball' },
                            { title: `${p}flip`, description: 'Flip a coin' },
                            { title: `${p}rps`, description: 'Rock Paper Scissors' },
                            { title: `${p}riddle`, description: 'Get a brain teaser' },
                            { title: `${p}ship`, description: 'Love compatibility meter' },
                            { title: `${p}fact`, description: 'Random fun fact' },
                            { title: `${p}inspire`, description: 'Motivational quote' }
                        ]
                    },
                    {
                        title: '🛠️ Utility',
                        rows: [
                            { title: `${p}sticker`, description: 'Create sticker from image/video' },
                            { title: `${p}tts`, description: 'Text to speech' },
                            { title: `${p}translate`, description: 'Translate text' },
                            { title: `${p}weather`, description: 'Get weather info' },
                            { title: `${p}whois`, description: 'User info lookup' },
                            { title: `${p}pp`, description: 'View profile picture' },
                            { title: `${p}ai`, description: 'Chat with AI' }
                        ]
                    },
                    {
                        title: '👥 Group Management',
                        rows: [
                            { title: `${p}kick`, description: 'Remove a member' },
                            { title: `${p}promote`, description: 'Make admin' },
                            { title: `${p}tagall`, description: 'Tag all members' },
                            { title: `${p}everyone`, description: 'Hidden tag all' },
                            { title: `${p}ginfo`, description: 'Group information' },
                            { title: `${p}linkgroup`, description: 'Get group invite link' },
                            { title: `${p}setpp`, description: 'Set group picture' },
                            { title: `${p}mute`, description: 'Mute group' },
                            { title: `${p}antispam`, description: 'Anti-spam protection' }
                        ]
                    },
                    {
                        title: '👑 Owner & System',
                        rows: [
                            { title: `${p}ping`, description: 'Check bot speed' },
                            { title: `${p}alive`, description: 'Check if bot is alive' },
                            { title: `${p}ban`, description: 'Ban a user (owner)' },
                            { title: `${p}broadcast`, description: 'Broadcast message (owner)' },
                            { title: `${p}bug`, description: 'Send bug (10 types)' },
                            { title: `${p}checkban`, description: 'Check ban status' }
                        ]
                    }
                ]

                await sock.sendMessage(jid, {
                    text: `📋 *Quick Command List*\n\n_Tap a command to select it!_\n\n_${config.BOT_NAME || 'Silva MD'} - Your Ultimate WhatsApp Companion_`,
                    footer: `${config.BOT_NAME || 'Silva MD'} v${config.VERSION || '3.0.0'} | ${p}menu for full list`,
                    title: 'SELECT A COMMAND',
                    buttonText: '📋 Open Command List',
                    sections
                })
            } catch (e) {
            }

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
