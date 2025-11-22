// fbindex.js - සම්පූර්ණ කේතය (HTML/Download Handler ඉවත් කර ඇත)

import { WorkerHandlers } from './handlers';
import { getApiMetadata, scrapeVideoLinkAndThumbnail } from './api';
import { formatCaption, htmlBold } from './helpers';
import { PROGRESS_STATES, MAX_FILE_SIZE_BYTES } from './config';

export default {
    
    // Cloudflare Worker හි fetch ශ්‍රිතය
    async fetch(request, env, ctx) {
        
        const url = new URL(request.url);
        
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        // Handlers class එක initialize කිරීම (ENV variables සමග)
        const handlers = new WorkerHandlers(env);
        
        // Default Keyboards
        const userInlineKeyboard = [
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];
        
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
            
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0))); // Wait until context

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                
                // OWNER_ID ENV විචල්‍යයෙන් ලබා ගනී
                const isOwner = env.OWNER_ID && chatId.toString() === env.OWNER_ID.toString();
                
                const userName = message.from.first_name || "User"; 

                // User ID එක KV එකේ save කිරීම
                ctx.waitUntil(handlers.saveUserId(chatId));

                
                // --- /start විධානය හැසිරවීම ---
                if (text && text.toLowerCase().startsWith('/start')) {
                    
                    if (isOwner) {
                        const ownerText = htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.";
                        const adminKeyboard = [
                            [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                            [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
                        ];
                        await handlers.sendMessage(chatId, ownerText, messageId, adminKeyboard);
                    } else {
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
                // --- /start අවසන් ---

                // --- URL හැසිරවීම ---
                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                    
                    if (isLink) {
                        
                        // Action: Send 'typing'
                        ctx.waitUntil(handlers.sendAction(chatId, 'typing'));

                        const initialText = htmlBold('⌛️ Detecting video... Please wait a moment.'); 
                        const progressMessageId = await handlers.sendMessage(
                            chatId, 
                            initialText, 
                            messageId, 
                            initialProgressKeyboard
                        );
                        
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        try {
                            // API කැඳවීමේදී env context එක යවයි
                            const apiData = await getApiMetadata(text, env); 
                            const finalCaption = formatCaption(apiData);
                            
                            const scraperData = await scrapeVideoLinkAndThumbnail(text);
                            const videoUrl = scraperData.videoUrl;
                            
                            const finalThumbnailLink = apiData.thumbnailLink || scraperData.fallbackThumbnail;

                            
                            if (videoUrl) {
                                handlers.progressActive = false; 
                                
                                // Large file handling: MAX_FILE_SIZE_BYTES (50MB) භාවිතා කරයි
                                if (apiData.filesize > MAX_FILE_SIZE_BYTES) { 
                                    if (progressMessageId) {
                                        await handlers.deleteMessage(chatId, progressMessageId);
                                    }
                                    
                                    await handlers.sendLinkMessage(
                                        chatId,
                                        videoUrl, 
                                        finalCaption, 
                                        messageId,
                                        apiData // apiData එක සම්පූර්ණයෙන් යැවීම
                                    );
                                    
                                } else {
                                    // 50MB ට අඩු නම්, සෘජුවම sendVideo
                                    if (progressMessageId) {
                                        ctx.waitUntil(handlers.editMessage(
                                            chatId, 
                                            progressMessageId, 
                                            htmlBold('🚀 Uploading to Telegram...')
                                        ));
                                    }
                                    
                                    await handlers.sendVideo(
                                        chatId, 
                                        videoUrl, 
                                        finalCaption, 
                                        messageId, 
                                        finalThumbnailLink,
                                        userInlineKeyboard
                                    );
                                    
                                    if (progressMessageId) {
                                        await handlers.deleteMessage(chatId, progressMessageId);
                                    }
                                }
                                
                            } else {
                                handlers.progressActive = false;
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                await handlers.sendMessage(chatId, htmlBold('❌ Could not find a high-quality video link.'), messageId);
                            }
                            
                        } catch (fdownError) {
                            handlers.progressActive = false;
                            if (progressMessageId) {
                                await handlers.deleteMessage(chatId, progressMessageId);
                            }
                            console.error("FDown Error:", fdownError.message);
                            await handlers.sendMessage(chatId, htmlBold('❌ An error occurred during video processing.') + `\n\nDetails: ${fdownError.message}`, messageId);
                        }
                        return new Response('OK', { status: 200 }); // Link received and handled
                        
                    } else {
                        // Link එකක් නොවේ නම්
                        await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid Facebook video link.'), messageId);
                    }
                } 
            }
            
            // --- Callback Query Logic (Admin Commands) ---
            if (callbackQuery) {
                 const chatId = callbackQuery.message.chat.id;
                 const messageId = callbackQuery.message.message_id;
                 const data = callbackQuery.data;
                 const buttonText = callbackQuery.message.reply_markup.inline_keyboard[0][0].text;
                 
                 // Admin පරීක්ෂාව env.OWNER_ID හරහා
                 if (env.OWNER_ID && chatId.toString() !== env.OWNER_ID.toString()) { 
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
                          
                      case 'ignore_c_d_h':
                          await handlers.answerCallbackQuery(callbackQuery.id, "© C D H Corporation");
                          break;
                     // Add other case handlers as needed
                 }

                 return new Response('OK', { status: 200 });
            }

            // --- Broadcast Reply Handling ---
            const isBroadcastReply = message && message.reply_to_message && message.reply_to_message.text && message.reply_to_message.text.includes("Broadcast Message") && isOwner;

            if (isBroadcastReply) {
                const originalMessageId = message.message_id; // broadcast කිරීමට අවශ්‍ය පණිවිඩයයි
                const chatId = message.chat.id;

                await handlers.sendMessage(chatId, htmlBold("📤 Broadcasting started..."));
                const { successfulSends, failedSends } = await handlers.broadcastMessage(chatId, originalMessageId);
                
                const resultText = htmlBold("✅ Broadcast Complete!") + `\n\n`
                                 + `Successful sends: ${successfulSends}\n`
                                 + `Failed sends (User blocked bot): ${failedSends}`;
                
                await handlers.sendMessage(chatId, resultText);
                return new Response('OK', { status: 200 });
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            // 🚨 දෝෂය log කර එය 500 status එකක් ලෙස ආපසු යවයි.
            console.error("Worker Catch Block Error:", e);
            
            // Telegram webhook එකට 500 status එකක් යැවීමෙන් සත්‍ය වශයෙන්ම දෝෂයක් ඇති බව පෙන්වයි.
            return new Response(`Worker Internal Error: ${e.message}`, { status: 500 });
        }
    }
};
