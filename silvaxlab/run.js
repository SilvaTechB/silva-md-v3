const config = require('../config')

const handler = {
    help: ['runjs'],
    tags: ['tools', 'debug'],
    command: /^runjs$/i,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const from = message.key.remoteJid
        const sender = message.key.participant || from
        const code = args.join(' ')

        if (!code) {
            return sock.sendMessage(
                jid,
                {
                    text: '❌ Usage:\n.runjs console.log("hi")',
                    contextInfo: ctx(sender)
                },
                { quoted: message }
            )
        }

        let output = []
        let errors = []

        // 🧠 Capture console output
        const fakeConsole = {
            log: (...args) => output.push(args.join(' ')),
            error: (...args) => errors.push(args.join(' ')),
            warn: (...args) => errors.push(args.join(' '))
        }

        try {
            await sock.sendMessage(jid, {
                react: { text: '⌛', key: message.key }
            })

            // ⚙️ Execute JS in controlled scope
            const fn = new Function(
                'console',
                `"use strict";\n${code}`
            )

            fn(fakeConsole)

            await sock.sendMessage(jid, {
                react: { text: '✅', key: message.key }
            })

            const resultText =
`🧪  R U N J S   C O N S O L E
━━━━━━━━━━━━━━━━━━━━━━━
📥 Input:
${code}

📤 Output:
${output.length ? output.join('\n') : '[ no output ]'}

${errors.length ? `⚠️ Errors:\n${errors.join('\n')}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━
⚡ Silva MD • JS Runtime`

            await sock.sendMessage(
                jid,
                {
                    text: resultText,
                    contextInfo: ctx(sender)
                },
                { quoted: message }
            )

        } catch (err) {
            await sock.sendMessage(
                jid,
                {
                    text:
`🧪  R U N J S   C O N S O L E
━━━━━━━━━━━━━━━━━━━━━━━
❌ Runtime Exception

${err.message}
━━━━━━━━━━━━━━━━━━━━━━━`,
                    contextInfo: ctx(sender)
                },
                { quoted: message }
            )
        }
    }
}

module.exports = { handler }

// 🎯 Context branding
function ctx(sender) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363200367779016@newsletter',
            newsletterName: 'SILVA • RUNJS',
            serverMessageId: Math.floor(Math.random() * 1000)
        }
    }
}