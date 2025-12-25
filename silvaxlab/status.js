/**
 * Silva MD Status Plugin
 * Auto View & Auto React to WhatsApp Status
 */

module.exports = {
    name: "status",

    async onMessage({ sock, message, config }) {
        try {
            // Status messages always come from this JID
            if (message.key.remoteJid !== "status@broadcast") return;

            // Do not react to your own status
            if (message.key.fromMe) return;

            // ===============================
            // AUTO VIEW STATUS
            // ===============================
            if (config.AUTO_STATUS_SEEN) {
                await sock.readMessages([message.key]);
            }

            // ===============================
            // AUTO LIKE / REACT STATUS
            // ===============================
            if (config.AUTO_STATUS_REACT) {
                const emojis = config.STATUS_EMOJI?.length
                    ? config.STATUS_EMOJI
                    : ["❤️"];

                const emoji =
                    emojis[Math.floor(Math.random() * emojis.length)];

                await sock.sendMessage(
                    "status@broadcast",
                    {
                        react: {
                            key: message.key,
                            text: emoji
                        }
                    },
                    { silent: true }
                );
            }

        } catch (err) {
            console.log("[STATUS PLUGIN ERROR]", err);
        }
    }
};
