/**
 * Silva MD – Auto Status View & React
 * Compatible with handler-based plugin loader
 */

const handler = {
    help: [],
    tags: ["system"],
    command: /^$/i, // silent plugin (no command)

    execute: async ({ sock, message, config }) => {
        try {
            // Status messages come from this JID
            if (!message?.key) return;
            if (message.key.remoteJid !== "status@broadcast") return;
            if (message.key.fromMe) return;

            // ===============================
            // AUTO VIEW STATUS
            // ===============================
            if (config.AUTO_STATUS_SEEN) {
                await sock.readMessages([message.key]);
            }

            // ===============================
            // AUTO LIKE / REACT
            // ===============================
            if (config.AUTO_STATUS_REACT) {
                const emojis =
                    config.STATUS_EMOJI?.length
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

module.exports = { handler };
