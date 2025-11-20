/**
 * src/index.js
 * FIX: All Helper Functions moved inside the export default object to resolve '500 Internal Server Error' 
 * often caused by environment variable/binding access issues (env.USER_DATABASE) or scope problems in Cloudflare Workers.
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
    cleaned = cleaned.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
    return cleaned;
}


export default {
    
    // ------------------------------------
    // KV සහායක Functions (Worker Object තුළට)
    // ------------------------------------

    async saveUserId(env, userId) {
        // env.USER_DATABASE binding එක අවශ්‍යයි
        if (!env.USER_DATABASE) return; 

        const key = `user:${userId}`;
        const isNew = await env.USER_DATABASE.get(key) === null; 

        if (isNew) {
            await env.USER_DATABASE.put(key, "1"); 
        }
    },

    async getAllUsersCount(env) {
        if (!env.USER_DATABASE) return 0;
        const listResult = await env.USER_DATABASE.list({ prefix: "user:" });
        return listResult.keys.length;
    },

    async broadcastMessage(env, telegramApi, messageText) {
        if (!env.USER_DATABASE) return 0;
        
        let listResult = { keys: [], list_complete: false };
        let cursor = null;
        let successfulSends = 0;
        let failedSends = 0;
        
        do {
            listResult = await env.USER_DATABASE.list({ prefix: "user:", cursor: cursor });
            cursor = listResult.list_complete ? null : listResult.cursor;

            for (const key of listResult.keys) {
                const userId = key.name.split(':')[1];
                
                try {
                    await fetch(`${telegramApi}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: userId,
                            text: messageText, 
                            parse_mode: 'MarkdownV2',
                        }),
                    });
                    successfulSends++;
                } catch (e) {
                    failedSends++;
                }
            }

        } while (cursor); 
        return { successfulSends, failedSends };
    },

    // ------------------------------------
    // Telegram API සහායක Functions (Worker Object තුළට)
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

    async sendMessageWithKeyboard(api, chatId, text, replyToMessageId, keyboard) {
        try {
            await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'MarkdownV2', 
                    reply_markup: {
                        inline_keyboard: keyboard
                    },
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            // Error handling
        }
    },
    
    async editMessage(api, chatId, messageId, text) {
        try {
            await fetch(`${api}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: text,
                    parse_mode: 'MarkdownV2',
                }),
            });
        } catch (e) {
            // Error handling
        }
    },
    
    async answerCallbackQuery(api, callbackQueryId, text) {
        try {
            await fetch(`${api}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: false,
                }),
            });
        } catch (e) {
            // Error handling
        }
    },

    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null) {
        
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි. CDN වෙත පිවිසීමට නොහැක.`), replyToMessageId);
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
                // Error handling
            }
        }

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්.'})`), replyToMessageId);
            }
            
        } catch (e) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්).`), replyToMessageId);
        }
    },
    
    // ------------------------------------
    // ප්‍රධාන fetch Handler
    // ------------------------------------

    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        // *****************************************************************
        // ********** [ ඔබගේ අගයන් මෙහි ඇතුළත් කරන්න ] ************************
        // *****************************************************************
        // !!! වැදගත්: කරුණාකර මේවා ඔබේ සත්‍ය අගයන් සමඟ වෙනස් කරන්න !!!
        const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE'; 
        const OWNER_ID = 'YOUR_OWNER_ID_HERE'; 
        // *****************************************************************

        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;
            
            // Telegram වෙත Worker successfully process කළ බවට වහාම OK ප්‍රතිචාරයක් යවයි.
            // මෙය 500 error එක බොහෝ විට නිවැරදි කරයි.
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));


            // ------------------------------------
            // 1. Message Handling
            // ------------------------------------
            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                // ** A. User ID KV එකට save කිරීම **
                ctx.waitUntil(this.saveUserId(env, chatId));
                
                if (text === '/start') {
                    const userName = message.from.first_name || "ප්‍රියතම මිතුර!";

                    // Owner Panel
                    if (OWNER_ID && chatId.toString() === OWNER_ID.toString()) {
                        
                        const usersCount = await this.getAllUsersCount(env);

                        const ownerMessage = `👋 **පරිපාලක පැනලය**\n\nමෙමගින් ඔබගේ Bot එකේ දත්ත පරීක්ෂා කළ හැක\.`;
                        const inlineKeyboard = [
                            [{ text: `📊 දැනට සිටින Users: ${usersCount}`, callback_data: 'admin_users_count' }],
                            [{ text: '📣 සියලු Users වෙත පණිවිඩයක් යවන්න', callback_data: 'admin_broadcast' }]
                        ];

                        await this.sendMessageWithKeyboard(telegramApi, chatId, escapeMarkdownV2(ownerMessage), messageId, inlineKeyboard);

                    } else {
                        // සාමාන්‍ය User Start Message
                        const userStartMessage = 
                            `👋 Hello Dear **${escapeMarkdownV2(userName)}**\\! \n\n` +
                            `💁‍♂️ මේ BOT ගෙන් පුළුවන් ඔයාට __Facebook Video__ ලේසියෙන්ම __Download__ කර ගන්න\.\n\n` +
                            `🎯 මේ BOT පැය __24/7__ ම Active එකේ තියෙනවා\\.🔔 \n\n` +
                            `◇───────────────◇\n\n` +
                            `🚀 __Developer__ : @chamoddeshan\n` +
                            `🔥 __C D H Corporation__ ©\n\n` +
                            `◇───────────────◇`;
                        
                        const userInlineKeyboard = [
                            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
                        ];

                        await this.sendMessageWithKeyboard(
                            telegramApi, 
                            chatId, 
                            userStartMessage, 
                            messageId, 
                            userInlineKeyboard
                        );
                    }
                    return new Response('OK', { status: 200 });
                }

                // ** C. Broadcast Message එක හඳුනා ගැනීම **
                if (OWNER_ID && chatId.toString() === OWNER_ID.toString() && message.reply_to_message && message.reply_to_message.text.includes("කරුණාකර දැන් ඔබ යැවීමට අවශ්‍ය පණිවිඩය එවන්න:")) {
                    
                    const broadcastText = escapeMarkdownV2(message.text);
                    const results = await this.broadcastMessage(env, telegramApi, broadcastText);
                    
                    const resultMessage = escapeMarkdownV2(`✅ Broadcast කිරීම සාර්ථකයි!`) + `\n\n` + escapeMarkdownV2(`සාර්ථකව යැවූ: ${results.successfulSends}`) + `\n` + escapeMarkdownV2(`අසාර්ථක වූ: ${results.failedSends}`);
                    
                    await this.sendMessage(telegramApi, chatId, resultMessage, messageId);
                    
                    await this.editMessage(telegramApi, chatId, message.reply_to_message.message_id, escapeMarkdownV2("📣 Broadcast කිරීම ආරම්භ විය\."));
                    
                    return new Response('OK', { status: 200 });
                }
                
                // Facebook Link Handling
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
                        
                        // Thumbnail Link
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }

                        // Video Link Scraping
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
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink); 
                        } else {
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.'), messageId);
                        }
                        
                    } catch (fdownError) {
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය.'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), messageId);
                }
            }
            
            // ------------------------------------
            // 2. Callback Query Handling
            // ------------------------------------
            if (callbackQuery) {
                const chatId = callbackQuery.message.chat.id;
                const data = callbackQuery.data;
                const messageId = callbackQuery.message.message_id;
                
                // Owner Check
                if (OWNER_ID && chatId.toString() !== OWNER_ID.toString()) {
                     await this.answerCallbackQuery(telegramApi, callbackQuery.id, "❌ ඔබට මෙම විධානය භාවිතා කළ නොහැක.");
                     return new Response('OK', { status: 200 });
                }

                switch (data) {
                    case 'admin_users_count':
                        const usersCount = await this.getAllUsersCount(env);
                        const countMessage = escapeMarkdownV2(`📊 දැනට ඔබගේ Bot භාවිතා කරන Users ගණන: ${usersCount}`);
                        
                        await this.editMessage(telegramApi, chatId, messageId, countMessage);
                        await this.answerCallbackQuery(telegramApi, callbackQuery.id, `Users ${usersCount} ක් සිටී.`);
                        break;
                    
                    case 'admin_broadcast':
                        const broadcastPrompt = escapeMarkdownV2(`📣 Broadcast පණිවිඩය\n\nකරුණාකර දැන් ඔබ යැවීමට අවශ්‍ය පණිවිඩය එවන්න:`);
                        
                        await this.sendMessage(telegramApi, chatId, broadcastPrompt, messageId); 
                        
                        await this.answerCallbackQuery(telegramApi, callbackQuery.id, "Broadcast කිරීම සඳහා පණිවිඩය සූදානම්.");
                        break;
                    
                    case 'ignore_c_d_h':
                        await this.answerCallbackQuery(telegramApi, callbackQuery.id, "මෙය තොරතුරු බොත්තමකි.");
                        break;

                }
                
                return new Response('OK', { status: 200 });
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            // දෝෂයක් ඇති වුවහොත්, එය Log කර Telegram වෙත OK ප්‍රතිචාරයක් යවයි.
            console.error(e);
            return new Response('OK', { status: 200 }); 
        }
    }
};
