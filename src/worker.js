/**
 * src/index.js
 * V11: Snapsave.app Integration, Video Info Scraping (Title, Views, Likes, Duration), Sinhala Friendly Telegram Bot Responses.
 */

// Helper to escape Telegram MarkdownV2
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// Helper to clean scraped text
function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim();
    cleaned = cleaned.replace(/\s\s+/g, ' ');
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
    return cleaned;
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your Facebook Video Telegram Bot [Snapsave.app powered].', { status: 200 });
        }

        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;

            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;

                // Handle "/start"
                if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. Snapsave.app හරහා download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                // Validate Facebook link (supports fb.watch/fb.me)
                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);

                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනාගෙන download link සෙවීම සිදුවෙයි... කරුණාකර රැදී සිටින්න.'), messageId);

                    try {
                        // Snapsave.app get video info
                        const snapsaveUrl = "https://snapsave.app/action.php";
                        const formData = new URLSearchParams();
                        formData.append('url', text);

                        const snapsaveResponse = await fetch(snapsaveUrl, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://snapsave.app/',
                            },
                            body: formData.toString(),
                        });

                        const resultHtml = await snapsaveResponse.text();

                        // Scrape Video Info
                        // Title, Thumbnail, Video Links, Duration etc
                        let title = 'නොදන්නා';
                        let views = 'නොදන්නා';
                        let likes = 'නොදන්නා';
                        let duration = 'නොදන්නා';
                        let videoUrl = null;
                        let thumbnailLink = null;

                        // Title
                        const titleRegex = /<div class="caption">(.*?)<\/div>/i;
                        const titleMatch = resultHtml.match(titleRegex);
                        if (titleMatch && titleMatch[1]) title = sanitizeText(titleMatch[1]);
                        // Thumbnail
                        const thumbRegex = /<img[^>]+class="thumb"[^>]*src="([^"]+)"/i;
                        const thumbMatch = resultHtml.match(thumbRegex);
                        if (thumbMatch && thumbMatch[1]) thumbnailLink = thumbMatch[1];
                        // Duration
                        const durationRegex = /<b>Duration:<\/b>\s*([^<]+)/i;
                        const durationMatch = resultHtml.match(durationRegex);
                        if (durationMatch && durationMatch[1]) duration = sanitizeText(durationMatch[1]);
                        // Views
                        const viewsRegex = /<b>Views:<\/b>\s*([^<]+)/i;
                        const viewsMatch = resultHtml.match(viewsRegex);
                        if (viewsMatch && viewsMatch[1]) views = sanitizeText(viewsMatch[1]);
                        // Likes
                        const likesRegex = /<b>Likes:<\/b>\s*([^<]+)/i;
                        const likesMatch = resultHtml.match(likesRegex);
                        if (likesMatch && likesMatch[1]) likes = sanitizeText(likesMatch[1]);
                        // Video Link - HD first, normal fallback
                        const hdLinkRegex = /<a[^>]+href="([^"]+)"[^>]*>\s*Download\s*HD\s*<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);
                        if (match && match[1]) {
                            videoUrl = match[1];
                        } else {
                            const normalLinkRegex = /<a[^>]+href="([^"]+)"[^>]*>\s*Download\s*<\/a>/i;
                            match = resultHtml.match(normalLinkRegex);
                            if (match && match[1]) videoUrl = match[1];
                        }

                        // Info message
                        const infoMsg =
                          `🎬 *Title*: ${title}\n👁️ *Views*: ${views}\n👍 *Likes*: ${likes}\n⏱️ *Duration*: ${duration}`;
                        await this.sendMessage(
                            telegramApi,
                            chatId,
                            escapeMarkdownV2(infoMsg),
                            messageId
                        );

                        if (videoUrl) {
                            // Fix entities
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            // Check size limit (optional: HEAD request, if CORS allows)
                            // Otherwise, send as video if reasonably sized (<50mb), else send direct link.
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink);
                        } else {
                            await this.sendMessage(
                                telegramApi,
                                chatId,
                                escapeMarkdownV2('⚠️ Download Link එක සොයා ගැනීමට නොහැකි වුණා. වීඩියෝව private/region-lock වෙන්න පුළුවන්!'),
                                messageId
                            );
                        }
                    } catch (snapsaveError) {
                        await this.sendMessage(
                            telegramApi,
                            chatId,
                            escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති වුණා.'),
                            messageId
                        );
                    }
                } else {
                    await this.sendMessage(
                        telegramApi,
                        chatId,
                        escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'),
                        messageId
                    );
                }
            }
            return new Response('OK', { status: 200 });
        } catch (e) {
            return new Response('OK', { status: 200 });
        }
    },

    // Telegram message sender
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
            // Optionally log/send admin error
        }
    },

    // Video uploader to Telegram
    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null) {
        // Try direct upload
        try {
            const videoResponse = await fetch(videoUrl);
            if (videoResponse.status !== 200) {
                await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ Video upload අසාර්ථකයි. CDN වැරදි.`), replyToMessageId);
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
            formData.append('video', videoBlob, 'video.mp4');
            if (thumbnailLink) {
                try {
                    const thumbResponse = await fetch(thumbnailLink);
                    if (thumbResponse.ok) {
                        const thumbBlob = await thumbResponse.blob();
                        formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    }
                } catch (e) {
                    // Thumb fetch fail
                }
            }
            // Send to Telegram
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData,
            });
            const telegramResult = await telegramResponse.json();
            if (!telegramResponse.ok) {
                await this.sendMessage(api, chatId,
                    escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්.'})`),
                    replyToMessageId
                );
            }
        } catch (e) {
            await this.sendMessage(api, chatId,
                escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්).`),
                replyToMessageId
            );
        }
    }
};
