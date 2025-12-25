const config = require('../config')

const handler = {
    help: ['eval'],
    tags: ['owner'],
    command: /^eval$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message }) => {
        try {
            const mek = message
            const key = mek.key || {}

            const output = {
                remoteJid: key.remoteJid || null,
                fromMe: key.fromMe || false,
                id: key.id || null,

                senderLid: key.senderLid || undefined,
                senderPn: key.senderPn || undefined,

                participant: key.participant || null,
                participantPn: key.participantPn || null,
                participantLid: key.participantLid || undefined
            }

            const textOutput =
`{
  remoteJid: '${output.remoteJid}',
  fromMe: ${output.fromMe},
  id: '${output.id}',
  senderLid: ${output.senderLid},
  senderPn: ${output.senderPn},
  participant: '${output.participant}',
  participantPn: '${output.participantPn}',
  participantLid: ${output.participantLid}
}`

            await sock.sendMessage(
                jid,
                {
                    text: textOutput,
                    contextInfo: {
                        mentionedJid: [key.participant || jid],
                        forwardingScore: 777,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363200367779016@newsletter',
                            newsletterName: 'SILVA • DEBUG',
                            serverMessageId: Math.floor(Math.random() * 1000)
                        }
                    }
                },
                { quoted: message }
            )

        } catch (err) {
            await sock.sendMessage(
                jid,
                { text: `❌ Eval error:\n${err.message}` },
                { quoted: message }
            )
        }
    }
}

module.exports = { handler }