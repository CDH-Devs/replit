const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');

// ⚠️ ආරක්ෂක අවදානම: ඔබේ Bot Token එක මෙතනටම ඇතුළත් කර ඇත.
// කරුණාකර මෙය ඔබගේ රහස් Token එක සමඟ ප්‍රතිස්ථාපනය කරන්න.
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 

if (BOT_TOKEN === 'ඔබේ_BotFather_Token_එක_මෙතනට_දාන්න' || !BOT_TOKEN) {
    console.error("⛔️ Error: Please replace the placeholder with your actual BotFather Token.");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// fdown.net වෙතින් Download Link එක Extract කරන Function එක
async function getDownloadLink(url) {
    // fdown.net වෙත Request යැවිය යුතු URL එක
    const scrapeUrl = `https://fdown.net/download.php?url=${encodeURIComponent(url)}`;
    
    try {
        // fdown.net පිටුවේ HTML එක ලබා ගැනීම
        const response = await axios.get(scrapeUrl, {
            // User-Agent එකක් යැවීමෙන් Bot එක Browser එකක් සේ පෙන්වයි.
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        // Cheerio භාවිතයෙන් HTML එක Parse කිරීම
        const $ = cheerio.load(response.data);

        // Web Scraping Logic: 'Download HD' button එක සොයා ගැනීම.
        // මෙම Selector එක fdown.net වෙබ් අඩවියේ වෙනස්කම් අනුව වෙනස් විය හැක.
        const hdLinkElement = $('a.btn.btn-primary:contains("Download HD")'); 
        
        if (hdLinkElement.length > 0) {
            // HD Download Link එකේ href attribute එක ලබා ගැනීම
            return hdLinkElement.attr('href');
        } else {
            // HD Link එකක් නොමැති නම්, SD Link එකක් තිබේදැයි බලමු
            const sdLinkElement = $('a.btn.btn-success:contains("Download SD")');
            if (sdLinkElement.length > 0) {
                return sdLinkElement.attr('href');
            }
        }

        return null; // Link එකක් හමුවුනේ නැත්නම්
        
    } catch (error) {
        console.error("Fdown Scraping Error:", error.message);
        return null; 
    }
}

// 2. Bot Commands and Handlers

// /start command එක
bot.start((ctx) => {
    ctx.reply(`👋 හායි ${ctx.from.first_name}!\nමම fdown.net හරහා Facebook වීඩියෝ බාගත කරන Bot කෙනෙක්. කරුණාකර Facebook වීඩියෝ ලින්ක් එකක් (URL) මට එවන්න.`);
});

// /help command එක
bot.help((ctx) => {
    ctx.reply('මට Facebook වීඩියෝවක ලින්ක් එක එවන්න. මම එය බාගත කරලා දෙන්නම්.');
});

// Text messages හැසිරවීමට
bot.on('text', async (ctx) => {
    const url = ctx.message.text.trim();
    const messageId = ctx.message.message_id;

    // සරලවම http/https වලින් පටන් ගන්නා URL එකක්ද කියලා බලමු
    if (url.startsWith('http')) {
        let loadingMsg;
        try {
            // Loading Message එකක් යැවීම
            loadingMsg = await ctx.reply('⌛️ වීඩියෝ ලින්ක් එක සකසමින්...', { reply_to_message_id: messageId });
            
            // Download Link එක ලබා ගැනීම
            const downloadLink = await getDownloadLink(url);

            if (downloadLink) {
                // Loading Message එක Delete කිරීම
                await ctx.deleteMessage(loadingMsg.message_id).catch(e => console.log("Can't delete msg:", e.message));

                // Download Link එක Telegram එකට යැවීම
                await ctx.replyWithVideo(downloadLink, { 
                    caption: `ඔබ ඉල්ලූ වීඩියෝව මෙන්න.`,
                    reply_to_message_id: messageId 
                });
                
            } else {
                // Loading message එක Edit කිරීම
                await ctx.editMessageText('⚠️ වීඩියෝව සොයා ගැනීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න (Public වීඩියෝ පමණක් වැඩ කරයි).', {
                    chat_id: loadingMsg.chat.id,
                    message_id: loadingMsg.message_id
                });
            }

        } catch (error) {
            console.error("Telegram Error:", error.message);
            
            try {
                // දෝෂය ගැන පරිශීලකයාට දැනුම් දීම
                if (loadingMsg) {
                     await ctx.editMessageText('❌ සමාවෙන්න! වීඩියෝව download කිරීමේදී දෝෂයක් ඇතිවිය. (internal server error).', {
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id
                    });
                } else {
                     await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                }
               
            } catch (editError) {
                 // edit කරන්න බැරි උනොත් අලුතෙන් message එකක් යවන්න
                 await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
            }
        }
    } else {
        ctx.reply('කරුණාකර වලංගු Facebook වීඩියෝ ලින්ක් එකක් (URL) පමණක් එවන්න.');
    }
});

// 3. Launch the Bot
bot.launch();

console.log('🚀 Fdown Telegram Bot is Running...');

// අනවශ්‍ය ලෙස Server එක වසා දැමීම වැළැක්වීම
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
