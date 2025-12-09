import express from 'express';
import { WorkerHandlers } from './handlers.js';
import { downloadTikTokVideo } from './api.js';
import { formatTikTokCaption, htmlBold } from './helpers.js';
import { PROGRESS_STATES, BOT_TOKEN, OWNER_ID } from './config.js';
import { downloadAndSendSongs } from './youtube.js';

const app = express();
app.use(express.json());

const userInlineKeyboard = [
    [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]
];

const userDatabase = new Map();

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
    
    const getVideoKeyboard = (videoUrl, videoCaption) => [
        [
            { text: '🎵 Extract Audio', callback_data: `extract_audio_${Date.now()}` }
        ]
    ];
    
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
                    const ownerText = htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.";
                    const adminKeyboard = [
                        [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                        [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                        [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }] 
                    ];
                    await handlers.sendMessage(chatId, ownerText, messageId, adminKeyboard);
                } else {
                    const userText = `👋 <b>Hello ${userName}!</b>

🎬 Welcome to <b>LK NEWS Download Bot</b>!

📌 <b>Features:</b>

<b>🎥 TikTok Downloads:</b>
Send any TikTok link to download videos without watermark.

<b>🎵 YouTube Music:</b>
Use <code>/song [name]</code> to download songs!
Example: <code>/song new sinhala dj song</code>

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
                        'Usage: <code>/song [search query]</code>\n\n' +
                        'Examples:\n' +
                        '• <code>/song new sinhala dj song</code>\n' +
                        '• <code>/song alan walker faded</code>\n' +
                        '• <code>/song 2024 remix songs</code>\n\n' +
                        'I will download up to 50 songs matching your search!',
                        messageId
                    );
                    return res.status(200).send('OK');
                }
                
                const statusMessageId = await handlers.sendMessage(
                    chatId,
                    htmlBold('🎵 Starting YouTube search...') + '\n\n' +
                    `🔍 Query: <i>${query}</i>\n` +
                    '📥 Searching for songs...',
                    messageId
                );
                
                ctx.waitUntil((async () => {
                    try {
                        await downloadAndSendSongs(query, 50, handlers, chatId, statusMessageId);
                    } catch (error) {
                        console.log(`[Bot] Song download error: ${error.message}`);
                        await handlers.editMessage(
                            chatId, 
                            statusMessageId, 
                            htmlBold('❌ Error downloading songs') + '\n\n' + error.message
                        );
                    }
                })());
                
                return res.status(200).send('OK');
            }

            if (text) { 
                const isAudioRequest = text.toLowerCase().startsWith('audio ') || text.toLowerCase().endsWith(' /audio');
                const cleanUrl = text.replace(/^audio\s+/i, '').replace(/\s+\/audio$/i, '').trim();
                const isTikTokLink = /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(isAudioRequest ? cleanUrl : text);
                
                if (isTikTokLink) {
                    const urlToUse = isAudioRequest ? cleanUrl : text;
                    
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
                        const videoData = await downloadTikTokVideo(urlToUse);
                        
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
                        
                        if (isAudioRequest && videoUrl) {
                            handlers.progressActive = false;
                            if (progressMessageId) {
                                await handlers.deleteMessage(chatId, progressMessageId);
                            }
                            ctx.waitUntil(handlers.sendAction(chatId, 'upload_audio'));
                            try {
                                const audioKeyboard = [[{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]];
                                await handlers.extractAudioFromVideo(videoUrl, finalCaption, chatId, messageId, audioKeyboard);
                            } catch (e) {
                                console.log(`[Bot] Audio extraction failed: ${e.message}`);
                                await handlers.sendMessage(chatId, htmlBold('❌ Failed to extract audio: ') + e.message, messageId);
                            }
                        } else if (videoUrl) {
                            handlers.progressActive = false; 
                            
                            if (progressMessageId) {
                                await handlers.deleteMessage(chatId, progressMessageId);
                            }
                            
                            ctx.waitUntil(handlers.sendAction(chatId, 'upload_video'));
                            
                            try {
                                const videoKeyboard = getVideoKeyboard(videoUrl, finalCaption);
                                const buttonId = videoKeyboard[0][0].callback_data;
                                await handlers.cacheVideoForAudio(chatId, buttonId, videoUrl, finalCaption);
                                
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
                    
                } else {
                    await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid TikTok video link.') + '\n\nExample: https://www.tiktok.com/@user/video/123456789', messageId);
                }
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
            
            if (env.OWNER_ID && chatId.toString() !== env.OWNER_ID.toString()) {
                await handlers.answerCallbackQuery(callbackQuery.id, "❌ You cannot use this command.");
                return res.status(200).send('OK');
            }

            switch (data) {
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
