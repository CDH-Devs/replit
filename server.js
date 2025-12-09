import express from 'express';
import { WorkerHandlers } from './handlers.js';
import { downloadTikTokVideo } from './api.js';
import { formatTikTokCaption, htmlBold } from './helpers.js';
import { PROGRESS_STATES, BOT_TOKEN, OWNER_ID } from './config.js';
import { downloadAndSendSongs } from './youtube.js';
import { isAlreadyDownloaded, addToHistory, getDownloadedCount } from './songHistory.js';

const app = express();
app.use(express.json());

const userInlineKeyboard = [
    [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]
];

const userDatabase = new Map();
const songQueryCache = new Map();
let ownerMode = 'owner';

const env = {
    BOT_TOKEN: BOT_TOKEN,
    OWNER_ID: OWNER_ID,
    USER_DATABASE: {
        async get(key) {
            return userDatabase.get(key) || null;
        },
        async put(key, value, options = {}) {
            userDatabase.set(key, value);
        },
        async delete(key) {
            userDatabase.delete(key);
        },
        async list(options = {}) {
            const keys = [];
            for (const key of userDatabase.keys()) {
                if (options.prefix && key.startsWith(options.prefix)) {
                    keys.push({ name: key });
                }
            }
            return { keys };
        }
    }
};

const ctx = {
    waitUntil: (promise) => {
        Promise.resolve(promise).catch(err => console.log('[Context] Background task error:', err.message));
    }
};

app.get('/', (req, res) => {
    res.send('Hello! I am LK NEWS Download Bot - Your TikTok Video Downloader.');
});

app.post('/', async (req, res) => {
    const handlers = new WorkerHandlers(env);
    
    const getVideoKeyboard = (videoUrl, videoCaption, isOwnerUser = false) => {
        if (ownerMode === 'owner' && isOwnerUser) {
            return [
                [
                    { text: '🎵 Extract Audio', callback_data: `extract_audio_${Date.now()}` }
                ]
            ];
        }
        return [[{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]];
    };
    
    const initialProgressKeyboard = [
        [{ text: PROGRESS_STATES[0].text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
    ];

    try {
        const update = req.body;
        console.log('[Bot] Received update:', JSON.stringify(update).substring(0, 300));
        
        const message = update.message;
        const callbackQuery = update.callback_query;
        
        if (!message && !callbackQuery) {
            console.log('[Bot] No message or callback query found');
            return res.status(200).send('OK');
        }
        
        if (message) {
            console.log('[Bot] Processing message from user:', message.from?.id);
        }
        if (callbackQuery) {
            console.log('[Bot] Processing callback query:', callbackQuery.data);
        }

        if (message) { 
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text ? message.text.trim() : null; 
            const isOwner = env.OWNER_ID && chatId.toString() === env.OWNER_ID.toString();
            
            const userName = message.from.first_name || "User"; 

            ctx.waitUntil(handlers.saveUserId(chatId));

            if (isOwner && message.reply_to_message) {
                const repliedMessage = message.reply_to_message;
                
                if (repliedMessage.text && repliedMessage.text.includes("Please reply with the message you want to broadcast:")) {
                    
                    const messageToBroadcastId = messageId; 
                    const originalChatId = chatId;
                    const promptMessageId = repliedMessage.message_id; 

                    await handlers.editMessage(chatId, promptMessageId, htmlBold("📣 Broadcast started. Please wait."));
                    
                    ctx.waitUntil((async () => {
                        try {
                            const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                            
                            const resultMessage = htmlBold('Broadcast Complete ✅') + `\n\n`
                                                + htmlBold(`🚀 Successful: `) + results.successfulSends + '\n'
                                                + htmlBold(`❗️ Failed/Blocked: `) + results.failedSends;
                            
                            await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                        } catch (e) {
                            await handlers.sendMessage(chatId, htmlBold("❌ Broadcast Process Failed.") + `\n\nError: ${e.message}`, messageToBroadcastId);
                        }
                    })()); 

                    return res.status(200).send('OK');
                }
            }
            
            if (isOwner && text && text.toLowerCase().startsWith('/brod') && message.reply_to_message) {
                const messageToBroadcastId = message.reply_to_message.message_id; 
                const originalChatId = chatId;
                
                await handlers.sendMessage(chatId, htmlBold("📣 Quick Broadcast started..."), messageId);

                ctx.waitUntil((async () => {
                    try {
                        const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                        
                        const resultMessage = htmlBold('Quick Broadcast Complete ✅') + `\n\n`
                                            + htmlBold(`🚀 Successful: `) + results.successfulSends + '\n'
                                            + htmlBold(`❗️ Failed/Blocked: `) + results.failedSends;
                        
                        await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                    } catch (e) {
                        await handlers.sendMessage(chatId, htmlBold("❌ Quick Broadcast failed.") + `\n\nError: ${e.message}`, messageId);
                    }
                })());

                return res.status(200).send('OK');
            }
            
            if (text && text.toLowerCase().startsWith('/start')) {
                
                if (isOwner) {
                    const modeText = ownerMode === 'owner' ? '👑 Owner Mode' : '👤 User Mode';
                    const ownerText = htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.\n\n" + htmlBold(`Current Mode: ${modeText}`);
                    const adminKeyboard = [
                        [
                            { text: ownerMode === 'owner' ? '✅ Owner Mode' : '👑 Owner Mode', callback_data: 'set_mode_owner' },
                            { text: ownerMode === 'user' ? '✅ User Mode' : '👤 User Mode', callback_data: 'set_mode_user' }
                        ],
                        [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                        [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                        [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }] 
                    ];
                    await handlers.sendMessage(chatId, ownerText, messageId, adminKeyboard);
                } else {
                    const userText = `👋 <b>Hello ${userName}!</b>

🎬 Welcome to <b>LK NEWS Download Bot</b>!

📌 <b>Available Commands:</b>

<b>🎥 /tiktok [url]</b>
Download TikTok videos without watermark
Example: <code>/tiktok https://vm.tiktok.com/xxx</code>

<b>🎵 /song [name or url]</b>
Download songs from YouTube
Example: <code>/song new sinhala dj song</code>
Example: <code>/song https://youtube.com/watch?v=xxx</code>

◇───────────────◇

🚀 <b>TikTok + YouTube Downloader</b>
🔥 <b>Powered by Replit</b>

◇───────────────◇`;
                    
                    await handlers.sendMessage(chatId, userText, messageId, userInlineKeyboard);
                }
                return res.status(200).send('OK');
            }

            if (text && text.toLowerCase().startsWith('/song')) {
                const query = text.replace(/^\/song\s*/i, '').trim();
                
                if (!query) {
                    await handlers.sendMessage(
                        chatId, 
                        htmlBold('🎵 YouTube Song Downloader') + '\n\n' +
                        'Usage: <code>/song [name or url]</code>\n\n' +
                        'Examples:\n' +
                        '• <code>/song new sinhala dj song</code>\n' +
                        '• <code>/song alan walker faded</code>\n' +
                        '• <code>/song https://youtube.com/watch?v=xxx</code>',
                        messageId
                    );
                    return res.status(200).send('OK');
                }
                
                const queryId = `song_${chatId}_${Date.now()}`;
                songQueryCache.set(queryId, { query, chatId, timestamp: Date.now() });
                
                const songCountKeyboard = [
                    [
                        { text: '1 Song', callback_data: `songcount_1_${queryId}` },
                        { text: '5 Songs', callback_data: `songcount_5_${queryId}` }
                    ],
                    [
                        { text: '15 Songs', callback_data: `songcount_15_${queryId}` },
                        { text: '50 Songs', callback_data: `songcount_50_${queryId}` }
                    ]
                ];
                
                await handlers.sendMessage(
                    chatId,
                    htmlBold('🎵 YouTube Song Downloader') + '\n\n' +
                    `🔍 Query: <i>${query}</i>\n\n` +
                    htmlBold('How many songs do you want to download?'),
                    messageId,
                    songCountKeyboard
                );
                
                return res.status(200).send('OK');
            }

            if (text && text.toLowerCase().startsWith('/tiktok')) {
                const tiktokUrl = text.replace(/^\/tiktok\s*/i, '').trim();
                
                if (!tiktokUrl) {
                    await handlers.sendMessage(
                        chatId,
                        htmlBold('🎥 TikTok Video Downloader') + '\n\n' +
                        'Usage: <code>/tiktok [url]</code>\n\n' +
                        'Example:\n' +
                        '• <code>/tiktok https://vm.tiktok.com/xxx</code>\n' +
                        '• <code>/tiktok https://www.tiktok.com/@user/video/123</code>',
                        messageId
                    );
                    return res.status(200).send('OK');
                }
                
                const isTikTokLink = /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(tiktokUrl);
                
                if (!isTikTokLink) {
                    await handlers.sendMessage(chatId, htmlBold('❌ Please provide a valid TikTok URL.'), messageId);
                    return res.status(200).send('OK');
                }
                
                ctx.waitUntil(handlers.sendAction(chatId, 'typing'));

                const initialText = htmlBold('⏳ Fetching TikTok video... Please wait.'); 
                const progressMessageId = await handlers.sendMessage(
                    chatId, 
                    initialText, 
                    messageId, 
                    initialProgressKeyboard
                );
                
                if (progressMessageId) {
                    ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                }
                
                try {
                    const videoData = await downloadTikTokVideo(tiktokUrl);
                    
                    if (!videoData.success) {
                        handlers.progressActive = false;
                        const errorText = htmlBold('❌ Failed to fetch video.') + `\n\n${videoData.error || 'The video might be private or unavailable.'}`;
                        if (progressMessageId) {
                            await handlers.editMessage(chatId, progressMessageId, errorText);
                        } else {
                            await handlers.sendMessage(chatId, errorText, messageId);
                        }
                        return res.status(200).send('OK');
                    }
                    
                    if (videoData.type === 'image' && videoData.images && videoData.images.length > 0) {
                        handlers.progressActive = false;
                        if (progressMessageId) {
                            await handlers.deleteMessage(chatId, progressMessageId);
                        }
                        
                        const caption = formatTikTokCaption(videoData);
                        await handlers.sendPhotos(chatId, videoData.images, caption, messageId, userInlineKeyboard);
                        return res.status(200).send('OK');
                    }
                    
                    const finalCaption = formatTikTokCaption(videoData);
                    const videoUrl = videoData.videoUrl;
                    
                    if (videoUrl) {
                        handlers.progressActive = false; 
                        
                        if (progressMessageId) {
                            await handlers.deleteMessage(chatId, progressMessageId);
                        }
                        
                        ctx.waitUntil(handlers.sendAction(chatId, 'upload_video'));
                        
                        try {
                            const videoKeyboard = getVideoKeyboard(videoUrl, finalCaption, isOwner);
                            const buttonId = videoKeyboard[0][0].callback_data;
                            if (buttonId.startsWith('extract_audio_')) {
                                await handlers.cacheVideoForAudio(chatId, buttonId, videoUrl, finalCaption);
                            }
                            
                            if (videoData.videoHD && videoData.videoSD) {
                                await handlers.sendVideoWithQualityFallback(
                                    chatId,
                                    videoData.videoHD,
                                    videoData.videoSD,
                                    finalCaption,
                                    messageId,
                                    videoData.thumbnail,
                                    videoKeyboard
                                );
                            } else {
                                await handlers.sendVideo(
                                    chatId, 
                                    videoUrl, 
                                    finalCaption, 
                                    messageId, 
                                    videoData.thumbnail, 
                                    videoKeyboard
                                );
                            }
                        } catch (e) {
                            console.log(`[Bot] sendVideo failed: ${e.message}`);
                            console.log(`[Bot] Sending direct download link instead...`);
                            await handlers.sendLinkMessage(
                                chatId,
                                videoUrl, 
                                finalCaption, 
                                messageId
                            );
                        }
                        
                    } else {
                        handlers.progressActive = false;
                        const errorText = htmlBold('⚠️ Could not get the video download link.') + '\n\nThe video might be private or the format is not supported.';
                        if (progressMessageId) {
                            await handlers.editMessage(chatId, progressMessageId, errorText); 
                        } else {
                            await handlers.sendMessage(chatId, errorText, messageId);
                        }
                    }
                } catch (error) {
                    handlers.progressActive = false;
                    console.log(`[Bot] Error: ${error.message}`);
                    const errorText = htmlBold('❌ An error occurred while processing the video.');
                    if (progressMessageId) {
                        await handlers.editMessage(chatId, progressMessageId, errorText);
                    } else {
                        await handlers.sendMessage(chatId, errorText, messageId);
                    }
                }
                
                return res.status(200).send('OK');
            }

            if (text) {
                const helpText = `📌 <b>Available Commands:</b>

<b>🎥 /tiktok [url]</b>
Download TikTok videos without watermark
Example: <code>/tiktok https://vm.tiktok.com/xxx</code>

<b>🎵 /song [name or url]</b>
Download songs from YouTube
Example: <code>/song new sinhala dj song</code>

◇───────────────◇
Send <b>/start</b> for more info!`;
                await handlers.sendMessage(chatId, helpText, messageId, userInlineKeyboard);
                return res.status(200).send('OK');
            }
        }
        
        if (callbackQuery) {
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;
            const messageId = callbackQuery.message.message_id;
            
            const allButtons = callbackQuery.message.reply_markup?.inline_keyboard?.flat() || [];
            const button = allButtons.find(b => b.callback_data === data);
            const buttonText = button ? button.text : "Action Complete";

            if (data === 'ignore_progress' || data === 'ignore_branding') {
                await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                return res.status(200).send('OK');
            }
            
            if (data.startsWith('extract_audio_')) {
                await handlers.answerCallbackQuery(callbackQuery.id, '🎵 Extracting audio...');
                const videoData = await handlers.getVideoForAudio(chatId, data);
                if (videoData) {
                    ctx.waitUntil(handlers.sendAction(chatId, 'upload_audio'));
                    try {
                        const audioKeyboard = [[{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]];
                        await handlers.extractAudioFromVideo(videoData.videoUrl, videoData.caption, chatId, null, audioKeyboard);
                    } catch (e) {
                        console.log(`[Bot] Audio extraction failed: ${e.message}`);
                        await handlers.sendMessage(chatId, htmlBold('❌ Failed to extract audio: ') + e.message, null);
                    }
                    await handlers.clearVideoForAudio(chatId, data);
                } else {
                    await handlers.sendMessage(chatId, htmlBold('❌ Video data expired. Please send the link again.'), null);
                }
                return res.status(200).send('OK');
            }
            
            if (data.startsWith('songcount_')) {
                const parts = data.split('_');
                const count = parseInt(parts[1]);
                const queryId = parts.slice(2).join('_');
                
                const cachedData = songQueryCache.get(queryId);
                
                if (!cachedData) {
                    await handlers.answerCallbackQuery(callbackQuery.id, '❌ Request expired');
                    await handlers.editMessage(chatId, messageId, htmlBold('❌ Request expired. Please send the /song command again.'));
                    return res.status(200).send('OK');
                }
                
                await handlers.answerCallbackQuery(callbackQuery.id, `🎵 Downloading ${count} song(s)...`);
                
                songQueryCache.delete(queryId);
                
                await handlers.editMessage(
                    chatId,
                    messageId,
                    htmlBold('🎵 Starting YouTube search...') + '\n\n' +
                    `🔍 Query: <i>${cachedData.query}</i>\n` +
                    `📥 Downloading ${count} song(s)...`
                );
                
                ctx.waitUntil((async () => {
                    try {
                        await downloadAndSendSongs(cachedData.query, count, handlers, chatId, messageId, { isAlreadyDownloaded, addToHistory });
                    } catch (error) {
                        console.log(`[Bot] Song download error: ${error.message}`);
                        await handlers.editMessage(
                            chatId, 
                            messageId, 
                            htmlBold('❌ Error downloading songs') + '\n\n' + error.message
                        );
                    }
                })());
                
                return res.status(200).send('OK');
            }
            
            if (env.OWNER_ID && chatId.toString() !== env.OWNER_ID.toString()) {
                await handlers.answerCallbackQuery(callbackQuery.id, "❌ You cannot use this command.");
                return res.status(200).send('OK');
            }

            switch (data) {
                case 'set_mode_owner':
                    ownerMode = 'owner';
                    await handlers.answerCallbackQuery(callbackQuery.id, '✅ Owner Mode activated');
                    const ownerModeKeyboard = [
                        [
                            { text: '✅ Owner Mode', callback_data: 'set_mode_owner' },
                            { text: '👤 User Mode', callback_data: 'set_mode_user' }
                        ],
                        [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                        [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                        [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }] 
                    ];
                    await handlers.editMessage(chatId, messageId, htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.\n\n" + htmlBold("Current Mode: 👑 Owner Mode"), ownerModeKeyboard);
                    break;
                
                case 'set_mode_user':
                    ownerMode = 'user';
                    await handlers.answerCallbackQuery(callbackQuery.id, '✅ User Mode activated');
                    const userModeKeyboard = [
                        [
                            { text: '👑 Owner Mode', callback_data: 'set_mode_owner' },
                            { text: '✅ User Mode', callback_data: 'set_mode_user' }
                        ],
                        [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                        [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                        [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }] 
                    ];
                    await handlers.editMessage(chatId, messageId, htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.\n\n" + htmlBold("Current Mode: 👤 User Mode"), userModeKeyboard);
                    break;
                
                case 'admin_users_count':
                    await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                    const usersCount = await handlers.getAllUsersCount();
                    const countMessage = htmlBold(`📊 Current Users in the Bot: ${usersCount}`);
                    await handlers.editMessage(chatId, messageId, countMessage);
                    break;
                
                case 'admin_broadcast':
                    await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                    const broadcastPrompt = htmlBold("📣 Broadcast Message") + "\n\n" + htmlBold("Please reply with the message you want to broadcast (Text, Photo, or Video).");
                    await handlers.sendMessage(chatId, broadcastPrompt, messageId); 
                    break;
            }

            return res.status(200).send('OK');
        }

        return res.status(200).send('OK');

    } catch (e) {
        console.log(`[Bot] Unhandled error: ${e.message}`);
        return res.status(200).send('OK'); 
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] TikTok Download Bot running on port ${PORT}`);
    console.log(`[Server] Webhook endpoint: http://0.0.0.0:${PORT}/`);
    if (!BOT_TOKEN) {
        console.log('[Server] WARNING: BOT_TOKEN is not set!');
    }
    if (!OWNER_ID) {
        console.log('[Server] WARNING: OWNER_ID is not set!');
    }
});
