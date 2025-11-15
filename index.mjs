import { Telegraf } from 'telegraf';
import axios from 'axios';
import * as cheerio from 'cheerio'; 

// ⚠️ ඔබ විසින් ලබා දුන් නිවැරදි Token එක මෙහි ඇතුළත් කර ඇත.
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 

let bot;

// --- 1. Scraping Logic: fdown.net වෙතින් Direct File Link එක සොයා ගැනීම ---

async function getFileLink(url) {
    const scrapeUrl = `https://fdown.net/download.php?url=${encodeURIComponent(url)}`;
    
    try {
        const response = await axios.get(scrapeUrl, {
            headers: {
                // නවතම User-Agent එක සහ Referer එක Bot Check එක මඟහැරීමට
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': 'https://fdown.net/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            maxRedirects: 5 
        });
        
        const $ = cheerio.load(response.data);

        // පුළුල් Selector Logic: HD/Normal Quality Link සොයයි
        let linkElement = $('a:contains("Download")'); 
        let downloadLink = null;

        if (linkElement.length > 0) {
            
            // 1. HD Link එක සොයමු
            let hdLink = linkElement.filter(':contains("HD Quality")').attr('href');
            if (hdLink) downloadLink = hdLink;

            // 2. HD නැත්නම් Normal Quality Link එක සොයමු
            if (!downloadLink) {
                let normalLink = linkElement.filter(':contains("Normal Quality")').attr('href');
                if (normalLink) downloadLink = normalLink;
            }
            
            // 3. වෙනත් 'Download' Link එකක් (Fallback)
            if (!downloadLink) {
                downloadLink = linkElement.first().attr('href');
            }
            
            if (downloadLink) return downloadLink;
        }

        return null; 
        
    } catch (error) {
        console.error("Fdown Scraping Error:", error.message);
        return null; 
    }
}

// --- 2. Download Logic: සොයාගත් Link එකෙන් වීඩියෝව Buffer එකක් ලෙස ලබා ගැනීම ---

async function downloadVideoBuffer(downloadUrl) {
    try {
        const response = await axios.get(downloadUrl, {
            responseType: 'arraybuffer', // දත්ත Buffer එකක් ලෙස ලබා ගැනීමට
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
            // විශාල වීඩියෝ සඳහා timeout එක වැඩි කරන්න
            timeout: 60000 
        });
        
        // වීඩියෝ දත්ත Buffer එකක් ලෙස ලබා දෙමු
        return response.data; 
    } catch (error) {
        console.error("Buffer Download Error:", error.message);
        return null;
    }
}


// --- 3. Telegram Handlers ---

function setupBotHandlers(botInstance) {
    botInstance.start((ctx) => {
        ctx.reply(`👋 හායි ${ctx.from.first_name}!\nමම fdown.net හරහා Facebook වීඩියෝ බාගත කරන Bot කෙනෙක්. කරුණාකර Facebook වීඩියෝ ලින්ක් එකක් (URL) මට එවන්න.`);
    });

    botInstance.help((ctx) => {
        ctx.reply('මට Facebook වීඩියෝවක ලින්ක් එක එවන්න. මම එය බාගත කරලා දෙන්නම්.');
    });

    botInstance.on('text', async (ctx) => {
        const url = ctx.message.text.trim();
        const messageId = ctx.message.message_id;

        if (url.startsWith('http')) {
            let loadingMsg;
            try {
                loadingMsg = await ctx.reply('⌛️ වීඩියෝ ලින්ක් එක සකසමින්...', { reply_to_message_id: messageId });
                
                const fileLink = await getFileLink(url); 
                let videoBuffer = null;

                if (fileLink) {
                    await ctx.editMessageText('📥 වීඩියෝව බාගත කරමින්... (Worker එකට විනාඩියක් පමණ ගත විය හැකිය)', { 
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id 
                    });
                    
                    videoBuffer = await downloadVideoBuffer(fileLink);
                }

                if (videoBuffer) {
                    await ctx.deleteMessage(loadingMsg.message_id).catch(e => console.log("Can't delete msg:", e.message));

                    // Buffer එක කෙලින්ම Telegram වෙත Upload කරයි
                    await ctx.replyWithVideo({ source: videoBuffer, filename: 'facebook_video.mp4' }, { 
                        caption: `ඔබ ඉල්ලූ වීඩියෝව මෙන්න.`,
                        reply_to_message_id: messageId 
                    });
                    
                } else {
                    // fileLink නැතිනම් හෝ Buffer එක Download කිරීමට අසමත් වුවහොත්
                    await ctx.editMessageText('⚠️ වීඩියෝව සොයා ගැනීමට හෝ බාගත කිරීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න (Public වීඩියෝ පමණක් වැඩ කරයි).', {
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id
                    });
                }

            } catch (error) {
                console.error("Handler Error:", error.message);
                
                try {
                    if (loadingMsg) {
                         await ctx.editMessageText('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය. (අභ්‍යන්තර දෝෂය).', {
                            chat_id: loadingMsg.chat.id,
                            message_id: loadingMsg.message_id
                        });
                    } else {
                         await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                    }
                } catch (editError) {
                     await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                }
            }
        } else {
            ctx.reply('කරුණාකර වලංගු Facebook වීඩියෝ ලින්ක් එකක් (URL) පමණක් එවන්න.');
        }
    });
}

// --- 4. Cloudflare Worker Entry Point ---
export default {
    async fetch(request, env, ctx) {
        
        if (!bot) {
            bot = new Telegraf(BOT_TOKEN); // Hardcoded Token භාවිතා කරයි
            setupBotHandlers(bot);
        }
        
        // Telegram වෙතින් එන POST request එක හසුරුවයි (Webhook)
        if (request.method === 'POST') {
            try {
                let body;
                try {
                    // JSON Parsing Error (Unexpected end of JSON input) හසුරුවයි
                    body = await request.json(); 
                } catch (e) {
                    console.error('JSON Parsing Error (Ignoring request):', e.message);
                    return new Response('OK - JSON Error Handled', { status: 200 }); 
                }

                await bot.handleUpdate(body);
                return new Response('OK', { status: 200 });

            } catch (error) {
                console.error('Webhook Handling Error:', error.message);
                return new Response('Error handling update', { status: 500 });
            }
        }

        return new Response('Facebook Downloader Bot Worker is running.', { status: 200 });
    },
};
