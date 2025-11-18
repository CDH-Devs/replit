/**
 * src/index.js
 * Cloudflare Worker Telegram Bot Code (Facebook Video Downloader via fdown.net scraping)
 *
 * ඔබගේ Bot Token එක Cloudflare Worker Settings වලදී Environment Variable එකක් ලෙස BOT_TOKEN නමින් ලබා දී තිබිය යුතුය.
 */

export default {
    // Cloudflare Worker විසින් එන HTTP ඉල්ලීම් හසුරුවන ප්‍රධාන fetch function එක
    async fetch(request, env, ctx) {
        // GET requests නොසලකා හැරීම
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        // Environment Variable එකෙන් Bot Token එක ලබාගැනීම
        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;

            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                // /start command එක හසුරුවීම
                if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, '👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.', messageId);
                    return new Response('OK', { status: 200 });
                }

                // 1. Facebook Link එකක් දැයි පරීක්ෂා කිරීම (http/https වලින් පටන් ගත්තදැයි බැලීම)
                // අපි සියලු HTTP/HTTPS Links පිළිගෙන, fdown.net වෙත යවමු.
                const isLink = /^https?:\/\//i.test(text);
                
                if (isLink) {
                    // පණිවිඩයක් යවා පරිශීලකයාට බලා සිටීමට සැලැස්වීම
                    await this.sendMessage(telegramApi, chatId, '⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.', messageId);
                    
                    try {
                        // 2. fdown.net වෙත POST ඉල්ලීම යැවීම
                        const fdownUrl = "https://fdown.net/download.php";
                        
                        const formData = new URLSearchParams();
                        formData.append('URLz', text); // පරිශීලකයාගේ Link එක URLz ලෙස යැවීම

                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                // Spam ලෙස නොසැලකීම සඳහා User-Agent සහ Referer යැවීම
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fdown.net/', // මෙය Bot block කිරීම වැලැක්වීමට උපකාරී විය හැක
                            },
                            body: formData.toString(),
                            // Cloudflare Workers වලදී follow redirect = manual හෝ follow තිබිය හැක.
                            // fdown.net සාමාන්‍යයෙන් redirect නොවී HTML එකක් දෙනවා.
                        });

                        const resultHtml = await fdownResponse.text();

                        // 3. HTML ප්‍රතිචාරයෙන් HD Video Link එක Scrap කිරීම (RegEx භාවිතා කර)
                        // අපි සොයන්නේ 'Download Video in HD Quality' button එකේ ඇති href එකයි.
                        const hdLinkRegex = /<a href="([^"]+)" target="_blank" class="btn btn-success btn-lg" rel="nofollow">Download Video in HD Quality<\/a>/i;
                        const match = resultHtml.match(hdLinkRegex);
                        
                        if (match && match[1]) {
                            const hdVideoUrl = match[1];
                            
                            // 4. Telegram වෙත වීඩියෝව යැවීම (sendVideo)
                            await this.sendVideo(telegramApi, chatId, hdVideoUrl, 'මෙන්න ඔබගේ වීඩියෝව! HD Quality එකෙන් download කර ඇත.', messageId);
                            
                        } else {
                            // HD Link එක සොයා ගැනීමට නොහැකි නම්, ඒ බව පරිශීලකයාට දැනුම් දීම
                            // මෙය Private වීඩියෝ හෝ අනෙකුත් ගැටළු නිසා විය හැක.
                            await this.sendMessage(telegramApi, chatId, '⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.', messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error("fdown.net/Scraping error:", fdownError);
                        await this.sendMessage(telegramApi, chatId, '❌ වීඩියෝව ලබා ගැනීමේදී තාක්ෂණික දෝෂයක් ඇති විය.', messageId);
                    }
                    
                } else {
                    // Link එකක් නොවේ නම්
                    await this.sendMessage(telegramApi, chatId, '❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.', messageId);
                }
            }

            // Telegram Webhook සඳහා 200 OK Response එකක් ආපසු ලබා දීම
            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("General bot error:", e);
            // දෝෂයක් ඇති වුවද 200 OK යැවීමෙන් Telegram හට නැවත නැවතත් එකම පණිවිඩය යැවීම වළක්වයි
            return new Response('Error processing request', { status: 200 });
        }
    },

    // Telegram API වෙත Message යැවීම සඳහා වන සහායක function
    async sendMessage(api, chatId, text, replyToMessageId) {
        await fetch(`${api}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
            }),
        });
    },

    // Telegram API වෙත Video යැවීම සඳහා වන සහායක function
    async sendVideo(api, chatId, videoUrl, caption, replyToMessageId) {
        await fetch(`${api}/sendVideo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                video: videoUrl,
                caption: caption,
                parse_mode: 'HTML',
                ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
            }),
        });
    }
};
