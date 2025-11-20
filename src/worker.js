/**
 * src/index.js
 * Final Code V34 (Uses copyMessage API to hide 'Forwarded from' tag)
 * Developer: @chamoddeshan
 */

// *****************************************************************
// ********** [ 1. Configurations and Constants ] ********************
// *****************************************************************
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
// *****************************************************************

// Telegram API Base URL
const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Helper Functions ---

function htmlBold(text) {
    return `<b>${text}</b>`;
}

// *** PROGRESS_STATES for better readability (V29) ***
const PROGRESS_STATES = [
    { text: "⏳ <b>Loading</b>...▒▒▒▒▒▒▒▒▒▒", percentage: "0%" },
    { text: "📥 <b>Downloading</b>...█▒▒▒▒▒▒▒▒▒", percentage: "10%" },
    { text: "📥 <b>Downloading</b>...██▒▒▒▒▒▒▒▒", percentage: "20%" },
    { text: "📥 <b>Downloading</b>...███▒▒▒▒▒▒▒", percentage: "30%" },
    { text: "📤 <b>Uploading</b>...████▒▒▒▒▒▒", percentage: "40%" },
    { text: "📤 <b>Uploading</b>...█████▒▒▒▒▒", percentage: "50%" },
    { text: "📤 <b>Uploading</b>...██████▒▒▒▒", percentage: "60%" },
    { text: "📤 <b>Uploading</b>...███████▒▒▒", percentage: "70%" },
    { text: "✨ <b>Finalizing</b>...████████▒▒", percentage: "80%" },
    { text: "✨ <b>Finalizing</b>...█████████▒", percentage: "90%" },
    { text: "✅ <b>Done!</b> ██████████", percentage: "100%" } 
];

// *****************************************************************
// ********** [ 2. WorkerHandlers Class (Complete Implementation) ] *
// *****************************************************************

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; 
    }

    // --- KV DB Management ---

    async saveUserId(userId) {
        if (!this.env.USER_DATABASE) return; 
        const key = `user:${userId}`;
        const isNew = await this.env.USER_DATABASE.get(key) === null; 
        if (isNew) {
            try {
                await this.env.USER_DATABASE.put(key, "1"); 
            } catch (e) {
                console.error(`KV Error: Failed to save user ID ${userId}`, e);
            }
        }
    }
    
    async getAllUsersCount() {
        if (!this.env.USER_DATABASE) return 0;
        try {
            const list = await this.env.USER_DATABASE.list({ prefix: 'user:' });
            return list.keys.length;
        } catch (e) {
            console.error("KV Error: Failed to list user keys:", e);
            return 0;
        }
    }
    
    // --- Telegram API Helpers (Using HTML Parse Mode) ---

    async sendMessage(chatId, text, replyToMessageId, inlineKeyboard = null) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
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
                console.error(`sendMessage API Failed (Chat ID: ${chatId}):`, result);
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            console.error(`sendMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
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
            const response = await fetch(`${telegramApi}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            
            const result = await response.json(); 

             if (!response.ok) {
                if (result.error_code === 400 && result.description && result.description.includes("message to edit not found")) {
                     return;
                } else {
                     console.error(`editMessage API Failed (Chat ID: ${chatId}):`, result);
                }
            }
        } catch (e) { 
             console.error(`editMessage Fetch Error (Chat ID: ${chatId}):`, e);
        }
    }
    
    async deleteMessage(chatId, messageId) {
        try {
            const response = await fetch(`${telegramApi}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                }),
            });
             if (!response.ok) {
                console.warn(`deleteMessage API Failed (Chat ID: ${chatId}, Msg ID: ${messageId}):`, await response.text());
            }
        } catch (e) { 
             console.error(`deleteMessage Fetch Error (Chat ID: ${chatId}):`, e);
        }
    }
    
    // --- answerCallbackQuery (FIXED and IMPLEMENTED) ---
    async answerCallbackQuery(callbackQueryId, text) {
        try {
            await fetch(`${telegramApi}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: false, 
                }),
            });
        } catch (e) {
            console.error("answerCallbackQuery failed:", e);
        }
    }

    // --- sendVideo (With 403 Fix Headers) ---
    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, inlineKeyboard = null) {
        
        console.log(`[DEBUG] Attempting to send video. URL: ${videoUrl.substring(0, 50)}...`);
        
        try {
            // FIX: 403 Forbidden Error මඟහැරීමට User-Agent සහ Referer Headers එකතු කිරීම.
            const videoResponse = await fetch(videoUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://fdown.net/',
                },
            });
            
            if (videoResponse.status !== 200) {
                console.error(`[DEBUG] Video Fetch Failed! Status: ${videoResponse.status} for URL: ${videoUrl}`);
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                await this.sendMessage(chatId, htmlBold(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි. CDN වෙත පිවිසීමට නොහැක. (HTTP ${videoResponse.status})`), replyToMessageId);
                return;
            }
            
            const videoBlob = await videoResponse.blob();
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            if (caption) {
                formData.append('caption', caption);
                formData.append('parse_mode', 'HTML'); 
            }
            
            if (replyToMessageId) {
                formData.append('reply_to_message_id', replyToMessageId);
            }
            
            console.log(`[DEBUG] Video Blob size: ${videoBlob.size} bytes`);
            formData.append('video', videoBlob, 'video.mp4'); 

            if (thumbnailLink) {
                try {
                    const thumbResponse = await fetch(thumbnailLink);
                    if (thumbResponse.ok) {
                        const thumbBlob = await thumbResponse.blob();
                        formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    } else {
                        if (thumbResponse.body) { await thumbResponse.body.cancel(); }
                    } 
                } catch (e) { 
                    console.warn("Thumbnail fetch failed:", e);
                }
            }
            
            if (inlineKeyboard) {
                formData.append('reply_markup', JSON.stringify({
                    inline_keyboard: inlineKeyboard
                }));
            }

            const telegramResponse = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`[DEBUG] sendVideo API Failed! Result:`, telegramResult);
                await this.sendMessage(chatId, htmlBold(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්.'})`), replyToMessageId);
            } else {
                 console.log(`[DEBUG] sendVideo successful.`);
            }
            
        } catch (e) {
            console.error(`[DEBUG] sendVideo General Error (Chat ID: ${chatId}):`, e);
            await this.sendMessage(chatId, htmlBold(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්).`), replyToMessageId);
        }
    }


    // --- Progress Bar Simulation ---

    async simulateProgress(chatId, messageId, originalReplyId) {
        const originalText = htmlBold('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'); 
        
        const statesToUpdate = PROGRESS_STATES.slice(1, 10); 

        for (let i = 0; i < statesToUpdate.length; i++) {
            if (!this.progressActive) break; 
            
            // Wait 800ms between updates
            await new Promise(resolve => setTimeout(resolve, 800)); 
            
            if (!this.progressActive) break; 

            const state = statesToUpdate[i];
            
            // PROGRESS_STATES already includes HTML <b> tags in V29
            const newKeyboard = [
                [{ text: state.text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }] // Remove HTML for button text
            ];
            const newText = originalText + "\n" + htmlBold(`\nStatus:`) + ` ${state.text}`; // Use raw state.text which has bold
            
            this.editMessage(chatId, messageId, newText, newKeyboard);
        }
    }
    
    // --- Broadcast Feature (FIXED WITH BATCHING/CHUNKING & copyMessage) ---
    async broadcastMessage(fromChatId, originalMessageId) {
        if (!this.env.USER_DATABASE) return { successfulSends: 0, failedSends: 0 };
        
        const BATCH_SIZE = 50; // එක් වරකට යවන පණිවිඩ ගණන
        let successfulSends = 0;
        let failedSends = 0;

        try {
            // KV List Keys මඟින් සියලුම Users IDs ලබාගැනීම
            const list = await this.env.USER_DATABASE.list({ prefix: 'user:' });
            const userKeys = list.keys.map(key => key.name.split(':')[1]);
            
            const totalUsers = userKeys.length;
            console.log(`[BROADCAST] Total users found: ${totalUsers}`);
            
            // Note: copyMessage API එක Forwarded from Tag එක ඉවත් කරයි.
            const copyMessageUrl = `${telegramApi}/copyMessage`; 
            
            // Users ලා BATCHES වලට බෙදීම
            for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
                const batch = userKeys.slice(i, i + BATCH_SIZE);
                console.log(`[BROADCAST] Processing batch ${Math.ceil((i + 1) / BATCH_SIZE)}/${Math.ceil(totalUsers / BATCH_SIZE)} (Size: ${batch.length})`);
                
                // වර්තමාන Batch එක සඳහා Promises අරාවක් නිර්මාණය කිරීම
                const sendPromises = batch.map(async (userId) => {
                    // Owner ID එකට ආපසු යැවීම වළක්වයි
                    if (userId.toString() === OWNER_ID.toString()) return; 

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
                            // Block වූ Users ලා ඉවත් කිරීම (403: Forbidden)
                            if (result.error_code === 403) {
                                 console.log(`User ${userId} blocked the bot. Removing from KV.`);
                                 this.env.USER_DATABASE.delete(`user:${userId}`);
                            }
                        }
                    } catch (e) {
                        console.error(`Broadcast failed for user ${userId}:`, e);
                        failedSends++;
                    }
                });

                // Batch එකේ සියලුම promises අවසන් වනතුරු රැඳී සිටීම
                await Promise.allSettled(sendPromises);
                
                // Telegram Rate Limits වළක්වා ගැනීමට Batch අතර තත්පර 1ක රැඳී සිටීම
                await new Promise(resolve => setTimeout(resolve, 1000));
            }


        } catch (e) {
            console.error("Error listing users for broadcast:", e);
        }

        return { successfulSends, failedSends };
    }
}


// *****************************************************************
// ********** [ 3. Main Fetch Handler ] ******************************
// *****************************************************************

export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        // --- Inline Keyboards ---
        const userInlineKeyboard = [
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];
        
        // Initial progress keyboard uses the first state text, removing HTML tags for button text
        const initialProgressKeyboard = [
             [{ text: PROGRESS_STATES[0].text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
        ];
        // ------------------------

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;
            
            if (!message && !callbackQuery) {
                 return new Response('OK', { status: 200 });
            }
            // Ensure the main execution path is not blocked by KV writes
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));


            // --- 1. Message Handling ---
            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = OWNER_ID && chatId.toString() === OWNER_ID.toString();
                
                const userName = message.from.first_name || "User"; 

                // Save user ID to KV in the background
                ctx.waitUntil(handlers.saveUserId(chatId));

                // A. Broadcast Message Logic (Prompt Reply)
                if (isOwner && message.reply_to_message) {
                    const repliedMessage = message.reply_to_message;
                    
                    // Prompt Message එක හඳුනාගැනීම සඳහා සරල පරීක්ෂාවක්
                    if (repliedMessage.text && repliedMessage.text.includes("කරුණාකර දැන් ඔබ යැවීමට අවශ්‍ය පණිවිඩය එවන්න:")) {
                        
                        const messageToBroadcastId = messageId; 
                        const originalChatId = chatId;
                        const promptMessageId = repliedMessage.message_id; // Capture prompt message ID

                        // Prompt Message එක Edit කිරීම
                        await handlers.editMessage(chatId, promptMessageId, htmlBold("📣 Broadcast කිරීම ආරම්භ විය. කරුණාකර රැඳී සිටින්න."));
                        
                        // Background එකේ Broadcast කිරීම ආරම්භ කිරීම (using ctx.waitUntil)
                        ctx.waitUntil((async () => {
                            try {
                                const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                                
                                // Admin හට ප්‍රතිඵල යැවීම (Broadcast අවසන් වූ පසු)
                                const resultMessage = htmlBold(`Message Send Successfully ✅`) + `\n\n` + htmlBold(`🚀 Send: ${results.successfulSends}`) + `\n` + htmlBold(`❗️ Faild: ${results.failedSends}`);
                                
                                // Broadcast පණිවිඩයටම Reply කර ප්‍රතිඵල යැවීම
                                await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                            } catch (e) {
                                console.error("Broadcast Process Failed in WaitUntil:", e);
                                // Admin හට දෝෂ පණිවිඩයක් යැවීම
                                await handlers.sendMessage(chatId, htmlBold("❌ Broadcast කිරීමේ ක්‍රියාවලිය අසාර්ථක විය.") + `\n\nError: ${e.message}`, messageToBroadcastId);
                            }
                        })()); 

                        return new Response('OK', { status: 200 });
                    }
                }
                
                // A2. Owner Quick Broadcast Option (/brod command)
                if (isOwner && text && text.toLowerCase().startsWith('/brod') && message.reply_to_message) {
                    const messageToBroadcastId = message.reply_to_message.message_id; 
                    const originalChatId = chatId;
                    
                    await handlers.sendMessage(chatId, htmlBold("📣 Quick Broadcast ආරම්භ විය..."), messageId);

                    ctx.waitUntil((async () => {
                        try {
                            const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                            
                            const resultMessage = htmlBold(`Quick Message Send Successfully ✅`) + `\n\n` + htmlBold(`🚀 Send: ${results.successfulSends}`) + `\n` + htmlBold(`❗️ Faild: ${results.failedSends}`);
                            
                            await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                        } catch (e) {
                            console.error("Quick Broadcast Process Failed in WaitUntil:", e);
                            await handlers.sendMessage(chatId, htmlBold("❌ Quick Broadcast කිරීමේ ක්‍රියාවලිය අසාර්ථක විය.") + `\n\nError: ${e.message}`, messageId);
                        }
                    })());

                    return new Response('OK', { status: 200 });
                }

                
                // B. /start command Handling (English HTML)
                if (text && text.toLowerCase().startsWith('/start')) {
                    
                    if (isOwner) {
                        // Owner Message and Admin Keyboard (HTML)
                        const ownerText = htmlBold("👑 Welcome Back, Admin! 👑") + "\n\nමෙය ඔබගේ Admin Control Panel එකයි.";
                        const adminKeyboard = [
                            [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                            [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
                        ];
                        await handlers.sendMessage(chatId, ownerText, messageId, adminKeyboard);
                    } else {
                        // Normal User Message (English HTML)
                        const userText = `👋 <b>Hello Dear ${userName}!</b> 💁‍♂️ You can easily <b>Download Facebook Videos</b> using this BOT.

🎯 This BOT is <b>Active 24/7</b>.🔔 

◇───────────────◇

🚀 <b>Developer</b> : @chamoddeshan
🔥 <b>C D H Corporation ©</b>

◇───────────────◇`;
                        
                        await handlers.sendMessage(chatId, userText, messageId, userInlineKeyboard);
                    }
                    return new Response('OK', { status: 200 });
                }

                // C. Facebook Link Handling (FDown Scraping & Video Sending)
                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                    
                    if (isLink) {
                        
                        // 1. Initial Message Send
                        const initialText = htmlBold('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'); 
                        const progressMessageId = await handlers.sendMessage(
                            chatId, 
                            initialText, 
                            messageId, 
                            initialProgressKeyboard
                        );
                        
                        // 2. Start Progress Simulation in background
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        // 3. Start Scraping and Fetching
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
                            
                            // Get Thumbnail Link
                            const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                            let thumbnailMatch = resultHtml.match(thumbnailRegex);
                            if (thumbnailMatch && thumbnailMatch[1]) {
                                thumbnailLink = thumbnailMatch[1];
                            }

                            // Get HD or Normal Quality Link
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
                            
                            // 4. Send Video or Error
                            if (videoUrl) {
                                let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                                
                                handlers.progressActive = false; 
                                
                                if (progressMessageId) {
                                     await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                await handlers.sendVideo(
                                    chatId, 
                                    cleanedUrl, 
                                    null, 
                                    messageId, 
                                    thumbnailLink, 
                                    userInlineKeyboard
                                ); 
                                
                            } else {
                                console.error(`[DEBUG] Video Link not found for: ${text}`);
                                handlers.progressActive = false;
                                const errorText = htmlBold('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.');
                                if (progressMessageId) {
                                     await handlers.editMessage(chatId, progressMessageId, errorText); 
                                } else {
                                     await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                            
                        } catch (fdownError) {
                             console.error(`[DEBUG] FDown Scraping Error (Chat ID: ${chatId}):`, fdownError);
                             handlers.progressActive = false;
                             const errorText = htmlBold('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය.');
                             if (progressMessageId) {
                                 await handlers.editMessage(chatId, progressMessageId, errorText);
                             } else {
                                 await handlers.sendMessage(chatId, errorText, messageId);
                             }
                        }
                        
                    } else {
                        await handlers.sendMessage(chatId, htmlBold('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), messageId);
                    }
                } 
            }
            
            // --- 2. Callback Query Handling ---
            if (callbackQuery) {
                 const chatId = callbackQuery.message.chat.id;
                 const data = callbackQuery.data;
                 const messageId = callbackQuery.message.message_id;

                 if (data === 'ignore_progress') {
                     await handlers.answerCallbackQuery(callbackQuery.id, "🎬 වීඩියෝව සකස් වෙමින් පවතී...");
                     return new Response('OK', { status: 200 });
                 }
                 
                 // Owner Check for admin callbacks
                 if (OWNER_ID && chatId.toString() !== OWNER_ID.toString()) {
                      await handlers.answerCallbackQuery(callbackQuery.id, "❌ ඔබට මෙම විධානය භාවිතා කළ නොහැක.");
                      return new Response('OK', { status: 200 });
                 }

                 switch (data) {
                     case 'admin_users_count':
                         const usersCount = await handlers.getAllUsersCount();
                         const countMessage = htmlBold(`📊 දැනට ඔබගේ Bot භාවිතා කරන Users ගණන: ${usersCount}`);
                         await handlers.editMessage(chatId, messageId, countMessage);
                         await handlers.answerCallbackQuery(callbackQuery.id, `Users ${usersCount} ක් සිටී.`);
                         break;
                     
                     case 'admin_broadcast':
                         // Sending a new message/prompt for the broadcast
                         const broadcastPrompt = htmlBold(`📣 Broadcast පණිවිඩය\n\nකරුණාකර දැන් ඔබ යැවීමට අවශ්‍ය <b>Text, Photo, හෝ Video</b> එක <b>Reply</b> කරන්න.`);
                         // Send the prompt as a new message, replying to the button message
                         await handlers.sendMessage(chatId, broadcastPrompt, messageId); 
                         await handlers.answerCallbackQuery(callbackQuery.id, "Broadcast කිරීම සඳහා පණිවිඩය සූදානම්.");
                         break;
                     
                     case 'ignore_c_d_h':
                         await handlers.answerCallbackQuery(callbackQuery.id, "මෙය තොරතුරු බොත්තමකි.");
                         break;
                 }

                 return new Response('OK', { status: 200 });
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update: TypeError: " + e.message);
            console.error("-------------------------------------------------");
            return new Response('OK', { status: 200 }); 
        }
    }
};
