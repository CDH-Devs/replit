import { WorkerHandlers } from './handlers.js';
import { downloadTikTokVideo } from './api.js';
import { formatTikTokCaption, htmlBold } from './helpers.js';
import { PROGRESS_STATES } from './config.js';

export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello! I am LK NEWS Download Bot - Your TikTok Video Downloader.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        const getVideoKeyboard = (videoUrl, videoCaption) => [
            [
                { text: '🎵 Extract Audio', callback_data: `extract_audio_${Date.now()}` }
            ]
        ];
        
        const initialProgressKeyboard = [
             [{ text: PROGRESS_STATES[0].text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
        ];

        try {
            const update = await request.json();
            console.log('[Bot] Received update:', JSON.stringify(update).substring(0, 300));
            
            const message = update.message;
            const callbackQuery = update.callback_query;
            
            if (!message && !callbackQuery) {
                 console.log('[Bot] No message or callback query found');
                 return new Response('OK', { status: 200 });
            }
            
            if (message) {
                console.log('[Bot] Processing message from user:', message.from?.id);
            }
            if (callbackQuery) {
                console.log('[Bot] Processing callback query:', callbackQuery.data);
            }
            
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = env.OWNER_ID && chatId.toString() === env.OWNER_ID.toString();
                
                const userName = message.from.first_name || "User"; 

                ctx.waitUntil(handlers.saveUserId(chatId));

                if (isOwner && message.reply_to_message) {
                    const repliedMessage = message.reply_to_message;
                    
                    if (repliedMessage.text && repliedMessage.text.includes("Please reply with the message you want to broadcast:")) {
                        
                        const messageToBroadcastId = messageId; 
                        const originalChatId = chatId;
                        const promptMessageId = repliedMessage.message_id; 

                        await handlers.editMessage(chatId, promptMessageId, htmlBold("📣 Broadcast started. Please wait."));
                        
                        ctx.waitUntil((async () => {
                            try {
                                const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                                
                                const resultMessage = htmlBold('Broadcast Complete ✅') + `\n\n`
                                                    + htmlBold(`🚀 Successful: `) + results.successfulSends + '\n'
                                                    + htmlBold(`❗️ Failed/Blocked: `) + results.failedSends;
                                
                                await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                            } catch (e) {
                                await handlers.sendMessage(chatId, htmlBold("❌ Broadcast Process Failed.") + `\n\nError: ${e.message}`, messageToBroadcastId);
                            }
                        })()); 

                        return new Response('OK', { status: 200 });
                    }
                }
                
                if (isOwner && text && text.toLowerCase().startsWith('/brod') && message.reply_to_message) {
                    const messageToBroadcastId = message.reply_to_message.message_id; 
                    const originalChatId = chatId;
                    
                    await handlers.sendMessage(chatId, htmlBold("📣 Quick Broadcast started..."), messageId);

                    ctx.waitUntil((async () => {
                        try {
                            const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                            
                            const resultMessage = htmlBold('Quick Broadcast Complete ✅') + `\n\n`
                                                + htmlBold(`🚀 Successful: `) + results.successfulSends + '\n'
                                                + htmlBold(`❗️ Failed/Blocked: `) + results.failedSends;
                            
                            await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                        } catch (e) {
                            await handlers.sendMessage(chatId, htmlBold("❌ Quick Broadcast failed.") + `\n\nError: ${e.message}`, messageId);
                        }
                    })());

                    return new Response('OK', { status: 200 });
                }
                
                if (text && text.toLowerCase().startsWith('/start')) {
                    
                    if (isOwner) {
                        const ownerText = htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.";
                        const adminKeyboard = [
                            [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                            [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                            [{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }] 
                        ];
                        await handlers.sendMessage(chatId, ownerText, messageId, adminKeyboard);
                    } else {
                        const userText = `👋 <b>Hello ${userName}!</b>

🎬 Welcome to <b>LK NEWS Download Bot</b> - TikTok Video Downloader!

📌 <b>How to use:</b>
Just send me any TikTok video link and I'll download it for you.
✅ Videos without watermark
✅ Full metadata included

✅ <b>Supported links:</b>
• tiktok.com/...
• vm.tiktok.com/...
• vt.tiktok.com/...

◇───────────────◇

🚀 <b>TikTok Video Downloader</b>
🔥 <b>Powered by Replit</b>

◇───────────────◇`;
                        
                        await handlers.sendMessage(chatId, userText, messageId, userInlineKeyboard);
                    }
                    return new Response('OK', { status: 200 });
                }

                if (text) { 
                    const isAudioRequest = text.toLowerCase().startsWith('audio ') || text.toLowerCase().endsWith(' /audio');
                    const cleanUrl = text.replace(/^audio\s+/i, '').replace(/\s+\/audio$/i, '').trim();
                    const isTikTokLink = /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(isAudioRequest ? cleanUrl : text);
                    
                    if (isTikTokLink) {
                        const urlToUse = isAudioRequest ? cleanUrl : text;
                        
                        ctx.waitUntil(handlers.sendAction(chatId, 'typing'));

                        const initialText = htmlBold('⏳ Fetching TikTok video... Please wait.'); 
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
                            const videoData = await downloadTikTokVideo(urlToUse);
                            
                            if (!videoData.success) {
                                handlers.progressActive = false;
                                const errorText = htmlBold('❌ Failed to fetch video.') + `\n\n${videoData.error || 'The video might be private or unavailable.'}`;
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText);
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                                return new Response('OK', { status: 200 });
                            }
                            
                            if (videoData.type === 'image' && videoData.images && videoData.images.length > 0) {
                                handlers.progressActive = false;
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                const caption = formatTikTokCaption(videoData);
                                await handlers.sendPhotos(chatId, videoData.images, caption, messageId, userInlineKeyboard);
                                return new Response('OK', { status: 200 });
                            }
                            
                            const finalCaption = formatTikTokCaption(videoData);
                            const videoUrl = videoData.videoUrl;
                            
                            // Extract audio if requested
                            if (isAudioRequest && videoUrl) {
                                handlers.progressActive = false;
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                ctx.waitUntil(handlers.sendAction(chatId, 'upload_audio'));
                                try {
                                    const audioKeyboard = [[{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]];
                                    await handlers.extractAudioFromVideo(videoUrl, finalCaption, chatId, messageId, audioKeyboard);
                                } catch (e) {
                                    console.log(`[Bot] Audio extraction failed: ${e.message}`);
                                    await handlers.sendMessage(chatId, htmlBold('❌ Failed to extract audio: ') + e.message, messageId);
                                }
                            } else if (videoUrl) {
                                handlers.progressActive = false; 
                                
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                ctx.waitUntil(handlers.sendAction(chatId, 'upload_video'));
                                
                                try {
                                    const videoKeyboard = getVideoKeyboard(videoUrl, finalCaption);
                                    // Store video data for audio extraction
                                    const buttonId = videoKeyboard[0][0].callback_data;
                                    await handlers.cacheVideoForAudio(chatId, buttonId, videoUrl, finalCaption);
                                    
                                    // Auto-select best quality: try HD first, fallback to SD if too large
                                    if (videoData.videoHD && videoData.videoSD) {
                                        await handlers.sendVideoWithQualityFallback(
                                            chatId,
                                            videoData.videoHD,
                                            videoData.videoSD,
                                            finalCaption,
                                            messageId,
                                            videoData.thumbnail,
                                            videoKeyboard
                                        );
                                    } else {
                                        await handlers.sendVideo(
                                            chatId, 
                                            videoUrl, 
                                            finalCaption, 
                                            messageId, 
                                            videoData.thumbnail, 
                                            videoKeyboard
                                        );
                                    }
                                } catch (e) {
                                    console.log(`[Bot] sendVideo failed: ${e.message}`);
                                    console.log(`[Bot] Sending direct download link instead...`);
                                    await handlers.sendLinkMessage(
                                        chatId,
                                        videoUrl, 
                                        finalCaption, 
                                        messageId
                                    );
                                }
                                
                            } else {
                                handlers.progressActive = false;
                                const errorText = htmlBold('⚠️ Could not get the video download link.') + '\n\nThe video might be private or the format is not supported.';
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText); 
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                        } catch (error) {
                            handlers.progressActive = false;
                            console.log(`[Bot] Error: ${error.message}`);
                            const errorText = htmlBold('❌ An error occurred while processing the video.');
                            if (progressMessageId) {
                                await handlers.editMessage(chatId, progressMessageId, errorText);
                            } else {
                                await handlers.sendMessage(chatId, errorText, messageId);
                            }
                        }
                        
                    } else {
                        await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid TikTok video link.') + '\n\nExample: https://www.tiktok.com/@user/video/123456789', messageId);
                    }
                } 
            }
            
            if (callbackQuery) {
                 const chatId = callbackQuery.message.chat.id;
                 const data = callbackQuery.data;
                 const messageId = callbackQuery.message.message_id;
                 
                 const allButtons = callbackQuery.message.reply_markup.inline_keyboard.flat();
                 const button = allButtons.find(b => b.callback_data === data);
                 const buttonText = button ? button.text : "Action Complete";

                 if (data === 'ignore_progress' || data === 'ignore_branding') {
                     await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                     return new Response('OK', { status: 200 });
                 }
                 
                 // Handle audio extraction button
                 if (data.startsWith('extract_audio_')) {
                     await handlers.answerCallbackQuery(callbackQuery.id, '🎵 Extracting audio...');
                     const videoData = await handlers.getVideoForAudio(chatId, data);
                     if (videoData) {
                         ctx.waitUntil(handlers.sendAction(chatId, 'upload_audio'));
                         try {
                             const audioKeyboard = [[{ text: 'LK NEWS Download Bot', callback_data: 'ignore_branding' }]];
                             await handlers.extractAudioFromVideo(videoData.videoUrl, videoData.caption, chatId, null, audioKeyboard);
                         } catch (e) {
                             console.log(`[Bot] Audio extraction failed: ${e.message}`);
                             await handlers.sendMessage(chatId, htmlBold('❌ Failed to extract audio: ') + e.message, null);
                         }
                         await handlers.clearVideoForAudio(chatId, data);
                     } else {
                         await handlers.sendMessage(chatId, htmlBold('❌ Video data expired. Please send the link again.'), null);
                     }
                     return new Response('OK', { status: 200 });
                 }
                 
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
                 }

                 return new Response('OK', { status: 200 });
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            console.log(`[Bot] Unhandled error: ${e.message}`);
            return new Response('OK', { status: 200 }); 
        }
    }
};
