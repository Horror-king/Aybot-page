const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const https = require('https'); // This might not be strictly needed if you're deploying to a service that handles HTTPS, but kept for completeness
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = process.env.PORT || 3000;

// --- Admin Configuration ---
// IMPORTANT: Replace with actual Facebook User IDs of your administrators.
// For production, consider loading these from environment variables or a secure configuration.
const ADMIN_UIDS = ['61555393416824', 'YOUR_ADMIN_UID_2']; // <<< REPLACE WITH ACTUAL ADMIN UIDs

// --- Ensure directories exist ---
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const commandsDir = path.join(__dirname, 'commands');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir);

// --- Database and token files ---
const dbFile = path.join(dataDir, 'bot_memory.db');
const tokensFile = path.join(dataDir, 'tokens.json');
const tokenRefreshFile = path.join(dataDir, 'token_refresh.json');

// Initialize files if they don't exist
if (!fs.existsSync(tokensFile)) {
    fs.writeFileSync(tokensFile, JSON.stringify([]), 'utf8');
}
if (!fs.existsSync(tokenRefreshFile)) {
    fs.writeFileSync(tokenRefreshFile, JSON.stringify({}), 'utf8');
}

// --- Initialize SQLite database ---
const db = new sqlite3.Database(dbFile);

// Create tables if they don't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            message TEXT NOT NULL,
            sender TEXT NOT NULL,
            message_type TEXT DEFAULT 'text',
            metadata TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_context (
            user_id TEXT PRIMARY KEY,
            last_interaction DATETIME,
            conversation_state TEXT,
            user_preferences TEXT,
            conversation_history TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS message_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            sender_id TEXT,
            message_type TEXT,
            status TEXT,
            error_message TEXT,
            metadata TEXT
        )
    `);

    // New table for token management
    db.run(`
        CREATE TABLE IF NOT EXISTS token_management (
            page_id TEXT PRIMARY KEY,
            last_refresh DATETIME,
            expires_at DATETIME,
            refresh_token TEXT
        )
    `);
});

// --- Middleware ---
app.use(express.static(publicDir));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Enhanced logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// --- Command Handling ---
const commands = {}; // Global object to store loaded commands

// Recursively load command files from subdirectories
function loadCommands(dir = commandsDir) { // Default to commandsDir
    console.log('🔄 Reloading commands...');
    // Clear existing commands
    for (const key in commands) {
        delete commands[key];
    }

    // Clear require cache for all command files to ensure fresh load
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (file.endsWith('.js')) {
            delete require.cache[require.resolve(fullPath)];
        }
    });

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Recurse into subdirectory
            loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.name && typeof command.execute === 'function') {
                    commands[command.name] = command;
                    console.log(`Loaded command: ${command.name} from ${fullPath}`);
                } else {
                    console.warn(`Skipping invalid command file: ${fullPath} (missing name or execute function).`);
                }
            } catch (error) {
                console.error(`Failed to load command file: ${fullPath}`, error);
            }
        }
    }
    console.log(`✅ Commands reloaded. Total commands: ${Object.keys(commands).length}`);
}

// Load commands at startup
loadCommands(commandsDir);


// --- Bot Configuration ---
let bots = [];
try {
    const data = fs.readFileSync(tokensFile, 'utf8');
    bots = JSON.parse(data);
    console.log(`Loaded ${bots.length} bots from tokens.json`);
} catch (err) {
    console.error('Error reading tokens.json:', err);
}

// Load refresh tokens
let tokenRefreshData = {};
try {
    const data = fs.readFileSync(tokenRefreshFile, 'utf8');
    tokenRefreshData = JSON.parse(data);
} catch (err) {
    console.error('Error reading token_refresh.json:', err);
}

// Default bot configuration
const DEFAULT_VERIFY_TOKEN = "Hassan";
const PREFIX = "-"; // Changed from / to -

// Ensure a default bot exists
if (!bots.some(bot => bot.id === "default-bot")) {
    bots.push({
        id: "default-bot",
        verifyToken: DEFAULT_VERIFY_TOKEN,
        pageAccessToken: "DUMMY_TOKEN", // Placeholder
        geminiKey: "DUMMY_KEY" // Placeholder
    });
    saveBots(); // Save the default bot
}

// --- Helper functions ---
function saveBots() {
    return new Promise((resolve, reject) => {
        fs.writeFile(tokensFile, JSON.stringify(bots, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error saving bots:', err);
                reject(err);
            } else {
                console.log('Bots saved to tokens.json');
                resolve();
            }
        });
    });
}

function saveTokenRefreshData() {
    return new Promise((resolve, reject) => {
        fs.writeFile(tokenRefreshFile, JSON.stringify(tokenRefreshData, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error saving token refresh data:', err);
                reject(err);
            } else {
                console.log('Token refresh data saved');
                resolve();
            }
        });
    });
}

function getCurrentTime() {
    return new Date().toISOString();
}

function splitLongMessage(message, maxLength = 2000) {
    if (message.length <= maxLength) return [message];
    const chunks = [];
    while (message.length > 0) {
        let splitPoint = message.lastIndexOf(' ', maxLength);
        if (splitPoint === -1) splitPoint = maxLength; // If no space found, just split at maxLength
        chunks.push(message.substring(0, splitPoint));
        message = message.substring(splitPoint).trim();
    }
    return chunks;
}

// --- Token Management Functions ---
async function validateAccessToken(token) {
    try {
        const response = await axios.get('https://graph.facebook.com/v19.0/me', {
            params: { access_token: token }
        });
        return !response.data.error; // Returns true if no error object is present
    } catch (error) {
        console.error('Token validation error:', error.response?.data?.error?.message || error.message);
        return false;
    }
}

async function refreshAccessToken(refreshToken) {
    try {
        // IMPORTANT: Replace with actual App ID and App Secret from Facebook Developer App
        // For local testing, you might hardcode them here or load from a config file.
        // For production, use environment variables.
        const FB_APP_ID = "23926875990311589"; // <<< REMEMBER TO CHANGE THIS
        const FB_APP_SECRET = "2a781d05db8ac5c12f0b7b660f8df93f"; // <<< REMEMBER TO CHANGE THIS

        if (FB_APP_ID === "YOUR_FACEBOOK_APP_ID" || FB_APP_SECRET === "YOUR_FACEBOOK_APP_SECRET") {
               console.warn('⚠️ Facebook App ID or App Secret not configured. Token refresh might fail.');
               // Optionally, throw an error or handle this more gracefully if these are mandatory for your setup.
        }


        const response = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: FB_APP_ID,
                client_secret: FB_APP_SECRET,
                fb_exchange_token: refreshToken
            }
        });

        const { access_token, expires_in } = response.data;
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // Update the bot configuration (assuming 'default-bot' is the one to update)
        const defaultBotIndex = bots.findIndex(bot => bot.id === "default-bot");
        if (defaultBotIndex !== -1) {
            bots[defaultBotIndex].pageAccessToken = access_token;
            await saveBots();
        } else {
            console.warn("Default bot not found, could not update pageAccessToken.");
        }

        // Update refresh data
        tokenRefreshData['default'] = {
            lastRefresh: new Date().toISOString(),
            expiresAt,
            refreshToken: access_token // The new long-lived token acts as the refresh token
        };
        await saveTokenRefreshData();

        return access_token;

    } catch (error) {
        console.error('Token refresh failed:', error.response?.data?.error?.message || error.message);
        throw error;
    }
}

// --- Database operations ---
function storeMessage(userId, message, sender, messageType = "text", metadata = null) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO conversations (user_id, message, sender, message_type, metadata, timestamp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, message, sender, messageType, JSON.stringify(metadata), getCurrentTime()],
            function(err) {
                if (err) return reject(err);

                db.get(
                    `SELECT conversation_history FROM user_context WHERE user_id = ?`,
                    [userId],
                    (err, row) => {
                        if (err) return reject(err);

                        const history = row?.conversation_history ? JSON.parse(row.conversation_history) : [];
                        const role = sender === "user" ? "user" : "assistant";

                        history.push({
                            role,
                            content: message,
                            type: messageType
                        });

                        const limitedHistory = history.slice(-50); // Keep last 50 messages

                        db.run(
                            `INSERT OR REPLACE INTO user_context
                             (user_id, last_interaction, conversation_history)
                             VALUES (?, ?, ?)`,
                            [userId, getCurrentTime(), JSON.stringify(limitedHistory)],
                            (err) => {
                                if (err) return reject(err);
                                resolve();
                            }
                        );
                    }
                );
            }
        );
    });
}

function getConversationHistory(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT conversation_history FROM user_context WHERE user_id = ?`,
            [userId],
            (err, row) => {
                if (err) return reject(err);
                resolve(row?.conversation_history ? JSON.parse(row.conversation_history) : []);
            }
        );
    });
}

function logMessageStatus(senderId, messageType, status, errorMessage = null, metadata = null) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO message_logs
             (sender_id, message_type, status, error_message, metadata, timestamp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [senderId, messageType, status, errorMessage, JSON.stringify(metadata), getCurrentTime()],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// --- Facebook Message Sending Function ---
async function sendFacebookMessage(recipientId, message, accessToken) {
    try {
        // First validate the token
        const isValid = await validateAccessToken(accessToken);

        if (!isValid) {
            console.log('⚠️ Token invalid or expired. Attempting refresh...');

            // Check if we have a refresh token
            const refreshInfo = tokenRefreshData['default']; // Assuming 'default' key for refresh info
            if (refreshInfo && refreshInfo.refreshToken) {
                try {
                    const newToken = await refreshAccessToken(refreshInfo.refreshToken);
                    console.log('🔄 Successfully refreshed access token');

                    // Retry with new token
                    return await sendFacebookMessage(recipientId, message, newToken);
                } catch (refreshError) {
                    console.error('❌ Failed to refresh token:', refreshError);
                    throw new Error('Access token expired and refresh failed. Please update the token.');
                }
            } else {
                throw new Error('Access token expired and no refresh token available. Please update the token.');
            }
        }

        // Process message sending
        const messages = typeof message === 'string' ? splitLongMessage(message) : [message];

        for (const msg of messages) {
            const messageData = {
                messaging_type: "RESPONSE",
                recipient: {
                    id: recipientId
                },
                message: {
                    text: msg
                }
            };

            const response = await axios.post(
                `https://graph.facebook.com/v19.0/me/messages`,
                messageData,
                {
                    params: { access_token: accessToken },
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            await logMessageStatus(recipientId, 'text', 'success', null, response.data);
            console.log(`📨 Message sent to ${recipientId}`);
        }

        return true;

    } catch (error) {
        console.error('❌ Error sending message:', error.response?.data?.error?.message || error.message);
        await logMessageStatus(
            recipientId,
            'text',
            'failed',
            error.response?.data?.error?.message || error.message,
            error.response?.data
        );
        throw error;
    }
}

// --- Gemini AI Integration ---
async function generateGeminiReply(userText, geminiKey, history = []) {
    try {
        console.log('🧠 Generating Gemini reply...');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        let prompt = "Your name is KORA AI. Reply with soft vibes. Here's our conversation so far:\n\n";
        history.forEach(msg => {
            prompt += `${msg.role === 'user' ? 'User' : 'KORA AI'}: ${msg.content}\n`;
        });
        prompt += `\nUser: ${userText}\nKORA AI:`;

        const result = await model.generateContent(prompt);
        const response = await result.response.text();

        console.log('✅ Gemini response generated successfully');
        return response;

    } catch (e) {
        console.error("❌ Gemini error:", e);
        return "KORA AI is taking a break. Please try again later.";
    }
}

// --- API Endpoints ---
app.post('/set-tokens', async (req, res) => {
    try {
        const { verifyToken, pageAccessToken, geminiKey, refreshToken } = req.body;

        if (!verifyToken || !pageAccessToken || !geminiKey) {
            return res.status(400).send("Required fields: verifyToken, pageAccessToken, geminiKey");
        }

        // Validate Facebook token
        try {
            const isValid = await validateAccessToken(pageAccessToken);
            if (!isValid) {
                return res.status(400).send("Invalid Page Access Token");
            }
        } catch (error) {
            return res.status(400).send(`Failed to validate Page Access Token: ${error.message}`);
        }

        // Update bot configuration (assuming we are always updating the default bot)
        const defaultBotIndex = bots.findIndex(bot => bot.id === "default-bot");
        if (defaultBotIndex !== -1) {
            bots[defaultBotIndex] = {
                id: "default-bot",
                verifyToken,
                pageAccessToken,
                geminiKey,
                createdAt: getCurrentTime()
            };
            console.log(`🔄 Bot configuration updated`);
        } else {
            // This case should ideally not happen if a default bot is pushed at startup
            bots.push({
                id: "default-bot",
                verifyToken,
                pageAccessToken,
                geminiKey,
                createdAt: getCurrentTime()
            });
            console.log(`➕ Default bot created`);
        }


        // Save refresh token if provided
        if (refreshToken) {
            tokenRefreshData['default'] = {
                lastRefresh: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
                refreshToken
            };
            await saveTokenRefreshData();
        }

        await saveBots();
        res.send("✅ Bot configuration saved successfully!");

    } catch (error) {
        console.error('Error in /set-tokens:', error);
        res.status(500).send("Internal server error");
    }
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔍 Webhook Verification Request:', {
        mode,
        token,
        challenge,
        allVerifyTokens: bots.map(b => b.verifyToken),
        ip: req.ip
    });

    const matchingBot = bots.find(b => b.verifyToken === token);

    if (mode === 'subscribe' && matchingBot) {
        console.log(`✅ Webhook verified for bot ${matchingBot.id}`);
        return res.status(200).send(challenge);
    }

    console.error('❌ Webhook verification failed', {
        reason: !mode ? 'Missing hub.mode' :
            !token ? 'Missing hub.verify_token' :
                !matchingBot ? 'No matching verify token found' : 'Unknown reason',
        receivedToken: token,
        expectedTokens: bots.map(b => b.verifyToken),
        mode
    });

    res.sendStatus(403);
});


// Webhook handler with enhanced error handling
app.post('/webhook', async (req, res) => {
    try {
        console.log('📩 Received webhook event:', JSON.stringify(req.body, null, 2));

        const body = req.body;
        if (body.object !== 'page') {
            console.warn('⚠️ Received non-page object:', body.object);
            return res.sendStatus(404);
        }

        for (const entry of body.entry) {
            const messaging = entry.messaging;
            if (!messaging || !Array.isArray(messaging)) {
                console.warn('No messaging events in entry, skipping.');
                continue;
            }

            for (const event of messaging) {
                const senderId = event.sender?.id;
                const messageText = event.message?.text;
                const attachments = event.message?.attachments || [];

                if (!senderId) {
                    console.warn('No sender ID found in event, skipping.');
                    continue;
                }

                console.log(`Message from ${senderId}:`, messageText || '[non-text message]', attachments.length > 0 ? '[attachments]' : '');

                // Find bot config (assuming single default bot)
                const bot = bots[0];
                if (!bot) {
                    console.error('No bot config found, cannot process message.');
                    continue;
                }

                await storeMessage(senderId, messageText || JSON.stringify(attachments), 'user', messageText ? 'text' : 'attachment');

                // Only process text messages for now for Gemini or commands
                if (messageText) {
                    try {
                        if (messageText.startsWith(PREFIX)) {
                            // Handle command
                            const args = messageText.slice(PREFIX.length).trim().split(/\s+/);
                            const commandName = args.shift().toLowerCase();
                            const command = commands[commandName];

                            if (command) {
                                console.log(`Executing command: ${commandName} for ${senderId}`);
                                // Pass necessary functions to command.execute
                                await command.execute(senderId, args, bot.pageAccessToken, sendFacebookMessage, loadCommands);
                                // Commands are responsible for sending their own responses
                            } else {
                                const response = `Unknown command: \`${PREFIX}${commandName}\`.`;
                                await sendFacebookMessage(senderId, response, bot.pageAccessToken);
                                await storeMessage(senderId, response, 'bot');
                            }
                        } else {
                            // Handle regular message with Gemini
                            const history = await getConversationHistory(senderId);
                            const geminiReply = await generateGeminiReply(messageText, bot.geminiKey, history);
                            console.log('Sending reply:', geminiReply);

                            await sendFacebookMessage(senderId, geminiReply, bot.pageAccessToken);
                            await storeMessage(senderId, geminiReply, 'bot');
                        }
                    } catch (error) {
                        console.error('Error processing message or sending reply:', error);
                        const errorMessage = "Oops! Something went wrong while I was trying to respond. Please try again later.";
                        await sendFacebookMessage(senderId, errorMessage, bot.pageAccessToken);
                        await storeMessage(senderId, errorMessage, 'bot', 'text', { error: error.message });
                    }
                } else if (attachments.length > 0) {
                    // Handle attachments
                    const response = "I received your attachment! (I'm currently configured to only process text, but I got this!)";
                    await sendFacebookMessage(senderId, response, bot.pageAccessToken);
                    await storeMessage(senderId, response, 'bot');
                }
            }
        }

        res.status(200).send('EVENT_RECEIVED');

    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Internal server error');
    }
});

// --- Additional API endpoints ---
app.get('/bots', (req, res) => {
    res.json({
        bots: bots.filter(bot => bot.pageAccessToken !== "DUMMY_TOKEN"),
        defaultVerifyToken: DEFAULT_VERIFY_TOKEN,
        serverTime: getCurrentTime()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: getCurrentTime(),
        botCount: bots.length
    });
});

app.get('/history', async (req, res) => {
    const userId = req.query.userId;
    const adminCode = req.query.adminCode;

    if (!userId) {
        return res.status(400).json({ error: "userId parameter is required" });
    }

    if (!adminCode || adminCode !== "ICU14CU") { // Secure this admin code!
        return res.status(403).json({ error: "Invalid admin code" });
    }

    try {
        const history = await getConversationHistory(userId);
        res.json({ userId, conversationHistory: history });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Serve HTML interface
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// --- Start server with token validation ---
app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
    console.log('🔐 Default verify token:', DEFAULT_VERIFY_TOKEN);
    console.log('🤖 Configured bots:', bots.filter(b => b.pageAccessToken !== "DUMMY_TOKEN").length);

    // Validate tokens on startup
    bots.forEach(async (bot) => {
        if (bot.pageAccessToken !== "DUMMY_TOKEN") {
            try {
                const isValid = await validateAccessToken(bot.pageAccessToken);
                console.log(`ℹ️ Token status for ${bot.id}: ${isValid ? 'Valid' : 'Invalid'}`);

                if (!isValid) {
                    console.log(`Attempting to refresh token for ${bot.id}...`);
                    const refreshInfo = tokenRefreshData['default'];
                    if (refreshInfo?.refreshToken) {
                        try {
                            await refreshAccessToken(refreshInfo.refreshToken);
                            console.log(`Token refreshed successfully for ${bot.id}.`);
                        } catch (refreshError) {
                            console.error(`Failed to refresh token for ${bot.id}:`, refreshError.message);
                        }
                    } else {
                        console.warn(`No refresh token found for ${bot.id}. Manual update might be needed.`);
                    }
                }
            } catch (error) {
                console.error(`Error checking token for ${bot.id}:`, error.message);
            }
        }
    });
});

// --- Export necessary variables for commands to access ---
// These exports must be at the very end of index.js, before any other unrelated code.
module.exports.ADMIN_UIDS = ADMIN_UIDS;
module.exports.PREFIX = PREFIX;
module.exports.sendFacebookMessage = sendFacebookMessage;
module.exports.loadCommands = loadCommands;
module.exports.db = db; // Export db if commands need direct database access
// Add any other exports necessary for your commands
