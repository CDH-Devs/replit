import { Bot } from 'grammy';
import { registerHandlers } from './handlers/telegram.js';
import 'dotenv/config';

// Read environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN environment variable is required!');
  console.error('💡 Please set your BOT_TOKEN in Replit Secrets.');
  process.exit(1);
}

const env = {
  BOT_TOKEN
};

console.log('🤖 Starting Telegram bot in polling mode...');
console.log('📡 Bot Token:', BOT_TOKEN.substring(0, 10) + '...');

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// Register handlers
registerHandlers(bot, env);

// Error handler
bot.catch((err) => {
  console.error('❌ Bot error:', err);
});

// Start the bot
bot.start({
  onStart: (botInfo) => {
    console.log('✅ Bot started successfully!');
    console.log('👤 Bot username:', botInfo.username);
    console.log('📱 Bot name:', botInfo.first_name);
    console.log('\n💡 Send a Facebook video URL to the bot to test it!\n');
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Stopping bot...');
  bot.stop();
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('\n🛑 Stopping bot...');
  bot.stop();
  process.exit(0);
});
