import { Telegraf } = require('telegraf'); // Cloudflare Workers වලදී import/require මිශ්‍රණයකට ඉඩ දිය හැක.
// නමුත් සම්පූර්ණයෙන්ම ES Module වලට මාරු වෙමු.

import { Telegraf } from 'telegraf';
import axios from 'axios';
import * as cheerio from 'cheerio'; // cheerio සඳහා මේ ආකාරයට import කිරීම අවශ්‍ය විය හැකියි.

// ⚠️ ආරක්ෂක අවදානම: ඔබේ Bot Token එක මෙතනටම ඇතුළත් කර ඇත.
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 

if (BOT_TOKEN === 'ඔබේ_BotFather_Token_එක_මෙතනට_දාන්න' || !BOT_TOKEN) {
    console.error("⛔️ Error: Please replace the placeholder with your actual BotFather Token.");
}

let bot;

// fdown.net වෙතින් Download Link එක Extract කරන Function එක
async function getDownloadLink(url) {
    const scrapeUrl = `https://fdown.net/download.php?url=${encodeURIComponent(url)}`;
    
    try {
        const response = await axios.get(scrapeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        // Cheerio load කිරීම
        const $ = cheerio.load(response.data);

        // Web Scraping Logic: 'Download HD' button එක සොයා ගැනීම.
        const hdLinkElement = $('a.btn.btn-primary:contains("Download HD")'); 
        
        if (hdLinkElement.length > 0) {
            return hdLinkElement.attr('href');
        } else {
            const sdLinkElement = $('a.btn.btn-success:contains("Download SD")');
            if (sdLinkElement.length > 0) {
                return sdLinkElement.attr('href');
            }
        }

        return null; 
        
    } catch (error) {
        console.error("Fdown Scraping Error:", error.message);
        return null; 
    }
}

// Telegram Handlers define කරන function එක
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
                
                const downloadLink = await getDownloadLink(url);

                if (downloadLink) {
                    await ctx.deleteMessage(loadingMsg.message_id).catch(e => console.log("Can't delete msg:", e.message));

                    await ctx.replyWithVideo(downloadLink, { 
                        caption: `ඔබ ඉල්ලූ වීඩියෝව මෙන්න.`,
                        reply_to_message_id: messageId 
                    });
                    
                } else {
                    await ctx.editMessageText('⚠️ වීඩියෝව සොයා ගැනීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න (Public වීඩියෝ පමණක් වැඩ කරයි).', {
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id
                    });
                }

            } catch (error) {
                console.error("Handler Error:", error.message);
                
                try {
                    if (loadingMsg) {
                         await ctx.editMessageText('❌ සමාවෙන්න! වීඩියෝව download කිරීමේදී දෝෂයක් ඇතිවිය. (internal server error).', {
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

// Cloudflare Worker's entry point: ES Module default export
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!bot) {
        bot = new Telegraf(BOT_TOKEN);
        setupBotHandlers(bot);
    }
    
    // Telegram වෙතින් එන POST request එක හසුරුවයි
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            await bot.handleUpdate(body);
            return new Response('OK', { status: 200 });

        } catch (error) {
            console.error('Webhook Handling Error:', error.message);
            return new Response('Error handling update', { status: 500 });
        }
    }

    return new Response('Fdown Telegram Bot Worker is running.', { status: 200 });
  },
};
    // GET request එකක් පැමිණියහොත් සරල පිළිතුරක් දෙන්න
    return new Response('Fdown Telegram Bot Worker is running.', { status: 200 });
  },
};
