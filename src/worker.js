/**
 * src/index.js
 * Final Code V50 (සම්පූර්ණයි, deleteMessage සහ Callback Query Handler ඇතුළත්)
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

// *****************************************************************
// ********** [ 2. WorkerHandlers Class ] ****************************
// *****************************************************************

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
    }
    
    // --- Telegram API Helpers (අවශ්‍ය අවම ශ්‍රිත) ---

    /**
     * Sends a text message to a chat.
     */
    async sendMessage(chatId, text, replyToMessageId, replyMarkup = null) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'HTML', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(replyMarkup && { reply_markup: replyMarkup }),
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

    /**
     * Sends a photo (thumbnail) with a caption.
     */
    async sendPhoto(chatId, photoUrl, replyToMessageId, caption = null) { 
        try {
            console.log(`[INFO] Attempting to send photo from URL: ${photoUrl.substring(0, 50)}...`);
            const response = await fetch(`${telegramApi}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    photo: photoUrl,
                    reply_to_message_id: replyToMessageId,
                    caption: caption || htmlBold("✅ Thumbnail බාගත කිරීම සාර්ථකයි!"),
                    parse_mode: 'HTML',
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] sendPhoto successful.");
                return result.result.message_id; 
            }
            console.error(`[ERROR] sendPhoto API Failed (Chat ID: ${chatId}):`, result);
            return null;
        } catch (e) {
            console.error(`[ERROR] sendPhoto Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    /**
     * Sends a video file from a URL.
     */
    async sendVideo(chatId, videoUrl, caption = null) {
        try {
            console.log(`[INFO] Sending video from URL: ${videoUrl.substring(0, 50)}...`);
            const response = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    video: videoUrl,
                    caption: caption || htmlBold("✅ Video බාගත කිරීම සාර්ථකයි!"),
                    parse_mode: 'HTML',
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] sendVideo successful.");
                return result.result.message_id;
            }
            console.error(`[ERROR] sendVideo API Failed (Chat ID: ${chatId}):`, result);
            return null;
        } catch (e) {
            console.error(`[ERROR] sendVideo Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    /**
     * Updates the inline keyboard buttons on an existing message.
     */
    async editMessageReplyMarkup(chatId, messageId, inlineKeyboard) {
        try {
            const response = await fetch(`${telegramApi}/editMessageReplyMarkup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: inlineKeyboard },
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] editMessageReplyMarkup successful.");
                return true;
            }
            console.error(`[ERROR] editMessageReplyMarkup failed:`, result);
            return false;
        } catch (e) {
            console.error(`[ERROR] editMessageReplyMarkup error:`, e);
            return false;
        }
    }

    /**
     * Deletes a message.
     */
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
            const result = await response.json();
            if (!response.ok) {
                // Ignore the common "message to delete not found" error
                if (result.description !== 'Bad Request: message to delete not found') {
                    console.error(`[ERROR] deleteMessage API Failed (Chat ID: ${chatId}):`, result);
                }
                return false;
            }
            console.log(`[SUCCESS] deleteMessage successful for message ID: ${messageId}`);
            return true;
        } catch (e) {
            console.error(`[ERROR] deleteMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return false;
        }
    }
    
    /**
     * Handles the inline keyboard button click for video download.
     */
    async handleCallbackQuery(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;

        if (!data.startsWith('dl_')) {
            return; // Download නොවන බොත්තම් නොසලකා හරින්න
        }

        // Split data: dl_QUALITY_URL_ENCODED
        const parts = data.substring(3).split('_'); 
        const requestedQuality = parts[0];
        const encodedUrl = parts.slice(1).join('_'); // ඉතිරි කොටස encoded URL ලෙස ලබා ගන්න
        const originalUrl = decodeURIComponent(encodedUrl);

        // 1. බොත්තම් වහාම ඉවත් කරන්න
        await this.editMessageReplyMarkup(chatId, messageId, []);

        const downloadingText = htmlBold(`⬇️ ${requestedQuality} Video බාගත කිරීම ආරම්භ විය...`);
        
        // 2. තත්ත්ව පණිවිඩයක් යවන්න (පසුව මෙය මකා දැමීමට උත්සාහ කරමු)
        const statusMessageId = await this.sendMessage(chatId, downloadingText, messageId);

        try {
            // 3. වීඩියෝ තොරතුරු නැවත ලබා ගන්න
            const apiUrl = "https://fdown.isuru.eu.org/info";
            const apiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'CloudflareWorker/1.0'
                },
                body: JSON.stringify({ url: originalUrl })
            });

            if (!apiResponse.ok) {
                throw new Error(`API request failed with status ${apiResponse.status}`);
            }
            
            const videoData = await apiResponse.json();
            let downloadLink = null;
            let videoTitle = videoData.video_info?.title || 'Facebook Video';


            // 4. නිවැරදි බාගත කිරීමේ සබැඳිය සොයන්න
            if (videoData.available_formats && videoData.available_formats.length > 0) {
                const selectedFormat = videoData.available_formats.find(
                    format => format.quality === requestedQuality
                );
                if (selectedFormat && selectedFormat.url) {
                    downloadLink = selectedFormat.url.replace(/&amp;/g, '&');
                }
            }
            
            // 5. Video එක යවන්න හෝ දෝෂ පණිවිඩය යවන්න
            if (downloadLink) {
                const successCaption = htmlBold(`✅ Video බාගත කිරීම සාර්ථකයි!`) + `\n\n${videoTitle}`;
                const videoMessageId = await this.sendVideo(chatId, downloadLink, successCaption);

                if (videoMessageId && statusMessageId) {
                    // සාර්ථකව යැවීමෙන් පසු තාවකාලික තත්ත්ව පණිවිඩය මකන්න
                    await this.deleteMessage(chatId, statusMessageId); 
                }

            } else {
                const errorText = htmlBold(`❌ ${requestedQuality} බාගත කිරීම අසාර්ථකයි:`) + `\n\nබාගත කිරීමේ සබැඳිය සොයා ගැනීමට නොහැකි විය, නැතහොත් එය කල් ඉකුත් වී ඇත.`;
                if (statusMessageId) {
                    await this.deleteMessage(chatId, statusMessageId);
                }
                await this.sendMessage(chatId, errorText, messageId);
            }

        } catch (e) {
            console.error(`[ERROR] Download callback failed for ${originalUrl}:`, e.message);
            const errorText = htmlBold(`⚠️ බාගත කිරීම අසාර්ථකයි:`) + `\n\n${e.message}`;
            if (statusMessageId) {
                await this.deleteMessage(chatId, statusMessageId);
            }
            await this.sendMessage(chatId, errorText, messageId);
        }
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
        
        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query; 
            
            if (!message && !callbackQuery) {
                 return new Response('OK', { status: 200 });
            }

            // --- A. Handle Callback Query (බොත්තම් ක්ලික් කිරීම්) ---
            if (callbackQuery) {
                await handlers.handleCallbackQuery(callbackQuery);
                return new Response('OK', { status: 200 });
            }

            // --- B. Handle Message Updates (පණිවිඩ යාවත්කාලීන කිරීම්) ---
            if (!message) {
                return new Response('OK', { status: 200 });
            }

            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text ? message.text.trim() : null; 
            
            const userName = message.from.first_name || "පරිශීලක"; 

            // --- 1. /start command Handling ---
            if (text && text.toLowerCase().startsWith('/start')) {
                const userText = `👋 <b>සුභ දවසක් ${userName} මහත්මයා/මහත්මිය!</b> 💁‍♂️ මෙම බොට් දැනට ඇත්තේ <b>Thumbnail පරීක්ෂණ මාදිලියේය</b>.
                
                කරුණාකර Thumbnail ක්‍රියාකාරීත්වය පරීක්ෂා කිරීමට Facebook වීඩියෝ Link එකක් එවන්න.`;
                await handlers.sendMessage(chatId, userText, messageId);
                return new Response('OK', { status: 200 });
            }

            // --- 2. Facebook Link Handling ---
            if (text) { 
                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    
                    // Initial Acknowledgement Message
                    const initialMessage = await handlers.sendMessage(
                        chatId, 
                        htmlBold('⏳ වීඩියෝ තොරතුරු සොයමින්...'), 
                        messageId
                    );
                    
                    try {
                        // Use Facebook Video Download API
                        const apiUrl = "https://fdown.isuru.eu.org/info";
                        
                        console.log(`[DEBUG] Fetching video info for: ${text}`);
                        
                        const apiResponse = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'CloudflareWorker/1.0'
                            },
                            body: JSON.stringify({ url: text })
                        });
                        
                        console.log(`[DEBUG] API Response Status: ${apiResponse.status}, OK: ${apiResponse.ok}`);
                        
                        if (!apiResponse.ok) {
                            throw new Error(`API request failed with status ${apiResponse.status}`);
                        }
                        
                        const videoData = await apiResponse.json();
                        console.log(`[DEBUG] API Response:`, JSON.stringify(videoData));
                        
                        // Extract thumbnail and video information
                        let rawThumbnailLink = null;
                        let videoTitle = 'Facebook Video';
                        let duration = null;
                        let uploader = null;
                        let viewCount = null;
                        let uploadDate = null;
                        
                        // API ප්‍රතිචාර ව්‍යුහයන් හසුරුවන්න
                        if (videoData.video_info) {
                            // නව API ව්‍යුහය
                            if (videoData.video_info.thumbnail) {
                                rawThumbnailLink = videoData.video_info.thumbnail.replace(/&amp;/g, '&');
                            }
                            if (videoData.video_info.title) {
                                videoTitle = videoData.video_info.title;
                            }
                            if (videoData.video_info.duration) {
                                duration = videoData.video_info.duration;
                            }
                            if (videoData.video_info.uploader) {
                                uploader = videoData.video_info.uploader;
                            }
                            if (videoData.video_info.view_count) {
                                viewCount = videoData.video_info.view_count;
                            }
                            if (videoData.video_info.upload_date) {
                                uploadDate = videoData.video_info.upload_date;
                            }
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
                        
                        console.log(`[DEBUG] Thumbnail URL: ${rawThumbnailLink}`);
                        console.log(`[DEBUG] Video Title: ${videoTitle}`);

                        // Send Photo or Error
                        if (rawThumbnailLink) {
                            // Duration format (තත්පර MM:SS)
                            let durationText = '';
                            if (duration) {
                                const minutes = Math.floor(duration / 60);
                                const seconds = Math.floor(duration % 60);
                                durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                            }
                            
                            // View count comma වලින්
                            let viewCountText = '';
                            if (viewCount) {
                                viewCountText = viewCount.toLocaleString();
                            }
                            
                            // Upload date format (YYYYMMDD to readable format)
                            let uploadDateText = '';
                            if (uploadDate && uploadDate.length === 8) {
                                const year = uploadDate.substring(0, 4);
                                const month = uploadDate.substring(4, 6);
                                const day = uploadDate.substring(6, 8);
                                uploadDateText = `${year}-${month}-${day}`;
                            }
                            
                            // සියලු තොරතුරු සහිත සිරස්තලයක් තනන්න
                            let caption = `${htmlBold(videoTitle)}\n\n`;
                            if (uploader) caption += `👤 Upload කළේ: ${uploader}\n`;
                            if (durationText) caption += `⏱️ කාලය: ${durationText}\n`;
                            if (viewCountText) caption += `👁️ නැරඹුම්: ${viewCountText}\n`;
                            if (uploadDateText) caption += `📅 Upload කළ දිනය: ${uploadDateText}\n`;
                            caption += `\n✅ ${htmlBold('Thumbnail බාගත කිරීම සාර්ථකයි!')}`;
                            
                            const photoMessageId = await handlers.sendPhoto(
                                chatId, 
                                rawThumbnailLink, 
                                messageId,
                                caption
                            );
                            
                            if (photoMessageId) {
                                if (initialMessage) {
                                    handlers.deleteMessage(chatId, initialMessage); 
                                }
                                console.log("[SUCCESS] Thumbnail sent successfully and temporary message deleted.");
                            } else {
                                await handlers.sendMessage(chatId, htmlBold('❌ Thumbnail එක යැවීම අසාර්ථක විය. කරුණාකර වෙනත් Link එකක් උත්සහා කරන්න.'), messageId);
                            }
                        } else {
                            console.error(`[ERROR] Thumbnail not found in API response for: ${text}`);
                            const errorText = htmlBold('⚠️ සමාවෙන්න, මේ වීඩියෝ එකේ Thumbnail එක සොයා ගැනීමට නොහැකි විය.');
                            if (initialMessage) {
                                await handlers.sendMessage(chatId, errorText, initialMessage); 
                            } else {
                                await handlers.sendMessage(chatId, errorText, messageId);
                            }
                        }

                        // Send quality selection buttons
                        if (videoData.available_formats && videoData.available_formats.length > 0) {
                            const encodedUrl = encodeURIComponent(text); 
                            
                            const qualityButtons = videoData.available_formats.map(format => [{
                                text: `📥 ${format.quality} බාගත කරන්න`,
                                callback_data: `dl_${format.quality}_${encodedUrl}` 
                            }]);
                            
                            const replyMarkupMessageId = await handlers.sendMessage(
                                chatId,
                                `${htmlBold('🎥 වීඩියෝ Quality එකක් තෝරන්න:')}\n\n${videoTitle}`,
                                messageId,
                                { inline_keyboard: qualityButtons } 
                            );
                            
                            console.log("[SUCCESS] Quality selection buttons prepared");
                        }
                        
                    } catch (apiError) {
                         console.error(`[ERROR] API Error (Chat ID: ${chatId}):`, apiError);
                         const errorText = htmlBold('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේ දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.');
                         if (initialMessage) {
                             // Delete initial loading message and send error
                             handlers.deleteMessage(chatId, initialMessage);
                             await handlers.sendMessage(chatId, errorText, messageId);
                         } else {
                             await handlers.sendMessage(chatId, errorText, messageId);
                         }
                    }
                    
                } else {
                    await handlers.sendMessage(chatId, htmlBold('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), messageId);
                }
            } 
            
            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update: " + e.message);
            console.error("-------------------------------------------------");
            // Still return 200 OK to Telegram to acknowledge the update
            return new Response('OK', { status: 200 }); 
        }
    }
};
