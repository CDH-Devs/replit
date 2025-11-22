// index.js (Cloudflare Worker Main File)

import { WorkerHandlers } from './handlers';
import { getApiMetadata, scrapeVideoLinkAndThumbnail } from './api';
import { formatCaption, htmlBold } from './helpers';
import { OWNER_ID, PROGRESS_STATES } from './config';

export default {
    
    async fetch(request, env, ctx) {
        
        // POST method එකක් නොවේ නම් සරල ප්‍රතිචාරයක් යවයි.
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        // Handlers class එක initialize කරයි.
        const handlers = new WorkerHandlers(env);
        
        // පෙරනිමි inline keyboard
        const userInlineKeyboard = [
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];
        
        // Progress bar එකේ ආරම්භක තත්ත්වය
        const initialProgressKeyboard = [
             [{ text: PROGRESS_STATES[0].text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
        ];

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;
            
            if (!message && !callbackQuery) {
                 return new Response('OK', { status: 200 });
            }
            
            // ⚠️ වැදගත්: මෙය Telegram වෙත සෘජු ප්‍රතිචාරය අවහිර නොකළ යුතුය.
            // වෙනත් කෙටි tasks මෙහිදී run කළ හැකියි.
            
            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = OWNER_ID && chatId.toString() === OWNER_ID.toString();
               
                // User ID එක Database එකේ save කරයි.
                ctx.waitUntil(handlers.saveUserId(chatId));

                // ----------------------------------------------------
                // 1. Admin Commands
                // ----------------------------------------------------
                if (isOwner) {
                    if (text && text.startsWith('/admin')) {
                        const adminKeyboard = [
                            [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                            [{ text: '📣 Broadcast Message', callback_data: 'admin_broadcast' }]
                        ];
                        await handlers.sendMessage(chatId, htmlBold("⚙️ Admin Panel"), messageId, adminKeyboard);
                        return new Response('OK', { status: 200 });
                    }
                    
                    // Broadcast Handling
                    if (message.reply_to_message && message.reply_to_message.text && message.reply_to_message.text.includes("📣 Broadcast Message")) {
                        const originalMessageId = message.message_id;
                        await handlers.sendMessage(chatId, htmlBold("⏳ Starting broadcast... Please wait. This may take a while."), messageId);
                        
                        // Broadcast එක ctx.waitUntil හරහා background එකේ run කරයි
                        ctx.waitUntil((async () => {
                            const { successfulSends, failedSends } = await handlers.broadcastMessage(chatId, originalMessageId);
                            const resultText = htmlBold("✅ Broadcast Complete!") + `\n\n`
                                             + `🟢 Successful Sends: ${successfulSends}\n`
                                             + `🔴 Failed Sends: ${failedSends}`;
                            await handlers.sendMessage(chatId, resultText, originalMessageId);
                        })());

                        return new Response('OK', { status: 200 });
                    }
                }
                
                // ----------------------------------------------------
                // 2. Start Command
                // ----------------------------------------------------
                if (text === '/start') {
                    const welcomeMessage = htmlBold("👋 Welcome to Facebook Video Downloader Bot!") + "\n\n"
                                           + "Just send me a **Facebook video link** (e.g., `https://www.facebook.com/...`) and I will process it for you." + "\n\n"
                                           + "Developer: @chamoddeshan";
                    await handlers.sendMessage(chatId, welcomeMessage, messageId);
                    return new Response('OK', { status: 200 });
                }

                // ----------------------------------------------------
                // 3. Link Handling Logic (Video Download)
                // ----------------------------------------------------
                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me|m\.facebook\.com|mbasic\.facebook\.com)/i.test(text);
                    
                    if (isLink) {
                        
                        // A. Initial Progress Message
                        const initialText = htmlBold('⌛️ Detecting video... Please wait a moment.'); 
                        const progressMessageId = await handlers.sendMessage(
                            chatId, 
                            initialText, 
                            messageId, 
                            initialProgressKeyboard
                        );
                        
                        // B. Start Progress Simulation (Background Task)
                        // ⚠️ Bot reply එක Block නොකිරීමට මෙය ctx.waitUntil තුළට යොදන්න.
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        // C. Main Processing Logic
                        ctx.waitUntil((async () => {
                            try {
                                
                                ctx.waitUntil(handlers.sendAction(chatId, 'typing'));
                                
                                // 1. API හරහා Metadata ලබා ගනී
                                const apiData = await getApiMetadata(text);
                                const finalCaption = formatCaption(apiData);
                                
                                // 2. Scraper හරහා Download Link සහ Fallback Thumbnail ලබා ගනී
                                const scraperData = await scrapeVideoLinkAndThumbnail(text);
                                const videoUrl = scraperData.videoUrl;
                                
                                // 3. අවසන් Thumbnail Link එක තීරණය කරයි (API එකේ ඇති Link එකට ප්‍රමුඛත්වය දෙයි)
                                const finalThumbnailLink = apiData.thumbnailLink || scraperData.fallbackThumbnail;

                                
                                if (videoUrl) {
                                    handlers.progressActive = false; // Progress simulation නවත්වයි
                                    
                                    // 50MB (config.js වෙතින්) සීමාවට වඩා විශාලදැයි පරීක්ෂා කරයි
                                    if (apiData.filesize > MAX_FILE_SIZE_BYTES) { 
                                        
                                        if (progressMessageId) {
                                            await handlers.deleteMessage(chatId, progressMessageId);
                                        }
                                        
                                        // සීමාව ඉක්මවා ගියහොත් Download Link එක වෙබ් පිටුවට යවයි
                                        await handlers.sendLinkMessage(
                                            chatId,
                                            videoUrl, 
                                            finalCaption, 
                                            messageId
                                        );
                                        
                                    } else {
                                        // ගොනුව Telegram සීමාවට යටත් නම්, එය Upload කරයි
                                        if (progressMessageId) {
                                            await handlers.deleteMessage(chatId, progressMessageId);
                                        }
                                        
                                        ctx.waitUntil(handlers.sendAction(chatId, 'upload_video'));
                                        
                                        try {
                                            await handlers.sendVideo(
                                                chatId, 
                                                videoUrl, 
                                                finalCaption, 
                                                messageId, 
                                                finalThumbnailLink, // Thumbnail Link එක යවයි
                                                userInlineKeyboard
                                            ); 
                                        } catch (e) {
                                            // sendVideo අසාර්ථක වුවහොත්, Link එක fallback කරයි
                                            await handlers.sendLinkMessage(
                                                chatId,
                                                videoUrl, 
                                                finalCaption, 
                                                messageId
                                            );
                                        }
                                    }
                                    
                                } else {
                                    // Download Link එක සොයා ගත නොහැකි නම්
                                    handlers.progressActive = false;
                                    const errorText = htmlBold('⚠️ Sorry, the video Download Link could not be found. The video might be Private.');
                                    if (progressMessageId) {
                                        await handlers.editMessage(chatId, progressMessageId, errorText); 
                                    } else {
                                        await handlers.sendMessage(chatId, errorText, messageId);
                                    }
                                }
                                
                            } catch (error) {
                                // Scraper හෝ API දෝෂ
                                handlers.progressActive = false;
                                console.error("Video processing error:", error);
                                const errorText = htmlBold('❌ An error occurred while retrieving video information.');
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText);
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                        })());
                        
                    } else {
                        // Link එකක් නොවේ නම්
                        await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid Facebook video link.'), messageId);
                    }
                } 

                return new Response('OK', { status: 200 }); // Bot Reply කිරීමට, මෙම OK response එක අත්‍යවශ්‍යයි.

            } 
            
            // ----------------------------------------------------
            // 4. Callback Query Handling
            // ----------------------------------------------------
            if (callbackQuery) {
                 const chatId = callbackQuery.message.chat.id;
                 const messageId = callbackQuery.message.message_id;
                 const data = callbackQuery.data;
                 const buttonText = callbackQuery.message.reply_markup.inline_keyboard[0][0].text;
                 
                 // Ignore Queries
                 if (data.startsWith('ignore_')) {
                      await handlers.answerCallbackQuery(callbackQuery.id, "මෙය බොත්තමක් පමණි.");
                      return new Response('OK', { status: 200 });
                 }
                 
                 // Admin Panel Commands
                 if (OWNER_ID && chatId.toString() !== OWNER_ID.toString()) {
                      await handlers.answerCallbackQuery(callbackQuery.id, "❌ You cannot use this command.");
                      return new Response('OK', { status: 200 });
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

                 return new Response('OK', { status: 200 });
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            // දෝෂයක් ඇති වුවද, Telegram වෙත OK ප්‍රතිචාරය යවයි.
            console.error("Global Error:", e);
            return new Response('OK', { status: 200 }); 
        }
    }
};
