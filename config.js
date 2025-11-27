const BOT_TOKEN = process.env.BOT_TOKEN || ''; 
const OWNER_ID = process.env.OWNER_ID || ''; 
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES) || 50 * 1024 * 1024;

const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

const PROGRESS_STATES = [
    { text: "⏳ <b>Loading</b>...▒▒▒▒▒▒▒▒▒▒", percentage: "0%" },
    { text: "📥 <b>Fetching</b>...█▒▒▒▒▒▒▒▒▒", percentage: "10%" },
    { text: "📥 <b>Fetching</b>...██▒▒▒▒▒▒▒▒", percentage: "20%" },
    { text: "📥 <b>Fetching</b>...███▒▒▒▒▒▒▒", percentage: "30%" },
    { text: "📤 <b>Uploading</b>...████▒▒▒▒▒▒", percentage: "40%" },
    { text: "📤 <b>Uploading</b>...█████▒▒▒▒▒", percentage: "50%" },
    { text: "📤 <b>Uploading</b>...██████▒▒▒▒", percentage: "60%" },
    { text: "📤 <b>Uploading</b>...███████▒▒▒", percentage: "70%" },
    { text: "✨ <b>Finalizing</b>...████████▒▒", percentage: "80%" },
    { text: "✨ <b>Finalizing</b>...█████████▒", percentage: "90%" },
    { text: "✅ <b>Done!</b> ██████████", percentage: "100%" } 
];

export { 
    BOT_TOKEN, 
    OWNER_ID, 
    MAX_FILE_SIZE_BYTES, 
    telegramApi, 
    PROGRESS_STATES 
};
