import { getFbVideoInfo } from '../services/facebook.js';

export function registerHandlers(bot, env) {
  // Store env in bot for access in handlers
  bot.env = env;
  // Start command
  bot.command('start', async (ctx) => {
    await ctx.reply(
      "👋 *ආයුබෝවන්\\!* මම Facebook වීඩියෝ බාගත කරන්නා\\. මට Facebook වීඩියෝ සබැඳියක් \\(link\\) එවන්න\\.",
      { parse_mode: 'MarkdownV2' }
    );
  });

  // Help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      "👋 *ආයුබෝවන්\\!* මම Facebook වීඩියෝ බාගත කරන්නා\\. මට Facebook වීඩියෝ සබැඳියක් \\(link\\) එවන්න\\.",
      { parse_mode: 'MarkdownV2' }
    );
  });

  // Handle text messages
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.|fb\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i);
    
    if (!fbUrlMatch) {
      await ctx.reply(
        "💡 කරුණාකර වලංගු Facebook වීඩියෝ සබැඳියක් පමණක් එවන්න\\.\n\n" +
        "සහාය දක්වන URL ආකෘති:\n" +
        "\\- facebook\\.com/username/videos/\\.\\.\\.\n" +
        "\\- fb\\.watch/\\.\\.\\.\n" +
        "\\- facebook\\.com/watch/\\.\\.\\.",
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }
    
    const fbUrl = fbUrlMatch[0];
    
    await ctx.reply("⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
    
    try {
      const result = await getFbVideoInfo(fbUrl, bot.env);
      
      if (result.error) {
        await ctx.reply(
          `❌ දෝෂය: ${result.error}\n\n` +
          `💡 කරුණාකර පරීක්ෂා කරන්න:\n` +
          `- වීඩියෝ URL නිවැරදි දැයි\n` +
          `- වීඩියෝව ප්‍රසිද්ධ (public) දැයි\n` +
          `- වීඩියෝව තවමත් ලබා ගත හැකි දැයි`
        );
        return;
      }
      
      if (result.hd) {
        try {
          await ctx.replyWithVideo(result.hd, { 
            caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (HD)' 
          });
        } catch (error) {
          console.error('Error sending HD video:', error.message);
          if (result.sd) {
            try {
              await ctx.replyWithVideo(result.sd, { 
                caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)\n⚠️ HD ප්‍රමාණය ඉතා විශාල නිසා SD යැවීය.' 
              });
            } catch (sdError) {
              console.error('Error sending SD video:', sdError.message);
              await ctx.reply(`❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n${result.sd}`);
            }
          } else {
            await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
          }
        }
      } else if (result.sd) {
        try {
          await ctx.replyWithVideo(result.sd, { 
            caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)' 
          });
        } catch (error) {
          console.error('Error sending SD video:', error.message);
          await ctx.reply(`❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n${result.sd}`);
        }
      } else {
        await ctx.reply("❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න.");
      }
    } catch (error) {
      console.error('Facebook video fetch error:', error);
      await ctx.reply(`❌ දෝෂයක් සිදු විය: ${error.message}`);
    }
  });
}
