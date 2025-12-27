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
            let channelJid = null;

            // 1️⃣ If argument provided
            if (args[0]) {
                const input = args[0];

                // Already a newsletter JID
                if (input.endsWith('@newsletter')) {
                    channelJid = input;
                }

                // WhatsApp channel link
                else if (input.includes('whatsapp.com/channel/')) {
                    const inviteCode = input.split('/channel/')[1]?.trim();
                    if (!inviteCode) throw new Error('Invalid channel link');

                    // Ask WhatsApp to resolve it
                    const meta = await sock.newsletterMetadata(inviteCode);
                    channelJid = meta?.id;
                }

                else {
                    throw new Error('Invalid channel input');
                }
            }

            // 2️⃣ No argument → current chat
            else {
                channelJid = message.key.remoteJid;
            }

            // 3️⃣ Validate
            if (!channelJid || !channelJid.endsWith('@newsletter')) {
                return sock.sendMessage(
                    jid,
                    {
                        text: '❌ This is not a WhatsApp channel/newsletter',
                        contextInfo: ctx(sender, 'Silva MD Channels 📢')
                    },
                    { quoted: message }
                );
            }

            // 4️⃣ Send REAL numeric JID
            await sock.sendMessage(
                jid,
                {
                    text: channelJid,
                    contextInfo: ctx(sender, 'Silva MD Channels 📢')
                },
                { quoted: message }
            );

        } catch (err) {
            console.error('ChannelJID Error:', err);

            await sock.sendMessage(
                jid,
                {
                    text:
                        '⚠️ Failed to resolve channel JID\n\n' +
                        '✔ Make sure the channel exists\n' +
                        '✔ Bot must have internet access',
                    contextInfo: ctx(sender, 'Silva MD Errors ⚠️')
                },
                { quoted: message }
            );
        }
    }
};

module.exports = { handler };


// 🧠 Silva MD contextInfo helper
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
