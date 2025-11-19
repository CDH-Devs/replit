/**
 * src/index.js
 * Final Fix V18: Final attempt to scrape fbdownloader.to using a refined Regex for "Download MP3".
 * Debugging logs remain active.
 * Requires: A KV Namespace bound as env.VIDEO_LINKS
 */

// ... (escapeMarkdownV2 and sanitizeText functions remain unchanged)
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim();
    cleaned = cleaned.replace(/\s\s+/g, ' ');
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return cleaned;
}
// ...

export default {
    async fetch(request, env, ctx) {
        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const callbackQuery = update.callback_query;

            // -------------------------------------------------------------
            // 🚀 1. CALLBACK QUERY HANDLING (Inline Button Clicks) - Audio Extraction
            // -------------------------------------------------------------
            if (callbackQuery) {
                const chatId = callbackQuery.message.chat.id;
                const data = callbackQuery.data;
                const messageId = callbackQuery.message.message_id;
                const callbackQueryId = callbackQuery.id;

                const parts = data.split('|');

                if (parts.length >= 3 && parts[0] === 'audio_ID') {
                    const randomId = parts[1];
                    const videoTitle = parts[2];

                    const originalFbUrl = await env.VIDEO_LINKS.get(randomId);

                    if (originalFbUrl) {
                        await this.answerCallbackQuery(telegramApi, callbackQueryId, '⏳ Audio Link එක fbdownloader වෙතින් ලබා ගනිමින්...');
                        
                        try {
                            console.log(`[DEBUG] Attempting to scrape Audio for URL: ${originalFbUrl}`);
                            
                            const fbDownloaderUrl = "https://fbdownloader.to/en"; 
                            const formData = new URLSearchParams();
                            formData.append('q', originalFbUrl); 
                            
                            const fbDownloaderResponse = await fetch(fbDownloaderUrl, {
                                method: 'POST',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': 'https://fbdownloader.to/en/download-facebook-mp3', 
                                },
                                body: formData.toString(),
                                redirect: 'follow'
                            });

                            const resultHtml = await fbDownloaderResponse.text();
                            
                            // 3. Audio Link එක Scrape කිරීම - V18 Refined Regex
                            // 'Download MP3' යන වචන සහිත ඕනෑම href එකක් සොයයි
                            const newMp3LinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download MP3.*<\/a>/i;
                            let mp3Match = resultHtml.match(newMp3LinkRegex);
                            
                            let finalAudioUrl = null;
                            if (mp3Match && mp3Match[1]) {
                                finalAudioUrl = mp3Match[1].replace(/&amp;/g, '&');
                            }

                            if (finalAudioUrl && finalAudioUrl.startsWith('http')) {
                                console.log(`[DEBUG] Found final Audio URL: ${finalAudioUrl}`);
                                await this.sendAudio(telegramApi, chatId, finalAudioUrl, messageId, videoTitle);
                            } else {
                                // Scrape කිරීමට අසාර්ථක නම් - Debugging Logs
                                console.log(`[ERROR] Audio Link not found (V18 failed). HTML Start: ${resultHtml.substring(0, 500)}`);
                                await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, Audio Link එක සොයා ගැනීමට නොහැකි විය\\. (V18)`));
                            }
                            
                        } catch (e) {
                            console.error(`[FATAL ERROR] Audio scraping failed (V18): ${e.stack}`);
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`❌ Audio ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.`));
                        }

                    } else {
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, එම Link එක කල් ඉකුත් වී ඇත\\. කරුණාකර නැවත වීඩියෝ Link එක එවන්න\\.`));
                    }

                    return new Response('OK', { status: 200 });
                }
                
                // ... (rest of the callback handling)
                await this.answerCallbackQuery(telegramApi, callbackQueryId, 'දත්ත හඳුනාගත නොහැක.');
                return new Response('OK', { status: 200 });
            }

            // -------------------------------------------------------------
            // 💬 2. MESSAGE HANDLING (Text/Links) - fdown.net භාවිතයෙන් Video Link ලබා ගනී
            // -------------------------------------------------------------
            // ... (This section remains exactly the same as V16/V17 to get the video link and store the original FB link)

            if (update.message && update.message.text) {
                const chatId = update.message.chat.id;
                const text = update.message.text.trim();
                const messageId = update.message.message_id;

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        const formData = new URLSearchParams();
                        formData.append('URLz', text);
                        
                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fdown.net/',
                            },
                            body: formData.toString(),
                            redirect: 'follow'
                        });

                        const resultHtml = await fdownResponse.text();
                        
                        let videoUrl = null;
                        let thumbnailLink = null;
                        
                        const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1];
                        } else {
                            const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
                            match = resultHtml.match(normalLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1];
                            }
                        }
                        
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }


                        if (videoUrl) {
                            let cleanedVideoUrl = videoUrl.replace(/&amp;/g, '&');
                            const videoTitle = 'Facebook Video'; 
                            
                            const randomId = Math.random().toString(36).substring(2, 12);
                            await env.VIDEO_LINKS.put(randomId, text, { expirationTtl: 3600 }); 

                            const replyMarkup = {
                                inline_keyboard: [
                                    [{ text: '🎧 Audio පමණක් ගන්න', callback_data: `audio_ID|${randomId}|${videoTitle}` }]
                                ]
                            };

                            await this.sendVideo(telegramApi, chatId, cleanedVideoUrl, null, messageId, thumbnailLink, replyMarkup);
                            
                        } else {
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private (පුද්ගලික) විය හැක\\.'), messageId);
                        }
                        
                    } catch (fdownError) {
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.'), messageId);
                    }
                    
                } else if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }
            
            return new Response('OK', { status: 200 });

        } catch (e) {
            return new Response('OK', { status: 200 });
        }
    },

    // ... (All auxiliary functions: sendMessage, sendVideo, sendAudio, answerCallbackQuery remain unchanged)

    async sendMessage(api, chatId, text, replyToMessageId, replyMarkup = null) { /* ... */ },
    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, replyMarkup = null) { /* ... */ },
    async sendAudio(api, chatId, audioUrl, replyToMessageId, title) { /* ... */ },
    async answerCallbackQuery(api, callbackQueryId, text) { /* ... */ }
};
