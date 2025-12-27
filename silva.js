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
    proto,
    isJidBroadcast,
    isJidStatusBroadcast,
    isJidGroup
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
// 🪵 LOGGER SECTION (OPTIMIZED)
// ==============================
const logger = pino({
    level: 'silent' // Suppress Baileys internal logs
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
            EVENT: '\x1b[96m',
            WARN: '\x1b[33m',
            RESET: '\x1b[0m'
        };
        
        // Only log important messages in production
        if (!config.DEBUG_MODE && type === 'DEBUG') return;
        
        console.log(`${colors[type] || colors.INFO}[${type}] ${timestamp} - ${message}${colors.RESET}`);
    }
}

const botLogger = new BotLogger();

// Helper function for logging
function logMessage(type, message) {
    botLogger.log(type, message);
}

// ==============================
// 🔐 SESSION MANAGEMENT
// ==============================
async function loadSession() {
    try {
        const credsPath = './sessions/creds.json';
        
        if (!fs.existsSync('./sessions')) {
            fs.mkdirSync('./sessions', { recursive: true });
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
// 🔧 UTILITY FUNCTIONS
// ==============================
class FunctionsWrapper {
    constructor() {
        this.tempDir = path.join(__dirname, './temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        this.botNumber = null;
        this.botLid = null;
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
        let phoneNumber = '';
        let isLid = false;
        
        if (sender.includes('@lid')) {
            phoneNumber = sender.split('@')[0];
            isLid = true;
        } else if (sender.includes('@s.whatsapp.net')) {
            phoneNumber = sender.split('@')[0];
        } else if (sender.includes(':')) {
            phoneNumber = sender.split(':')[0];
        } else {
            phoneNumber = sender;
        }
        
        const cleanSender = phoneNumber.replace(/[^0-9]/g, '');
        
        if (isLid && this.botLid) {
            const cleanBotLid = this.botLid.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotLid) {
                return true;
            }
        }
        
        if (this.botNumber) {
            const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotNum) {
                return true;
            }
        }
        
        let ownerNumbers = [];
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                ownerNumbers = config.OWNER_NUMBER.map(num => num.replace(/[^0-9]/g, ''));
            } else if (typeof config.OWNER_NUMBER === 'string') {
                const cleanNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
                ownerNumbers = [cleanNum];
            }
        }
        
        if (config.CONNECTED_NUMBER) {
            const connectedNumber = config.CONNECTED_NUMBER.replace(/[^0-9]/g, '');
            ownerNumbers.push(connectedNumber);
        }
        
        ownerNumbers = [...new Set(ownerNumbers)];
        
        const isOwner = ownerNumbers.some(ownerNum => {
            return cleanSender === ownerNum || 
                   cleanSender.endsWith(ownerNum) || 
                   ownerNum.endsWith(cleanSender);
        });
        
        return isOwner;
    }

    setBotNumber(number) {
        if (number) {
            this.botNumber = number.replace(/[^0-9]/g, '');
            botLogger.log('INFO', `🤖 Bot connected as: ${this.botNumber}`);
        }
    }

    setBotLid(lid) {
        if (lid) {
            this.botLid = lid.split('@')[0];
            botLogger.log('INFO', `🔑 Bot LID detected: ${this.botLid}`);
        }
    }

    isAllowed(sender, jid) {
        if (this.isOwner(sender)) {
            return true;
        }
        
        if (config.BOT_MODE === 'public') return true;
        
        if (config.BOT_MODE === 'private') {
            if (jid.endsWith('@g.us')) return true;
            
            if (config.ALLOWED_USERS && Array.isArray(config.ALLOWED_USERS)) {
                const senderNumber = sender.split('@')[0].replace(/[^0-9]/g, '');
                const allowedNumbers = config.ALLOWED_USERS.map(num => num.replace(/[^0-9]/g, ''));
                return allowedNumbers.includes(senderNumber);
            }
            return false;
        }
        
        return true;
    }

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

    formatJid(number) {
        if (!number) return null;
        const cleaned = number.replace(/[^0-9]/g, '');
        if (cleaned.length < 10) return null;
        return cleaned + '@s.whatsapp.net';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==============================
// 📊 STATUS HELPER FUNCTIONS
// ==============================
function unwrapStatus(m) {
    try {
        const inner = m.message;
        const msgType = getContentType(inner);
        return { inner, msgType };
    } catch (error) {
        return { inner: null, msgType: null };
    }
}

async function saveMedia(m, msgType, sock, caption) {
    try {
        const buffer = await downloadMediaMessage(m, 'buffer', {}, {
            logger,
            reuploadRequest: sock.updateMediaMessage
        });
        
        const tempDir = './temp';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const ext = msgType === 'imageMessage' ? 'jpg' : msgType === 'videoMessage' ? 'mp4' : 'bin';
        const filename = `status_${Date.now()}.${ext}`;
        const filePath = path.join(tempDir, filename);
        
        fs.writeFileSync(filePath, buffer);
        
        // Send to saved messages
        if (msgType === 'imageMessage') {
            await sock.sendMessage(sock.user.id, {
                image: buffer,
                caption: caption
            });
        } else if (msgType === 'videoMessage') {
            await sock.sendMessage(sock.user.id, {
                video: buffer,
                caption: caption
            });
        } else if (msgType === 'audioMessage') {
            await sock.sendMessage(sock.user.id, {
                audio: buffer,
                mimetype: 'audio/mp4',
                caption: caption
            });
        }
        
        return filePath;
    } catch (error) {
        logMessage('ERROR', `saveMedia error: ${error.message}`);
        return null;
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
                        
                        if (config.DEBUG_MODE) {
                            botLogger.log('SUCCESS', "✅ Loaded plugin: " + file.replace('.js', ''));
                        }
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Failed to load plugin " + file + ": " + error.message);
                }
            }
            
            botLogger.log('SUCCESS', `✅ Loaded ${this.commandHandlers.size} plugins successfully`);
        } catch (error) {
            botLogger.log('ERROR', "Plugin loading error: " + error.message);
        }
    }

    async executeCommand(context) {
        const { text, jid, sender, isGroup, message, sock, args } = context;
        
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
                    if (handler.owner && !this.functions.isOwner(sender)) {
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
                    
                    botLogger.log('COMMAND', `✅ Executing: ${commandMatch}`);
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
// 🤖 MAIN BOT CLASS (OPTIMIZED)
// ==============================
class SilvaBot {
    constructor() {
        this.sock = null;
        this.store = new MessageStore();
        this.groupCache = new NodeCache({ stdTTL: 600, useClones: false });
        this.pluginManager = new PluginManager();
        this.isConnected = false;
        this.functions = new FunctionsWrapper();
        
        this.antiDeleteEnabled = config.ANTIDELETE || true;
        this.recentDeletedMessages = [];
        this.maxDeletedMessages = 20;
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.keepAliveInterval = null;
        
        // Decryption error tracking
        this.failedDecryptions = new Set();
        this.maxFailedDecryptions = 100;
        
        this.commands = {
            help: this.helpCommand.bind(this),
            menu: this.menuCommand.bind(this),
            ping: this.pingCommand.bind(this),
            owner: this.ownerCommand.bind(this),
            stats: this.statsCommand.bind(this),
            plugins: this.pluginsCommand.bind(this),
            start: this.startCommand.bind(this),
            antidelete: this.antideleteCommand.bind(this)
        };
    }

    async init() {
        try {
            botLogger.log('BOT', "🚀 Starting " + config.BOT_NAME + " v" + config.VERSION);
            botLogger.log('INFO', "Mode: " + (config.BOT_MODE || 'public'));
            botLogger.log('INFO', "Prefix: " + config.PREFIX);
            
            if (config.SESSION_ID) {
                await loadSession();
            }

            await this.pluginManager.loadPlugins('silvaxlab');
            await this.connect();
        } catch (error) {
            botLogger.log('ERROR', "Init failed: " + error.message);
            setTimeout(() => this.init(), 10000);
        }
    }

    async connect() {
        try {
            this.reconnectAttempts++;
            
            if (this.reconnectAttempts > this.maxReconnectAttempts) {
                botLogger.log('ERROR', 'Max reconnection attempts reached');
                this.reconnectAttempts = 0;
                setTimeout(() => this.init(), 30000);
                return;
            }

            const { state, saveCreds } = await useMultiFileAuthState('./sessions');
            const { version } = await fetchLatestBaileysVersion();
            
            this.sock = makeWASocket({
                version,
                logger: logger,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                browser: Browsers.macOS(config.BOT_NAME),
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                defaultQueryTimeoutMs: 60000,
                cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
                retryRequestDelayMs: 3000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                emitOwnEvents: true,
                fireInitQueries: true,
                mobile: false,
                // ✅ FIX: Only ignore regular broadcast, allow status@broadcast and newsletters
                shouldIgnoreJid: (jid) => {
                    if (!jid || typeof jid !== 'string') return false;
                    return jid.endsWith('@broadcast') && jid !== 'status@broadcast';
                },
                getMessage: async (key) => {
                    try {
                        return await this.store.getMessage(key);
                    } catch (error) {
                        return null;
                    }
                },
                printQRInTerminal: !config.SESSION_ID
            });

            this.setupEvents(saveCreds);
            botLogger.log('SUCCESS', '✅ Bot initialized');
            this.reconnectAttempts = 0;
        } catch (error) {
            botLogger.log('ERROR', "Connection error: " + error.message);
            await this.handleReconnect(error);
        }
    }

    async handleReconnect(error) {
        const delayTime = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        botLogger.log('WARNING', "Reconnecting in " + (delayTime/1000) + "s");
        
        await this.functions.sleep(delayTime);
        await this.connect();
    }

    setupEvents(saveCreds) {
        const sock = this.sock;

        // ✅ Suppress decryption errors
        sock.ev.on('CB:ib,,dirty', () => {});
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                botLogger.log('INFO', '📱 QR Code Generated');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                this.isConnected = false;
                this.stopKeepAlive();
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.message;
                
                botLogger.log('WARNING', "Connection closed. Status: " + statusCode);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    botLogger.log('ERROR', 'Logged out. Please scan QR again.');
                    this.cleanupSessions();
                    setTimeout(() => this.init(), 10000);
                } else {
                    await this.handleReconnect(lastDisconnect?.error);
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                botLogger.log('SUCCESS', '🔗 Connected to WhatsApp');
                
                if (sock.user && sock.user.id) {
                    const botNumber = sock.user.id.split(':')[0];
                    this.functions.setBotNumber(botNumber);
                }
                
                this.startKeepAlive();
                
                // ✅ Follow newsletters
                await this.followNewsletters();
                
                // Send connection message to owner
                await this.sendOwnerConnectedMessage();
            }
        });

        // === ONE consolidated messages.upsert handler ===
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (!Array.isArray(messages) || messages.length === 0) return;

                // Process only real-time messages
                if (type && !['notify', 'append'].includes(type)) return;

                for (const m of messages) {
                    // ---- STATUS handling (status@broadcast)
                    if (m.key.remoteJid === 'status@broadcast') {
                        await this.handleStatus(m);
                        continue;
                    }

                    // ---- For other messages
                    if (!m.message) continue;

                    const sender = m.key.remoteJid;
                    const isGroupMsg = isJidGroup(sender);
                    const isNewsletter = sender && sender.endsWith && sender.endsWith('@newsletter');
                    const isBroadcast = isJidBroadcast(sender) || isJidStatusBroadcast(sender);

                    // Skip broadcasts (but not status or newsletters)
                    if (isBroadcast && sender !== 'status@broadcast') continue;

                    // Auto-react to newsletters
                    if (isNewsletter && config.AUTO_REACT_NEWSLETTER) {
                        try {
                            const emojis = ['🤖','🔥','💫','❤️','👍','💯','✨','👏','😎'];
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            await sock.sendMessage(m.key.remoteJid, {
                                react: { text: randomEmoji, key: m.key }
                            });
                            botLogger.log('INFO', `✅ Reacted to newsletter`);
                        } catch (e) {
                            // Silent fail
                        }
                    }

                    // Handle regular messages (commands, etc.)
                    await this.handleMessages({ messages: [m], type });
                }
            } catch (error) {
                if (config.DEBUG_MODE) {
                    botLogger.log('ERROR', "Messages upsert error: " + error.message);
                }
            }
        });

        // Handle message updates
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                try {
                    if (update.update && (update.update === 'delete' || update.update.messageStubType === 7)) {
                        await this.handleMessageDelete(update);
                    }
                } catch (error) {
                    // Silent fail
                }
            }
        });

        // Handle message delete events
        sock.ev.on('messages.delete', async (deletion) => {
            try {
                await this.handleBulkMessageDelete(deletion);
            } catch (error) {
                // Silent fail
            }
        });

        // Handle group participants updates
        sock.ev.on('group-participants.update', async (event) => {
            try {
                if (this.sock.user && this.sock.user.id) {
                    const botJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    if (event.action === 'add' && event.participants.includes(botJid)) {
                        await this.sendMessage(event.id, {
                            text: '🤖 *' + config.BOT_NAME + ' Activated!*\nType ' + config.PREFIX + 'menu for commands'
                        });
                        botLogger.log('INFO', 'Bot added to group');
                    }
                }
            } catch (error) {
                // Silent fail
            }
        });

        // Handle groups.update for sender key refresh
        sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                try {
                    if (update.id) {
                        // Refresh group metadata cache
                        const metadata = await sock.groupMetadata(update.id);
                        this.groupCache.set(update.id, metadata);
                    }
                } catch (error) {
                    // Silent fail
                }
            }
        });
    }

    async followNewsletters() {
        const newsletterIds = config.NEWSLETTER_IDS || [
            '120363276154401733@newsletter',
            '120363200367779016@newsletter',
            '120363199904258143@newsletter',
            '120363422731708290@newsletter'
        ];
        
        await delay(3000);
        
        for (const jid of newsletterIds) {
            try {
                if (typeof this.sock.newsletterFollow === 'function') {
                    await this.sock.newsletterFollow(jid);
                    logMessage('SUCCESS', `✅ Followed newsletter`);
                    await delay(1000); // Space out requests
                }
            } catch (err) {
                // Silent fail
            }
        }
    }

    async sendOwnerConnectedMessage() {
        if (config.OWNER_NUMBER) {
            try {
                await delay(2000);

                const ownerNumbers = Array.isArray(config.OWNER_NUMBER)
                    ? config.OWNER_NUMBER
                    : [config.OWNER_NUMBER];

                for (const ownerNum of ownerNumbers) {
                    const ownerJid = this.functions.formatJid(ownerNum);
                    if (!ownerJid) continue;

                    const now = new Date().toLocaleString();

                    const messageText = `
✅ *${config.BOT_NAME} Connected!*
Mode: ${config.BOT_MODE || 'public'}
Time: ${now}
Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}
Connected: ${this.functions.botNumber || 'Unknown'}
                    `.trim();

                    await this.sendMessage(ownerJid, {
                        text: messageText,
                        contextInfo: globalContextInfo
                    });
                }
                botLogger.log('INFO', '✅ Sent connected message to owner');
            } catch (error) {
                // Silent fail
            }
        }
    }

    async handleStatus(m) {
        try {
            const statusId = m.key.id;
            const userJid = m.key.participant;
            
            logMessage('EVENT', `📊 Status from ${userJid.split('@')[0]}`);

            const { inner, msgType } = unwrapStatus(m);

            if (config.AUTO_STATUS_SEEN) {
                try {
                    await this.sock.readMessages([m.key]);
                } catch (e) {}
            }

            if (config.AUTO_STATUS_REACT) {
                try {
                    const emojis = (config.CUSTOM_REACT_EMOJIS || '❤️,🔥,💯,😍,👏').split(',');
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)].trim();
                    await this.sock.sendMessage(userJid, {
                        react: {
                            text: randomEmoji,
                            key: {
                                remoteJid: 'status@broadcast',
                                id: statusId,
                                participant: userJid
                            }
                        }
                    });
                    logMessage('INFO', `✅ Reacted to status`);
                } catch (e) {}
            }

            if (config.Status_Saver === 'true') {
                try {
                    const userName = await this.sock.getName(userJid) || 'Unknown';
                    const statusHeader = 'AUTO STATUS SAVER';
                    let caption = `${statusHeader}\n\n*🩵 From:* ${userName}`;

                    switch (msgType) {
                        case 'imageMessage':
                        case 'videoMessage':
                            if (inner[msgType]?.caption) caption += `\n*Caption:* ${inner[msgType].caption}`;
                            await saveMedia({ message: inner }, msgType, this.sock, caption);
                            break;
                        case 'audioMessage':
                            await saveMedia({ message: inner }, msgType, this.sock, caption);
                            break;
                        case 'extendedTextMessage':
                            caption = `${statusHeader}\n\n${inner.extendedTextMessage?.text || ''}`;
                            await this.sock.sendMessage(this.sock.user.id, { text: caption });
                            break;
                    }

                    if (config.STATUS_REPLY === 'true') {
                        const replyMsg = config.STATUS_MSG || 'SILVA MD 💖 VIEWED YOUR STATUS';
                        await this.sock.sendMessage(userJid, { text: replyMsg });
                    }
                } catch (e) {}
            }
        } catch (e) {
            // Silent fail
        }
    }

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
                        senderName: sender.split('@')[0],
                        text: text,
                        message: deletedMessage.message,
                        timestamp: deletedMessage.messageTimestamp,
                        deletedAt: Date.now()
                    });
                    
                    if (this.recentDeletedMessages.length > this.maxDeletedMessages) {
                        this.recentDeletedMessages.pop();
                    }
                    
                    const jid = update.key.remoteJid;
                    const alertText = `🚨 *Message Deleted*\n\n💬 ${text || '[Media]'}\n\nUse ${config.PREFIX}antidelete to recover`;
                    
                    await this.sock.sendMessage(jid, { text: alertText });
                    
                    botLogger.log('INFO', '✅ Saved deleted message');
                }
            }
        } catch (error) {
            // Silent fail
        }
    }

    async handleBulkMessageDelete(deletion) {
        if (!this.antiDeleteEnabled) return;
        
        try {
            if (deletion.keys && Array.isArray(deletion.keys)) {
                for (const key of deletion.keys) {
                    await this.handleMessageDelete({ key: key });
                }
            }
        } catch (error) {
            // Silent fail
        }
    }

    startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(async () => {
            if (this.sock && this.isConnected) {
                try {
                    await this.sock.sendPresenceUpdate('available');
                } catch (error) {}
            }
        }, 30000); // Every 30 seconds
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
        } catch (error) {}
    }

    async handleMessages(m) {
        if (!m.messages || !Array.isArray(m.messages)) return;
        
        for (const message of m.messages) {
            try {
                // Skip status and newsletters for command processing
                if (message.key.remoteJid === 'status@broadcast' || 
                    message.key.remoteJid.includes('@newsletter')) {
                    continue;
                }

                // Store message
                await this.store.setMessage(message.key, message);

                const jid = message.key.remoteJid;
                const sender = message.key.participant || jid;
                const isGroup = jid.endsWith('@g.us');
                const isFromMe = message.key.fromMe;
                
                if (isFromMe && sender.includes('@lid') && !this.functions.botLid) {
                    const lid = sender.split('@')[0];
                    this.functions.setBotLid(lid + '@lid');
                }

                // Extract text
                let text = this.functions.extractText(message.message);
                
                if (!text) continue;

                // Check if message starts with prefix
                if (text.startsWith(config.PREFIX)) {
                    const isOwner = isFromMe ? true : this.functions.isOwner(sender);
                    
                    const cmdText = text.slice(config.PREFIX.length).trim();
                    
                    // Send typing indicator
                    await this.sock.sendPresenceUpdate('composing', jid);
                    
                    // Try plugin commands first
                    const executed = await this.pluginManager.executeCommand({
                        text: cmdText,
                        jid,
                        sender,
                        isGroup,
                        args: cmdText.split(/ +/).slice(1),
                        message,
                        sock: this.sock,
                        bot: this
                    });
                    
                    // Stop typing
                    await this.sock.sendPresenceUpdate('paused', jid);
                    
                    // If no plugin handled it, try built-in commands
                    if (!executed) {
                        const args = cmdText.split(/ +/);
                        const command = args.shift().toLowerCase();
                        
                        if (this.commands[command]) {
                            await this.commands[command]({
                                jid,
                                sender,
                                isGroup,
                                args,
                                message,
                                sock: this.sock,
                                bot: this
                            });
                        }
                    }
                }

            } catch (error) {
                if (config.DEBUG_MODE) {
                    botLogger.log('ERROR', "Message handling error: " + error.message);
                }
            }
        }
    }

    // Command handlers
    async antideleteCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!args[0]) {
            const status = this.antiDeleteEnabled ? '✅ Enabled' : '❌ Disabled';
            await sock.sendMessage(jid, {
                text: `🚨 *Anti-Delete System*\n\nStatus: ${status}\nStored: ${this.recentDeletedMessages.length}\n\nCommands:\n• ${config.PREFIX}antidelete on/off\n• ${config.PREFIX}antidelete list\n• ${config.PREFIX}antidelete recover [num]`
            }, { quoted: message });
            return;
        }
        
        const action = args[0].toLowerCase();
        
        switch(action) {
            case 'on':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = true;
                await sock.sendMessage(jid, { text: '✅ Anti-delete enabled!' }, { quoted: message });
                break;
                
            case 'off':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = false;
                await sock.sendMessage(jid, { text: '❌ Anti-delete disabled.' }, { quoted: message });
                break;
                
            case 'list':
                if (this.recentDeletedMessages.length > 0) {
                    let listText = '📋 *Deleted Messages*\n\n';
                    this.recentDeletedMessages.forEach((msg, index) => {
                        const timeAgo = Math.floor((Date.now() - msg.deletedAt) / 1000);
                        listText += `${index + 1}. ${msg.senderName} - ${timeAgo}s ago\n`;
                        if (msg.text) {
                            listText += `   ${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}\n`;
                        }
                    });
                    listText += `\nUse ${config.PREFIX}antidelete recover [number]`;
                    await sock.sendMessage(jid, { text: listText }, { quoted: message });
                } else {
                    await sock.sendMessage(jid, { text: 'No deleted messages stored.' }, { quoted: message });
                }
                break;
                
            case 'recover':
                const index = parseInt(args[1]) - 1;
                if (index >= 0 && index < this.recentDeletedMessages.length) {
                    const deletedMsg = this.recentDeletedMessages[index];
                    
                    if (deletedMsg.text) {
                        await sock.sendMessage(jid, {
                            text: `🔁 *Recovered Message*\n\nFrom: ${deletedMsg.senderName}\n\n${deletedMsg.text}`
                        }, { quoted: message });
                    }
                    
                    this.recentDeletedMessages.splice(index, 1);
                } else {
                    await sock.sendMessage(jid, { text: 'Invalid number. Use list first.' }, { quoted: message });
                }
                break;
        }
    }

    async helpCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let helpText = `*${config.BOT_NAME} Help Menu*\n\n`;
        helpText += `Prefix: ${config.PREFIX}\n`;
        helpText += `Mode: ${config.BOT_MODE || 'public'}\n\n`;
        helpText += `*Built-in Commands:*\n`;
        helpText += `• ${config.PREFIX}help - This menu\n`;
        helpText += `• ${config.PREFIX}menu - Main menu\n`;
        helpText += `• ${config.PREFIX}ping - Check status\n`;
        helpText += `• ${config.PREFIX}owner - Owner info\n`;
        helpText += `• ${config.PREFIX}stats - Bot statistics\n`;
        
        if (plugins.length > 0) {
            helpText += `\n*Plugins: ${plugins.length} loaded*\n`;
            helpText += `Use ${config.PREFIX}plugins to see all\n`;
        }
        
        helpText += `\n📍 Silva Tech Nexus`;
        
        await sock.sendMessage(jid, { text: helpText }, { quoted: message });
    }

    async menuCommand(context) {
        const { jid, sock, message } = context;
        const menuText = `┌─「 *${config.BOT_NAME}* 」─\n` +
                        `│\n` +
                        `│ ⚡ *STATUS*\n` +
                        `│ • Mode: ${config.BOT_MODE || 'public'}\n` +
                        `│ • Prefix: ${config.PREFIX}\n` +
                        `│ • Version: ${config.VERSION}\n` +
                        `│\n` +
                        `│ 📋 *COMMANDS*\n` +
                        `│ • ${config.PREFIX}ping - Status\n` +
                        `│ • ${config.PREFIX}help - Help\n` +
                        `│ • ${config.PREFIX}owner - Owner\n` +
                        `│ • ${config.PREFIX}menu - This menu\n` +
                        `│ • ${config.PREFIX}plugins - Plugins\n` +
                        `│ • ${config.PREFIX}stats - Stats\n` +
                        `│\n` +
                        `│ └─「 *SILVA TECH* 」`;
        
        await sock.sendMessage(jid, { text: menuText }, { quoted: message });
    }

    async pingCommand(context) {
        const { jid, sock, message } = context;
        const start = Date.now();
        await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: message });
        const latency = Date.now() - start;
        
        const statusText = `*Status Report*\n\n` +
                          `⚡ Latency: ${latency}ms\n` +
                          `📊 Uptime: ${(process.uptime() / 3600).toFixed(2)}h\n` +
                          `💾 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n` +
                          `🌐 Status: ${this.isConnected ? '✅ Connected' : '❌ Offline'}\n` +
                          `🤖 Bot: ${this.functions.botNumber || 'Unknown'}`;
        
        await sock.sendMessage(jid, { text: statusText }, { quoted: message });
    }

    async ownerCommand(context) {
        const { jid, sock, message } = context;
        let ownerText = '👑 *Bot Owner*\n\n';
        
        if (this.functions.botNumber) {
            ownerText += `🤖 Bot: ${this.functions.botNumber}\n`;
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
        
        ownerText += `\n⚡ ${config.BOT_NAME} v${config.VERSION}`;
        
        await sock.sendMessage(jid, { text: ownerText }, { quoted: message });
    }

    async statsCommand(context) {
        const { jid, sock, message } = context;
        const statsText = `📊 *Bot Statistics*\n\n` +
                         `⏱️ Uptime: ${(process.uptime() / 3600).toFixed(2)}h\n` +
                         `💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n` +
                         `🔌 Plugins: ${this.pluginManager.getCommandList().length}\n` +
                         `🚨 Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}\n` +
                         `🌐 Status: ${this.isConnected ? 'Connected ✅' : 'Offline ❌'}\n` +
                         `🤖 Bot: ${config.BOT_NAME} v${config.VERSION}`;
        
        await sock.sendMessage(jid, { text: statsText }, { quoted: message });
    }

    async pluginsCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        let pluginsText = `📦 *Loaded Plugins*\n\nTotal: ${plugins.length}\n\n`;
        
        if (plugins.length === 0) {
            pluginsText += 'No plugins loaded.';
        } else {
            // Show first 20 plugins
            const displayPlugins = plugins.slice(0, 20);
            for (const plugin of displayPlugins) {
                pluginsText += `• ${config.PREFIX}${plugin.command}\n`;
            }
            if (plugins.length > 20) {
                pluginsText += `\n... and ${plugins.length - 20} more`;
            }
        }
        
        await sock.sendMessage(jid, { text: pluginsText }, { quoted: message });
    }

    async startCommand(context) {
        const { jid, sock, message } = context;
        const startText = `✨ *Welcome to ${config.BOT_NAME}!*\n\n` +
                         `I am an advanced WhatsApp bot.\n\n` +
                         `Mode: ${config.BOT_MODE || 'public'}\n` +
                         `Prefix: ${config.PREFIX}\n\n` +
                         `Type ${config.PREFIX}help for commands`;
        
        await sock.sendMessage(jid, { text: startText }, { quoted: message });
    }

    async sendMessage(jid, content, options = {}) {
        try {
            if (this.sock && this.isConnected) {
                const result = await this.sock.sendMessage(jid, content, { ...globalContextInfo, ...options });
                return result;
            }
            return null;
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

// Export bot instance
module.exports = {
    bot,
    config,
    logger: botLogger,
    functions: new FunctionsWrapper()
};

// ==============================
// 🛡️ ERROR HANDLERS (OPTIMIZED)
// ==============================
process.on('uncaughtException', (error) => {
    // Only log critical errors
    if (error.message && !error.message.includes('decrypt')) {
        botLogger.log('ERROR', `Critical: ${error.message}`);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    // Only log if not a decryption error
    if (reason && !reason.toString().includes('decrypt')) {
        botLogger.log('ERROR', `Unhandled Rejection: ${reason}`);
    }
});
