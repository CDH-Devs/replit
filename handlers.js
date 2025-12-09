import { telegramApi, PROGRESS_STATES, MAX_FILE_SIZE_BYTES } from './config.js';
import { createReadStream, statSync } from 'fs';
import FormData from 'form-data';

class WorkerHandlers {
    constructor(env) {
        this.env = env;
        this.telegramApi = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
        this.progressActive = false;
        this.videoCache = new Map();
    }

    async telegramRequest(method, body = {}) {
        const response = await fetch(`${this.telegramApi}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return response.json();
    }

    async sendMessage(chatId, text, replyToMessageId = null, keyboard = null) {
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (keyboard) {
            body.reply_markup = { inline_keyboard: keyboard };
        }

        const result = await this.telegramRequest('sendMessage', body);
        if (result.ok && result.result) {
            return result.result.message_id;
        }
        return null;
    }

    async editMessage(chatId, messageId, text, keyboard = null) {
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        };

        if (keyboard) {
            body.reply_markup = { inline_keyboard: keyboard };
        }

        return this.telegramRequest('editMessageText', body);
    }

    async deleteMessage(chatId, messageId) {
        return this.telegramRequest('deleteMessage', {
            chat_id: chatId,
            message_id: messageId
        });
    }

    async sendAction(chatId, action) {
        return this.telegramRequest('sendChatAction', {
            chat_id: chatId,
            action: action
        });
    }

    async answerCallbackQuery(callbackQueryId, text = null) {
        const body = { callback_query_id: callbackQueryId };
        if (text) {
            body.text = text;
            body.show_alert = false;
        }
        return this.telegramRequest('answerCallbackQuery', body);
    }

    async sendVideo(chatId, videoUrl, caption, replyToMessageId = null, thumbnail = null, keyboard = null) {
        const body = {
            chat_id: chatId,
            video: videoUrl,
            caption: caption,
            parse_mode: 'HTML',
            supports_streaming: true
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (thumbnail) {
            body.thumbnail = thumbnail;
        }

        if (keyboard) {
            body.reply_markup = { inline_keyboard: keyboard };
        }

        return this.telegramRequest('sendVideo', body);
    }

    async sendVideoWithQualityFallback(chatId, hdUrl, sdUrl, caption, replyToMessageId = null, thumbnail = null, keyboard = null) {
        try {
            const result = await this.sendVideo(chatId, hdUrl, caption, replyToMessageId, thumbnail, keyboard);
            if (result.ok) {
                return result;
            }
        } catch (e) {
            console.log(`[Handlers] HD video failed: ${e.message}, trying SD...`);
        }

        return this.sendVideo(chatId, sdUrl, caption, replyToMessageId, thumbnail, keyboard);
    }

    async sendPhotos(chatId, images, caption, replyToMessageId = null, keyboard = null) {
        if (!images || images.length === 0) return;

        if (images.length === 1) {
            const body = {
                chat_id: chatId,
                photo: images[0],
                caption: caption,
                parse_mode: 'HTML'
            };
            if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
            if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
            return this.telegramRequest('sendPhoto', body);
        }

        const media = images.slice(0, 10).map((url, index) => ({
            type: 'photo',
            media: url,
            ...(index === 0 ? { caption: caption, parse_mode: 'HTML' } : {})
        }));

        const body = {
            chat_id: chatId,
            media: media
        };
        if (replyToMessageId) body.reply_to_message_id = replyToMessageId;

        return this.telegramRequest('sendMediaGroup', body);
    }

    async sendPhotoWithCaption(chatId, photoUrl, caption, replyToMessageId = null, keyboard = null) {
        const body = {
            chat_id: chatId,
            photo: photoUrl,
            caption: caption,
            parse_mode: 'HTML'
        };
        if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
        if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
        return this.telegramRequest('sendPhoto', body);
    }

    async sendAudio(chatId, audioUrl, caption, replyToMessageId = null, keyboard = null) {
        const body = {
            chat_id: chatId,
            audio: audioUrl,
            caption: caption,
            parse_mode: 'HTML'
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (keyboard) {
            body.reply_markup = { inline_keyboard: keyboard };
        }

        return this.telegramRequest('sendAudio', body);
    }

    async sendDocument(chatId, documentUrl, caption, replyToMessageId = null, keyboard = null) {
        const body = {
            chat_id: chatId,
            document: documentUrl,
            caption: caption,
            parse_mode: 'HTML'
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (keyboard) {
            body.reply_markup = { inline_keyboard: keyboard };
        }

        return this.telegramRequest('sendDocument', body);
    }

    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId = null) {
        const text = `${caption}\n\n📥 <b>Download Link:</b>\n${videoUrl}`;
        return this.sendMessage(chatId, text, replyToMessageId);
    }

    async simulateProgress(chatId, messageId, originalMessageId) {
        this.progressActive = true;
        
        for (let i = 1; i < PROGRESS_STATES.length && this.progressActive; i++) {
            await new Promise(resolve => setTimeout(resolve, 800));
            
            if (!this.progressActive) break;
            
            try {
                await this.editMessage(chatId, messageId, PROGRESS_STATES[i].text, [
                    [{ text: PROGRESS_STATES[i].text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
                ]);
            } catch (e) {
                break;
            }
        }
    }

    async saveUserId(userId) {
        if (!this.env.USER_DATABASE) return;
        
        const key = `user_${userId}`;
        try {
            await this.env.USER_DATABASE.put(key, JSON.stringify({
                id: userId,
                joined: Date.now()
            }));
        } catch (e) {
            console.log(`[Handlers] Error saving user: ${e.message}`);
        }
    }

    async getAllUsersCount() {
        if (!this.env.USER_DATABASE) return 0;
        
        try {
            const result = await this.env.USER_DATABASE.list({ prefix: 'user_' });
            return result.keys ? result.keys.length : 0;
        } catch (e) {
            console.log(`[Handlers] Error counting users: ${e.message}`);
            return 0;
        }
    }

    async broadcastMessage(fromChatId, messageId) {
        if (!this.env.USER_DATABASE) {
            return { successfulSends: 0, failedSends: 0 };
        }

        let successfulSends = 0;
        let failedSends = 0;

        try {
            const result = await this.env.USER_DATABASE.list({ prefix: 'user_' });
            const users = result.keys || [];

            for (const user of users) {
                const userId = user.name.replace('user_', '');
                
                try {
                    await this.telegramRequest('copyMessage', {
                        chat_id: userId,
                        from_chat_id: fromChatId,
                        message_id: messageId
                    });
                    successfulSends++;
                    await new Promise(resolve => setTimeout(resolve, 50));
                } catch (e) {
                    failedSends++;
                }
            }
        } catch (e) {
            console.log(`[Handlers] Broadcast error: ${e.message}`);
        }

        return { successfulSends, failedSends };
    }

    async cacheVideoForAudio(chatId, buttonId, videoUrl, caption) {
        const key = `${chatId}_${buttonId}`;
        this.videoCache.set(key, { videoUrl, caption, timestamp: Date.now() });
        
        if (this.env.USER_DATABASE) {
            try {
                await this.env.USER_DATABASE.put(`audio_${key}`, JSON.stringify({ videoUrl, caption }), {
                    expirationTtl: 3600
                });
            } catch (e) {
                console.log(`[Handlers] Cache error: ${e.message}`);
            }
        }
    }

    async getVideoForAudio(chatId, buttonId) {
        const key = `${chatId}_${buttonId}`;
        
        if (this.videoCache.has(key)) {
            return this.videoCache.get(key);
        }

        if (this.env.USER_DATABASE) {
            try {
                const data = await this.env.USER_DATABASE.get(`audio_${key}`);
                if (data) {
                    return JSON.parse(data);
                }
            } catch (e) {
                console.log(`[Handlers] Get cache error: ${e.message}`);
            }
        }

        return null;
    }

    async clearVideoForAudio(chatId, buttonId) {
        const key = `${chatId}_${buttonId}`;
        this.videoCache.delete(key);
        
        if (this.env.USER_DATABASE) {
            try {
                await this.env.USER_DATABASE.delete(`audio_${key}`);
            } catch (e) {
                console.log(`[Handlers] Clear cache error: ${e.message}`);
            }
        }
    }

    async extractAudioFromVideo(videoUrl, caption, chatId, replyToMessageId = null, keyboard = null) {
        const audioCaption = caption.replace('🎬', '🎵').replace('Video', 'Audio');
        
        try {
            const result = await this.sendAudio(chatId, videoUrl, audioCaption, replyToMessageId, keyboard);
            if (!result.ok) {
                throw new Error('Failed to send audio');
            }
            return result;
        } catch (e) {
            console.log(`[Handlers] Audio extraction failed: ${e.message}`);
            throw e;
        }
    }

    async sendAudioFile(chatId, filePath, title, replyToMessageId = null, keyboard = null) {
        try {
            const stats = statSync(filePath);
            console.log(`[Handlers] Sending audio file: ${filePath} (${stats.size} bytes)`);
            
            if (stats.size > MAX_FILE_SIZE_BYTES) {
                throw new Error('File too large for Telegram');
            }

            const form = new FormData();
            form.append('chat_id', String(chatId));
            form.append('audio', createReadStream(filePath), {
                filename: `${title.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50)}.mp3`,
                contentType: 'audio/mpeg'
            });
            form.append('title', title.substring(0, 64));
            form.append('parse_mode', 'HTML');

            if (replyToMessageId) {
                form.append('reply_to_message_id', String(replyToMessageId));
            }

            if (keyboard) {
                form.append('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
            }

            const response = await new Promise((resolve, reject) => {
                form.submit(`${this.telegramApi}/sendAudio`, (err, res) => {
                    if (err) return reject(err);
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                    res.on('error', reject);
                });
            });

            let result;
            try {
                result = JSON.parse(response);
            } catch (e) {
                console.log(`[Handlers] sendAudioFile parse error: ${response.substring(0, 200)}`);
                throw new Error('Invalid response from Telegram');
            }
            
            if (!result.ok) {
                console.log(`[Handlers] sendAudioFile error: ${JSON.stringify(result)}`);
            } else {
                console.log(`[Handlers] Audio sent successfully: ${title.substring(0, 30)}`);
            }
            return result;
        } catch (e) {
            console.log(`[Handlers] sendAudioFile failed: ${e.message}`);
            throw e;
        }
    }
}

export { WorkerHandlers };
