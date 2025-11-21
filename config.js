const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
const API_URL = "https://fdown.isuru.eu.org/info"; 
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB Limit

const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

const PROGRESS_STATES = [
    { text: "⏳ <b>Loading</b>...▒▒▒▒▒▒▒▒▒▒", percentage: "0%" },
    { text: "📥 <b>Downloading</b>...█▒▒▒▒▒▒▒▒▒", percentage: "10%" },
    { text: "📥 <b>Downloading</b>...██▒▒▒▒▒▒▒▒", percentage: "20%" },
    { text: "📥 <b>Downloading</b>...███▒▒▒▒▒▒▒", percentage: "30%" },
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
    API_URL, 
    MAX_FILE_SIZE_BYTES, 
    telegramApi, 
    PROGRESS_STATES 
};
