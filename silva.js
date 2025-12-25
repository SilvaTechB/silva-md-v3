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
// 🔐 SESSION MANAGEMENT (FIXED)
// ==============================
async function loadSession() {
    try {
        const credsPath = './sessions/creds.json';
        
        if (!fs.existsSync('./sessions')) {
            fs.mkdirSync('./sessions', { recursive: true });
        }
        
        // Don't delete existing valid sessions
        if (fs.existsSync(credsPath)) {
            try {
                const existingCreds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                if (existingCreds && existingCreds.me) {
                    botLogger.log('INFO', "♻️ Using existing valid session");
                    return true;
                }
            } catch (e) {
                fs.unlinkSync(credsPath);
                botLogger.log('INFO', "♻️ Removed corrupted session");
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

        const cleanB64 = b64data.replace(/\.\.\./g, '');
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
// 🔧 UTILITY FUNCTIONS (FIXED)
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
        botLogger.log('DEBUG', `[OWNER CHECK] Checking sender: ${sender}`);
        
        let phoneNumber = '';
        let isLid = false;
        
        if (sender.includes('@lid')) {
            phoneNumber = sender.split('@')[0];
            isLid = true;
            botLogger.log('DEBUG', `[OWNER CHECK] Sender is LID: ${phoneNumber}`);
        } else if (sender.includes('@s.whatsapp.net')) {
            phoneNumber = sender.split('@')[0];
            botLogger.log('DEBUG', `[OWNER CHECK] Sender is JID: ${phoneNumber}`);
        } else if (sender.includes(':')) {
            phoneNumber = sender.split(':')[0];
        } else {
            phoneNumber = sender;
        }
        
        const cleanSender = phoneNumber.replace(/[^0-9]/g, '');
        botLogger.log('DEBUG', `[OWNER CHECK] Cleaned sender: ${cleanSender}`);
        
        // Check bot LID
        if (isLid && this.botLid) {
            const cleanBotLid = this.botLid.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotLid) {
                botLogger.log('DEBUG', '[OWNER CHECK] Sender is bot LID - GRANTING OWNER');
                return true;
            }
        }
        
        // Check bot number
        if (this.botNumber) {
            const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotNum) {
                botLogger.log('DEBUG', '[OWNER CHECK] Sender is bot number - GRANTING OWNER');
                return true;
            }
        }
        
        // Check config owner numbers
        let ownerNumbers = [];
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                ownerNumbers = config.OWNER_NUMBER.map(num => num.replace(/[^0-9]/g, ''));
            } else if (typeof config.OWNER_NUMBER === 'string') {
                ownerNumbers = [config.OWNER_NUMBER.replace(/[^0-9]/g, '')];
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
        
        botLogger.log('DEBUG', `[OWNER CHECK] Final result: ${isOwner}`);
        return isOwner;
    }

    setBotNumber(number) {
        if (number) {
            this.botNumber = number.replace(/[^0-9]/g, '');
            botLogger.log('INFO', `🤖 Bot number set: ${this.botNumber}`);
        }
    }

    setBotLid(lid) {
        if (lid) {
            this.botLid = lid.split('@')[0];
            botLogger.log('INFO', `🔑 Bot LID set: ${this.botLid}`);
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
// 💾 STORE IMPLEMENTATION (FIXED)
// ==============================
class MessageStore {
    constructor() {
        this.messageCache = new NodeCache({ stdTTL: 7200, checkperiod: 600 });
        this.chatCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
        this.deletedMessages = new Map();
        this.messageBuffer = new Map();
    }

    async getMessage(key) {
        if (!key || !key.id) return null;
        
        if (this.messageBuffer.has(key.id)) {
            return this.messageBuffer.get(key.id);
        }
        
        return this.messageCache.get(key.id);
    }

    async setMessage(key, message) {
        if (!key || !key.id || !message) return;
        
        try {
            this.messageBuffer.set(key.id, message);
            this.messageCache.set(key.id, message);
            
            setTimeout(() => {
                this.messageBuffer.delete(key.id);
            }, 30000);
        } catch (e) {
            botLogger.log('WARNING', `Failed to store message: ${e.message}`);
        }
    }

    async getChat(jid) {
        return this.chatCache.get(jid);
    }

    async setChat(jid, chat) {
        this.chatCache.set(jid, chat);
    }

    async saveDeletedMessage(key, message) {
        if (!message || !key || !key.id) return;
        
        if (message.key?.fromMe) return;
        
        this.deletedMessages.set(key.id, {
            ...message,
            timestamp: Date.now(),
            deletedAt: Date.now()
        });
        
        setTimeout(() => {
            this.deletedMessages.delete(key.id);
        }, 300000);
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

            botLogger.log('INFO', "Found " + pluginFiles.length + " plugin(s)");

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
                        
                        botLogger.log('SUCCESS', "✅ Loaded: " + file.replace('.js', ''));
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Failed to load " + file + ": " + error.message);
                }
            }
        } catch (error) {
            botLogger.log('ERROR', "Plugin loading error: " + error.message);
        }
    }

    async executeCommand(context) {
        const { text, jid, sender, isGroup, message, sock, args } = context;
        
        botLogger.log('COMMAND', `🔄 Processing: ${text.substring(0, 50)}`);
        
        if (!this.functions.isAllowed(sender, jid)) {
            if (config.BOT_MODE === 'private') {
                await sock.sendMessage(jid, { 
                    text: '🔒 Private mode: Contact owner' 
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
                            await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
                            return true;
                        }
                    }
                    
                    if (handler.group && !isGroup) {
                        await sock.sendMessage(jid, { text: '⚠️ Group only' }, { quoted: message });
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
                                await sock.sendMessage(jid, { text: '⚠️ Bot needs admin' }, { quoted: message });
                                return true;
                            }
                        } catch (e) {}
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
// 🤖 MAIN BOT CLASS (FIXED)
// ==============================
class SilvaBot {
    constructor() {
        this.sock = null;
        this.store = new MessageStore();
        this.groupCache = new NodeCache({ stdTTL: 300, useClones: false });
        this.pluginManager = new PluginManager();
        this.isConnected = false;
        this.functions = new FunctionsWrapper();
        this.sessionLockFile = path.join(__dirname, './sessions/.lock');
        
        this.antiDeleteEnabled = config.ANTIDELETE || true;
        this.recentDeletedMessages = [];
        this.maxDeletedMessages = 20;
        
        this.autoStatusView = config.AUTO_STATUS_SEEN || false;
        this.autoStatusLike = config.AUTO_STATUS_REACT || false;
        this.autoStatusReply = config.AUTO_STATUS_REPLY || false;
        this.statusSaver = config.Status_Saver === 'true' || false;
        this.statusReply = config.STATUS_REPLY === 'true' || false;
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.keepAliveInterval = null;
        
        this.commands = {
            help: this.helpCommand.bind(this),
            menu: this.menuCommand.bind(this),
            ping: this.pingCommand.bind(this),
            owner: this.ownerCommand.bind(this),
            stats: this.statsCommand.bind(this),
            plugins: this.pluginsCommand.bind(this),
            start: this.startCommand.bind(this),
            antidelete: this.antideleteCommand.bind(this),
            statusview: this.statusviewCommand.bind(this),
            statussaver: this.statussaverCommand.bind(this)
        };
    }

    async init() {
        try {
            // Check for session lock
            if (this.checkSessionLock()) {
                botLogger.log('ERROR', '🔒 Another instance is already running!');
                botLogger.log('ERROR', '⚠️ If this is wrong, delete ./sessions/.lock file');
                process.exit(1);
            }
            
            // Create session lock
            this.createSessionLock();
            
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
            this.removeSessionLock();
            setTimeout(() => this.init(), 10000);
        }
    }

    checkSessionLock() {
        if (!fs.existsSync(this.sessionLockFile)) return false;
        
        try {
            const lockData = JSON.parse(fs.readFileSync(this.sessionLockFile, 'utf8'));
            const lockAge = Date.now() - lockData.timestamp;
            
            // If lock is older than 5 minutes, consider it stale
            if (lockAge > 300000) {
                botLogger.log('WARNING', '⚠️ Stale lock detected, removing...');
                fs.unlinkSync(this.sessionLockFile);
                return false;
            }
            
            return true;
        } catch (e) {
            // Corrupted lock file, remove it
            fs.unlinkSync(this.sessionLockFile);
            return false;
        }
    }

    createSessionLock() {
        try {
            const lockData = {
                pid: process.pid,
                timestamp: Date.now(),
                platform: process.platform
            };
            fs.writeFileSync(this.sessionLockFile, JSON.stringify(lockData, null, 2));
            botLogger.log('INFO', '🔒 Session locked');
        } catch (e) {
            botLogger.log('WARNING', 'Failed to create lock: ' + e.message);
        }
    }

    removeSessionLock() {
        try {
            if (fs.existsSync(this.sessionLockFile)) {
                fs.unlinkSync(this.sessionLockFile);
                botLogger.log('INFO', '🔓 Session unlocked');
            }
        } catch (e) {
            // Ignore errors
        }
    }

    async connect() {
        try {
            this.reconnectAttempts++;
            
            if (this.reconnectAttempts > this.maxReconnectAttempts) {
                botLogger.log('ERROR', 'Max reconnection attempts reached');
                this.reconnectAttempts = 0;
                this.cleanupSessions();
                setTimeout(() => this.init(), 30000);
                return;
            }

            const { state, saveCreds } = await useMultiFileAuthState('./sessions');
            const { version } = await fetchLatestBaileysVersion();
            
            botLogger.log('INFO', `WA version: ${version.join('.')}`);
            
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
                keepAliveIntervalMs: 30000,
                emitOwnEvents: true,
                fireInitQueries: true,
                mobile: false,
                shouldIgnoreJid: (jid) => {
                    if (!jid || typeof jid !== 'string') return false;
                    return jid.includes('@newsletter');
                },
                getMessage: async (key) => {
                    try {
                        if (!key || !key.id) return { conversation: '' };
                        const msg = await this.store.getMessage(key);
                        return msg?.message || msg || { conversation: '' };
                    } catch (error) {
                        return { conversation: '' };
                    }
                },
                printQRInTerminal: !config.SESSION_ID
            });

            this.setupEvents(saveCreds);
            botLogger.log('SUCCESS', '✅ Socket initialized');
            this.reconnectAttempts = 0;
            
        } catch (error) {
            botLogger.log('ERROR', "Connection error: " + error.message);
            await this.handleReconnect(error);
        }
    }

    async handleReconnect(error) {
        const delayTime = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        botLogger.log('WARNING', `Reconnecting in ${(delayTime/1000)}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        await this.functions.sleep(delayTime);
        await this.connect();
    }

    setupEvents(saveCreds) {
        const sock = this.sock;

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
                
                botLogger.log('WARNING', `Connection closed. Status: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    botLogger.log('ERROR', 'Logged out. Cleaning sessions...');
                    this.cleanupSessions();
                    setTimeout(() => this.init(), 10000);
                } else if (statusCode === DisconnectReason.badSession) {
                    botLogger.log('ERROR', 'Bad session. Restarting...');
                    this.cleanupSessions();
                    setTimeout(() => this.init(), 5000);
                } else if (statusCode === 440) {
                    botLogger.log('ERROR', '⚠️ Connection replaced - Another instance is running!');
                    botLogger.log('ERROR', '🔍 Check: WhatsApp Web, other deployments, or duplicate processes');
                    
                    // Instead of exiting immediately, wait and try to reclaim
                    if (this.reconnectAttempts < 3) {
                        botLogger.log('WARNING', `⏳ Waiting 30s before attempting to reclaim connection...`);
                        await this.functions.sleep(30000);
                        this.cleanupSessions(); // Force new session
                        setTimeout(() => this.init(), 5000);
                    } else {
                        botLogger.log('ERROR', '❌ Cannot reclaim connection. Exiting...');
                        process.exit(0);
                    }
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
                    
                    const fullId = sock.user.id;
                    if (fullId.includes(':')) {
                        const lid = fullId.split(':')[0];
                        this.functions.setBotLid(lid + '@lid');
                    }
                }
                
                this.startKeepAlive();
                setTimeout(() => this.notifyOwner(), 3000);
            }
        });

        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
            } catch (e) {
                botLogger.log('ERROR', `Creds update error: ${e.message}`);
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const { messages, type } = m;
                
                if (!messages || messages.length === 0) return;
                if (type !== 'notify' && type !== 'append') return;
                
                for (const message of messages) {
                    try {
                        if (!message || !message.message || !message.key) continue;

                        const jid = message.key.remoteJid;
                        if (!jid) continue;

                        if (jid === 'status@broadcast') {
                            await this.handleStatusUpdate(message).catch(e => {
                                botLogger.log('ERROR', `Status error: ${e.message}`);
                            });
                            continue;
                        }

                        if (jid.includes('@newsletter')) continue;

                        await this.handleRegularMessage(message).catch(e => {
                            botLogger.log('ERROR', `Message error: ${e.message}`);
                        });

                    } catch (error) {
                        botLogger.log('ERROR', `Processing error: ${error.message}`);
                    }
                }
            } catch (error) {
                botLogger.log('ERROR', `Upsert error: ${error.message}`);
            }
        });

        sock.ev.on('messages.update', async (updates) => {
            if (!this.antiDeleteEnabled) return;
            
            for (const update of updates) {
                try {
                    if (update.update?.message === null) {
                        await this.handleMessageDelete(update).catch(e => {
                            botLogger.log('ERROR', `Delete error: ${e.message}`);
                        });
                    }
                } catch (error) {
                    botLogger.log('ERROR', `Update error: ${error.message}`);
                }
            }
        });

        sock.ev.on('group-participants.update', async (event) => {
            try {
                if (sock.user && sock.user.id) {
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    if (event.action === 'add' && event.participants.includes(botJid)) {
                        await delay(2000);
                        await this.sendMessage(event.id, {
                            text: `🤖 *${config.BOT_NAME} Activated!*\nType ${config.PREFIX}menu`
                        });
                    }
                }
            } catch (error) {
                botLogger.log('WARNING', 'Group event error: ' + error.message);
            }
        });
    }

    unwrapStatus(msg) {
        try {
            let content = msg.message;
            
            if (content?.viewOnceMessageV2?.message) {
                content = content.viewOnceMessageV2.message;
            } else if (content?.viewOnceMessage?.message) {
                content = content.viewOnceMessage.message;
            } else if (content?.ephemeralMessage?.message) {
                content = content.ephemeralMessage.message;
            }
            
            const msgType = Object.keys(content || {})[0] || '';
            
            return { inner: content, msgType };
        } catch (error) {
            botLogger.log('ERROR', `Unwrap error: ${error.message}`);
            return { inner: msg.message || {}, msgType: '' };
        }
    }

    async saveStatusMedia(message, msgType, caption) {
        try {
            const stream = await downloadMediaMessage(
                message,
                'stream',
                {},
                {
                    logger,
                    reuploadRequest: this.sock.updateMediaMessage
                }
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const extMap = {
                imageMessage: 'jpg',
                videoMessage: 'mp4',
                audioMessage: 'ogg',
                documentMessage: 'pdf',
                stickerMessage: 'webp'
            };

            const filename = `status_${Date.now()}.${extMap[msgType] || 'bin'}`;
            const statusDir = path.join(__dirname, 'status_saver');
            
            if (!fs.existsSync(statusDir)) {
                fs.mkdirSync(statusDir, { recursive: true });
            }
            
            const filePath = path.join(statusDir, filename);
            fs.writeFileSync(filePath, buffer);

            const botJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';

            const msgContent = {
                caption: caption || '',
                mimetype: message.message?.[msgType]?.mimetype
            };

            if (msgType === 'imageMessage') {
                msgContent.image = fs.readFileSync(filePath);
            } else if (msgType === 'videoMessage') {
                msgContent.video = fs.readFileSync(filePath);
            } else if (msgType === 'audioMessage') {
                msgContent.audio = fs.readFileSync(filePath);
                msgContent.mimetype = 'audio/ogg; codecs=opus';
            } else if (msgType === 'stickerMessage') {
                msgContent.sticker = fs.readFileSync(filePath);
            }

            await this.sock.sendMessage(botJid, msgContent);
            
            botLogger.log('SUCCESS', `✅ Status saved: ${filename}`);
            return true;
        } catch (error) {
            botLogger.log('ERROR', `Save error: ${error.message}`);
            return false;
        }
    }

    async handleStatusUpdate(message) {
        try {
            if (!message || !message.key || !message.message) {
                botLogger.log('WARNING', 'Invalid status structure');
                return;
            }

            const statusId = message.key.id;
            const userJid = message.key.participant;
            
            if (!userJid) {
                botLogger.log('WARNING', 'Status without participant - skipping');
                return;
            }

            if (message.key.fromMe) {
                botLogger.log('DEBUG', 'Skipping own status');
                return;
            }

            botLogger.log('STATUS', `📱 Status from ${userJid.split('@')[0]}`);

            const { inner, msgType } = this.unwrapStatus(message);

            if (!inner || !msgType) {
                botLogger.log('WARNING', 'Could not unwrap status');
                return;
            }

            if (this.autoStatusView) {
                try {
                    await delay(500);
                    await this.sock.readMessages([message.key]);
                    botLogger.log('STATUS', `👁️ Viewed`);
                } catch (e) {
                    botLogger.log('WARNING', `View failed: ${e.message}`);
                }
            }

            if (this.autoStatusLike) {
                try {
                    await delay(1000);
                    
                    const emojis = (config.CUSTOM_REACT_EMOJIS || '❤️,🔥,💯,😍,👏').split(',');
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)].trim();
                    
                    await this.sock.sendMessage('status@broadcast', {
                        react: {
                            text: randomEmoji,
                            key: message.key
                        }
                    });
                    
                    botLogger.log('STATUS', `❤️ Reacted: ${randomEmoji}`);
                } catch (e) {
                    botLogger.log('WARNING', `React failed: ${e.message}`);
                }
            }

            if (this.statusSaver && ['imageMessage', 'videoMessage', 'audioMessage'].includes(msgType)) {
                try {
                    await delay(2000);
                    
                    const userName = await this.getContactName(userJid) || userJid.split('@')[0];
                    let caption = `📥 *STATUS SAVER*\n\n*From:* ${userName}\n*Time:* ${new Date().toLocaleString()}`;

                    if (inner[msgType]?.caption) {
                        caption += `\n*Caption:* ${inner[msgType].caption}`;
                    }

                    const downloadMsg = {
                        key: message.key,
                        message: inner
                    };

                    const saved = await this.saveStatusMedia(downloadMsg, msgType, caption);
                    
                    if (saved && this.statusReply) {
                        await delay(1000);
                        const replyMsg = config.STATUS_MSG || '👀 Viewed!';
                        await this.sock.sendMessage(userJid, { text: replyMsg }).catch(() => {});
                    }
                    
                } catch (e) {
                    botLogger.log('ERROR', `Save failed: ${e.message}`);
                }
            }

            if (this.statusSaver && msgType === 'extendedTextMessage') {
                try {
                    const userName = await this.getContactName(userJid) || userJid.split('@')[0];
                    const textContent = inner.extendedTextMessage?.text || '';
                    
                    const caption = `📥 *STATUS SAVER*\n\n*From:* ${userName}\n*Text:* ${textContent}\n*Time:* ${new Date().toLocaleString()}`;
                    
                    const botJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    await this.sock.sendMessage(botJid, { text: caption });
                    
                    if (this.statusReply) {
                        const replyMsg = config.STATUS_MSG || '👀 Viewed!';
                        await this.sock.sendMessage(userJid, { text: replyMsg }).catch(() => {});
                    }
                } catch (e) {
                    botLogger.log('ERROR', `Text save failed: ${e.message}`);
                }
            }
        } catch (e) {
            botLogger.log('ERROR', `Status handler: ${e.message}`);
        }
    }

    async handleRegularMessage(message) {
        try {
            if (!message || !message.key) return;
            
            const jid = message.key.remoteJid;
            const sender = message.key.participant || jid;
            const isGroup = jid.endsWith('@g.us');
            const isFromMe = message.key.fromMe;
            
            try {
                await this.store.setMessage(message.key, message);
            } catch (e) {
                botLogger.log('WARNING', `Store failed: ${e.message}`);
            }

            if (isFromMe && sender.includes('@lid') && !this.functions.botLid) {
                const lid = sender.split('@')[0];
                this.functions.setBotLid(lid + '@lid');
            }

            let text = this.functions.extractText(message.message);
            
            if (!text && message.message) {
                const msgType = Object.keys(message.message)[0];
                if (msgType === 'conversation') {
                    text = message.message.conversation;
                } else if (message.message[msgType]?.text) {
                    text = message.message[msgType].text;
                } else if (message.message[msgType]?.caption) {
                    text = message.message[msgType].caption;
                }
            }

            if (text && config.DEBUG_MODE) {
                const preview = text.substring(0, 50);
                botLogger.log('MESSAGE', `📨 ${sender.split('@')[0]} | ${preview}`);
            }

            if (text && text.startsWith(config.PREFIX)) {
                await this.handleCommand(message, text, jid, sender, isGroup, isFromMe);
            }

        } catch (error) {
            botLogger.log('ERROR', `Regular message: ${error.message}`);
        }
    }

    async handleCommand(message, text, jid, sender, isGroup, isFromMe) {
        try {
            botLogger.log('COMMAND', `⚡ Command: ${text.substring(0, 100)}`);
            
            const isOwner = isFromMe ? true : this.functions.isOwner(sender);
            const cmdText = text.slice(config.PREFIX.length).trim();
            
            await this.sock.sendPresenceUpdate('composing', jid);
            
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
            
            await this.sock.sendPresenceUpdate('paused', jid);
            
            if (!executed) {
                const args = cmdText.split(/ +/);
                const command = args.shift().toLowerCase();
                
                if (this.commands[command]) {
                    botLogger.log('COMMAND', `🛠️ Built-in: ${command}`);
                    await this.commands[command]({
                        jid,
                        sender,
                        isGroup,
                        args,
                        message,
                        sock: this.sock,
                        bot: this
                    });
                } else if (config.AUTO_REPLY) {
                    await this.sock.sendMessage(jid, {
                        text: '❓ Unknown command. Type ' + config.PREFIX + 'help'
                    }, { quoted: message });
                }
            }
        } catch (error) {
            botLogger.log('ERROR', `Command error: ${error.message}`);
            try {
                await this.sock.sendMessage(jid, {
                    text: '❌ Error: ' + error.message
                }, { quoted: message });
            } catch (e) {}
        }
    }

    async handleMessageDelete(update) {
        if (!this.antiDeleteEnabled || !update.key) return;
        
        try {
            const deletedMessage = await this.store.getMessage(update.key);
            
            if (!deletedMessage || deletedMessage.key?.fromMe) return;
            
            await this.store.saveDeletedMessage(update.key, deletedMessage);
            
            const sender = deletedMessage.key.participant || deletedMessage.key.remoteJid;
            const text = this.functions.extractText(deletedMessage.message);
            
            this.recentDeletedMessages.unshift({
                key: update.key,
                sender: sender,
                senderName: await this.getContactName(sender),
                text: text || '[Media]',
                message: deletedMessage,
                timestamp: deletedMessage.messageTimestamp,
                deletedAt: Date.now()
            });
            
            if (this.recentDeletedMessages.length > this.maxDeletedMessages) {
                this.recentDeletedMessages.pop();
            }
            
            const jid = update.key.remoteJid;
            const timeAgo = Math.floor((Date.now() - (deletedMessage.messageTimestamp * 1000)) / 1000);
            
            if (jid.endsWith('@g.us')) {
                await this.sock.sendMessage(jid, {
                    text: `🚨 *Message Deleted*\n\n` +
                          `👤 *Sender:* @${sender.split('@')[0]}\n` +
                          `💬 *Message:* ${text || '[Media]'}\n` +
                          `⏰ *Sent:* ${timeAgo}s ago\n\n` +
                          `Type \`${config.PREFIX}antidelete recover 1\` to recover`,
                    mentions: [sender]
                });
            }
            
            botLogger.log('INFO', '🚨 Saved deleted message');
        } catch (error) {
            botLogger.log('ERROR', 'Anti-delete: ' + error.message);
        }
    }

    async getContactName(jid) {
        try {
            const contact = await this.sock.onWhatsApp(jid);
            if (contact && contact[0]) {
                return contact[0].notify || contact[0].name || jid.split('@')[0];
            }
            return jid.split('@')[0];
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
                } catch (error) {}
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
                // Remove all files except .lock
                const files = fs.readdirSync(sessionsDir);
                for (const file of files) {
                    if (file !== '.lock') {
                        const filePath = path.join(sessionsDir, file);
                        fs.unlinkSync(filePath);
                    }
                }
                botLogger.log('INFO', 'Sessions cleaned');
            }
        } catch (error) {
            botLogger.log('ERROR', 'Cleanup error: ' + error.message);
        }
    }

    async notifyOwner() {
        if (!config.OWNER_NUMBER || !this.isConnected) return;
        
        try {
            const ownerNumbers = Array.isArray(config.OWNER_NUMBER)
                ? config.OWNER_NUMBER
                : [config.OWNER_NUMBER];

            for (const ownerNum of ownerNumbers) {
                const ownerJid = this.functions.formatJid(ownerNum);
                if (!ownerJid) continue;

                const messageText = `
✅ *${config.BOT_NAME} Connected!*

📊 *Status:*
• Mode: ${config.BOT_MODE || 'public'}
• Time: ${new Date().toLocaleString()}
• Number: ${this.functions.botNumber || 'Unknown'}
• LID: ${this.functions.botLid || 'Not detected'}

⚙️ *Features:*
• Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}
• Status View: ${this.autoStatusView ? '✅' : '❌'}
• Status React: ${this.autoStatusLike ? '✅' : '❌'}
• Status Saver: ${this.statusSaver ? '✅' : '❌'}

Type ${config.PREFIX}help for commands
                `.trim();

                await this.sendMessage(ownerJid, { text: messageText });
            }
        } catch (error) {
            botLogger.log('ERROR', `Notify owner: ${error.message}`);
        }
    }

    async statusviewCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!isOwner) {
            await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `📊 *Status Auto Settings*\n\n` +
                      `Auto View: ${this.autoStatusView ? '✅' : '❌'}\n` +
                      `Auto Like: ${this.autoStatusLike ? '✅' : '❌'}\n` +
                      `Auto Reply: ${this.autoStatusReply ? '✅' : '❌'}\n\n` +
                      `*Commands:*\n` +
                      `• ${config.PREFIX}statusview on\n` +
                      `• ${config.PREFIX}statusview off\n` +
                      `• ${config.PREFIX}statusview view\n` +
                      `• ${config.PREFIX}statusview like\n` +
                      `• ${config.PREFIX}statusview reply`
            }, { quoted: message });
            return;
        }
        
        switch(action) {
            case 'on':
                this.autoStatusView = true;
                this.autoStatusLike = true;
                this.autoStatusReply = true;
                await sock.sendMessage(jid, { text: '✅ All enabled!' }, { quoted: message });
                break;
                
            case 'off':
                this.autoStatusView = false;
                this.autoStatusLike = false;
                this.autoStatusReply = false;
                await sock.sendMessage(jid, { text: '❌ All disabled' }, { quoted: message });
                break;
                
            case 'view':
                this.autoStatusView = !this.autoStatusView;
                await sock.sendMessage(jid, {
                    text: `Auto-view: ${this.autoStatusView ? '✅' : '❌'}`
                }, { quoted: message });
                break;
                
            case 'like':
                this.autoStatusLike = !this.autoStatusLike;
                await sock.sendMessage(jid, {
                    text: `Auto-like: ${this.autoStatusLike ? '✅' : '❌'}`
                }, { quoted: message });
                break;
                
            case 'reply':
                this.autoStatusReply = !this.autoStatusReply;
                await sock.sendMessage(jid, {
                    text: `Auto-reply: ${this.autoStatusReply ? '✅' : '❌'}`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, { text: '❓ Invalid option' }, { quoted: message });
        }
    }
    
    async statussaverCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!isOwner) {
            await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `💾 *Status Saver*\n\n` +
                      `Saver: ${this.statusSaver ? '✅' : '❌'}\n` +
                      `Reply: ${this.statusReply ? '✅' : '❌'}\n\n` +
                      `*Commands:*\n` +
                      `• ${config.PREFIX}statussaver on\n` +
                      `• ${config.PREFIX}statussaver off\n` +
                      `• ${config.PREFIX}statussaver save\n` +
                      `• ${config.PREFIX}statussaver reply`
            }, { quoted: message });
            return;
        }
        
        switch(action) {
            case 'on':
                this.statusSaver = true;
                this.statusReply = true;
                await sock.sendMessage(jid, { text: '✅ Status saver enabled!' }, { quoted: message });
                break;
                
            case 'off':
                this.statusSaver = false;
                this.statusReply = false;
                await sock.sendMessage(jid, { text: '❌ Status saver disabled' }, { quoted: message });
                break;
                
            case 'save':
                this.statusSaver = !this.statusSaver;
                await sock.sendMessage(jid, {
                    text: `Saver: ${this.statusSaver ? '✅' : '❌'}`
                }, { quoted: message });
                break;
                
            case 'reply':
                this.statusReply = !this.statusReply;
                await sock.sendMessage(jid, {
                    text: `Reply: ${this.statusReply ? '✅' : '❌'}`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, { text: '❓ Invalid option' }, { quoted: message });
        }
    }

    async antideleteCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!args[0]) {
            const status = this.antiDeleteEnabled ? '✅' : '❌';
            await sock.sendMessage(jid, {
                text: `🚨 *Anti-Delete*\n\n` +
                      `Status: ${status}\n` +
                      `Stored: ${this.recentDeletedMessages.length}/${this.maxDeletedMessages}\n\n` +
                      `*Commands:*\n` +
                      `• ${config.PREFIX}antidelete on\n` +
                      `• ${config.PREFIX}antidelete off\n` +
                      `• ${config.PREFIX}antidelete list\n` +
                      `• ${config.PREFIX}antidelete recover [num]\n` +
                      `• ${config.PREFIX}antidelete clear`
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
                await sock.sendMessage(jid, { text: '✅ Enabled!' }, { quoted: message });
                break;
                
            case 'off':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = false;
                await sock.sendMessage(jid, { text: '❌ Disabled' }, { quoted: message });
                break;
                
            case 'list':
                if (this.recentDeletedMessages.length > 0) {
                    let listText = '📋 *Deleted Messages*\n\n';
                    this.recentDeletedMessages.forEach((msg, index) => {
                        const timeAgo = Math.floor((Date.now() - msg.deletedAt) / 1000);
                        listText += `${index + 1}. ${msg.senderName} - ${timeAgo}s ago\n`;
                        if (msg.text && msg.text !== '[Media]') {
                            const preview = msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text;
                            listText += `   ${preview}\n`;
                        } else {
                            listText += `   ${msg.text}\n`;
                        }
                    });
                    listText += `\nUse \`${config.PREFIX}antidelete recover [num]\``;
                    await sock.sendMessage(jid, { text: listText }, { quoted: message });
                } else {
                    await sock.sendMessage(jid, { text: '📭 No deleted messages' }, { quoted: message });
                }
                break;
                
            case 'recover':
                const index = parseInt(args[1]) - 1;
                if (isNaN(index) || index < 0 || index >= this.recentDeletedMessages.length) {
                    await sock.sendMessage(jid, {
                        text: `❌ Invalid number. Use \`${config.PREFIX}antidelete list\``
                    }, { quoted: message });
                    return;
                }
                
                const deletedMsg = this.recentDeletedMessages[index];
                
                try {
                    if (deletedMsg.message && deletedMsg.message.message) {
                        await sock.sendMessage(jid, {
                            forward: deletedMsg.message,
                            contextInfo: {
                                mentionedJid: [deletedMsg.sender]
                            }
                        });
                    } else if (deletedMsg.text && deletedMsg.text !== '[Media]') {
                        await sock.sendMessage(jid, {
                            text: `🔁 *Recovered*\n\n*From:* ${deletedMsg.senderName}\n*Text:* ${deletedMsg.text}`,
                            mentions: [deletedMsg.sender]
                        });
                    } else {
                        await sock.sendMessage(jid, {
                            text: `⚠️ Could not recover media from ${deletedMsg.senderName}`
                        });
                    }
                    
                    await sock.sendMessage(jid, {
                        text: `✅ *Recovered*\n\nFrom: ${deletedMsg.senderName}`
                    }, { quoted: message });
                    
                    this.recentDeletedMessages.splice(index, 1);
                } catch (error) {
                    await sock.sendMessage(jid, {
                        text: `❌ Failed: ${error.message}`
                    }, { quoted: message });
                }
                break;
                
            case 'clear':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only' }, { quoted: message });
                    return;
                }
                const count = this.recentDeletedMessages.length;
                this.recentDeletedMessages = [];
                await sock.sendMessage(jid, {
                    text: `🗑️ Cleared ${count} messages`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: `❓ Invalid. Use \`${config.PREFIX}antidelete\``
                }, { quoted: message });
        }
    }

    async helpCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let helpText = `🤖 *${config.BOT_NAME}*\n\n`;
        helpText += `📌 *Prefix:* ${config.PREFIX}\n`;
        helpText += `🔧 *Mode:* ${config.BOT_MODE || 'public'}\n`;
        helpText += `📦 *Version:* ${config.VERSION}\n\n`;
        
        helpText += `*📋 Built-in:*\n`;
        helpText += `• ${config.PREFIX}help\n`;
        helpText += `• ${config.PREFIX}menu\n`;
        helpText += `• ${config.PREFIX}ping\n`;
        helpText += `• ${config.PREFIX}owner\n`;
        helpText += `• ${config.PREFIX}plugins\n`;
        helpText += `• ${config.PREFIX}stats\n`;
        helpText += `• ${config.PREFIX}antidelete\n`;
        helpText += `• ${config.PREFIX}statusview\n`;
        helpText += `• ${config.PREFIX}statussaver\n`;
        
        if (plugins.length > 0) {
            helpText += `\n*🔌 Plugins:*\n`;
            for (const cmd of plugins) {
                helpText += `• ${config.PREFIX}${cmd.command}\n`;
            }
        }
        
        helpText += `\n📍 *Silva Tech*`;
        
        await sock.sendMessage(jid, { text: helpText }, { quoted: message });
    }

    async menuCommand(context) {
        const { jid, sock, message } = context;
        const menuText = `
┌─「 *${config.BOT_NAME}* 」─
│
│ ⚡ *STATUS*
│ • Mode: ${config.BOT_MODE || 'public'}
│ • Prefix: ${config.PREFIX}
│ • Version: ${config.VERSION}
│ • Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}
│ • Status Saver: ${this.statusSaver ? '✅' : '❌'}
│ • Uptime: ${(process.uptime() / 3600).toFixed(2)}h
│
│ 📋 *COMMANDS*
│ • ${config.PREFIX}ping
│ • ${config.PREFIX}help
│ • ${config.PREFIX}owner
│ • ${config.PREFIX}menu
│ • ${config.PREFIX}plugins
│ • ${config.PREFIX}stats
│ • ${config.PREFIX}antidelete
│
│ 📱 *STATUS*
│ • ${config.PREFIX}statusview
│ • ${config.PREFIX}statussaver
│
└─「 *SILVA TECH* 」
        `.trim();
        
        await sock.sendMessage(jid, { text: menuText }, { quoted: message });
    }

    async pingCommand(context) {
        const { jid, sock, message } = context;
        const start = Date.now();
        await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: message });
        const latency = Date.now() - start;
        
        const statusText = `
📊 *Status*

⚡ *Latency:* ${latency}ms
⏱️ *Uptime:* ${(process.uptime() / 3600).toFixed(2)}h
💾 *RAM:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
🌐 *Status:* ${this.isConnected ? '✅' : '❌'}
🚨 *Anti-delete:* ${this.antiDeleteEnabled ? '✅' : '❌'}
📱 *Status Saver:* ${this.statusSaver ? '✅' : '❌'}
🤖 *Number:* ${this.functions.botNumber || 'Unknown'}
🔑 *LID:* ${this.functions.botLid || 'Not detected'}
        `.trim();
        
        await sock.sendMessage(jid, { text: statusText }, { quoted: message });
    }

    async ownerCommand(context) {
        const { jid, sock, message } = context;
        let ownerText = '👑 *Owner Info*\n\n';
        
        if (this.functions.botNumber) {
            ownerText += `🤖 *Bot:* ${this.functions.botNumber}\n`;
        }
        
        if (this.functions.botLid) {
            ownerText += `🔑 *LID:* ${this.functions.botLid}\n\n`;
        }
        
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                config.OWNER_NUMBER.forEach((num, idx) => {
                    ownerText += `📞 *Owner ${idx + 1}:* ${num}\n`;
                });
            } else {
                ownerText += `📞 *Owner:* ${config.OWNER_NUMBER}\n`;
            }
        }
        
        ownerText += `\n⚡ *${config.BOT_NAME}* v${config.VERSION}`;
        
        await sock.sendMessage(jid, { text: ownerText }, { quoted: message });
    }

    async statsCommand(context) {
        const { jid, sock, message } = context;
        
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const statsText = `
📊 *Statistics*

⏱️ *Uptime:* ${hours}h ${minutes}m
💾 *Memory:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
📦 *Platform:* ${process.platform}
🔌 *Plugins:* ${this.pluginManager.getCommandList().length}
🚨 *Deleted:* ${this.recentDeletedMessages.length}/${this.maxDeletedMessages}
👁️ *Auto-View:* ${this.autoStatusView ? '✅' : '❌'}
❤️ *Auto-React:* ${this.autoStatusLike ? '✅' : '❌'}
💾 *Saver:* ${this.statusSaver ? '✅' : '❌'}
🌐 *Status:* ${this.isConnected ? '✅' : '❌'}
🤖 *Bot:* ${config.BOT_NAME} v${config.VERSION}
📱 *Number:* ${this.functions.botNumber || 'Unknown'}
🔑 *LID:* ${this.functions.botLid || 'Not detected'}
        `.trim();
        
        await sock.sendMessage(jid, { text: statsText }, { quoted: message });
    }

    async pluginsCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let pluginsText = '📦 *Loaded Plugins*\n\n';
        pluginsText += `*Total:* ${plugins.length}\n\n`;
        
        if (plugins.length === 0) {
            pluginsText += '❌ No plugins loaded\n';
            pluginsText += 'Check silvaxlab folder';
        } else {
            for (const plugin of plugins) {
                pluginsText += `• \`${config.PREFIX}${plugin.command}\`\n`;
                pluginsText += `  ${plugin.help}\n\n`;
            }
        }
        
        await sock.sendMessage(jid, { text: pluginsText }, { quoted: message });
    }

    async startCommand(context) {
        const { jid, sock, message } = context;
        
        const startText = `
✨ *Welcome to ${config.BOT_NAME}!*

Advanced WhatsApp bot with powerful features.

📌 *Config:*
• Mode: ${config.BOT_MODE || 'public'}
• Prefix: ${config.PREFIX}
• Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}
• Status Saver: ${this.statusSaver ? '✅' : '❌'}

🚀 *Get Started:*
Type \`${config.PREFIX}help\` for all commands
Type \`${config.PREFIX}menu\` for main menu

📍 *Silva Tech*
        `.trim();
        
        await sock.sendMessage(jid, { text: startText }, { quoted: message });
    }

    async sendMessage(jid, content, options = {}) {
        try {
            if (this.sock && this.isConnected) {
                const result = await this.sock.sendMessage(jid, content, options);
                return result;
            } else {
                botLogger.log('WARNING', 'Cannot send: Not connected');
                return null;
            }
        } catch (error) {
            botLogger.log('ERROR', "Send error: " + error.message);
            return null;
        }
    }
}

// ==============================
// 🚀 BOT INSTANCE
// ==============================
const bot = new SilvaBot();

module.exports = {
    bot,
    config,
    logger: botLogger,
    functions: new FunctionsWrapper()
};

// ==============================
// 🛡️ ERROR HANDLERS
// ==============================
process.on('uncaughtException', (error) => {
    botLogger.log('ERROR', `Uncaught Exception: ${error.message}`);
    botLogger.log('ERROR', `Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    botLogger.log('ERROR', `Unhandled Rejection: ${reason}`);
});

// Cleanup on exit
process.on('SIGINT', () => {
    botLogger.log('WARNING', 'SIGINT received, cleaning up...');
    bot.removeSessionLock();
    process.exit(0);
});

process.on('SIGTERM', () => {
    botLogger.log('WARNING', 'SIGTERM received, cleaning up...');
    bot.removeSessionLock();
    process.exit(0);
});

process.on('exit', (code) => {
    botLogger.log('INFO', `Process exiting with code: ${code}`);
    bot.removeSessionLock();
});

// ==============================
// 🎬 START BOT
// ==============================
bot.init().catch(error => {
    botLogger.log('ERROR', 'Failed to start bot: ' + error.message);
    bot.removeSessionLock();
    process.exit(1);
});
