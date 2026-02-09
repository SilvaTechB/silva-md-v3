const config = require('../config')

const welcomeGroups = new Map()

const handler = {
    help: ['welcome', 'goodbye'],
    tags: ['group', 'admin'],
    command: /^(welcome|goodbye)$/i,
    group: true,
    admin: true,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args, text }) => {
        try {
            const command = text.split(' ')[0].toLowerCase()
            const action = args[0]?.toLowerCase()

            if (!welcomeGroups.has(jid)) {
                welcomeGroups.set(jid, { welcome: false, goodbye: false })
            }

            const settings = welcomeGroups.get(jid)

            if (!action || !['on', 'off'].includes(action)) {
                return sock.sendMessage(jid, {
                    text: `╭━━━━━━━━━━━━━━━━━━━━╮
┃   ${command === 'welcome' ? '👋 WELCOME' : '👋 GOODBYE'}       ┃
╰━━━━━━━━━━━━━━━━━━━━╯

📊 *Welcome:* ${settings.welcome ? '✅ ON' : '❌ OFF'}
📊 *Goodbye:* ${settings.goodbye ? '✅ ON' : '❌ OFF'}

*Usage:*
${config.PREFIX}welcome on/off
${config.PREFIX}goodbye on/off`
                }, { quoted: message })
            }

            settings[command] = action === 'on'

            await sock.sendMessage(jid, {
                text: `${action === 'on' ? '✅' : '❌'} *${command.charAt(0).toUpperCase() + command.slice(1)}* ${action === 'on' ? 'ENABLED' : 'DISABLED'}`
            }, { quoted: message })

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ Error: ${err.message}`
            }, { quoted: message })
        }
    }
}

module.exports = { handler, welcomeGroups }
