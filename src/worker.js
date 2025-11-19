/**
 * src/index.js
 * Final Fix V12: Fixed BUTTON_DATA_INVALID using KV Storage for Callback Data.
 * Requires: A KV Namespace bound as env.VIDEO_LINKS
 */

// ** 1. MarkdownV2 හි සියලුම විශේෂ අක්ෂර Escape කිරීමේ Helper Function **
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// ** 2. Scraped Title/Stats සඳහා Cleaner Function **
function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim();
    cleaned = cleaned.replace(/\s\s+/g, ' ');
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return cleaned;
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;

            // -------------------------------------------------------------
            // 🚀 1. CALLBACK QUERY HANDLING (Inline Button Clicks)
            // -------------------------------------------------------------
            if (callbackQuery) {
                const chatId = callbackQuery.message.chat.id;
                const data = callbackQuery.data;
                const messageId = callbackQuery.message.message_id;
                const callbackQueryId = callbackQuery.id;

                const parts = data.split('|');

                // 'audio_ID|RANDOM_ID|TITLE' Format එක හඳුනාගැනීම
                if (parts.length >= 3 && parts[0] === 'audio_ID') {
                    const randomId = parts[1]; // KV Key එක
                    const videoTitle = parts[2];

                    await this.answerCallbackQuery(telegramApi, callbackQueryId, '⏳ Audio Link එක ලබා ගනිමින්...');

                    // ** KV Store එකෙන් Original Link එක ලබා ගැනීම **
                    const videoUrlForAudio = await env.VIDEO_LINKS.get(randomId);

                    if (videoUrlForAudio) {
                        // Audio යැවීම (Video Link එකම Audio ලෙස යවයි)
                        await this.sendAudio(telegramApi, chatId, videoUrlForAudio, messageId, videoTitle);
                    } else {
                        // Link එක කල් ඉකුත් වී හෝ සොයා ගැනීමට නොහැකි නම්
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, එම Audio Link එක කල් ඉකුත් වී ඇත\\. කරුණාකර නැවත වීඩියෝ Link එක එවන්න\\.`));
                    }

                    return new Response('OK', { status: 200 });
                }
                
                // වෙනත් callback queries සඳහා
                await this.answerCallbackQuery(telegramApi, callbackQueryId, 'දත්ත හඳුනාගත නොහැක.');
                return new Response('OK', { status: 200 });
            }

            // -------------------------------------------------------------
            // 💬 2. MESSAGE HANDLING (Text/Links)
            // -------------------------------------------------------------
            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        
                        const formData = new URLSearchParams();
                        formData.append('URLz', text);
                        
                        // Fdown.net වෙත POST request යැවීම
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
                        
                        // Thumbnail Link සොයා ගැනීම
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }

                        // Link Scraping (HD වලට ප්‍රමුඛත්වය දී)
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

                        if (videoUrl) {
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            const videoTitle = 'Facebook Video'; 
                            
                            // -------------------------------------------------------------
                            // ** V12 FIX: KV Storage භාවිතයෙන් කෙටි ID එකක් නිර්මාණය කිරීම **
                            // -------------------------------------------------------------
                            const randomId = Math.random().toString(36).substring(2, 12); // අක්ෂර 10ක ID එකක්
                            await env.VIDEO_LINKS.put(randomId, cleanedUrl, { expirationTtl: 3600 }); // පැයක් සඳහා ගබඩා කරයි

                            const replyMarkup = {
                                inline_keyboard: [
                                    // Callback Data Format: audio_ID|RANDOM_ID|TITLE
                                    [{ text: '🎧 Audio පමණක් ගන්න', callback_data: `audio_ID|${randomId}|${videoTitle}` }]
                                ]
                            };

                            // Caption එක null ලෙස යවා, Inline Button එක එකතු කරයි
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink, replyMarkup);
                            
                        } else {
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private (පුද්ගලික) විය හැක\\.'), messageId);
                        }
                        
                    } catch (fdownError) {
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            // console.error(e.stack);
            return new Response('OK', { status: 200 });
        }
    },

    // ------------------------------------
    // සහායක Functions
    // ------------------------------------

    async sendMessage(api, chatId, text, replyToMessageId) {
        try {
            await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'MarkdownV2',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            // Error handling
        }
    },

    // ** V12: replyMarkup parameter එක එකතු කරයි **
    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, replyMarkup = null) {
        
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.\\n*Link:* ${escapeMarkdownV2(videoUrl)}`), replyToMessageId);
            return;
        }
        
        const videoBlob = await videoResponse.blob();
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        
        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'MarkdownV2');
        }
        
        if (replyToMessageId) {
            formData.append('reply_to_message_id', replyToMessageId);
        }
        
        // ** V12: Inline Keyboard එකතු කිරීම **
        if (replyMarkup) {
            formData.append('reply_markup', JSON.stringify(replyMarkup));
        }

        formData.append('video', videoBlob, 'video.mp4');

        if (thumbnailLink) {
            try {
                const thumbResponse = await fetch(thumbnailLink);
                if (thumbResponse.ok) {
                    const thumbBlob = await thumbResponse.blob();
                    formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                }
            } catch (e) {
                // Error handling
            }
        }

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData,
            });
            
            if (!telegramResponse.ok) {
                const telegramResult = await telegramResponse.json();
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${escapeMarkdownV2(telegramResult.description || 'නොදන්නා දෝෂයක්\\.')})`), replyToMessageId);
            }
            
        } catch (e) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්)\\.`), replyToMessageId);
        }
    },

    // ** V12: Audio URL එක සෘජුවම යැවීම **
    async sendAudio(api, chatId, audioUrl, replyToMessageId, title) {
        try {
            await fetch(`${api}/sendAudio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    audio: audioUrl,
                    caption: escapeMarkdownV2(`🎶 **Audio Downloaded**\n\nමෙම ගොනුව ඔබට Audio ලෙස Save කරගත හැක\\.`),
                    parse_mode: 'MarkdownV2',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    title: sanitizeText(title),
                    performer: 'Facebook'
                }),
            });
        } catch (e) {
            // Error handling
        }
    },

    // ** V12: Callback Answer යැවීම **
    async answerCallbackQuery(api, callbackQueryId, text) {
        try {
            await fetch(`${api}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: false 
                }),
            });
        } catch (e) {
            // Error handling
        }
    }
};
