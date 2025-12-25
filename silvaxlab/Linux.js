const { exec } = require('child_process')
const config = require('../config')

const handler = {
    help: ['linux', 'exec'],
    tags: ['tools', 'debug'],
    command: /^(linux|exec)$/i,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const from = message.key.remoteJid
        const sender = message.key.participant || from

        const commandToRun = args.join(' ') || 'ls'

        try {
            // ⌛ React: processing
            await sock.sendMessage(jid, {
                react: { text: '⌛', key: message.key }
            })

            exec(commandToRun, async (error, stdout, stderr) => {

                // ✅ React: done
                await sock.sendMessage(jid, {
                    react: { text: '✅', key: message.key }
                })

                if (error) {
                    return sock.sendMessage(
                        jid,
                        {
                            text:
`🖥️  L I N U X   E X E C
━━━━━━━━━━━━━━━━━━━━━━━
❌ Execution Error

Command:
${commandToRun}

Message:
${error.message}
━━━━━━━━━━━━━━━━━━━━━━━`,
                            contextInfo: ctx(sender)
                        },
                        { quoted: message }
                    )
                }

                if (stderr) {
                    return sock.sendMessage(
                        jid,
                        {
                            text:
`🖥️  L I N U X   E X E C
━━━━━━━━━━━━━━━━━━━━━━━
⚠️ STDERR Output

Command:
${commandToRun}

${stderr}
━━━━━━━━━━━━━━━━━━━━━━━`,
                            contextInfo: ctx(sender)
                        },
                        { quoted: message }
                    )
                }

                const output =
`🖥️  L I N U X   E X E C
━━━━━━━━━━━━━━━━━━━━━━━
Command:
${commandToRun}

Results:
${stdout || '[ no output ]'}
━━━━━━━━━━━━━━━━━━━━━━━
⚡ Silva MD Shell Bridge`

                await sock.sendMessage(
                    jid,
                    {
                        text: output,
                        contextInfo: ctx(sender)
                    },
                    { quoted: message }
                )
            })

        } catch (err) {
            await sock.sendMessage(
                jid,
                {
                    text: `❌ Linux plugin failure:\n${err.message}`,
                    contextInfo: ctx(sender)
                },
                { quoted: message }
            )
        }
    }
}

module.exports = { handler }

// 🔧 Context branding
function ctx(sender) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363200367779016@newsletter',
            newsletterName: 'SILVA • LINUX CORE',
            serverMessageId: Math.floor(Math.random() * 1000)
        }
    }
}