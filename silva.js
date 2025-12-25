// ==============================
// 📦 IMPORTS SECTION
// ==============================
const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    downloadMediaMessage,
    getContentType,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    delay,
    proto
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Import configuration
const config = require('./config.js');

// Global Context Info
const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363200367779016@newsletter',
        newsletterName: '◢◤ Silva Tech Nexus ◢◤',
        serverMessageId: 144
    }
};

// ==============================
// 🪵 LOGGER SECTION (ENHANCED FOR DEBUGGING)
// ==============================
const logger = pino({
    level: config.DEBUG_MODE ? 'debug' : 'error',
    transport: config.DEBUG_MODE ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    } : undefined
});

// Enhanced logger for bot messages
class BotLogger {
    log(type, message) {
        const timestamp = new Date().toISOString();
        const colors = {
            SUCCESS: '\x1b[32m',
            ERROR: '\x1b[31m',
            INFO: '\x1b[36m',
            WARNING: '\x1b[33m',
            BOT: '\x1b[35m',
            DEBUG: '\x1b[90m',
            MESSAGE: '\x1b[34m',
            COMMAND: '\x1b[95m',
            STATUS: '\x1b[93m',
            RESET: '\x1b[0m'
        };
        console.log(`${colors[type] || colors.INFO}[${type}] ${timestamp} - ${message}${colors.RESET}`);
    }
}

const botLogger = new BotLogger();

// ==============================
// 🔐 SESSION MANAGEMENT
// ==============================
async function loadSession() {
    try {
        const credsPath = './sessions/creds.json';
        
        if (!fs.existsSync('./sessions')) {
            fs.mkdirSync('./sessions', { recursive: true });
        }
        
        // Clean old sessions if needed
        if (fs.existsSync(credsPath)) {
            try {
                fs.unlinkSync(credsPath);
                botLogger.log('INFO', "♻️ Old session removed");
            } catch (e) {
                // Ignore error
            }
        }

        if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
            botLogger.log('WARNING', "SESSION_ID missing, using QR");
            return false;
        }

        const [header, b64data] = config.SESSION_ID.split('~');

        if (header !== "Silva" || !b64data) {
            botLogger.log('ERROR', "Invalid session format");
            return false;
        }

        const cleanB64 = b64data.replace('...', '');
        const compressedData = Buffer.from(cleanB64, 'base64');
        const decompressedData = zlib.gunzipSync(compressedData);

        fs.writeFileSync(credsPath, decompressedData, "utf8");
        botLogger.log('SUCCESS', "✅ Session loaded successfully");
        return true;
    } catch (e) {
        botLogger.log('ERROR', "Session Error: " + e.message);
        return false;
    }
}

// ==============================
// 🔧 UTILITY FUNCTIONS (FIXED FOR LID OWNER DETECTION)
// ==============================
class FunctionsWrapper {
    constructor() {
        this.tempDir = path.join(__dirname, './temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        this.botNumber = null;
        this.botLid = null; // Store bot's LID
    }

    async isAdmin(message, sock) {
        if (!message.key.remoteJid.endsWith('@g.us')) return false;
        
        try {
            const metadata = await sock.groupMetadata(message.key.remoteJid);
            const participant = message.key.participant || message.key.remoteJid;
            const adminList = metadata.participants.filter(p => p.admin).map(p => p.id);
            return adminList.includes(participant);
        } catch {
            return false;
        }
    }

    isOwner(sender) {
        botLogger.log('DEBUG', `[OWNER CHECK] Checking if sender is owner: ${sender}`);
        
        // First: If message is from the bot itself (fromMe), it's automatically owner
        // We'll handle this in the message handler by checking fromMe flag
        
        // Extract phone number or LID from sender
        let phoneNumber = '';
        let isLid = false;
        
        if (sender.includes('@lid')) {
            // Handle LID format: 81712071631074@lid
            phoneNumber = sender.split('@')[0];
            isLid = true;
            botLogger.log('DEBUG', `[OWNER CHECK] Sender is LID: ${phoneNumber}`);
        } else if (sender.includes('@s.whatsapp.net')) {
            // Handle standard JID format: 254700143167@s.whatsapp.net
            phoneNumber = sender.split('@')[0];
            botLogger.log('DEBUG', `[OWNER CHECK] Sender is JID: ${phoneNumber}`);
        } else if (sender.includes(':')) {
            // Handle other formats with colon
            phoneNumber = sender.split(':')[0];
        } else {
            phoneNumber = sender;
        }
        
        // Clean the phone number (remove non-digits)
        const cleanSender = phoneNumber.replace(/[^0-9]/g, '');
        botLogger.log('DEBUG', `[OWNER CHECK] Cleaned sender: ${cleanSender}`);
        
        // Check 1: Is this the bot's LID?
        if (isLid && this.botLid) {
            const cleanBotLid = this.botLid.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotLid) {
                botLogger.log('DEBUG', '[OWNER CHECK] Sender is bot LID - GRANTING OWNER');
                return true;
            }
        }
        
        // Check 2: Is this the bot's phone number?
        if (this.botNumber) {
            const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
            botLogger.log('DEBUG', `[OWNER CHECK] Bot number: ${cleanBotNum}`);
            if (cleanSender === cleanBotNum) {
                botLogger.log('DEBUG', '[OWNER CHECK] Sender is bot number - GRANTING OWNER');
                return true;
            }
        }
        
        // Check 3: Check against config owner numbers
        let ownerNumbers = [];
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                ownerNumbers = config.OWNER_NUMBER.map(num => {
                    const cleanNum = num.replace(/[^0-9]/g, '');
                    botLogger.log('DEBUG', `[OWNER CHECK] Config owner: ${num} -> ${cleanNum}`);
                    return cleanNum;
                });
            } else if (typeof config.OWNER_NUMBER === 'string') {
                const cleanNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
                ownerNumbers = [cleanNum];
                botLogger.log('DEBUG', `[OWNER CHECK] Config owner: ${config.OWNER_NUMBER} -> ${cleanNum}`);
            }
        }
        
        // Check 4: Also check connected number from config
        if (config.CONNECTED_NUMBER) {
            const connectedNumber = config.CONNECTED_NUMBER.replace(/[^0-9]/g, '');
            ownerNumbers.push(connectedNumber);
            botLogger.log('DEBUG', `[OWNER CHECK] Connected number from config: ${connectedNumber}`);
        }
        
        // Remove duplicates
        ownerNumbers = [...new Set(ownerNumbers)];
        botLogger.log('DEBUG', `[OWNER CHECK] All owner numbers to check: ${ownerNumbers.join(', ')}`);
        
        // Check if sender matches any owner number
        const isOwner = ownerNumbers.some(ownerNum => {
            const match = cleanSender === ownerNum || 
                         cleanSender.endsWith(ownerNum) || 
                         ownerNum.endsWith(cleanSender);
            if (match) {
                botLogger.log('DEBUG', `[OWNER CHECK] Match found: ${cleanSender} === ${ownerNum}`);
            }
            return match;
        });
        
        botLogger.log('DEBUG', `[OWNER CHECK] Final result for ${cleanSender}: ${isOwner}`);
        return isOwner;
    }

    setBotNumber(number) {
        if (number) {
            this.botNumber = number.replace(/[^0-9]/g, '');
            botLogger.log('INFO', `🤖 Bot connected as: ${this.botNumber}`);
            
            // Also store as owner if not already in config
            if (config.OWNER_NUMBER) {
                const ownerNumbers = Array.isArray(config.OWNER_NUMBER) ? 
                    config.OWNER_NUMBER : [config.OWNER_NUMBER];
                const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
                
                // Check if bot number is already in owner list
                const isAlreadyOwner = ownerNumbers.some(ownerNum => 
                    ownerNum.replace(/[^0-9]/g, '') === cleanBotNum
                );
                
                if (!isAlreadyOwner) {
                    botLogger.log('INFO', `✅ Added bot number ${this.botNumber} to owner list`);
                }
            }
        }
    }

    setBotLid(lid) {
        if (lid) {
            this.botLid = lid.split('@')[0]; // Store just the number part
            botLogger.log('INFO', `🔑 Bot LID detected: ${this.botLid}`);
        }
    }

    isAllowed(sender, jid) {
        // Owner is always allowed
        if (this.isOwner(sender)) {
            botLogger.log('INFO', `✅ Owner access granted for: ${sender}`);
            return true;
        }
        
        if (config.BOT_MODE === 'public') return true;
        
        if (config.BOT_MODE === 'private') {
            // Allow groups in private mode
            if (jid.endsWith('@g.us')) return true;
            
            // Check allowed users
            if (config.ALLOWED_USERS && Array.isArray(config.ALLOWED_USERS)) {
                const senderNumber = sender.split('@')[0].replace(/[^0-9]/g, '');
                const allowedNumbers = config.ALLOWED_USERS.map(num => num.replace(/[^0-9]/g, ''));
                return allowedNumbers.includes(senderNumber);
            }
            return false;
        }
        
        return true;
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    formatJid(number) {
        if (!number) return null;
        const cleaned = number.replace(/[^0-9]/g, '');
        if (cleaned.length < 10) return null;
        return cleaned + '@s.whatsapp.net';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Extract text from message
    extractText(message) {
        if (!message) return '';
        
        if (message.conversation) {
            return message.conversation;
        } else if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        } else if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        } else if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        } else if (message.documentMessage?.caption) {
            return message.documentMessage.caption;
        } else if (message.audioMessage?.caption) {
            return message.audioMessage.caption;
        }
        return '';
    }
}

// ==============================
// 💾 STORE IMPLEMENTATION
// ==============================
class MessageStore {
    constructor() {
        this.messageCache = new NodeCache({ stdTTL: 3600 });
        this.chatCache = new NodeCache({ stdTTL: 300 });
        this.deletedMessages = new Map();
    }

    async getMessage(key) {
        return this.messageCache.get(key.id);
    }

    async setMessage(key, message) {
        this.messageCache.set(key.id, message);
    }

    async getChat(jid) {
        return this.chatCache.get(jid);
    }

    async setChat(jid, chat) {
        this.chatCache.set(jid, chat);
    }

    async saveDeletedMessage(key, message) {
        if (message && !message.key?.fromMe) {
            this.deletedMessages.set(key.id, {
                ...message,
                timestamp: Date.now(),
                deletedAt: Date.now()
            });
            
            setTimeout(() => {
                this.deletedMessages.delete(key.id);
            }, 300000);
        }
    }

    async getDeletedMessage(keyId) {
        return this.deletedMessages.get(keyId);
    }
}

// ==============================
// 🧩 PLUGIN MANAGER
// ==============================
class PluginManager {
    constructor() {
        this.commandHandlers = new Map();
        this.pluginInfo = new Map();
        this.functions = new FunctionsWrapper();
    }

    async loadPlugins(dir = 'silvaxlab') {
        try {
            const pluginDir = path.join(__dirname, dir);
            
            if (!fs.existsSync(pluginDir)) {
                fs.mkdirSync(pluginDir, { recursive: true });
                botLogger.log('INFO', "Created plugin directory: " + dir);
                this.createExamplePlugins(pluginDir);
                return;
            }

            const pluginFiles = fs.readdirSync(pluginDir)
                .filter(file => file.endsWith('.js') && !file.startsWith('_'));

            botLogger.log('INFO', "Found " + pluginFiles.length + " plugin(s) in " + dir);

            for (const file of pluginFiles) {
                try {
                    const pluginPath = path.join(pluginDir, file);
                    delete require.cache[require.resolve(pluginPath)];
                    
                    const pluginModule = require(pluginPath);
                    
                    if (pluginModule && pluginModule.handler && pluginModule.handler.command) {
                        const handler = pluginModule.handler;
                        this.commandHandlers.set(handler.command, handler);
                        
                        this.pluginInfo.set(handler.command.source, {
                            help: handler.help || [],
                            tags: handler.tags || [],
                            group: handler.group || false,
                            admin: handler.admin || false,
                            botAdmin: handler.botAdmin || false,
                            owner: handler.owner || false,
                            filename: file
                        });
                        
                        botLogger.log('SUCCESS', "✅ Loaded plugin: " + file.replace('.js', ''));
                    } else {
                        botLogger.log('WARNING', "Plugin " + file + " has invalid format");
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Failed to load plugin " + file + ": " + error.message);
                }
            }
        } catch (error) {
            botLogger.log('ERROR', "Plugin loading error: " + error.message);
        }
    }

    createExamplePlugins(pluginDir) {
        // Create example plugins if needed
        const plugins = [];
        for (const plugin of plugins) {
            fs.writeFileSync(path.join(pluginDir, plugin.name), plugin.content);
            botLogger.log('INFO', "Created plugin: " + plugin.name);
        }
    }

    async executeCommand(context) {
        const { text, jid, sender, isGroup, message, sock, args } = context;
        
        botLogger.log('COMMAND', `🔄 Processing command: ${text} from ${sender}`);
        
        // Check if user is allowed
        if (!this.functions.isAllowed(sender, jid)) {
            if (config.BOT_MODE === 'private') {
                await sock.sendMessage(jid, { 
                    text: '🔒 Private mode: Contact owner for access.' 
                }, { quoted: message });
                return true;
            }
            return false;
        }
        
        for (const [commandRegex, handler] of this.commandHandlers.entries()) {
            const commandMatch = text.split(' ')[0];
            if (commandRegex.test(commandMatch)) {
                try {
                    // Check permissions - SPECIAL HANDLING FOR FROM_ME MESSAGES
                    if (handler.owner && !this.functions.isOwner(sender)) {
                        // If message is from bot itself (fromMe), allow it
                        if (!message.key.fromMe) {
                            await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                            return true;
                        }
                    }
                    
                    if (handler.group && !isGroup) {
                        await sock.sendMessage(jid, { text: '⚠️ Group only command' }, { quoted: message });
                        return true;
                    }
                    
                    if (handler.admin && isGroup) {
                        const isAdmin = await this.functions.isAdmin(message, sock);
                        if (!isAdmin) {
                            await sock.sendMessage(jid, { text: '⚠️ Admin required' }, { quoted: message });
                            return true;
                        }
                    }
                    
                    if (handler.botAdmin && isGroup) {
                        try {
                            const metadata = await sock.groupMetadata(jid);
                            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                            const botParticipant = metadata.participants.find(p => p.id === botJid);
                            if (!botParticipant || !botParticipant.admin) {
                                await sock.sendMessage(jid, { text: '⚠️ Bot needs admin rights' }, { quoted: message });
                                return true;
                            }
                        } catch (e) {
                            // Ignore error
                        }
                    }
                    
                    // Execute command
                    botLogger.log('COMMAND', `✅ Executing plugin command: ${commandMatch} for ${sender}`);
                    await handler.execute(context);
                    return true;
                    
                } catch (error) {
                    botLogger.log('ERROR', "Command error: " + error.message);
                    await sock.sendMessage(jid, { 
                        text: '❌ Error: ' + error.message
                    }, { quoted: message });
                    return true;
                }
            }
        }
        return false;
    }

    getCommandList() {
        const commands = [];
        for (const [regex, info] of this.pluginInfo) {
            commands.push({
                command: regex.replace(/[\/\^$]/g, ''),
                help: info.help[0] || 'No description',
                tags: info.tags,
                group: info.group,
                admin: info.admin
            });
        }
        return commands;
    }
}

// ==============================
// 🤖 MAIN BOT CLASS (FIXED & CLEAN)
// ==============================
class SilvaBot {
    constructor() {
        this.sock = null;
        this.store = new MessageStore();
        this.groupCache = new NodeCache({ stdTTL: 300, useClones: false });
        this.pluginManager = new PluginManager();
        this.isConnected = false;

        // ✅ SINGLE shared functions instance
        this.functions = new FunctionsWrapper();

        // ==============================
        // ⚙️ SETTINGS
        // ==============================
        this.antiDeleteEnabled = config.ANTIDELETE !== false;

        // Status settings (ENV + config safe)
        this.autoStatusView = config.AUTO_STATUS_SEEN === true;
        this.autoStatusLike = config.AUTO_STATUS_REACT === true;
        this.autoStatusReply = config.AUTO_STATUS_REPLY === true;
        this.statusSaver = config.STATUS_SAVER === true;
        this.statusReply = config.STATUS_REPLY === true;

        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.keepAliveInterval = null;

        // Built-in commands
        this.commands = {
            help: this.helpCommand?.bind(this),
            menu: this.menuCommand?.bind(this),
            ping: this.pingCommand?.bind(this),
            owner: this.ownerCommand?.bind(this),
            stats: this.statsCommand?.bind(this),
            plugins: this.pluginsCommand?.bind(this),
            start: this.startCommand?.bind(this),
            antidelete: this.antideleteCommand?.bind(this)
        };
    }

    // ==============================
    // 🚀 INIT
    // ==============================
    async init() {
        try {
            botLogger.log('BOT', `🚀 Starting ${config.BOT_NAME} v${config.VERSION}`);

            if (config.SESSION_ID) {
                await loadSession();
            }

            await this.pluginManager.loadPlugins('silvaxlab');
            await this.connect();
        } catch (err) {
            botLogger.log('ERROR', `Init failed: ${err.message}`);
            setTimeout(() => this.init(), 10000);
        }
    }

    // ==============================
    // 🔌 CONNECT
    // ==============================
    async connect() {
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            browser: Browsers.macOS(config.BOT_NAME),
            markOnlineOnConnect: true,
            printQRInTerminal: true,
            shouldIgnoreJid: jid =>
                jid === 'status@broadcast' || jid?.includes('@newsletter')
        });

        this.setupEvents(saveCreds);
    }

    // ==============================
    // 📦 STATUS UNWRAP HELPER
    // ==============================
    unwrapStatus(msg) {
        const inner =
            msg.message?.viewOnceMessageV2?.message ||
            msg.message?.viewOnceMessage?.message ||
            msg.message ||
            {};
        const msgType = Object.keys(inner)[0];
        return { inner, msgType };
    }

    // ==============================
    // 🎯 EVENTS
    // ==============================
    setupEvents(saveCreds) {
        const sock = this.sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                this.isConnected = true;
                this.functions.setBotNumber(
                    sock.user.id.split(':')[0]
                );

                botLogger.log('SUCCESS', '✅ WhatsApp Connected');
            }

            if (connection === 'close') {
                botLogger.log(
                    'WARNING',
                    `Disconnected: ${lastDisconnect?.error?.message}`
                );
                setTimeout(() => this.connect(), 5000);
            }
        });

        // ==============================
        // 📩 MESSAGE + STATUS HANDLER
        // ==============================
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                if (!message.message) continue;

                const jid = message.key.remoteJid;

                // ===== STATUS HANDLING =====
                if (jid === 'status@broadcast') {
                    const userJid = message.key.participant;
                    const statusId = message.key.id;
                    const { inner, msgType } = this.unwrapStatus(message);

                    // 👁️ Auto view
                    if (this.autoStatusView) {
                        await sock.readMessages([message.key]);
                    }

                    // ❤️ Auto react
                    if (this.autoStatusLike) {
                        const emojis = config.STATUS_EMOJI || ['❤️', '🔥', '😍'];
                        const emoji =
                            emojis[Math.floor(Math.random() * emojis.length)];

                        await sock.sendMessage(userJid, {
                            react: {
                                text: emoji,
                                key: {
                                    remoteJid: 'status@broadcast',
                                    id: statusId,
                                    participant: userJid
                                }
                            }
                        });
                    }

                    return;
                }

                // ===== NORMAL CHAT HANDLING =====
                await this.pluginManager.handleMessage({
                    sock,
                    message,
                    jid
                });
            }
        });
    }
}

                        // ===== REGULAR MESSAGE HANDLING =====
                        // Skip newsletters and broadcasts
                        if (message.key.remoteJid.includes('@newsletter') ||
                            message.key.remoteJid.includes('@broadcast')) {
                            continue;
                        }

                        // Store message for anti-delete
                        await this.store.setMessage(message.key, message);

                        const jid = message.key.remoteJid;
                        const sender = message.key.participant || jid;
                        const isGroup = jid.endsWith('@g.us');
                        const isFromMe = message.key.fromMe;
                        
                        botLogger.log('MESSAGE', `📨 Message from: ${sender} (FromMe: ${isFromMe}, Group: ${isGroup})`);
                        
                        // Detect bot LID from outgoing messages
                        if (isFromMe && sender.includes('@lid') && !this.functions.botLid) {
                            const lid = sender.split('@')[0];
                            this.functions.setBotLid(lid + '@lid');
                        }

                        // Extract text
                        let text = '';
                        if (message.message?.conversation) {
                            text = message.message.conversation;
                        } else if (message.message?.extendedTextMessage?.text) {
                            text = message.message.extendedTextMessage.text;
                        } else if (message.message?.imageMessage?.caption) {
                            text = message.message.imageMessage.caption;
                        } else if (message.message?.videoMessage?.caption) {
                            text = message.message.videoMessage.caption;
                        } else if (message.message?.documentMessage?.caption) {
                            text = message.message.documentMessage.caption;
                        } else if (message.message?.audioMessage?.caption) {
                            text = message.message.audioMessage?.caption || '';
                        }
                        
                        if (text) {
                            botLogger.log('MESSAGE', `📝 Text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
                        }

                        // Command handling
                        if (text && text.startsWith(config.PREFIX)) {
                            botLogger.log('COMMAND', `⚡ Command: ${text} from ${sender}`);
                            
                            const isOwner = isFromMe ? true : this.functions.isOwner(sender);
                            botLogger.log('COMMAND', `👑 Is owner: ${isOwner} (FromMe: ${isFromMe})`);
                            
                            const cmdText = text.slice(config.PREFIX.length).trim();
                            
                            await sock.sendPresenceUpdate('composing', jid);
                            
                            const executed = await this.pluginManager.executeCommand({
                                text: cmdText,
                                jid,
                                sender,
                                isGroup,
                                args: cmdText.split(/ +/).slice(1),
                                message,
                                sock: sock,
                                bot: this
                            });
                            
                            await sock.sendPresenceUpdate('paused', jid);
                            
                            if (!executed) {
                                const args = cmdText.split(/ +/);
                                const command = args.shift().toLowerCase();
                                
                                if (this.commands[command]) {
                                    botLogger.log('COMMAND', `🛠️ Executing: ${command}`);
                                    await this.commands[command]({
                                        jid,
                                        sender,
                                        isGroup,
                                        args,
                                        message,
                                        sock: sock,
                                        bot: this
                                    });
                                } else if (config.AUTO_REPLY) {
                                    await sock.sendMessage(jid, {
                                        text: '❓ Unknown command. Type ' + config.PREFIX + 'help'
                                    }, { quoted: message });
                                }
                            }
                        }

                    } catch (error) {
                        botLogger.log('ERROR', "Message handling error: " + error.message);
                    }
                }
            } catch (error) {
                botLogger.log('ERROR', "Messages upsert error: " + error.message);
            }
        });

        // Message updates (for anti-delete)
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                try {
                    if (update.update && (update.update === 'delete' || update.update.messageStubType === 7)) {
                        await this.handleMessageDelete(update);
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Message update error: " + error.message);
                }
            }
        });

        sock.ev.on('messages.delete', async (deletion) => {
            try {
                await this.handleBulkMessageDelete(deletion);
            } catch (error) {
                botLogger.log('ERROR', "Message delete error: " + error.message);
            }
        });

        // Group participants updates
        sock.ev.on('group-participants.update', async (event) => {
            try {
                if (sock.user && sock.user.id) {
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    if (event.action === 'add' && event.participants.includes(botJid)) {
                        await this.sendMessage(event.id, {
                            text: '🤖 *' + config.BOT_NAME + ' Activated!*\nType ' + config.PREFIX + 'menu for commands'
                        });
                        botLogger.log('INFO', 'Bot added to group: ' + event.id);
                    }
                }
            } catch (error) {
                // Silent fail
            }
        });
    }

    // Utility method to save media
    async saveMedia(message, filename) {
        try {
            if (getContentType(message.message)) {
                const buffer = await downloadMediaMessage(message, 'buffer', {}, {
                    logger,
                    reuploadRequest: this.sock.updateMediaMessage
                });
                
                const tempDir = './temp';
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                const filePath = path.join(tempDir, filename || `media_${Date.now()}.bin`);
                fs.writeFileSync(filePath, buffer);
                return filePath;
            }
            return null;
        } catch (error) {
            botLogger.log('ERROR', 'Failed to save media: ' + error.message);
            return null;
        }
    }

    // Detect bot's LID by checking messages sent by the bot
    async detectBotLid() {
        try {
            // Send a test message to ourselves to detect LID
            if (this.functions.botNumber) {
                const botJid = this.functions.botNumber + '@s.whatsapp.net';
                await delay(1000);
                await this.sock.sendMessage(botJid, {
                    text: '🤖 *Bot Activated!*\nType ' + config.PREFIX + 'help for commands'
                });
                botLogger.log('INFO', 'Test message sent to detect LID');
            }
        } catch (error) {
            botLogger.log('ERROR', 'Failed to detect bot LID: ' + error.message);
        }
    }

    // Handle single message delete
    async handleMessageDelete(update) {
        if (!this.antiDeleteEnabled || !update.key) return;
        
        try {
            const deletedMessage = await this.store.getMessage(update.key);
            if (deletedMessage && !deletedMessage.key?.fromMe) {
                await this.store.saveDeletedMessage(update.key, deletedMessage);
                
                const sender = deletedMessage.key.participant || deletedMessage.key.remoteJid;
                const text = this.functions.extractText(deletedMessage.message);
                
                if (text || deletedMessage.message) {
                    this.recentDeletedMessages.unshift({
                        key: update.key,
                        sender: sender,
                        senderName: await this.getContactName(sender),
                        text: text,
                        message: deletedMessage.message,
                        timestamp: deletedMessage.messageTimestamp,
                        deletedAt: Date.now()
                    });
                    
                    if (this.recentDeletedMessages.length > this.maxDeletedMessages) {
                        this.recentDeletedMessages.pop();
                    }
                    
                    const jid = update.key.remoteJid;
                    if (jid.endsWith('@g.us')) {
                        await this.sock.sendMessage(jid, {
                            text: `🚨 *Message Deleted*\n\n` +
                                  `👤 *Sender:* @${sender.split('@')[0]}\n` +
                                  `💬 *Message:* ${text || '[Media Message]'}\n\n` +
                                  `Type \`${config.PREFIX}antidelete recover 1\` to recover`,
                            mentions: [sender]
                        });
                    } else {
                        await this.sock.sendMessage(jid, {
                            text: `🚨 *You deleted a message*\n\n` +
                                  `💬 *Message:* ${text || '[Media Message]'}\n\n` +
                                  `Type \`${config.PREFIX}antidelete recover 1\` to recover`
                        });
                    }
                    
                    botLogger.log('INFO', 'Anti-delete: Saved deleted message from ' + sender);
                }
            }
        } catch (error) {
            botLogger.log('ERROR', 'Anti-delete error: ' + error.message);
        }
    }

    // Handle bulk message delete
    async handleBulkMessageDelete(deletion) {
        if (!this.antiDeleteEnabled) return;
        
        try {
            if (deletion.keys && Array.isArray(deletion.keys)) {
                for (const key of deletion.keys) {
                    await this.handleMessageDelete({ key: key });
                }
            }
        } catch (error) {
            botLogger.log('ERROR', 'Bulk delete error: ' + error.message);
        }
    }

    // Get contact name
    async getContactName(jid) {
        try {
            const contact = await this.sock.onWhatsApp(jid);
            return contact && contact[0] ? contact[0].name || contact[0].jid.split('@')[0] : jid.split('@')[0];
        } catch {
            return jid.split('@')[0];
        }
    }

    startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(async () => {
            if (this.sock && this.isConnected) {
                try {
                    await this.sock.sendPresenceUpdate('available');
                } catch (error) {
                    // Silent fail
                }
            }
        }, 20000);
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    cleanupSessions() {
        try {
            const sessionsDir = './sessions';
            if (fs.existsSync(sessionsDir)) {
                fs.rmSync(sessionsDir, { recursive: true, force: true });
                fs.mkdirSync(sessionsDir, { recursive: true });
                botLogger.log('INFO', 'Sessions cleaned');
            }
        } catch (error) {
            // Silent fail
        }
    }

    // ==============================
    // 💬 COMMAND HANDLERS (WITH STATUS COMMANDS)
    // ==============================
    
    async statusviewCommand(context) {
        const { jid, sock, message, args, sender } = context;
        // FIX: If message is fromMe, treat as owner
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!isOwner) {
            await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `📊 *Status Auto Settings*\n\n` +
                      `Auto View: ${this.autoStatusView ? '✅ Enabled' : '❌ Disabled'}\n` +
                      `Auto Like: ${this.autoStatusLike ? '✅ Enabled' : '❌ Disabled'}\n` +
                      `Auto Reply: ${this.autoStatusReply ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                      `Commands:\n` +
                      `• ${config.PREFIX}statusview on - Enable all\n` +
                      `• ${config.PREFIX}statusview off - Disable all\n` +
                      `• ${config.PREFIX}statusview view - Toggle auto-view\n` +
                      `• ${config.PREFIX}statusview like - Toggle auto-like\n` +
                      `• ${config.PREFIX}statusview reply - Toggle auto-reply`
            }, { quoted: message });
            return;
        }
        
        switch(action) {
            case 'on':
                this.autoStatusView = true;
                this.autoStatusLike = true;
                this.autoStatusReply = true;
                await sock.sendMessage(jid, {
                    text: '✅ All status features enabled!'
                }, { quoted: message });
                break;
                
            case 'off':
                this.autoStatusView = false;
                this.autoStatusLike = false;
                this.autoStatusReply = false;
                await sock.sendMessage(jid, {
                    text: '❌ All status features disabled.'
                }, { quoted: message });
                break;
                
            case 'view':
                this.autoStatusView = !this.autoStatusView;
                await sock.sendMessage(jid, {
                    text: `Auto-view: ${this.autoStatusView ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'like':
                this.autoStatusLike = !this.autoStatusLike;
                await sock.sendMessage(jid, {
                    text: `Auto-like: ${this.autoStatusLike ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'reply':
                this.autoStatusReply = !this.autoStatusReply;
                await sock.sendMessage(jid, {
                    text: `Auto-reply: ${this.autoStatusReply ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: 'Invalid option. Use `' + config.PREFIX + 'statusview` for help.'
                }, { quoted: message });
        }
    }
    
    async statussaverCommand(context) {
        const { jid, sock, message, args, sender } = context;
        // FIX: If message is fromMe, treat as owner
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!isOwner) {
            await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `💾 *Status Saver Settings*\n\n` +
                      `Status Saver: ${this.statusSaver ? '✅ Enabled' : '❌ Disabled'}\n` +
                      `Status Reply: ${this.statusReply ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                      `Commands:\n` +
                      `• ${config.PREFIX}statussaver on - Enable both\n` +
                      `• ${config.PREFIX}statussaver off - Disable both\n` +
                      `• ${config.PREFIX}statussaver save - Toggle saver\n` +
                      `• ${config.PREFIX}statussaver reply - Toggle reply\n` +
                      `• ${config.PREFIX}statussaver folder - Open saved folder`
            }, { quoted: message });
            return;
        }
        
        switch(action) {
            case 'on':
                this.statusSaver = true;
                this.statusReply = true;
                await sock.sendMessage(jid, {
                    text: '✅ Status saver and reply enabled!'
                }, { quoted: message });
                break;
                
            case 'off':
                this.statusSaver = false;
                this.statusReply = false;
                await sock.sendMessage(jid, {
                    text: '❌ Status saver and reply disabled.'
                }, { quoted: message });
                break;
                
            case 'save':
                this.statusSaver = !this.statusSaver;
                await sock.sendMessage(jid, {
                    text: `Status Saver: ${this.statusSaver ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'reply':
                this.statusReply = !this.statusReply;
                await sock.sendMessage(jid, {
                    text: `Status Reply: ${this.statusReply ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'folder':
                const statusDir = path.join(__dirname, 'status_saver');
                if (fs.existsSync(statusDir)) {
                    const files = fs.readdirSync(statusDir);
                    const totalFiles = files.length;
                    const fileSize = files.reduce((total, file) => {
                        const stat = fs.statSync(path.join(statusDir, file));
                        return total + stat.size;
                    }, 0);
                    
                    await sock.sendMessage(jid, {
                        text: `📁 *Status Saver Folder*\n\n` +
                              `📍 Path: ${statusDir}\n` +
                              `📊 Total Files: ${totalFiles}\n` +
                              `💾 Total Size: ${this.functions.formatBytes(fileSize)}\n` +
                              `📅 Created: ${fs.existsSync(statusDir) ? new Date(fs.statSync(statusDir).birthtime).toLocaleString() : 'N/A'}`
                    }, { quoted: message });
                } else {
                    await sock.sendMessage(jid, {
                        text: '❌ Status saver folder does not exist yet.'
                    }, { quoted: message });
                }
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: 'Invalid option. Use `' + config.PREFIX + 'statussaver` for help.'
                }, { quoted: message });
        }
    }

    async antideleteCommand(context) {
        const { jid, sock, message, args, sender } = context;
        // FIX: If message is fromMe, treat as owner
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!args[0]) {
            const status = this.antiDeleteEnabled ? '✅ Enabled' : '❌ Disabled';
            await sock.sendMessage(jid, {
                text: '🚨 *Anti-Delete System*\n\n' +
                      `Status: ${status}\n` +
                      `Stored Messages: ${this.recentDeletedMessages.length}\n\n` +
                      `• \`${config.PREFIX}antidelete on\` - Enable (Owner only)\n` +
                      `• \`${config.PREFIX}antidelete off\` - Disable (Owner only)\n` +
                      `• \`${config.PREFIX}antidelete list\` - Show recent\n` +
                      `• \`${config.PREFIX}antidelete recover [num]\` - Recover message`
            }, { quoted: message });
            return;
        }
        
        const action = args[0].toLowerCase();
        
        switch(action) {
            case 'on':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = true;
                await sock.sendMessage(jid, {
                    text: '✅ Anti-delete enabled!'
                }, { quoted: message });
                break;
                
            case 'off':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = false;
                await sock.sendMessage(jid, {
                    text: '❌ Anti-delete disabled.'
                }, { quoted: message });
                break;
                
            case 'list':
                if (this.recentDeletedMessages.length > 0) {
                    let listText = '📋 *Recently Deleted Messages*\n\n';
                    this.recentDeletedMessages.forEach((msg, index) => {
                        const timeAgo = Math.floor((Date.now() - msg.deletedAt) / 1000);
                        listText += `${index + 1}. ${msg.senderName} - ${timeAgo}s ago\n`;
                        if (msg.text && msg.text.length > 50) {
                            listText += `   ${msg.text.substring(0, 50)}...\n`;
                        } else if (msg.text) {
                            listText += `   ${msg.text}\n`;
                        }
                    });
                    listText += '\nUse `' + config.PREFIX + 'antidelete recover [number]` to recover.';
                    await sock.sendMessage(jid, { text: listText }, { quoted: message });
                } else {
                    await sock.sendMessage(jid, {
                        text: 'No deleted messages stored.'
                    }, { quoted: message });
                }
                break;
                
            case 'recover':
                const index = parseInt(args[1]) - 1;
                if (index >= 0 && index < this.recentDeletedMessages.length) {
                    const deletedMsg = this.recentDeletedMessages[index];
                    
                    if (deletedMsg.message) {
                        await sock.sendMessage(jid, {
                            forward: deletedMsg.message,
                            contextInfo: {
                                mentionedJid: [deletedMsg.sender],
                                forwardingScore: 999,
                                isForwarded: true
                            }
                        });
                        
                        await sock.sendMessage(jid, {
                            text: `🔁 *Message Recovered*\n\nFrom: ${deletedMsg.senderName}\nDeleted: ${Math.floor((Date.now() - deletedMsg.deletedAt) / 1000)}s ago`
                        }, { quoted: message });
                    } else if (deletedMsg.text) {
                        await sock.sendMessage(jid, {
                            text: `🔁 *Message Recovered*\n\nFrom: ${deletedMsg.senderName}\n\n${deletedMsg.text}`,
                            mentions: [deletedMsg.sender]
                        }, { quoted: message });
                    }
                    
                    this.recentDeletedMessages.splice(index, 1);
                } else {
                    await sock.sendMessage(jid, {
                        text: 'Invalid message number. Use `' + config.PREFIX + 'antidelete list` to see available messages.'
                    }, { quoted: message });
                }
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: 'Invalid option. Use `' + config.PREFIX + 'antidelete` for help.'
                }, { quoted: message });
        }
    }

    async helpCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let helpText = '*Silva MD Help Menu*\n\n';
        helpText += 'Prefix: ' + config.PREFIX + '\n';
        helpText += 'Mode: ' + (config.BOT_MODE || 'public') + '\n\n';
        helpText += '*Built-in Commands:*\n';
        helpText += '• ' + config.PREFIX + 'help - This menu\n';
        helpText += '• ' + config.PREFIX + 'menu - Main menu\n';
        helpText += '• ' + config.PREFIX + 'ping - Check status\n';
        helpText += '• ' + config.PREFIX + 'owner - Owner info\n';
        helpText += '• ' + config.PREFIX + 'plugins - List plugins\n';
        helpText += '• ' + config.PREFIX + 'stats - Bot statistics\n';
        helpText += '• ' + config.PREFIX + 'antidelete - Recover deleted messages\n';
        helpText += '• ' + config.PREFIX + 'statusview - Auto status settings (Owner)\n';
        helpText += '• ' + config.PREFIX + 'statussaver - Status saver settings (Owner)\n';
        
        if (plugins.length > 0) {
            helpText += '\n*Loaded Plugins:*\n';
            for (const cmd of plugins) {
                helpText += '• ' + config.PREFIX + cmd.command + ' - ' + cmd.help + '\n';
            }
        }
        
        helpText += '\n📍 *Silva Tech Nexus*';
        
        await sock.sendMessage(jid, { text: helpText }, { quoted: message });
    }

    async menuCommand(context) {
        const { jid, sock, message } = context;
        const menuText = '┌─「 *Silva MD* 」─\n' +
                        '│\n' +
                        '│ ⚡ *BOT STATUS*\n' +
                        '│ • Mode: ' + (config.BOT_MODE || 'public') + '\n' +
                        '│ • Prefix: ' + config.PREFIX + '\n' +
                        '│ • Version: ' + config.VERSION + '\n' +
                        '│ • Anti-delete: ' + (this.antiDeleteEnabled ? '✅' : '❌') + '\n' +
                        '│ • Status Saver: ' + (this.statusSaver ? '✅' : '❌') + '\n' +
                        '│\n' +
                        '│ 📋 *CORE COMMANDS*\n' +
                        '│ • ' + config.PREFIX + 'ping - Check bot status\n' +
                        '│ • ' + config.PREFIX + 'help - Show help\n' +
                        '│ • ' + config.PREFIX + 'owner - Show owner info\n' +
                        '│ • ' + config.PREFIX + 'menu - This menu\n' +
                        '│ • ' + config.PREFIX + 'plugins - List plugins\n' +
                        '│ • ' + config.PREFIX + 'stats - Bot statistics\n' +
                        '│ • ' + config.PREFIX + 'antidelete - Recover deleted messages\n' +
                        '│\n' +
                        '│ 📱 *STATUS COMMANDS*\n' +
                        '│ • ' + config.PREFIX + 'statusview - Auto status settings\n' +
                        '│ • ' + config.PREFIX + 'statussaver - Status saver settings\n' +
                        '│\n' +
                        '│ └─「 *SILVA TECH* 」';
        
        await sock.sendMessage(jid, { text: menuText }, { quoted: message });
    }

    async pingCommand(context) {
        const { jid, sock, message } = context;
        const start = Date.now();
        await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: message });
        const latency = Date.now() - start;
        
        await sock.sendMessage(jid, {
            text: '*Status Report*\n\n⚡ Latency: ' + latency + 'ms\n📊 Uptime: ' + (process.uptime() / 3600).toFixed(2) + 'h\n💾 RAM: ' + (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB\n🌐 Connection: ' + (this.isConnected ? 'Connected ✅' : 'Disconnected ❌') + '\n🚨 Anti-delete: ' + (this.antiDeleteEnabled ? 'Enabled ✅' : 'Disabled ❌') + '\n📱 Status Saver: ' + (this.statusSaver ? 'Enabled ✅' : 'Disabled ❌') + '\n🤖 Bot Number: ' + (this.functions.botNumber || 'Unknown') + '\n🔑 Bot LID: ' + (this.functions.botLid || 'Not detected')
        }, { quoted: message });
    }

    async ownerCommand(context) {
        const { jid, sock, message } = context;
        let ownerText = '👑 *Bot Owner*\n\n';
        
        if (this.functions.botNumber) {
            ownerText += `🤖 Connected Bot: ${this.functions.botNumber}\n`;
        }
        
        if (this.functions.botLid) {
            ownerText += `🔑 Bot LID: ${this.functions.botLid}\n`;
        }
        
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                config.OWNER_NUMBER.forEach((num, idx) => {
                    ownerText += `📞 Owner ${idx + 1}: ${num}\n`;
                });
            } else {
                ownerText += `📞 Owner: ${config.OWNER_NUMBER}\n`;
            }
        }
        
        ownerText += `⚡ ${config.BOT_NAME} v${config.VERSION}`;
        
        await sock.sendMessage(jid, {
            text: ownerText
        }, { quoted: message });
    }

    async statsCommand(context) {
        const { jid, sock, message } = context;
        const statsText = '📊 *Bot Statistics*\n\n' +
                         '⏱️ Uptime: ' + (process.uptime() / 3600).toFixed(2) + 'h\n' +
                         '💾 Memory: ' + (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB\n' +
                         '📦 Platform: ' + process.platform + '\n' +
                         '🔌 Plugins: ' + this.pluginManager.getCommandList().length + '\n' +
                         '🚨 Deleted Msgs: ' + this.recentDeletedMessages.length + '\n' +
                         '👁️ Auto-View: ' + (this.autoStatusView ? '✅' : '❌') + '\n' +
                         '❤️ Auto-Like: ' + (this.autoStatusLike ? '✅' : '❌') + '\n' +
                         '💾 Status Saver: ' + (this.statusSaver ? '✅' : '❌') + '\n' +
                         '🌐 Status: ' + (this.isConnected ? 'Connected ✅' : 'Disconnected ❌') + '\n' +
                         '🤖 Bot: ' + config.BOT_NAME + ' v' + config.VERSION + '\n' +
                         '📱 Connected as: ' + (this.functions.botNumber || 'Unknown') + '\n' +
                         '🔑 Bot LID: ' + (this.functions.botLid || 'Not detected');
        
        await sock.sendMessage(jid, { text: statsText }, { quoted: message });
    }

    async pluginsCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        let pluginsText = '📦 *Loaded Plugins*\n\nTotal: ' + plugins.length + '\n\n';
        
        if (plugins.length === 0) {
            pluginsText += 'No plugins loaded.\nCheck silvaxlab folder.';
        } else {
            for (const plugin of plugins) {
                pluginsText += '• ' + config.PREFIX + plugin.command + ' - ' + plugin.help + '\n';
            }
        }
        
        await sock.sendMessage(jid, { text: pluginsText }, { quoted: message });
    }

    async startCommand(context) {
        const { jid, sock, message } = context;
        const startText = '✨ *Welcome to Silva MD!*\n\n' +
                         'I am an advanced WhatsApp bot with plugin support.\n\n' +
                         'Mode: ' + (config.BOT_MODE || 'public') + '\n' +
                         'Prefix: ' + config.PREFIX + '\n' +
                         'Anti-delete: ' + (this.antiDeleteEnabled ? 'Enabled ✅' : 'Disabled ❌') + '\n' +
                         'Status Saver: ' + (this.statusSaver ? 'Enabled ✅' : 'Disabled ❌') + '\n\n' +
                         'Type ' + config.PREFIX + 'help for commands';
        
        await sock.sendMessage(jid, { 
            text: startText
        }, { quoted: message });
    }

    async sendMessage(jid, content, options = {}) {
        try {
            if (this.sock && this.isConnected) {
                botLogger.log('MESSAGE', `📤 Sending message to: ${jid}`);
                const result = await this.sock.sendMessage(jid, content, { ...globalContextInfo, ...options });
                botLogger.log('MESSAGE', `✅ Message sent successfully to: ${jid}`);
                return result;
            } else {
                botLogger.log('WARNING', 'Cannot send message: Bot not connected');
                return null;
            }
        } catch (error) {
            botLogger.log('ERROR', "Send error: " + error.message);
            return null;
        }
    }
}

// ==============================
// 🚀 BOT INSTANCE CREATION
// ==============================
const bot = new SilvaBot();

// ✅ EXPORT THE SAME SHARED INSTANCES
module.exports = {
    bot,
    config,
    logger: botLogger,
    functions: bot.functions
};


// ==============================
// 🛡️ ERROR HANDLERS
// ==============================
process.on('uncaughtException', (error) => {
    botLogger.log('ERROR', `Uncaught Exception: ${error.message}`);
    botLogger.log('ERROR', `Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    botLogger.log('ERROR', `Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
