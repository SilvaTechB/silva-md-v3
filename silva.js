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
    extractMessageContent
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
        if (!sender) return false;
        
        // Extract phone number from sender
        let phoneNumber = '';
        
        if (sender.includes('@lid')) {
            phoneNumber = sender.split('@')[0];
        } else if (sender.includes('@s.whatsapp.net')) {
            phoneNumber = sender.split('@')[0];
        } else if (sender.includes(':')) {
            phoneNumber = sender.split(':')[0];
        } else {
            phoneNumber = sender;
        }
        
        const cleanSender = phoneNumber.replace(/[^0-9]/g, '');
        
        // Check if this is the bot itself
        if (this.botNumber && cleanSender === this.botNumber.replace(/[^0-9]/g, '')) {
            return true;
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
        
        return ownerNumbers.some(ownerNum => 
            cleanSender === ownerNum || 
            cleanSender.endsWith(ownerNum) || 
            ownerNum.endsWith(cleanSender)
        );
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
        try {
            if (!message) return '';
            
            const content = extractMessageContent(message);
            if (!content) return '';
            
            if (typeof content === 'string') return content;
            if (content.conversation) return content.conversation;
            if (content.text) return content.text;
            if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
            if (content.imageMessage?.caption) return content.imageMessage.caption;
            if (content.videoMessage?.caption) return content.videoMessage.caption;
            if (content.documentMessage?.caption) return content.documentMessage.caption;
            
            return '';
        } catch (error) {
            return '';
        }
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

    async executeCommand(context) {
        const { text, jid, sender, isGroup, message, sock, args } = context;
        
        for (const [commandRegex, handler] of this.commandHandlers.entries()) {
            const commandMatch = text.split(' ')[0];
            if (commandRegex.test(commandMatch)) {
                try {
                    if (handler.owner && !this.functions.isOwner(sender)) {
                        await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                        return true;
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
// 🤖 MAIN BOT CLASS (STABILIZED VERSION)
// ==============================
class SilvaBot {
    constructor() {
        this.sock = null;
        this.store = new MessageStore();
        this.groupCache = new NodeCache({ stdTTL: 300, useClones: false });
        this.pluginManager = new PluginManager();
        this.isConnected = false;
        this.functions = new FunctionsWrapper();
        
        // Settings
        this.antiDeleteEnabled = config.ANTIDELETE || false;
        this.recentDeletedMessages = [];
        this.maxDeletedMessages = 20;
        
        // Status settings
        this.autoStatusView = config.AUTO_STATUS_SEEN || false;
        this.autoStatusLike = config.AUTO_STATUS_REACT || false;
        this.statusSaver = config.Status_Saver === 'true' || false;
        this.statusReply = config.STATUS_REPLY === 'true' || false;
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 10000; // Increased to 10 seconds
        this.keepAliveInterval = null;
        this.isInitializing = false;
        
        // Built-in commands
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
        if (this.isInitializing) {
            botLogger.log('WARNING', 'Already initializing, skipping...');
            return;
        }
        
        this.isInitializing = true;
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
            this.isInitializing = false;
            setTimeout(() => this.init(), 30000);
        }
    }

    async connect() {
        if (this.sock) {
            try {
                await this.sock.end(undefined);
            } catch (e) {
                // Ignore
            }
            this.sock = null;
        }
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState('./sessions');
            const { version } = await fetchLatestBaileysVersion();
            
            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }), // Reduced logging
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                browser: Browsers.macOS(config.BOT_NAME),
                markOnlineOnConnect: false, // Set to false to reduce conflicts
                generateHighQualityLinkPreview: false,
                syncFullHistory: false,
                defaultQueryTimeoutMs: 30000,
                cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: true,
                fireInitQueries: false, // Set to false
                mobile: false,
                printQRInTerminal: false,
                shouldIgnoreJid: (jid) => {
                    if (!jid) return false;
                    return jid.includes('@newsletter') || jid === 'status@broadcast';
                },
                getMessage: async (key) => {
                    try {
                        const msg = await this.store.getMessage(key);
                        return msg || { conversation: '' };
                    } catch (error) {
                        return { conversation: '' };
                    }
                }
            });

            this.setupEvents(saveCreds);
            botLogger.log('SUCCESS', '✅ Bot initialized');
        } catch (error) {
            botLogger.log('ERROR', "Connection error: " + error.message);
            await this.handleReconnect(error);
        }
    }

    async handleReconnect(error) {
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            botLogger.log('ERROR', 'Max reconnection attempts reached, waiting 60 seconds');
            this.reconnectAttempts = 0;
            setTimeout(() => this.init(), 60000);
            return;
        }

        const delayTime = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 60000);
        botLogger.log('WARNING', "Reconnecting in " + (delayTime/1000) + "s (Attempt " + this.reconnectAttempts + "/" + this.maxReconnectAttempts + ")");
        
        await this.functions.sleep(delayTime);
        await this.connect();
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
            return { inner: msg.message || {}, msgType: '' };
        }
    }

    // ==============================
    // 🎯 SETUP EVENTS (STABILIZED)
    // ==============================
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
                
                botLogger.log('WARNING', `Connection closed. Status: ${statusCode}, Reason: ${reason}`);
                
                // Handle specific disconnect reasons
                if (statusCode === DisconnectReason.loggedOut) {
                    botLogger.log('ERROR', 'Logged out. Please scan QR again.');
                    this.cleanupSessions();
                    setTimeout(() => this.init(), 30000);
                } else if (statusCode === 440) {
                    // Conflict error - wait longer before reconnecting
                    botLogger.log('ERROR', 'Conflict detected! Make sure WhatsApp is not open on another device.');
                    await this.functions.sleep(20000); // Wait 20 seconds
                    await this.handleReconnect(lastDisconnect?.error);
                } else {
                    await this.handleReconnect(lastDisconnect?.error);
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.isInitializing = false;
                botLogger.log('SUCCESS', '🔗 Connected to WhatsApp');
                
                if (sock.user && sock.user.id) {
                    const botNumber = sock.user.id.split(':')[0];
                    this.functions.setBotNumber(botNumber);
                    botLogger.log('INFO', '🤖 Bot connected as: ' + botNumber);
                }
                
                // Don't send initial messages to avoid conflicts
                await this.functions.sleep(5000);
                
                // Start keep alive with reduced frequency
                this.startKeepAlive();
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Simplified message handler
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const { messages, type } = m;
                
                if (!messages || messages.length === 0 || type !== 'notify') return;
                
                for (const message of messages) {
                    try {
                        if (!message.message) continue;
                        
                        const jid = message.key.remoteJid;
                        if (jid.includes('@newsletter') || jid === 'status@broadcast') continue;
                        
                        await this.handleRegularMessage(message);
                    } catch (error) {
                        // Silent error
                    }
                }
            } catch (error) {
                // Silent error
            }
        });

        // Anti-delete
        sock.ev.on('messages.update', async (updates) => {
            if (!this.antiDeleteEnabled) return;
            
            for (const update of updates) {
                try {
                    if (update.update?.message === null) {
                        await this.handleMessageDelete(update);
                    }
                } catch (error) {
                    // Silent error
                }
            }
        });
    }

    async handleRegularMessage(message) {
        try {
            const jid = message.key.remoteJid;
            const sender = message.key.participant || jid;
            const isGroup = jid.endsWith('@g.us');
            const isFromMe = message.key.fromMe;

            // Store message
            try {
                await this.store.setMessage(message.key, message);
            } catch (e) {
                // Ignore
            }

            // Extract text
            const text = this.functions.extractText(message.message);
            if (!text) return;

            // Command handling
            if (text.startsWith(config.PREFIX)) {
                const cmdText = text.slice(config.PREFIX.length).trim();
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
                } else {
                    // Try plugins
                    await this.pluginManager.executeCommand({
                        text: cmdText,
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
        } catch (error) {
            // Silent error
        }
    }

    async handleMessageDelete(update) {
        if (!this.antiDeleteEnabled || !update.key) return;
        
        try {
            const deletedMessage = await this.store.getMessage(update.key);
            if (!deletedMessage || deletedMessage.key?.fromMe) return;
            
            const sender = deletedMessage.key.participant || deletedMessage.key.remoteJid;
            const text = this.functions.extractText(deletedMessage.message) || '[Media]';
            
            this.recentDeletedMessages.unshift({
                key: update.key,
                sender: sender,
                text: text,
                deletedAt: Date.now()
            });
            
            if (this.recentDeletedMessages.length > this.maxDeletedMessages) {
                this.recentDeletedMessages.pop();
            }
        } catch (error) {
            // Silent error
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
        }, 45000); // Increased to 45 seconds
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
            botLogger.log('ERROR', 'Session cleanup error: ' + error.message);
        }
    }

    // ==============================
    // 💬 COMMAND HANDLERS
    // ==============================
    
    async helpCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let helpText = `🤖 *${config.BOT_NAME} Help*\n\n`;
        helpText += `Prefix: ${config.PREFIX}\n`;
        helpText += `Mode: ${config.BOT_MODE || 'public'}\n\n`;
        
        helpText += `*Commands:*\n`;
        helpText += `• ${config.PREFIX}help - This menu\n`;
        helpText += `• ${config.PREFIX}menu - Main menu\n`;
        helpText += `• ${config.PREFIX}ping - Bot status\n`;
        helpText += `• ${config.PREFIX}owner - Owner info\n`;
        helpText += `• ${config.PREFIX}stats - Statistics\n`;
        
        if (plugins.length > 0) {
            helpText += `\n*Plugins:* ${plugins.length} loaded`;
        }
        
        await sock.sendMessage(jid, { text: helpText }, { quoted: message });
    }

    async menuCommand(context) {
        const { jid, sock, message } = context;
        const menuText = `
*${config.BOT_NAME} Menu*

⚡ *Status*
• Uptime: ${(process.uptime() / 3600).toFixed(2)}h
• Connection: ${this.isConnected ? '✅' : '❌'}
• Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}

📋 *Commands*
• ${config.PREFIX}ping - Check status
• ${config.PREFIX}help - Show help
• ${config.PREFIX}owner - Owner info
• ${config.PREFIX}stats - Statistics
• ${config.PREFIX}plugins - List plugins
        `.trim();
        
        await sock.sendMessage(jid, { text: menuText }, { quoted: message });
    }

    async pingCommand(context) {
        const { jid, sock, message } = context;
        const start = Date.now();
        await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: message });
        const latency = Date.now() - start;
        
        const statusText = `
📊 *Status Report*

⚡ Latency: ${latency}ms
⏱️ Uptime: ${(process.uptime() / 3600).toFixed(2)}h
💾 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
🌐 Connection: ${this.isConnected ? 'Connected ✅' : 'Disconnected ❌'}
🤖 Bot: ${this.functions.botNumber || 'Unknown'}
        `.trim();
        
        await sock.sendMessage(jid, { text: statusText }, { quoted: message });
    }

    async ownerCommand(context) {
        const { jid, sock, message } = context;
        let ownerText = '👑 *Bot Owner*\n\n';
        
        if (this.functions.botNumber) {
            ownerText += `🤖 Connected: ${this.functions.botNumber}\n`;
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
        
        await sock.sendMessage(jid, { text: ownerText }, { quoted: message });
    }

    async statsCommand(context) {
        const { jid, sock, message } = context;
        
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const statsText = `
📊 *Bot Statistics*

⏱️ Uptime: ${hours}h ${minutes}m
💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
📦 Platform: ${process.platform}
🔌 Plugins: ${this.pluginManager.getCommandList().length}
🚨 Deleted Messages: ${this.recentDeletedMessages.length}
🌐 Status: ${this.isConnected ? 'Connected ✅' : 'Disconnected ❌'}
        `.trim();
        
        await sock.sendMessage(jid, { text: statsText }, { quoted: message });
    }

    async pluginsCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let pluginsText = `📦 *Plugins: ${plugins.length}*\n\n`;
        
        if (plugins.length === 0) {
            pluginsText += 'No plugins loaded.';
        } else {
            plugins.forEach((plugin, idx) => {
                pluginsText += `${idx + 1}. ${plugin.command}\n`;
            });
        }
        
        await sock.sendMessage(jid, { text: pluginsText }, { quoted: message });
    }

    async startCommand(context) {
        const { jid, sock, message } = context;
        
        const startText = `
✨ *${config.BOT_NAME}*

I'm a WhatsApp bot with various features.

Type ${config.PREFIX}help to see all commands.
Type ${config.PREFIX}menu for the main menu.
        `.trim();
        
        await sock.sendMessage(jid, { text: startText }, { quoted: message });
    }

    async antideleteCommand(context) {
        const { jid, sock, message, args } = context;
        
        if (!args[0]) {
            const status = this.antiDeleteEnabled ? '✅ Enabled' : '❌ Disabled';
            await sock.sendMessage(jid, {
                text: `🚨 *Anti-Delete*\n\nStatus: ${status}\nMessages: ${this.recentDeletedMessages.length}\n\nCommands:\n• ${config.PREFIX}antidelete on/off\n• ${config.PREFIX}antidelete list`
            }, { quoted: message });
            return;
        }
        
        const action = args[0].toLowerCase();
        
        if (action === 'on' || action === 'off') {
            this.antiDeleteEnabled = action === 'on';
            await sock.sendMessage(jid, { 
                text: `Anti-delete ${this.antiDeleteEnabled ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        } else if (action === 'list') {
            if (this.recentDeletedMessages.length > 0) {
                let listText = '📋 *Deleted Messages*\n\n';
                this.recentDeletedMessages.forEach((msg, index) => {
                    const timeAgo = Math.floor((Date.now() - msg.deletedAt) / 1000);
                    listText += `${index + 1}. ${timeAgo}s ago\n`;
                });
                await sock.sendMessage(jid, { text: listText }, { quoted: message });
            } else {
                await sock.sendMessage(jid, { text: 'No deleted messages.' }, { quoted: message });
            }
        }
    }

    async statusviewCommand(context) {
        const { jid, sock, message, args } = context;
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `📱 *Status Settings*\n\nAuto View: ${this.autoStatusView ? '✅' : '❌'}\nAuto Like: ${this.autoStatusLike ? '✅' : '❌'}\n\nCommands:\n• ${config.PREFIX}statusview on/off\n• ${config.PREFIX}statusview view\n• ${config.PREFIX}statusview like`
            }, { quoted: message });
            return;
        }
        
        if (action === 'on' || action === 'off') {
            this.autoStatusView = action === 'on';
            this.autoStatusLike = action === 'on';
            await sock.sendMessage(jid, { 
                text: `Status features ${action === 'on' ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        } else if (action === 'view') {
            this.autoStatusView = !this.autoStatusView;
            await sock.sendMessage(jid, { 
                text: `Auto-view ${this.autoStatusView ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        } else if (action === 'like') {
            this.autoStatusLike = !this.autoStatusLike;
            await sock.sendMessage(jid, { 
                text: `Auto-like ${this.autoStatusLike ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        }
    }

    async statussaverCommand(context) {
        const { jid, sock, message, args } = context;
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `💾 *Status Saver*\n\nSaver: ${this.statusSaver ? '✅' : '❌'}\nReply: ${this.statusReply ? '✅' : '❌'}\n\nCommands:\n• ${config.PREFIX}statussaver on/off\n• ${config.PREFIX}statussaver save\n• ${config.PREFIX}statussaver reply`
            }, { quoted: message });
            return;
        }
        
        if (action === 'on' || action === 'off') {
            this.statusSaver = action === 'on';
            this.statusReply = action === 'on';
            await sock.sendMessage(jid, { 
                text: `Status saver ${action === 'on' ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        } else if (action === 'save') {
            this.statusSaver = !this.statusSaver;
            await sock.sendMessage(jid, { 
                text: `Status Saver ${this.statusSaver ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        } else if (action === 'reply') {
            this.statusReply = !this.statusReply;
            await sock.sendMessage(jid, { 
                text: `Status Reply ${this.statusReply ? '✅ Enabled' : '❌ Disabled'}` 
            }, { quoted: message });
        }
    }
}

// ==============================
// 🚀 BOT INSTANCE CREATION
// ==============================
const bot = new SilvaBot();

// Start the bot with error handling
try {
    bot.init();
} catch (error) {
    botLogger.log('ERROR', 'Failed to start bot: ' + error.message);
    setTimeout(() => bot.init(), 10000);
}

// Export bot instance
module.exports = {
    bot,
    config,
    logger: botLogger,
    functions: new FunctionsWrapper()
};

// Error handlers
process.on('uncaughtException', (error) => {
    botLogger.log('ERROR', `Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    botLogger.log('ERROR', `Unhandled Rejection: ${reason}`);
});
