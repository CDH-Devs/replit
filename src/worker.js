/**
 * src/local.js
 * Local development server for the Facebook Download Bot using grammY.
 * NOTE: This local implementation uses a temporary global cache (global.videoCache) 
 * which is NOT suitable for production (Cloudflare Worker).
 * * Developer: @chamoddeshan
 */

import { Bot } from 'grammy';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get bot token from environment or use the hardcoded one
const BOT_TOKEN = process.env.BOT_TOKEN || '8382727460:AAEgKVISJN5TTV4O-82sMGQDG3khwjiKR8';
const OWNER_ID = process.env.OWNER_ID || '1901997764';

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// Helper function for HTML bold text
function htmlBold(text) {
    return `<b>${text}</b>`;
}

// Initialize video cache globally (Only for local development)
global.videoCache = global.videoCache || new Map();

// --- START COMMAND ---
bot.command('start', async (ctx) => {
    const userName = ctx.from?.first_name || "පරිශීලක";
    const userText = `👋 <b>සුභ දවසක් ${userName} මහත්මයා/මහත්මිය!</b> 💁‍♂️ මෙය Facebook වීඩියෝ බාගත කිරීමේ Bot එකයි.
    
කරුණාකර Facebook වීඩියෝ Link එකක් එවන්න.`;
    await ctx.reply(userText, { parse_mode: 'HTML' });
});

// --- MESSAGE HANDLER (Link Processing) ---
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
    const chatId = ctx.chat.id;

    if (!isLink) {
        await ctx.reply(htmlBold('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), { parse_mode: 'HTML' });
        return;
    }
    
    // Send initial acknowledgement
    let initialMsg;
    try {
        initialMsg = await ctx.reply(htmlBold('⏳ වීඩියෝ තොරතුරු සොයමින්...'), { 
            parse_mode: 'HTML',
            reply_to_message_id: ctx.message.message_id // Reply to the user's message
        });
    } catch (e) {
        console.error("Failed to send initial message:", e.message);
        return;
    }

    try {
        // Use Facebook Video Download API
        const apiUrl = "https://fdown.isuru.eu.org/info";
        
        console.log(`[DEBUG] Fetching video info for: ${text}`);
        
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'TelegramBot/1.0'
            },
            body: JSON.stringify({ url: text })
        });
        
        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }
        
        const videoData = await apiResponse.json();
        console.log(`[DEBUG] API Response:`, JSON.stringify(videoData, null, 2));
        
        // Extract required information (using the same logic as the worker)
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let duration = null;
        let uploader = null;
        let viewCount = null;
        let uploadDate = null;
        
        if (videoData.video_info) {
            rawThumbnailLink = videoData.video_info.thumbnail?.replace(/&amp;/g, '&');
            videoTitle = videoData.video_info.title || videoTitle;
            duration = videoData.video_info.duration;
            uploader = videoData.video_info.uploader;
            viewCount = videoData.video_info.view_count;
            uploadDate = videoData.video_info.upload_date;
        } else if (videoData.thumbnail) {
            rawThumbnailLink = videoData.thumbnail.replace(/&amp;/g, '&');
        } else if (videoData.data && videoData.data.thumbnail) {
            rawThumbnailLink = videoData.data.thumbnail.replace(/&amp;/g, '&');
        }
        
        if (!videoTitle && videoData.title) {
            videoTitle = videoData.title;
        } else if (!videoTitle && videoData.data && videoData.data.title) {
            videoTitle = videoData.data.title;
        }

        // --- 1. Send Thumbnail and Details ---
        if (rawThumbnailLink) {
            try {
                // Format details
                let durationText = '';
                if (duration) {
                    const minutes = Math.floor(duration / 60);
                    const seconds = Math.floor(duration % 60);
                    durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                let viewCountText = viewCount ? viewCount.toLocaleString() : '';
                let uploadDateText = '';
                if (uploadDate && uploadDate.length === 8) {
                    const year = uploadDate.substring(0, 4);
                    const month = uploadDate.substring(4, 6);
                    const day = uploadDate.substring(6, 8);
                    uploadDateText = `${year}-${month}-${day}`;
                }
                
                // Build caption
                let caption = `${htmlBold(videoTitle)}\n\n`;
                if (uploader) caption += `👤 Upload කළේ: ${uploader}\n`;
                if (durationText) caption += `⏱️ කාලය: ${durationText}\n`;
                if (viewCountText) caption += `👁️ නැරඹුම්: ${viewCountText}\n`;
                if (uploadDateText) caption += `📅 Upload කළ දිනය: ${uploadDateText}\n`;
                caption += `\n✅ ${htmlBold('Thumbnail බාගත කිරීම සාර්ථකයි!')}`;
                
                await ctx.replyWithPhoto(rawThumbnailLink, {
                    caption: caption,
                    parse_mode: 'HTML',
                    reply_to_message_id: ctx.message.message_id
                });
                
                // Delete the temporary message after successful photo send
                await ctx.api.deleteMessage(chatId, initialMsg.message_id).catch(() => {});
                console.log("[SUCCESS] Thumbnail sent successfully and temporary message deleted.");

            } catch (photoError) {
                console.error('[ERROR] Failed to send photo (possibly invalid URL):', photoError);
                await ctx.reply(htmlBold('❌ Thumbnail එක යැවීම අසාර්ථක විය. කරුණාකර වෙනත් Link එකක් උත්සහා කරන්න.'), { parse_mode: 'HTML' });
                // Attempt to delete initial message even on photo error
                await ctx.api.deleteMessage(chatId, initialMsg.message_id).catch(() => {});
                return;
            }
        } else {
            console.error(`[ERROR] Thumbnail not found for: ${text}`);
            const errorText = htmlBold('⚠️ සමාවෙන්න, මේ වීඩියෝ එකේ Thumbnail එක සොයා ගැනීමට නොහැකි විය.');
            await ctx.api.deleteMessage(chatId, initialMsg.message_id).catch(() => {});
            await ctx.reply(errorText, { parse_mode: 'HTML' });
            return;
        }

        // --- 2. Send Quality Selection Buttons ---
        if (videoData.available_formats && videoData.available_formats.length > 0) {
            
            const qualityMap = new Map();
            videoData.available_formats.forEach(format => {
                if (!qualityMap.has(format.quality)) {
                    // Decoding HTML entities for safety, though grammY might handle it
                    let decodedUrl = format.url;
                    decodedUrl = decodedUrl.replace(/&amp;/g, '&');
                    // Store the first URL found for that quality
                    qualityMap.set(format.quality, decodedUrl); 
                }
            });
            
            // Generate a unique ID for this video link session
            const videoId = `${chatId}_${Date.now()}`; 
            
            // Store data in the local cache
            global.videoCache.set(videoId, {
                qualityMap: Object.fromEntries(qualityMap),
                title: videoTitle
            });

            // Create inline keyboard buttons with video ID and quality
            const qualityButtons = Array.from(qualityMap.keys()).map(quality => [{
                text: `📥 ${quality} බාගත කරන්න`,
                // Use the video ID and quality for callback data
                callback_data: `dl_${videoId}_${quality}` 
            }]);
            
            await ctx.reply(`${htmlBold('🎥 වීඩියෝ Quality එකක් තෝරන්න:')}\n\n${videoTitle}`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: qualityButtons
                }
            });
            console.log("[SUCCESS] Quality selection buttons sent with video ID:", videoId);
        }
        
    } catch (apiError) {
        console.error(`[ERROR] API Error:`, apiError);
        // Delete initial loading message and send error
        await ctx.api.deleteMessage(chatId, initialMsg.message_id).catch(() => {});
        await ctx.reply(htmlBold('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේ දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.') + `\n\n(දෝෂය: ${apiError.message})`, { parse_mode: 'HTML' });
    }
});

// --- CALLBACK QUERY HANDLER (Download Button Click) ---
bot.on('callback_query:data', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;
    console.log(`[DEBUG] Callback query received: ${callbackData}`);
    
    // Acknowledge the callback immediately
    await ctx.answerCallbackQuery({
        text: `⏬ ${callbackData.split('_').pop()} Video Download වෙමින්...`
    });

    if (callbackData.startsWith('dl_')) {
        let processingMsg;
        try {
            // Remove buttons immediately
            await ctx.editMessageReplyMarkup({});

            // Parse callback data: dl_videoId_quality
            const parts = callbackData.split('_');
            const quality = parts[parts.length - 1]; // Last part is quality
            const videoId = parts.slice(1, -1).join('_'); // Middle part(s) is videoId
            
            const videoData = global.videoCache.get(videoId);
            
            if (!videoData) {
                await ctx.reply(htmlBold('❌ Video data not found. Please send the link again.'), { parse_mode: 'HTML' });
                return;
            }
            
            const videoUrl = videoData.qualityMap[quality];
            const videoTitle = videoData.title;
            
            if (!videoUrl) {
                await ctx.reply(htmlBold('❌ Video URL not found for this quality.'), { parse_mode: 'HTML' });
                return;
            }
            
            // Send processing message
            processingMsg = await ctx.reply(`⏬ ${htmlBold(`${quality} Video Download වෙමින්...`)}\n\nකරුණාකර රැඳී සිටින්න...`, {
                parse_mode: 'HTML',
                reply_to_message_id: messageId // Reply to the message that had the buttons
            });
            
            console.log(`[DEBUG] Sending video from URL: ${videoUrl.substring(0, 100)}...`);
            
            // Send video directly from URL
            await ctx.replyWithVideo({
                url: videoUrl
            }, {
                caption: `${htmlBold(videoTitle)}\n\n✅ Quality: ${quality}\n📥 ${htmlBold('Video Downloaded!')}`,
                parse_mode: 'HTML'
            });
            
            // Delete the temporary processing message and the video data from cache
            await ctx.api.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
            global.videoCache.delete(videoId);
            console.log(`[SUCCESS] Video sent for ${quality} and cache cleared.`);

        } catch (videoError) {
            console.error(`[ERROR] Video send failed: ${videoError.message}`);
            
            // Try to delete the processing message if it was sent
            if (processingMsg) {
                await ctx.api.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
            }
            
            // Fallback: send download link (since Telegram may fail to download from the URL)
            const fallbackLink = videoUrl || 'No URL found.';
            const errorCaption = htmlBold('⚠️ වීඩියෝව යැවීම අසාර්ථක විය.') + `\n\nමෙම සබැඳිය භාවිතයෙන් බාගත කරන්න: <a href="${fallbackLink}">Click to Download</a>`;
            
            await ctx.reply(errorCaption, { 
                parse_mode: 'HTML', 
                link_preview_options: { is_disabled: true } 
            });

            // Clean up cache
            const parts = callbackData.split('_');
            const videoId = parts.slice(1, -1).join('_'); 
            global.videoCache.delete(videoId);

        }
    }
});

// --- ERROR HANDLER ---
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[ERROR] Error processing update for chat ${ctx.chat?.id}:`, err.error);
    // Notify the user about the unexpected error
    ctx.reply(htmlBold('🛑 අනපේක්ෂිත දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.'), { parse_mode: 'HTML' }).catch(() => {});
});

// Start the bot
console.log('Starting Facebook Download Bot in local mode...');
bot.start({
    onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} is running!`);
    }
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
