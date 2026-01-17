
// Multi-Language Code Compiler Plugin  Silva MD Bot
const config = require('../config')
const axios = require('axios')

const handler = {
    help: ['compile', 'run', 'code'],
    tags: ['tools', 'programming'],
    command: /^(compile|run|code|compile-py|compile-js|compile-java|compile-cpp|compile-c|compile-go|compile-rust|compile-php|compile-rb|compile-swift|compile-kt|compile-ts)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid

        try {
            // Get the full message text
            const fullText = message.message?.conversation || 
                           message.message?.extendedTextMessage?.text || ''

            // Extract command from the message
            const cmd = fullText.trim().split(' ')[0].replace(config.PREFIX, '')
            const command = cmd.toLowerCase()

            // Check if user wants help
            if (args[0]?.toLowerCase() === 'help' || !fullText.includes(' ')) {
                return sendHelp(sock, jid, message, sender)
            }

            // Extract language and code
            let language = ''
            let code = ''

            // Check if command specifies language (e.g., compile-py, compile-js)
            const cmdMatch = command.match(/^(compile|run|code)-(py|python|js|javascript|java|cpp|c|go|rust|php|rb|swift|kt|ts|node|nodejs)$/)
            
            if (cmdMatch) {
                // Language-specific command
                language = cmdMatch[2]
                code = fullText.replace(new RegExp(`^${config.PREFIX}${command}\\s*`, 'i'), '').trim()
            } else {
                // Generic compile command: .compile <language> <code>
                const parts = fullText.replace(new RegExp(`^${config.PREFIX}${command}\\s*`, 'i'), '').trim()
                const firstSpace = parts.indexOf(' ')
                
                if (firstSpace === -1) {
                    return sendHelp(sock, jid, message, sender)
                }

                language = parts.substring(0, firstSpace).toLowerCase()
                code = parts.substring(firstSpace + 1).trim()
            }

            // Remove code block markers if present
            code = code.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()

            if (!code) {
                return sendHelp(sock, jid, message, sender)
            }

            // Send "compiling" message
            await sock.sendMessage(jid, {
                text: `⏳ Compiling ${getLanguageName(language)} code...`,
                contextInfo: createContext(sender, 'SILVA MD • COMPILER')
            }, { quoted: message })

            // Compile and run the code
            const result = await compileCode(language, code)

            // Send result
            await sock.sendMessage(jid, {
                text: result,
                contextInfo: createContext(sender, 'SILVA MD • COMPILER')
            }, { quoted: message })

        } catch (error) {
            console.error('[COMPILER] Error:', error)
            await sock.sendMessage(jid, {
                text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴄᴏᴍᴘɪʟᴇʀ ᴇʀʀᴏʀ   ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ ${error.message}

💡 Use ${config.PREFIX}compile help for usage info`,
                contextInfo: createContext(sender, 'SILVA MD • ERROR')
            }, { quoted: message })
        }
    }
}

// ========================================
// COMPILE CODE USING JDoodle API
// ========================================
async function compileCode(language, code) {
    // Map language aliases to JDoodle language codes
    const languageMap = {
        // Python
        'py': 'python3',
        'python': 'python3',
        'python3': 'python3',
        'python2': 'python2',
        
        // JavaScript
        'js': 'nodejs',
        'javascript': 'nodejs',
        'node': 'nodejs',
        'nodejs': 'nodejs',
        
        // TypeScript
        'ts': 'nodejs',
        'typescript': 'nodejs',
        
        // Java
        'java': 'java',
        
        // C/C++
        'c': 'c',
        'cpp': 'cpp17',
        'c++': 'cpp17',
        'csharp': 'csharp',
        'cs': 'csharp',
        
        // Go
        'go': 'go',
        'golang': 'go',
        
        // Rust
        'rust': 'rust',
        'rs': 'rust',
        
        // PHP
        'php': 'php',
        
        // Ruby
        'ruby': 'ruby',
        'rb': 'ruby',
        
        // Swift
        'swift': 'swift',
        
        // Kotlin
        'kotlin': 'kotlin',
        'kt': 'kotlin',
        
        // Others
        'r': 'r',
        'scala': 'scala',
        'perl': 'perl',
        'bash': 'bash',
        'shell': 'bash',
        'sh': 'bash',
        'sql': 'sql',
        'vb': 'vbn',
    }

    const jdoodleLanguage = languageMap[language.toLowerCase()]

    if (!jdoodleLanguage) {
        throw new Error(`Unsupported language: ${language}\n\nSupported: python, js, java, c, cpp, go, rust, php, ruby, swift, kotlin, etc.`)
    }

    try {
        // Using JDoodle API (Free tier)
        const response = await axios.post('https://api.jdoodle.com/v1/execute', {
            clientId: '4b2ec22b2642d9934a357c874ae6d7d', // Free public client ID
            clientSecret: 'e3d1fc82d9d38bbd732e5a820c3c3c6c1e4b3b9e4f5d4c1e6b7e9f2a5c8d1f3', // Free public secret
            script: code,
            language: jdoodleLanguage,
            versionIndex: '0' // Latest version
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        })

        const { output, statusCode, memory, cpuTime, error } = response.data

        if (error) {
            return formatError(language, error)
        }

        return formatOutput(language, output, statusCode, memory, cpuTime)

    } catch (error) {
        if (error.response) {
            throw new Error(`API Error: ${error.response.data?.error || error.response.statusText}`)
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('Compilation timeout - code took too long to execute')
        } else {
            throw new Error(`Network error: ${error.message}`)
        }
    }
}

// ========================================
// FORMAT OUTPUT
// ========================================
function formatOutput(language, output, statusCode, memory, cpuTime) {
    const langName = getLanguageName(language)
    const status = statusCode === 200 ? '✅ SUCCESS' : '⚠️ WARNING'

    let result = `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ${status.padEnd(18)} ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🔤 Language: ${langName}
⏱️ CPU Time: ${cpuTime || 'N/A'}
💾 Memory: ${memory || 'N/A'}

📤 OUTPUT:
${'-'.repeat(40)}
${output.trim() || '(no output)'}
${'-'.repeat(40)}`

    return result
}

// ========================================
// FORMAT ERROR
// ========================================
function formatError(language, error) {
    const langName = getLanguageName(language)

    return `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ❌ ERROR         ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🔤 Language: ${langName}

📛 ERROR:
${'-'.repeat(40)}
${error.trim()}
${'-'.repeat(40)}`
}

// ========================================
// GET LANGUAGE FULL NAME
// ========================================
function getLanguageName(lang) {
    const names = {
        'py': 'Python',
        'python': 'Python',
        'python3': 'Python 3',
        'python2': 'Python 2',
        'js': 'JavaScript',
        'javascript': 'JavaScript',
        'node': 'Node.js',
        'nodejs': 'Node.js',
        'ts': 'TypeScript',
        'typescript': 'TypeScript',
        'java': 'Java',
        'c': 'C',
        'cpp': 'C++',
        'c++': 'C++',
        'csharp': 'C#',
        'cs': 'C#',
        'go': 'Go',
        'golang': 'Go',
        'rust': 'Rust',
        'rs': 'Rust',
        'php': 'PHP',
        'ruby': 'Ruby',
        'rb': 'Ruby',
        'swift': 'Swift',
        'kotlin': 'Kotlin',
        'kt': 'Kotlin',
        'r': 'R',
        'scala': 'Scala',
        'perl': 'Perl',
        'bash': 'Bash',
        'shell': 'Shell',
        'sh': 'Shell',
        'sql': 'SQL',
        'vb': 'Visual Basic'
    }

    return names[lang.toLowerCase()] || lang.toUpperCase()
}

// ========================================
// SEND HELP MESSAGE
// ========================================
async function sendHelp(sock, jid, message, sender) {
    const helpText = `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴄᴏᴅᴇ ᴄᴏᴍᴘɪʟᴇʀ   ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🚀 Compile and run code in multiple languages!

ᴜsᴀɢᴇ ᴍᴇᴛʜᴏᴅ 1:
${config.PREFIX}compile <language> <code>

ᴜsᴀɢᴇ ᴍᴇᴛʜᴏᴅ 2:
${config.PREFIX}compile-<lang> <code>

ᴇxᴀᴍᴘʟᴇs:
• ${config.PREFIX}compile py print("Hello World")
• ${config.PREFIX}compile-py print("Hello")
• ${config.PREFIX}compile js console.log("Hello")
• ${config.PREFIX}compile-java public class Main { public static void main(String[] args) { System.out.println("Hello"); } }

sᴜᴘᴘᴏʀᴛᴇᴅ ʟᴀɴɢᴜᴀɢᴇs:
• Python → py, python
• JavaScript → js, node, nodejs
• TypeScript → ts, typescript
• Java → java
• C → c
• C++ → cpp, c++
• C# → cs, csharp
• Go → go, golang
• Rust → rust, rs
• PHP → php
• Ruby → ruby, rb
• Swift → swift
• Kotlin → kotlin, kt
• R → r
• Scala → scala
• Perl → perl
• Bash → bash, shell, sh
• SQL → sql

💡 ᴛɪᴘs:
• Enclose multi-line code in triple backticks
• Maximum execution time: 30 seconds
• Free tier has rate limits

ᴇxᴀᴍᴘʟᴇ ᴡɪᴛʜ ᴄᴏᴅᴇ ʙʟᴏᴄᴋ:
${config.PREFIX}compile py \`\`\`
def greet(name):
    return f"Hello {name}"
print(greet("World"))
\`\`\``

    return sock.sendMessage(jid, {
        text: helpText,
        contextInfo: createContext(sender, 'SILVA MD • COMPILER')
    }, { quoted: message })
}

// ========================================
// CONTEXT HELPER
// ========================================
function createContext(sender, name) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363200367779016@newsletter',
            newsletterName: name,
            serverMessageId: Math.floor(Math.random() * 1000)
        }
    }
}

module.exports = { handler }