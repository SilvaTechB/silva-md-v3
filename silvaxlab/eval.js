const util = require('util')
const config = require('../config')

const handler = {
    help: ['eval'],
    tags: ['debug'],
    command: /^eval$/i,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        try {
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            const query = args.join(' ').trim()

            if (!query) {
                return sock.sendMessage(
                    jid,
                    { text: '⚙️ Usage:\n.eval mek.key\n.eval sock\n.eval message' },
                    { quoted: message }
                )
            }

            // -------- SAFE CONTEXT MAP --------
            const context = {
                sock,
                message,
                mek: message
            }

            let result
            try {
                result = eval(query)
            } catch (e) {
                return sock.sendMessage(
                    jid,
                    { text: `❌ Eval error:\n${e.message}` },
                    { quoted: message }
                )
            }

            // -------- STRINGIFY (SAFE, REAL) --------
            const inspected = util.inspect(result, {
                depth: 2,
                colors: false,
                maxArrayLength: 20,
                breakLength: 80
            })

            const output =
`🧪  E V A L   R E S U L T S
━━━━━━━━━━━━━━━━━━━━━━━
Query:
${query}

Results:
${inspected}
━━━━━━━━━━━━━━━━━━━━━━━
⚡ Silva MD Diagnostic Engine`

            await sock.sendMessage(
                jid,
                {
                    text: output,
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363200367779016@newsletter',
                            newsletterName: 'SILVA • EVAL LAB',
                            serverMessageId: Math.floor(Math.random() * 1000)
                        }
                    }
                },
                { quoted: message }
            )

        } catch (err) {
            await sock.sendMessage(
                jid,
                { text: `❌ Internal eval failure:\n${err.message}` },
                { quoted: message }
            )
        }
    }
}

module.exports = { handler }