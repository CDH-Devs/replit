// handlers.js - ENV විචල්‍යයන් භාවිතා කිරීමට සහ Base64 Encoding සමග යාවත්කාලීන කරන ලදී

import { htmlBold, formatDuration } from './helpers';
import { 
    MAX_FILE_SIZE_BYTES, // OWNER_ID සහ telegramApi ඉවත් කරන ලදී
    PROGRESS_STATES 
} from './config';

// Base64 Encoding Helper Function 
function encodeBase64(text) {
    if (!text) return '';
    return btoa(unescape(encodeURIComponent(text))); 
}


class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; 
        
        // ENV variable වෙතින් API Base URL එක ලබා ගැනීම
        this.telegramApi = `https://api.telegram.org/bot${this.env.BOT_TOKEN}`;
    }
    
    // ... (අනෙකුත් ශ්‍රිත) ...
    
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
    
    // ... (අනෙකුත් ශ්‍රිත) ...

    // යාවත්කාලීන කරන ලද sendLinkMessage ශ්‍රිතය (Base64 Encoding සහ Redirect URL එක සමග)
    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId, apiData = {}) {
        
        const workerDomain = this.env.WORKER_DOMAIN || 'https://facebookdownbot.your-worker-domain.workers.dev'; 
        
        const baseUrl = workerDomain.endsWith('/') ? workerDomain.slice(0, -1) : workerDomain;
        
        // --- DATA ENCODING FOR GITHUB PAGES ---
        const encodedUrl = encodeBase64(videoUrl);
        const encodedTitle = encodeBase64(apiData.videoTitle || 'Facebook Video');
        const encodedUploader = encodeBase64(apiData.uploader || 'Unknown Uploader');
        const encodedDuration = encodeBase64(formatDuration(apiData.duration) || 'N/A');
        const encodedViews = encodeBase64((typeof apiData.views === 'number' ? apiData.views.toLocaleString('en-US') : apiData.views) || 'N/A');
        const encodedUploadDate = encodeBase64(apiData.uploadDate || 'N/A');
        
        // /download endpoint එක වෙත යොමු කරන Worker URL එක සෑදීම
        const downloadLink = `${baseUrl}/download?url=${encodedUrl}&title=${encodedTitle}&uploader=${encodedUploader}&duration=${encodedDuration}&views=${encodedViews}&date=${encodedUploadDate}`;
        
        const largeFileMessage = htmlBold("⚠️ Large file detected.") + `\n\n`
                               + `The video file size (${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit) is too large for direct Telegram upload. Please use the button below to download the file directly.\n\n`
                               + caption; 
        
        const inlineKeyboard = [
            [{ text: '🔽 OPEN DOWNLOAD PAGE', url: downloadLink }],
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];

        try {
            await this.sendMessage(
                chatId, 
                largeFileMessage, 
                replyToMessageId, 
                inlineKeyboard
            );
        } catch (e) {
            console.error("Failed to send link message:", e);
        }
    }

    // ... (අනෙකුත් ශ්‍රිත - sendVideo, simulateProgress, broadcastMessage තුළ this.telegramApi සහ this.env.OWNER_ID භාවිතයට වෙනස් කර ඇත) ...
    
    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, inlineKeyboard = null) {
        
        // ... (this.telegramApi භාවිතා කරයි) ...
    }

    async simulateProgress(chatId, messageId, originalReplyId) {
        // ...
    }
    
    async broadcastMessage(fromChatId, originalMessageId) {
        if (!this.env.USER_DATABASE) return { successfulSends: 0, failedSends: 0 };
        
        // ...
            
            const copyMessageUrl = `${this.telegramApi}/copyMessage`; // this.telegramApi භාවිතා කරයි
            
            // ...
                const sendPromises = batch.map(async (userId) => {
                    if (userId.toString() === this.env.OWNER_ID.toString()) return; // this.env.OWNER_ID භාවිතා කරයි
            // ...
        return { successfulSends, failedSends };
    }
}

export {
    WorkerHandlers
};
