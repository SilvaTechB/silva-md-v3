// Modern Ping command
const handler = {
    help: ['ping'],
    tags: ['info', 'system'],
    command: /^ping$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message }) => {
        try {
            const sender = message.key.participant || message.key.remoteJid;
            const start = Date.now();

            // Initial pong
            await sock.sendMessage(jid, {
                text: '🏓 *Pong!* Checking latency...',
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "SILVA TECH PING 💻",
                        serverMessageId: 143
                    }
                }
            }, { quoted: message });

            const latency = Date.now() - start;

            // System stats
            const uptime = (process.uptime() / 3600).toFixed(2);
            const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

            const pingStats = `⚡ *Ping Statistics*\n\n` +
                              `⏱ Latency: ${latency}ms\n` +
                              `📊 Uptime: ${uptime}h\n` +
                              `💾 RAM Usage: ${ram}MB\n` +
                              `🤖 Bot Version: 1.0.0\n` +
                              `🌐 Status: Online`;

            const config = require('../config')
            const p = config.PREFIX
            await sock.sendMessage(jid, {
                text: pingStats,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    externalAdReply: {
                        title: "SILVA TECH BOT",
                        body: "Pure WhatsApp Tech Vibe ⚡",
                        sourceUrl: "https://silvatech.top",
                        showAdAttribution: true,
                        thumbnailUrl: "https://i.imgur.com/8hQvY5j.png"
                    },
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "SILVA TECH PING 💻",
                        serverMessageId: 143
                    }
                }
            }, { quoted: message });

            try {
                await sock.sendMessage(jid, {
                    text: `🏓 *${config.BOT_NAME || 'Silva MD'} is Online!*\n⚡ Latency: ${latency}ms\n\n_Quick Actions:_`,
                    footer: `${config.BOT_NAME || 'Silva MD'} v${config.VERSION || '3.0.0'}`,
                    templateButtons: [
                        { index: 1, quickReplyButton: { displayText: '📋 Menu', id: `${p}menu` } },
                        { index: 2, quickReplyButton: { displayText: '🤖 Alive', id: `${p}alive` } },
                        { index: 3, quickReplyButton: { displayText: '📊 Stats', id: `${p}stats` } }
                    ]
                })
            } catch (e) {}

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ *Ping Error:*\n${err.message}`,
                contextInfo: {
                    mentionedJid: [message.key.participant || message.key.remoteJid],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "SILVA TECH ERROR 💥",
                        serverMessageId: 143
                    }
                }
            }, { quoted: message });
        }
    }
};

module.exports = { handler };
