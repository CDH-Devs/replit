import os

BOT_TOKEN = os.environ.get('BOT_TOKEN', '')
OWNER_ID = os.environ.get('OWNER_ID', '')
MAX_FILE_SIZE_BYTES = int(os.environ.get('MAX_FILE_SIZE_BYTES', 50 * 1024 * 1024))

TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

PROGRESS_STATES = [
    {"text": "⏳ <b>Loading</b>...▒▒▒▒▒▒▒▒▒▒", "percentage": "0%"},
    {"text": "📥 <b>Fetching</b>...█▒▒▒▒▒▒▒▒▒", "percentage": "10%"},
    {"text": "📥 <b>Fetching</b>...██▒▒▒▒▒▒▒▒", "percentage": "20%"},
    {"text": "📥 <b>Fetching</b>...███▒▒▒▒▒▒▒", "percentage": "30%"},
    {"text": "📤 <b>Uploading</b>...████▒▒▒▒▒▒", "percentage": "40%"},
    {"text": "📤 <b>Uploading</b>...█████▒▒▒▒▒", "percentage": "50%"},
    {"text": "📤 <b>Uploading</b>...██████▒▒▒▒", "percentage": "60%"},
    {"text": "📤 <b>Uploading</b>...███████▒▒▒", "percentage": "70%"},
    {"text": "✨ <b>Finalizing</b>...████████▒▒", "percentage": "80%"},
    {"text": "✨ <b>Finalizing</b>...█████████▒", "percentage": "90%"},
    {"text": "✅ <b>Done!</b> ██████████", "percentage": "100%"}
]
