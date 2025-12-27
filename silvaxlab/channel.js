const handler = {
    help: ['channeljid', 'newsletterjid', 'getchannelid'],
    tags: ['channel', 'tools'],
    command: /^(channeljid|newsletterjid|getchannelid)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid;

        try {
            let targetJid = null;

            // 1️⃣ If a link or JID is provided
            if (args[0]) {
                const input = args[0];

                // Newsletter JID directly
                if (input.endsWith('@newsletter')) {
                    targetJid = input;
                }

                // WhatsApp channel/newsletter link
                else if (input.includes('whatsapp.com/channel/')) {
                    const code = input.split('/').pop().trim();
                    targetJid = `120363${code}@newsletter`;
                }

                else {
                    return sock.sendMessage(
                        jid,
                        {
                            text: '❌ Invalid channel link or JID',
                            contextInfo: ctx(sender, 'Silva MD Channels 📢')
                        },
                        { quoted: message }
                    );
                }
            }

            // 2️⃣ If no argument, use current chat JID
            else {
                targetJid = message.key.remoteJid;
            }

            // 3️⃣ Final validation
            if (!targetJid.endsWith('@newsletter')) {
                return sock.sendMessage(
                    jid,
                    {
                        text:
                            '❌ This is not a WhatsApp channel/newsletter\n\n' +
                            '📌 Tip:\n' +
                            '.channeljid <channel link or JID>',
                        contextInfo: ctx(sender, 'Silva MD Channels 📢')
                    },
                    { quoted: message }
                );
            }

            // 4️⃣ Output ONLY the JID (clean & obvious)
            await sock.sendMessage(
                jid,
                {
                    text: `${targetJid}`,
                    contextInfo: ctx(sender, 'Silva MD Channels 📢')
                },
                { quoted: message }
            );

        } catch (err) {
            console.error('❌ ChannelJID Error:', err);

            await sock.sendMessage(
                jid,
                {
                    text: '⚠️ Failed to fetch channel JID',
                    contextInfo: ctx(sender, 'Silva MD Errors ⚠️')
                },
                { quoted: message }
            );
        }
    }
};

module.exports = { handler };


// 🧠 Shared contextInfo builder (Silva MD standard)
function ctx(sender, name) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363200367779016@newsletter',
            newsletterName: name,
            serverMessageId: Math.floor(Math.random() * 1000)
        }
    };
}
