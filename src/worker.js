/**
 * src/index.js
 * Complete Code V60 (Enhanced Caption & Hybrid Mode)
 * - Video Link (Muxed/Working) is obtained via HTML Scraping (fdown.net/download.php).
 * - Metadata (Title, Thumbnail, Uploader, Duration, Views, Date) are obtained via JSON API.
 * - Caption format: Title + Metadata (Uploader, Duration, Views, Date).
 */

// *****************************************************************
// ********** [ 1. Configurations and Constants ] ********************
// *****************************************************************
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
const API_URL = "https://fdown.isuru.eu.org/info"; // JSON API for Metadata/Thumbnail
// *****************************************************************

// Telegram API Base URL
const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Helper Functions ---

function htmlBold(text) {
    return `<b>${text}</b>`;
}

/**
 * Seconds to H:MM:SS or M:SS format.
 */
function formatDuration(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
        return `${m}:${String(s).padStart(2, '0')}`;
    }
}

/**
 * Creates the final formatted caption string based on API data.
 */
function formatCaption(data) {
    const { videoTitle, uploader, duration, views, uploadDate } = data;
    
    const formattedDuration = formatDuration(duration);
    const formattedViews = typeof views === 'number' ? views.toLocaleString('en-US') : views;
    
    // Main Title
    let caption = htmlBold(videoTitle);
    
    // Metadata block
    caption += `\n\n`;
    caption += `👤 ${htmlBold(uploader)}\n`;
    caption += `⏱️ Duration: ${htmlBold(formattedDuration)}\n`;
    caption += `👁️ Views: ${htmlBold(formattedViews)}\n`;
    caption += `📅 Uploaded: ${htmlBold(uploadDate)}`;

    return caption;
}


// *****************************************************************
// ********** [ 2. WorkerHandlers Class ] ****************************
// *****************************************************************

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
    }
    
    // --- Telegram API Helpers ---
    async sendMessage(chatId, text, replyToMessageId) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'HTML',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
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

    // --- sendPhoto (Send thumbnail with caption) ---
    async sendPhoto(chatId, photoUrl, replyToMessageId, caption = null) { 
        try {
            console.log(`[INFO] Attempting to send photo from URL: ${photoUrl.substring(0, 50)}...`);
            // The caption parameter already contains the full formatted caption including the title
            const response = await fetch(`${telegramApi}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    photo: photoUrl,
                    reply_to_message_id: replyToMessageId,
                    caption: caption || htmlBold("✅ Thumbnail Downloaded!"), // Use the passed caption
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

    // --- sendVideo (Download & Upload as Blob - Mimics Site Referer) ---
    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId = null, thumbnailLink = null) {
        
        console.log(`[DEBUG] Attempting to send video. URL: ${videoUrl.substring(0, 50)}...`);
        
        try {
            // Download video using Referer header to mimic the fdown.net site download
            const videoResponse = await fetch(videoUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://fdown.net/', 
                    'Accept': 'video/mp4,video/webm,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
            });
            
            if (videoResponse.status !== 200) {
                console.error(`[DEBUG] Video Fetch Failed! Status: ${videoResponse.status} for URL: ${videoUrl}`);
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                await this.sendMessage(telegramApi, chatId, htmlBold('⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි. CDN වෙත පිවිසීමට නොහැක.'), replyToMessageId);
                return null; 
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

            const telegramResponse = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`[DEBUG] sendVideo API Failed! Result:`, telegramResult);
                await this.sendMessage(telegramApi, chatId, htmlBold(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්.'})`), replyToMessageId);
                return null;
            } else {
                console.log(`[DEBUG] sendVideo successful.`);
                return telegramResult.result.message_id;
            }
            
        } catch (e) {
            console.error(`[DEBUG] sendVideo General Error (Chat ID: ${chatId}):`, e);
            await this.sendMessage(telegramApi, chatId, htmlBold(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්).`), replyToMessageId);
            return null;
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
                    ...(inlineKeyboard !== null && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] editMessageText successful.");
                return true;
            }
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
// ********** [ 3. Hybrid Data Retrieval Functions ] *****************
// *****************************************************************

/**
 * ⭐️ Function 1: Get Thumbnail/Title/Metadata from JSON API (V57 Logic)
 */
async function getApiMetadata(link) {
    try {
        const apiResponse = await fetch(API_URL, {
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
        
        const videoData = await apiResponse.json();
        
        const info = videoData.video_info || videoData.data || videoData;
        
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let uploader = 'Unknown Uploader';
        let duration = 0;
        let views = 0;
        let uploadDate = 'N/A';
        
        if (info) {
            if (info.thumbnail) {
                rawThumbnailLink = info.thumbnail.replace(/&amp;/g, '&');
            }
            if (info.title) {
                videoTitle = info.title;
            }
            // Extracting new fields
            uploader = info.uploader || info.page_name || 'Unknown Uploader';
            duration = info.duration || 0;
            views = info.view_count || info.views || 0;
            uploadDate = info.upload_date || 'N/A';
        }

        return {
            thumbnailLink: rawThumbnailLink,
            videoTitle: videoTitle,
            uploader: uploader,
            duration: duration,
            views: views,
            uploadDate: uploadDate
        };

    } catch (e) {
        console.warn("[WARN] API Metadata fetch failed:", e.message);
        return { 
            thumbnailLink: null, 
            videoTitle: "Facebook Video", 
            uploader: 'Unknown Uploader',
            duration: 0,
            views: 0,
            uploadDate: 'N/A'
        };
    }
}


/**
 * ⭐️ Function 2: Get Working Video Link from HTML Scraper (V58 Logic)
 */
async function scrapeVideoLink(link) {
    const fdownUrl = "https://fdown.net/download.php";
    
    const formData = new URLSearchParams();
    formData.append('URLz', link); // Pass the Facebook URL

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

    if (!fdownResponse.ok) {
        throw new Error(`Scraper request failed with status ${fdownResponse.status}`);
    }

    const resultHtml = await fdownResponse.text();
    let videoUrl = null;

    // Download Links Scraping (Prioritize HD)
    
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

    return videoUrl ? videoUrl.replace(/&amp;/g, '&') : null;
}


export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        try {
            const update = await request.json();
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
                const userText = `${htmlBold('👋 සුභ දවසක්!')} 💁‍♂️ මෙය Facebook වීඩියෝ බාගත කිරීමේ Bot එකයි.
                
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
                        // ⭐️ STEP 1: Get ALL Metadata from JSON API
                        const apiData = await getApiMetadata(text);
                        const { thumbnailLink, videoTitle, uploader, duration, views, uploadDate } = apiData;

                        // Generate the final formatted caption
                        const finalCaption = formatCaption(apiData);

                        // ⭐️ 1. Thumbnail Sending Logic (Used to display progress/title)
                        let photoMessageId = null;
                        
                        if (thumbnailLink) {
                            
                            // Send thumbnail with the full formatted caption
                            photoMessageId = await handlers.sendPhoto(
                                chatId, 
                                thumbnailLink, 
                                messageId,
                                finalCaption
                            );
                            
                            if (photoMessageId && initialMessage) {
                                handlers.deleteMessage(chatId, initialMessage); 
                            } else {
                                // If photo failed, edit initial message instead
                                await handlers.editMessageText(chatId, initialMessage, htmlBold('⚠️ Thumbnail එක යැවීම අසාර්ථක විය. Video Processing කරමින්...'));
                                photoMessageId = initialMessage; 
                            }
                        } else if (initialMessage) {
                             // If no thumbnail, edit initial message
                             await handlers.editMessageText(chatId, initialMessage, htmlBold('⚠️ සමාවෙන්න, මේ Video එකේ Thumbnail එක සොයා ගැනීමට නොහැකි විය. Video Processing කරමින්...'));
                             photoMessageId = initialMessage;
                        }

                        // ⭐️ STEP 2: Get WORKING Video Link from HTML Scraper
                        const videoUrl = await scrapeVideoLink(text);

                        // ⭐️ 2. Upload Logic
                        
                        if (videoUrl) {
                            
                            const uploadText = htmlBold(`🔄 වීඩියෝව Upload කරමින්...`);
                            let statusMessageId = photoMessageId || initialMessage;
                            
                            // Update the message text to show uploading status
                            await handlers.editMessageText(chatId, statusMessageId, uploadText);

                            // The sendVideo function uses the strong Referer headers.
                            const sentVideoId = await handlers.sendVideo(chatId, videoUrl, finalCaption, messageId, thumbnailLink);

                            if (sentVideoId) {
                                // Success: Delete the status message
                                handlers.deleteMessage(chatId, statusMessageId);
                            } 

                        } else {
                             // No format found error
                            const errorText = htmlBold('❌ වීඩියෝ බාගත කිරීමේ Link සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.');
                            
                            if (photoMessageId && photoMessageId !== initialMessage) {
                                await handlers.sendMessage(chatId, errorText, messageId);
                            } else if (initialMessage) {
                                await handlers.editMessageText(chatId, initialMessage, errorText);
                            }
                        }
                        
                    } catch (overallError) {
                        console.error(`[ERROR] Overall Processing Error (Chat ID: ${chatId}):`, overallError);
                        const errorText = htmlBold('❌ Video තොරතුරු ලබා ගැනීමේ දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සහා කරන්න.');
                        if (initialMessage) {
                            await handlers.editMessageText(chatId, initialMessage, errorText); 
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
