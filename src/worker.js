/**
 * src/index.js
 * Complete Code V51 (Removes immediate KV deletion to prevent "Expired" error on double-click/race condition)
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
        // Access KV binding named 'USER_DATABASE' as per wrangler.toml
        this.kv = env.USER_DATABASE; 
        if (!this.kv) {
            console.error("[CRITICAL] KV Binding (USER_DATABASE) is not available in environment.");
        }
    }
    
    // --- Telegram API Helpers (sendMessage remains the same) ---
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
                    // Include inline keyboard if provided
                    ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                // Check for BUTTON_DATA_INVALID specifically and log detail
                if (result.description === "Bad Request: BUTTON_DATA_INVALID") {
                     console.error(`[ERROR] sendMessage API Failed: BUTTON_DATA_INVALID. Callback data length likely exceeded 64 bytes.`);
                }
                console.error(`sendMessage API Failed (Chat ID: ${chatId}):`, result);
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            console.error(`sendMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    // --- sendPhoto (Send thumbnail with caption) ---
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
                    caption: caption || htmlBold("✅ Thumbnail Downloaded!"),
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

    // --- sendVideo (Send video directly from URL) ---
    async sendVideo(chatId, videoUrl, caption = null) {
        try {
            console.log(`[INFO] Sending video from URL: ${videoUrl.substring(0, 50)}...`);
            const response = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    video: videoUrl,
                    caption: caption || htmlBold("✅ Video Downloaded!"),
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

    // --- answerCallbackQuery (Acknowledge and dismiss button loading) ---
    async answerCallbackQuery(callbackQueryId, text = null) {
        try {
            await fetch(`${telegramApi}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    ...(text && { text: text }),
                    show_alert: false, // Use true for serious errors
                    cache_time: 0
                }),
            });
            return true;
        } catch (e) {
            console.error(`[ERROR] answerCallbackQuery error:`, e);
            return false;
        }
    }

    // --- editMessageText (Edit the text of a message) ---
    async editMessageText(chatId, messageId, text, inlineKeyboard = null) {
        try {
            const response = await fetch(`${telegramApi}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: text,
                    parse_mode: 'HTML',
                    // The edit method already expects reply_markup here
                    ...(inlineKeyboard !== null && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] editMessageText successful.");
                return true;
            }
            // Non-fatal error log for edits
            console.warn(`[WARN] editMessageText failed for ${messageId}:`, result);
            return false;
        } catch (e) {
            console.error(`[ERROR] editMessageText error:`, e);
            return false;
        }
    }

    // --- deleteMessage (Delete a previous message) ---
    async deleteMessage(chatId, messageId) {
        if (!messageId) return false;
        try {
            const response = await fetch(`${telegramApi}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                }),
            });
            if (response.ok) {
                console.log(`[SUCCESS] Deleted message ${messageId} in chat ${chatId}.`);
                return true;
            }
            console.warn(`[WARN] deleteMessage failed for ${messageId}:`, await response.json());
            return false;
        } catch (e) {
            console.error(`[ERROR] deleteMessage error for ${messageId}:`, e);
            return false;
        }
    }
}


// *****************************************************************
// ********** [ 3. Main Fetch Handler ] ******************************
// *****************************************************************

async function fetchVideoInfo(link) {
    const apiUrl = "https://fdown.isuru.eu.org/info";
    
    const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CloudflareWorker/1.0'
        },
        body: JSON.stringify({ url: link })
    });
    
    if (!apiResponse.ok) {
        throw new Error(`API request failed with status ${apiResponse.status}`);
    }
    
    return apiResponse.json();
}


export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        // KV binding (USER_DATABASE) is passed in the env object
        const handlers = new WorkerHandlers(env);
        
        try {
            const update = await request.json();
            
            // --- C. Inline Button Click Handling (Callback Query) ---
            if (update.callback_query) {
                const callbackQuery = update.callback_query;
                const chatId = callbackQuery.message.chat.id;
                const messageId = callbackQuery.message.message_id;
                const data = callbackQuery.data; 

                // Check if it's a download request (Format: dl_videoKey_quality)
                if (data.startsWith('dl_')) {
                    
                    const parts = data.split('_');
                    if (parts.length < 3) {
                        await handlers.answerCallbackQuery(callbackQuery.id, "Invalid callback data.");
                        return new Response('OK', { status: 200 });
                    }
                    
                    const quality = parts.pop(); // Last part is quality
                    const videoKey = parts.slice(1).join('_'); // Reconstruct videoKey (v_chatIdPrefix_timestamp)

                    // 1. Acknowledge and Update the Button Message
                    const loadingText = htmlBold(`🔄 ${quality} වීඩියෝව බාගත කිරීම ආරම්භ වේ...`);
                    // Note: We remove buttons here, but we don't delete the KV yet.
                    await handlers.editMessageText(chatId, messageId, loadingText, []); 
                    await handlers.answerCallbackQuery(callbackQuery.id, `Starting ${quality} download...`);

                    try {
                        let downloadLink = null;
                        let videoTitle = 'Facebook Video';
                        
                        // --- KV Read and Process Logic ---
                        if (!handlers.kv) {
                            throw new Error("KV Database not available for download.");
                        }

                        // Retrieve data from KV
                        const kvDataString = await handlers.kv.get(videoKey);
                        if (!kvDataString) {
                            // This is the error message the user is seeing due to the race condition/double click
                            await handlers.editMessageText(chatId, messageId, htmlBold('❌ වීඩියෝ තොරතුරු කල් ඉකුත් වී ඇත. නැවත සබැඳිය එවන්න.'));
                            return new Response('OK', { status: 200 });
                        }
                        
                        const kvData = JSON.parse(kvDataString);
                        videoTitle = kvData.title || videoTitle;
                        downloadLink = kvData.qualityMap[quality];

                        // ***********************************************
                        // *** FIX: REMOVED KV DELETION STEP ***
                        // The entry will now expire automatically after 1 hour (TTL). 
                        // This prevents the "Expired" error on duplicate/race condition clicks.
                        // await handlers.kv.delete(videoKey); 
                        // console.log(`[SUCCESS] KV cache cleared for key: ${videoKey}`);
                        // ***********************************************
                        
                        // --- End KV Read and Process Logic ---
                        
                        if (!downloadLink) {
                            await handlers.editMessageText(chatId, messageId, htmlBold(`❌ ${quality} වීඩියෝ ලින්ක් එක සොයා ගැනීමට නොහැකි විය (KV Link Missing).`));
                            return new Response('OK', { status: 200 });
                        }

                        // 4. Send the Video
                        const caption = `${htmlBold(videoTitle)}\n\n📥 ${quality} Video Downloaded!`;
                        // Remove '&amp;' from URL for sendVideo API
                        downloadLink = downloadLink.replace(/&amp;/g, '&'); 
                        
                        const sentVideoId = await handlers.sendVideo(chatId, downloadLink, caption);

                        if (sentVideoId) {
                            // 5. Success: Edit the original button message
                            await handlers.editMessageText(
                                chatId, 
                                messageId, 
                                htmlBold(`✅ ${quality} වීඩියෝව සාර්ථකව යවන ලදී!`)
                            );
                        } else {
                            // 6. Failure to send video
                            await handlers.editMessageText(chatId, messageId, htmlBold('❌ Video එක යැවීම අසාර්ථක විය. කරුණාකර නැවත උත්සහා කරන්න.'));
                        }

                    } catch (e) {
                        console.error("[ERROR] Download Callback API Error (KV/Send):", e);
                        await handlers.editMessageText(chatId, messageId, htmlBold('⚠️ වීඩියෝව බාගත කිරීමේ දෝෂයක්. කරුණාකර නැවත උත්සහා කරන්න.'));
                    }
                }
                
                return new Response('OK', { status: 200 });
            }


            // --- D. New Message Handling ---
            const message = update.message;
            
            if (!message) {
                 return new Response('OK', { status: 200 });
            }

            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text ? message.text.trim() : null; 
            
            const userName = message.from.first_name || "User"; 

            // --- 1. /start command Handling ---
            if (text && text.toLowerCase().startsWith('/start')) {
                const userText = `👋 <b>නමස්කාර ${userName}!</b> 💁‍♂️ මෙය Facebook වීඩියෝ බාගත කිරීමේ Bot එකයි.
                
කරුණාකර Facebook Video link එකක් එවන්න.`;
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
                        htmlBold('⏳ Video තොරතුරු සොයමින්...'), 
                        messageId
                    );
                    
                    try {
                        // Use Facebook Video Download API
                        const videoData = await fetchVideoInfo(text);
                        
                        console.log(`[DEBUG] API Response:`, JSON.stringify(videoData));
                        
                        // Extract information
                        let rawThumbnailLink = null;
                        let videoTitle = 'Facebook Video';
                        let duration = null;
                        let uploader = null;
                        let viewCount = null;
                        let uploadDate = null;
                        
                        if (videoData.video_info) {
                            if (videoData.video_info.thumbnail) {
                                rawThumbnailLink = videoData.video_info.thumbnail.replace(/&amp;/g, '&');
                            }
                            if (videoData.video_info.title) {
                                videoTitle = videoData.video_info.title;
                            }
                            // ... other video_info fields (duration, uploader, view_count, upload_date)
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
                        
                        console.log(`[DEBUG] Thumbnail URL: ${rawThumbnailLink}`);
                        console.log(`[DEBUG] Video Title: ${videoTitle}`);

                        // Send Photo or Error
                        if (rawThumbnailLink) {
                            // Format duration (seconds to MM:SS)
                            let durationText = '';
                            if (duration) {
                                const minutes = Math.floor(duration / 60);
                                const seconds = Math.floor(duration % 60);
                                durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                            }
                            
                            // Format view count with commas
                            let viewCountText = '';
                            if (viewCount) {
                                viewCountText = viewCount.toLocaleString();
                            }
                            
                            // Format upload date (YYYYMMDD to readable format)
                            let uploadDateText = '';
                            if (uploadDate && uploadDate.length === 8) {
                                const year = uploadDate.substring(0, 4);
                                const month = uploadDate.substring(4, 6);
                                const day = uploadDate.substring(6, 8);
                                uploadDateText = `${year}-${month}-${day}`;
                            }
                            
                            // Build caption with all information
                            let caption = `${htmlBold(videoTitle)}\n\n`;
                            if (uploader) caption += `👤 ${uploader}\n`;
                            if (durationText) caption += `⏱️ Duration: ${durationText}\n`;
                            if (viewCountText) caption += `👁️ Views: ${viewCountText}\n`;
                            if (uploadDateText) caption += `📅 Uploaded: ${uploadDateText}\n`;
                            caption += `\n✅ ${htmlBold('Thumbnail Downloaded!')}`;
                            
                            const photoMessageId = await handlers.sendPhoto(
                                chatId, 
                                rawThumbnailLink, 
                                messageId,
                                caption
                            );
                            
                            if (photoMessageId && initialMessage) {
                                // Delete the initial "Searching..." message
                                handlers.deleteMessage(chatId, initialMessage); 
                                console.log("[SUCCESS] Thumbnail sent successfully and temporary message deleted.");
                            } else if (!photoMessageId) {
                                await handlers.sendMessage(chatId, htmlBold('❌ Thumbnail එක යැවීම අසාර්ථක විය. කරුණාකර වෙනත් Link එකක් උත්සහා කරන්න.'), messageId);
                            }
                            
                            // Send quality selection buttons after thumbnail
                            if (videoData.available_formats && videoData.available_formats.length > 0) {
                                
                                // --- KV Logic Start: Store data and use short key in callback_data ---
                                if (!handlers.kv) {
                                    console.error("[CRITICAL] USER_DATABASE KV binding is missing. Cannot proceed with short callbacks.");
                                    await handlers.sendMessage(chatId, htmlBold('❌ දත්ත ගබඩාව (KV) නොමැත. කරුණාකර Bot සකස් කරන්න.'), messageId);
                                    return new Response('OK', { status: 200 });
                                }
                                
                                const chatIdStr = String(chatId);
                                const timestamp = Math.floor(Date.now() / 1000);
                                // Create a short, unique key: v_<chatId prefix>_<timestamp>
                                const videoKey = `v_${chatIdStr.substring(0, 8)}_${timestamp}`; 

                                const qualityMap = {};
                                const availableQualities = [];

                                // Populate qualityMap and availableQualities
                                videoData.available_formats.forEach(format => {
                                    if (!qualityMap[format.quality]) {
                                        let decodedUrl = format.url.replace(/&amp;/g, '&');
                                        qualityMap[format.quality] = decodedUrl;
                                        availableQualities.push(format.quality);
                                    }
                                });

                                // Sort qualities: prioritize formats with audio (lower resolutions typically have audio)
                                // Higher resolutions on Facebook are often video-only streams
                                const qualityOrder = ['360p', '480p', '720p', '1080p', '1920p'];
                                availableQualities.sort((a, b) => {
                                    const aIndex = qualityOrder.indexOf(a);
                                    const bIndex = qualityOrder.indexOf(b);
                                    const aSort = aIndex === -1 ? 999 : aIndex;
                                    const bSort = bIndex === -1 ? 999 : bIndex;
                                    return aSort - bSort;
                                });

                                // Store essential data (URL map and title) in KV. Expires after 3600 seconds (1 hour).
                                const kvData = { 
                                    title: videoTitle, 
                                    qualityMap: qualityMap 
                                };
                                
                                await handlers.kv.put(videoKey, JSON.stringify(kvData), { expirationTtl: 3600 });
                                console.log(`[SUCCESS] Data stored in KV with key: ${videoKey}`);
                                
                                // Create buttons: [[B1], [B2], [B3], ...] - each button on a new row.
                                // Note: Lower qualities are listed first as they typically include audio
                                const qualityButtons = availableQualities.map(quality => [{
                                    text: `📥 Download ${quality}`,
                                    // Use the short key and quality for the callback data
                                    callback_data: `dl_${videoKey}_${quality}` 
                                }]);
                                
                                // --- KV Logic End ---

                                // Send the message with the inline keyboard
                                await handlers.sendMessage(
                                    chatId,
                                    `${htmlBold('🎥 Video Quality එකක් තෝරන්න:')}\n${videoTitle}`,
                                    null, // No reply_to_message_id for this message
                                    qualityButtons 
                                );
                                
                                console.log("[SUCCESS] Quality selection buttons prepared and sent.");
                            }

                        } else {
                            console.error(`[ERROR] Thumbnail not found in API response for: ${text}`);
                            const errorText = htmlBold('⚠️ සමාවෙන්න, මේ Video එකේ Thumbnail එක සොයා ගැනීමට නොහැකි විය.');
                            if (initialMessage) {
                                await handlers.editMessageText(chatId, initialMessage, errorText); // Edit the "Searching..." message
                            } else {
                                await handlers.sendMessage(chatId, errorText, messageId);
                            }
                        }
                        
                    } catch (apiError) {
                        console.error(`[ERROR] API Error (Chat ID: ${chatId}):`, apiError);
                        const errorText = htmlBold('❌ Video තොරතුරු ලබා ගැනීමේ දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සහා කරන්න.');
                        if (initialMessage) {
                            await handlers.editMessageText(chatId, initialMessage, errorText); // Edit the "Searching..." message
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
            return new Response('OK', { status: 200 }); 
        }
    }
};
