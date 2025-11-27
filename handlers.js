import { htmlBold } from './helpers.js';
import { 
    PROGRESS_STATES 
} from './config.js';
import ffmpeg from 'fluent-ffmpeg';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; 
        this.telegramApi = `https://api.telegram.org/bot${this.env.BOT_TOKEN}`;
        const tokenPreview = this.env.BOT_TOKEN ? this.env.BOT_TOKEN.substring(0, 15) + '...' : 'MISSING';
        console.log(`[Handler] Initialized with token: ${tokenPreview}`);
        console.log(`[Handler] Telegram API URL: ${this.telegramApi.substring(0, 50)}...`);
    }
    
    async saveUserId(userId) {
        if (!this.env.USER_DATABASE) return; 
        const key = `user:${userId}`;
        const isNew = await this.env.USER_DATABASE.get(key) === null; 
        if (isNew) {
            try {
                await this.env.USER_DATABASE.put(key, "1"); 
            } catch (e) {}
        }
    }

    async getAllUsersCount() {
        if (!this.env.USER_DATABASE) return 0;
        try {
            const list = await this.env.USER_DATABASE.list({ prefix: 'user:' });
            return list.keys.length;
        } catch (e) {
            return 0;
        }
    }

    async cacheVideoForAudio(chatId, buttonId, videoUrl, caption) {
        if (!this.env.USER_DATABASE) return;
        const key = `audio_cache:${buttonId}`;
        try {
            await this.env.USER_DATABASE.put(key, JSON.stringify({ videoUrl, caption, chatId }), { expirationTtl: 600 });
        } catch (e) {
            console.log('[Handler] Failed to cache video for audio:', e.message);
        }
    }

    async getVideoForAudio(chatId, buttonId) {
        if (!this.env.USER_DATABASE) return null;
        const key = `audio_cache:${buttonId}`;
        try {
            const data = await this.env.USER_DATABASE.get(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.log('[Handler] Failed to retrieve video cache:', e.message);
            return null;
        }
    }

    async clearVideoForAudio(chatId, buttonId) {
        if (!this.env.USER_DATABASE) return;
        const key = `audio_cache:${buttonId}`;
        try {
            await this.env.USER_DATABASE.delete(key);
        } catch (e) {}
    }
    
    async sendAction(chatId, action) {
        try {
            await fetch(`${this.telegramApi}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    action: action,
                }),
            });
        } catch (e) {}
    }

    async sendMessage(chatId, text, replyToMessageId, inlineKeyboard = null) {
        try {
            const response = await fetch(`${this.telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'HTML',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            return null;
        }
    }
    
    async deleteMessage(chatId, messageId) {
        try {
            const response = await fetch(`${this.telegramApi}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                }),
            });
             if (!response.ok) {}
        } catch (e) {}
    }
    
    async editMessage(chatId, messageId, text, inlineKeyboard = null) {
        try {
            const body = {
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'HTML', 
                ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
            };
            const response = await fetch(`${this.telegramApi}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            
            const result = await response.json(); 

             if (!response.ok) {
                if (result.error_code === 400 && result.description && result.description.includes("message to edit not found")) {
                     return;
                } else {}
            }
        } catch (e) {}
    }
    
    async answerCallbackQuery(callbackQueryId, text) {
        try {
            await fetch(`${this.telegramApi}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: true, 
                }),
            });
        } catch (e) {}
    }

    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId) {
        if (!videoUrl || typeof videoUrl !== 'string') {
            console.log('[Handler] Invalid video URL for sendLinkMessage');
            await this.sendMessage(chatId, htmlBold('❌ Unable to retrieve video URL.'), replyToMessageId);
            return;
        }
        
        console.log('[Handler] Sending download link message...');
        
        const inlineKeyboard = [
            [{ text: '📥 Download Video', url: videoUrl }],
            [{ text: 'TikTok Downloader Bot', callback_data: 'ignore_branding' }] 
        ];

        const linkMessage = htmlBold("📦 Video Too Large for Direct Upload") + `\n\n`
                           + `The video file is too large for Telegram (${htmlBold('>50MB')}).\n`
                           + `Click the button below to download it directly:\n\n`
                           + caption;

        try {
            const messageId = await this.sendMessage(
                chatId, 
                linkMessage, 
                replyToMessageId, 
                inlineKeyboard
            );
            console.log('[Handler] Download link message sent successfully');
            return messageId;
        } catch (e) {
            console.log('[Handler] Failed to send download link:', e.message);
            throw e;
        }
    }

    async sendVideoWithQualityFallback(chatId, hdUrl, sdUrl, caption, replyToMessageId, thumbnailLink, inlineKeyboard) {
        // Try HD first
        console.log('[Handler] Attempting HD quality...');
        try {
            return await this.sendVideoWithSizeCheck(chatId, hdUrl, caption, replyToMessageId, thumbnailLink, inlineKeyboard, '🎬 HD');
        } catch (hdError) {
            console.log(`[Handler] HD failed (${hdError.message}), trying SD...`);
            
            // If HD fails due to size, try SD
            if (sdUrl) {
                try {
                    console.log('[Handler] Attempting SD quality...');
                    return await this.sendVideoWithSizeCheck(chatId, sdUrl, caption, replyToMessageId, thumbnailLink, inlineKeyboard, '📱 SD');
                } catch (sdError) {
                    console.log(`[Handler] SD also failed (${sdError.message}), sending download link...`);
                    await this.sendLinkMessage(chatId, hdUrl, caption, replyToMessageId);
                    return;
                }
            } else {
                // No SD URL, send download link
                await this.sendLinkMessage(chatId, hdUrl, caption, replyToMessageId);
                return;
            }
        }
    }

    async sendVideoWithSizeCheck(chatId, videoUrl, caption, replyToMessageId, thumbnailLink, inlineKeyboard, qualityLabel) {
        try {
            if (!videoUrl || typeof videoUrl !== 'string') {
                throw new Error('Invalid video URL');
            }
            
            console.log(`[Handler] Fetching ${qualityLabel} video from: ${videoUrl.substring(0, 100)}...`);
            
            const videoResponse = await fetch(videoUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.tiktok.com/',
                    'Accept': '*/*',
                },
            });
            
            console.log(`[Handler] Video fetch status: ${videoResponse.status}`);
            
            if (videoResponse.status !== 200) {
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                throw new Error(`Video Fetch Failed (HTTP ${videoResponse.status})`); 
            }
            
            const videoBlob = await videoResponse.blob();
            const sizeInMB = videoBlob.size / 1024 / 1024;
            console.log(`[Handler] ${qualityLabel} Video size: ${sizeInMB.toFixed(2)} MB`);
            
            // Check if video exceeds Telegram's 50MB limit
            if (sizeInMB > 50) {
                throw new Error(`${qualityLabel} video exceeds 50MB limit (${sizeInMB.toFixed(2)}MB)`);
            }
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            if (caption) {
                formData.append('caption', caption);
                formData.append('parse_mode', 'HTML'); 
            }
            
            formData.append('video', videoBlob, 'tiktok_video.mp4'); 

            if (thumbnailLink) {
                try {
                    const thumbResponse = await fetch(thumbnailLink, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.tiktok.com/',
                        }
                    });
                    if (thumbResponse.ok) {
                        const thumbBlob = await thumbResponse.blob();
                        formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    } else {
                        if (thumbResponse.body) { await thumbResponse.body.cancel(); }
                    } 
                } catch (e) {
                    console.log(`[Handler] Thumbnail fetch failed: ${e.message}`);
                }
            }
            
            if (inlineKeyboard) {
                formData.append('reply_markup', JSON.stringify({
                    inline_keyboard: inlineKeyboard
                }));
            }

            console.log(`[Handler] Uploading to Telegram...`);
            console.log(`[Handler] Sending to: ${this.telegramApi}/sendVideo`);
            
            const telegramResponse = await fetch(`${this.telegramApi}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            console.log(`[Handler] Telegram response status: ${telegramResponse.status}`);
            console.log(`[Handler] Telegram response: ${JSON.stringify(telegramResult).substring(0, 200)}`);
            
            if (!telegramResponse.ok) {
                console.log(`[Handler] Telegram error: ${telegramResult.description}`);
                throw new Error(`Telegram API Error: ${telegramResult.description || 'Unknown Telegram Error.'}`);
            }
            
            console.log(`[Handler] Video sent successfully!`);
            
        } catch (e) {
            console.log(`[Handler] sendVideo error: ${e.message}`);
            throw e; 
        }
    }

    async extractAudioFromVideo(videoUrl, caption, chatId, replyToMessageId, inlineKeyboard) {
        const tempDir = tmpdir();
        const videoFile = join(tempDir, `tiktok_${Date.now()}.mp4`);
        const audioFile = join(tempDir, `tiktok_${Date.now()}.mp3`);
        
        try {
            console.log('[Handler] Downloading video for audio extraction...');
            const videoResponse = await fetch(videoUrl);
            if (videoResponse.status !== 200) {
                throw new Error('Failed to download video');
            }
            
            const videoBuffer = await videoResponse.arrayBuffer();
            writeFileSync(videoFile, Buffer.from(videoBuffer));
            console.log('[Handler] Video saved, extracting audio...');
            
            return new Promise((resolve, reject) => {
                ffmpeg(videoFile)
                    .noVideo()
                    .audioCodec('libmp3lame')
                    .audioBitrate('192k')
                    .format('mp3')
                    .on('end', async () => {
                        try {
                            console.log('[Handler] Audio extraction complete');
                            const audioBuffer = readFileSync(audioFile);
                            
                            // Clean up temp files
                            try { unlinkSync(videoFile); } catch (e) {}
                            try { unlinkSync(audioFile); } catch (e) {}
                            
                            // Send audio to Telegram
                            const formData = new FormData();
                            formData.append('chat_id', chatId);
                            if (caption) {
                                formData.append('caption', caption);
                                formData.append('parse_mode', 'HTML');
                            }
                            formData.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'tiktok_audio.mp3');
                            if (inlineKeyboard) {
                                formData.append('reply_markup', JSON.stringify({ inline_keyboard: inlineKeyboard }));
                            }
                            
                            const telegramResponse = await fetch(`${this.telegramApi}/sendAudio`, {
                                method: 'POST',
                                body: formData,
                            });
                            
                            const result = await telegramResponse.json();
                            if (!telegramResponse.ok) {
                                throw new Error(result.description || 'Telegram error');
                            }
                            console.log('[Handler] Audio sent successfully!');
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    })
                    .on('error', (err) => {
                        try { unlinkSync(videoFile); } catch (e) {}
                        try { unlinkSync(audioFile); } catch (e) {}
                        reject(new Error(`FFmpeg error: ${err.message}`));
                    })
                    .save(audioFile);
            });
        } catch (e) {
            try { unlinkSync(videoFile); } catch (err) {}
            try { unlinkSync(audioFile); } catch (err) {}
            throw e;
        }
    }

    async sendPhotos(chatId, images, caption, replyToMessageId, inlineKeyboard = null) {
        try {
            if (images.length === 1) {
                const response = await fetch(`${this.telegramApi}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        photo: images[0],
                        caption: caption,
                        parse_mode: 'HTML',
                        reply_to_message_id: replyToMessageId,
                        ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                    }),
                });
                return response.ok;
            }
            
            const media = images.slice(0, 10).map((url, index) => ({
                type: 'photo',
                media: url,
                ...(index === 0 && { caption: caption, parse_mode: 'HTML' })
            }));
            
            const response = await fetch(`${this.telegramApi}/sendMediaGroup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    media: media,
                    reply_to_message_id: replyToMessageId,
                }),
            });
            
            return response.ok;
            
        } catch (e) {
            console.log(`[Handler] sendPhotos error: ${e.message}`);
            return false;
        }
    }

    async simulateProgress(chatId, messageId, originalReplyId) {
        this.progressActive = true;
        const originalText = htmlBold('⏳ Fetching TikTok video... Please wait.'); 
        
        const statesToUpdate = PROGRESS_STATES.slice(1, 10); 

        for (let i = 0; i < statesToUpdate.length; i++) {
            if (!this.progressActive) break; 
            
            await new Promise(resolve => setTimeout(resolve, 800)); 
            
            if (!this.progressActive) break; 

            const state = statesToUpdate[i];
            
            const newKeyboard = [
                [{ text: state.text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
            ];
            const newText = originalText + "\n" + htmlBold(`\nStatus:`) + ` ${state.text}`; 
            
            this.editMessage(chatId, messageId, newText, newKeyboard);
        }
    }
    
    async broadcastMessage(fromChatId, originalMessageId) {
        if (!this.env.USER_DATABASE) return { successfulSends: 0, failedSends: 0 };
        
        const BATCH_SIZE = 50; 
        let successfulSends = 0;
        let failedSends = 0;

        try {
            const list = await this.env.USER_DATABASE.list({ prefix: 'user:' });
            const userKeys = list.keys.map(key => key.name.split(':')[1]);
            
            const totalUsers = userKeys.length;
            
            const copyMessageUrl = `${this.telegramApi}/copyMessage`; 
            
            for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
                const batch = userKeys.slice(i, i + BATCH_SIZE);
                
                const sendPromises = batch.map(async (userId) => {
                    if (userId.toString() === this.env.OWNER_ID.toString()) return; 

                    try {
                        const copyBody = {
                            chat_id: userId,
                            from_chat_id: fromChatId,
                            message_id: originalMessageId,
                        };
                        
                        const response = await fetch(copyMessageUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(copyBody),
                        });

                        if (response.ok) {
                            successfulSends++;
                        } else {
                            failedSends++;
                            const result = await response.json();
                            if (result.error_code === 403) {
                                this.env.USER_DATABASE.delete(`user:${userId}`);
                            }
                        }
                    } catch (e) {
                        failedSends++;
                    }
                });

                await Promise.allSettled(sendPromises);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }


        } catch (e) {}

        return { successfulSends, failedSends };
    }
}

export {
    WorkerHandlers
};
