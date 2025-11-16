import TelegramBot from 'node-telegram-bot-api';
import { getFbVideoInfo } from './src/worker/facebook.js';
import fs from 'fs';

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is not set');
  process.exit(1);
}

async function clearWebhook() {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
      method: 'POST'
    });
    const data = await response.json();
    if (data.ok) {
      console.log('✅ Webhook cleared successfully');
    } else {
      console.log('⚠️ Failed to clear webhook:', data.description);
    }
  } catch (error) {
    console.error('❌ Error clearing webhook:', error.message);
  }
}

await clearWebhook();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('✅ Facebook Video Downloader Bot started with polling');

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "👋 *ආයුබෝවන්!* මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.",
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "👋 *ආයුබෝවන්!* මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.",
    { parse_mode: 'Markdown' }
  );
});

bot.on('message', async (msg) => {
  if (msg.text && !msg.text.startsWith('/')) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    
    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.|fb\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i);
    
    if (!fbUrlMatch) {
      bot.sendMessage(
        chatId,
        "💡 කරුණාකර වලංගු Facebook වීඩියෝ සබැඳියක් පමණක් එවන්න.\n\n" +
        "සහාය දක්වන URL ආකෘති:\n" +
        "- facebook.com/username/videos/...\n" +
        "- fb.watch/...\n" +
        "- facebook.com/watch/..."
      );
      return;
    }
    
    const fbUrl = fbUrlMatch[0];
    
    const waitMsg = await bot.sendMessage(chatId, "⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
    
    try {
      const result = await getFbVideoInfo(fbUrl);
      
      if (result.error) {
        await bot.sendMessage(
          chatId,
          `❌ දෝෂය: ${result.error}\n\n` +
          `💡 කරුණාකර පරීක්ෂා කරන්න:\n` +
          `- වීඩියෝ URL නිවැරදි දැයි\n` +
          `- වීඩියෝව ප්‍රසිද්ධ (public) දැයි\n` +
          `- වීඩියෝව තවමත් ලබා ගත හැකි දැයි`
        );
        await bot.deleteMessage(chatId, waitMsg.message_id);
        return;
      }
      
      await bot.deleteMessage(chatId, waitMsg.message_id);
      
      if (result.videoPath) {
        try {
          await bot.sendVideo(chatId, fs.createReadStream(result.videoPath), {
            caption: `✅ Facebook වීඩියෝව බාගත කරන ලදී!\n\n📝 ${result.title || 'Facebook Video'}`
          }, {
            filename: 'video.mp4',
            contentType: 'video/mp4'
          });
        } catch (error) {
          console.error('Error sending video:', error.message);
          if (result.url) {
            await bot.sendMessage(chatId, `❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n${result.url}`);
          } else {
            await bot.sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
          }
        }
      } else if (result.url) {
        await bot.sendMessage(chatId, `📎 වීඩියෝ බාගත කිරීමේ සබැඳිය:\n${result.url}\n\n📝 ${result.title || 'Facebook Video'}`);
      } else {
        await bot.sendMessage(chatId, "❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න.");
      }
    } catch (error) {
      console.error('Facebook video fetch error:', error);
      await bot.sendMessage(chatId, `❌ දෝෂයක් සිදු විය: ${error.message}`);
      await bot.deleteMessage(chatId, waitMsg.message_id);
    }
  }
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Bot is ready to receive messages');
