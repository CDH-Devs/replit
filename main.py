import re
import time
import threading
import os
import tempfile
import subprocess
from flask import Flask, request, jsonify
from config import BOT_TOKEN, OWNER_ID, PROGRESS_STATES
from handlers import TelegramHandlers
from tiktok_api import download_tiktok_video
from helpers import format_tiktok_caption, html_bold, strip_html_tags
from youtube import download_and_send_songs, search_youtube, download_audio, get_video_metadata, is_youtube_url, extract_video_id
from song_history import is_already_downloaded, add_to_history

app = Flask(__name__)

handlers = TelegramHandlers(BOT_TOKEN, OWNER_ID)

user_inline_keyboard = [
    [{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]
]

song_query_cache = {}
owner_mode = 'owner'

def get_video_keyboard(video_url, video_caption, is_owner_user=False):
    global owner_mode
    # Extract Audio button ONLY for owner
    if is_owner_user:
        return [
            [{"text": "🎵 Extract Audio", "callback_data": f"extract_audio_{int(time.time() * 1000)}"}]
        ]
    return [[{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]]

def get_initial_progress_keyboard():
    text = strip_html_tags(PROGRESS_STATES[0]['text'])
    return [[{"text": text, "callback_data": "ignore_progress"}]]

def download_and_send_single_song(query, handlers, chat_id, message_id, is_owner):
    """Download a single song and send with thumbnail and metadata"""
    try:
        handlers.send_action(chat_id, 'typing')
        
        # Check if it's a YouTube URL or search query
        if is_youtube_url(query):
            video_url = query
            video_id = extract_video_id(query)
        else:
            # Search for the song
            results = search_youtube(query, 1)
            if not results:
                handlers.edit_message(chat_id, message_id, html_bold('❌ No songs found for: ') + query)
                return
            video_url = results[0]['url']
            video_id = results[0]['id']
        
        # Check if already downloaded
        if is_already_downloaded(video_id):
            handlers.edit_message(chat_id, message_id, html_bold('⏭️ This song was already downloaded!'))
            return
        
        # Get metadata
        handlers.edit_message(chat_id, message_id, html_bold('🎵 Fetching song info...'))
        metadata = get_video_metadata(video_url)
        
        if metadata and metadata.get('thumbnail'):
            # Send thumbnail with metadata
            info_caption = (
                f"🎵 <b>{metadata['title']}</b>\n\n"
                f"⏱ <b>Duration:</b> {metadata['duration']}\n"
                f"👁 <b>Views:</b> {metadata['views']}\n"
                f"👍 <b>Likes:</b> {metadata['likes']}\n"
                f"📅 <b>Upload Date:</b> {metadata['upload_date']}\n"
                f"📺 <b>Channel:</b> {metadata['channel']}\n\n"
                f"📝 <b>Description:</b>\n{metadata['description']}{'...' if len(metadata['description']) >= 200 else ''}"
            )
            handlers.send_photo_with_caption(chat_id, metadata['thumbnail'], info_caption, None)
        
        # Update status and download
        handlers.edit_message(chat_id, message_id, html_bold('📥 Downloading audio...'))
        handlers.send_action(chat_id, 'upload_audio')
        
        # Download audio
        temp_dir = tempfile.gettempdir()
        output_path = os.path.join(temp_dir, f"song_{int(time.time())}.mp3")
        
        downloaded_path = download_audio(video_url, output_path)
        
        if os.path.exists(downloaded_path):
            title = metadata['title'] if metadata else 'Unknown Song'
            handlers.send_action(chat_id, 'upload_audio')
            handlers.send_audio_file(chat_id, downloaded_path, title, None)
            
            # Add to history
            add_to_history({
                'title': title,
                'url': video_url,
                'video_id': video_id
            })
            
            # Clean up
            try:
                os.unlink(downloaded_path)
            except:
                pass
            
            handlers.edit_message(chat_id, message_id, html_bold('✅ Download Complete!') + f'\n\n🎵 {title}')
        else:
            handlers.edit_message(chat_id, message_id, html_bold('❌ Failed to download audio'))
            
    except Exception as e:
        print(f"[Bot] Single song download error: {e}")
        handlers.edit_message(chat_id, message_id, html_bold('❌ Error downloading song: ') + str(e))

def extract_tiktok_audio(video_url, chat_id, caption, handlers):
    """Extract audio from TikTok video URL using yt-dlp"""
    try:
        handlers.send_action(chat_id, 'upload_audio')
        
        temp_dir = tempfile.gettempdir()
        output_path = os.path.join(temp_dir, f"tiktok_audio_{int(time.time())}.mp3")
        
        # Download and extract audio using yt-dlp
        cmd = [
            'yt-dlp', '-x', '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', output_path.replace('.mp3', '.%(ext)s'),
            video_url
        ]
        
        print(f"[TikTok Audio] Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        # Find the output file
        base_path = output_path.replace('.mp3', '')
        possible_paths = [f"{base_path}.mp3", output_path]
        
        for path in possible_paths:
            if os.path.exists(path):
                audio_caption = caption.replace('🎬', '🎵').replace('Video', 'Audio')
                handlers.send_action(chat_id, 'upload_audio')
                
                # Send as audio file
                audio_keyboard = [[{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]]
                handlers.send_audio_file(chat_id, path, "TikTok Audio", None, audio_keyboard)
                
                # Clean up
                try:
                    os.unlink(path)
                except:
                    pass
                
                return True
        
        print(f"[TikTok Audio] File not found. stderr: {result.stderr}")
        return False
        
    except Exception as e:
        print(f"[TikTok Audio] Extraction failed: {e}")
        return False

@app.route('/', methods=['GET'])
def home():
    return 'Hello! I am LK NEWS Download Bot - Your TikTok Video Downloader.'

@app.route('/', methods=['POST'])
def webhook():
    global owner_mode, song_query_cache
    
    try:
        update = request.get_json()
        print(f"[Bot] Received update: {str(update)[:300]}")
        
        message = update.get('message')
        callback_query = update.get('callback_query')
        
        if not message and not callback_query:
            print("[Bot] No message or callback query found")
            return jsonify({"ok": True})
        
        if message:
            chat_id = message['chat']['id']
            message_id = message['message_id']
            text = message.get('text', '').strip() if message.get('text') else None
            is_owner = bool(OWNER_ID and str(chat_id) == str(OWNER_ID))
            user_name = message.get('from', {}).get('first_name', 'User')
            
            threading.Thread(target=handlers.save_user_id, args=(chat_id,)).start()
            
            if is_owner and message.get('reply_to_message'):
                replied_message = message['reply_to_message']
                replied_text = replied_message.get('text', '')
                
                if "Please reply with the message you want to broadcast:" in replied_text:
                    message_to_broadcast_id = message_id
                    prompt_message_id = replied_message['message_id']
                    
                    handlers.edit_message(chat_id, prompt_message_id, html_bold("📣 Broadcast started. Please wait."))
                    
                    def do_broadcast():
                        try:
                            results = handlers.broadcast_message(chat_id, message_to_broadcast_id)
                            result_message = (
                                html_bold('Broadcast Complete ✅') + '\n\n' +
                                html_bold('🚀 Successful: ') + str(results['successful_sends']) + '\n' +
                                html_bold('❗️ Failed/Blocked: ') + str(results['failed_sends'])
                            )
                            handlers.send_message(chat_id, result_message, message_to_broadcast_id)
                        except Exception as e:
                            handlers.send_message(chat_id, html_bold("❌ Broadcast Process Failed.") + f"\n\nError: {e}", message_to_broadcast_id)
                    
                    threading.Thread(target=do_broadcast).start()
                    return jsonify({"ok": True})
            
            if is_owner and text and text.lower().startswith('/brod') and message.get('reply_to_message'):
                message_to_broadcast_id = message['reply_to_message']['message_id']
                
                handlers.send_message(chat_id, html_bold("📣 Quick Broadcast started..."), message_id)
                
                def do_quick_broadcast():
                    try:
                        results = handlers.broadcast_message(chat_id, message_to_broadcast_id)
                        result_message = (
                            html_bold('Quick Broadcast Complete ✅') + '\n\n' +
                            html_bold('🚀 Successful: ') + str(results['successful_sends']) + '\n' +
                            html_bold('❗️ Failed/Blocked: ') + str(results['failed_sends'])
                        )
                        handlers.send_message(chat_id, result_message, message_to_broadcast_id)
                    except Exception as e:
                        handlers.send_message(chat_id, html_bold("❌ Quick Broadcast failed.") + f"\n\nError: {e}", message_id)
                
                threading.Thread(target=do_quick_broadcast).start()
                return jsonify({"ok": True})
            
            # /start command
            if text and text.lower().startswith('/start'):
                if is_owner:
                    # Owner always sees mode selection buttons
                    mode_text = '👑 Owner Mode' if owner_mode == 'owner' else '👤 User Mode'
                    owner_text = html_bold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.\n\n" + html_bold(f"Current Mode: {mode_text}")
                    admin_keyboard = [
                        [
                            {"text": "✅ Owner Mode" if owner_mode == 'owner' else "👑 Owner Mode", "callback_data": "set_mode_owner"},
                            {"text": "✅ User Mode" if owner_mode == 'user' else "👤 User Mode", "callback_data": "set_mode_user"}
                        ],
                        [{"text": "📊 Users Count", "callback_data": "admin_users_count"}],
                        [{"text": "📣 Broadcast", "callback_data": "admin_broadcast"}],
                        [{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]
                    ]
                    handlers.send_message(chat_id, owner_text, message_id, admin_keyboard)
                else:
                    user_text = f"""👋 <b>Hello {user_name}!</b>

🎬 Welcome to <b>LK NEWS Download Bot</b>!

📌 <b>Available Commands:</b>

<b>🎥 /tiktok [url]</b>
Download TikTok videos without watermark
Example: <code>/tiktok https://vm.tiktok.com/xxx</code>

<b>🎵 /song [name or url]</b>
Download songs from YouTube
Example: <code>/song new sinhala dj song</code>
Example: <code>/song https://youtube.com/watch?v=xxx</code>

◇───────────────◇

🚀 <b>TikTok + YouTube Downloader</b>
🔥 <b>Powered by Replit</b>

◇───────────────◇"""
                    handlers.send_message(chat_id, user_text, message_id, user_inline_keyboard)
                return jsonify({"ok": True})
            
            # /song command
            if text and text.lower().startswith('/song'):
                query = re.sub(r'^/song\s*', '', text, flags=re.IGNORECASE).strip()
                
                if not query:
                    handlers.send_message(
                        chat_id,
                        html_bold('🎵 YouTube Song Downloader') + '\n\n' +
                        'Usage: <code>/song [name or url]</code>\n\n' +
                        'Examples:\n' +
                        '• <code>/song new sinhala dj song</code>\n' +
                        '• <code>/song alan walker faded</code>\n' +
                        '• <code>/song https://youtube.com/watch?v=xxx</code>',
                        message_id
                    )
                    return jsonify({"ok": True})
                
                # Check if owner is in Owner Mode - show song count selection
                if is_owner and owner_mode == 'owner':
                    query_id = f"song_{chat_id}_{int(time.time() * 1000)}"
                    song_query_cache[query_id] = {"query": query, "chat_id": chat_id, "timestamp": time.time()}
                    
                    song_count_keyboard = [
                        [
                            {"text": "1 Song", "callback_data": f"songcount_1_{query_id}"},
                            {"text": "5 Songs", "callback_data": f"songcount_5_{query_id}"}
                        ],
                        [
                            {"text": "15 Songs", "callback_data": f"songcount_15_{query_id}"},
                            {"text": "50 Songs", "callback_data": f"songcount_50_{query_id}"}
                        ]
                    ]
                    
                    handlers.send_message(
                        chat_id,
                        html_bold('🎵 YouTube Song Downloader') + '\n\n' +
                        f'🔍 Query: <i>{query}</i>\n\n' +
                        html_bold('How many songs do you want to download?'),
                        message_id,
                        song_count_keyboard
                    )
                else:
                    # User mode or regular users: Direct download with thumbnail
                    status_msg_id = handlers.send_message(
                        chat_id,
                        html_bold('🎵 Searching for song...') + f'\n\n🔍 Query: <i>{query}</i>',
                        message_id
                    )
                    
                    def do_single_download():
                        download_and_send_single_song(query, handlers, chat_id, status_msg_id, is_owner)
                    
                    threading.Thread(target=do_single_download).start()
                
                return jsonify({"ok": True})
            
            # /tiktok command
            if text and text.lower().startswith('/tiktok'):
                tiktok_url = re.sub(r'^/tiktok\s*', '', text, flags=re.IGNORECASE).strip()
                
                if not tiktok_url:
                    handlers.send_message(
                        chat_id,
                        html_bold('🎥 TikTok Video Downloader') + '\n\n' +
                        'Usage: <code>/tiktok [url]</code>\n\n' +
                        'Example:\n' +
                        '• <code>/tiktok https://vm.tiktok.com/xxx</code>\n' +
                        '• <code>/tiktok https://www.tiktok.com/@user/video/123</code>',
                        message_id
                    )
                    return jsonify({"ok": True})
                
                is_tiktok_link = bool(re.match(r'^https?://(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)', tiktok_url, re.IGNORECASE))
                
                if not is_tiktok_link:
                    handlers.send_message(chat_id, html_bold('❌ Please provide a valid TikTok URL.'), message_id)
                    return jsonify({"ok": True})
                
                threading.Thread(target=handlers.send_action, args=(chat_id, 'typing')).start()
                
                initial_text = html_bold('⏳ Fetching TikTok video... Please wait.')
                progress_message_id = handlers.send_message(chat_id, initial_text, message_id, get_initial_progress_keyboard())
                
                def process_tiktok():
                    if progress_message_id:
                        threading.Thread(target=handlers.simulate_progress, args=(chat_id, progress_message_id, message_id)).start()
                    
                    try:
                        video_data = download_tiktok_video(tiktok_url)
                        
                        if not video_data.get('success'):
                            handlers.progress_active = False
                            error_text = html_bold('❌ Failed to fetch video.') + f"\n\n{video_data.get('error', 'The video might be private or unavailable.')}"
                            if progress_message_id:
                                handlers.edit_message(chat_id, progress_message_id, error_text)
                            else:
                                handlers.send_message(chat_id, error_text, message_id)
                            return
                        
                        if video_data.get('type') == 'image' and video_data.get('images'):
                            handlers.progress_active = False
                            if progress_message_id:
                                handlers.delete_message(chat_id, progress_message_id)
                            
                            caption = format_tiktok_caption(video_data)
                            handlers.send_photos(chat_id, video_data['images'], caption, message_id, user_inline_keyboard)
                            return
                        
                        final_caption = format_tiktok_caption(video_data)
                        video_url = video_data.get('video_url')
                        
                        if video_url:
                            handlers.progress_active = False
                            
                            if progress_message_id:
                                handlers.delete_message(chat_id, progress_message_id)
                            
                            threading.Thread(target=handlers.send_action, args=(chat_id, 'upload_video')).start()
                            
                            try:
                                # Extract Audio button ONLY for owner
                                video_keyboard = get_video_keyboard(video_url, final_caption, is_owner)
                                button_id = video_keyboard[0][0]['callback_data']
                                if button_id.startswith('extract_audio_'):
                                    handlers.cache_video_for_audio(chat_id, button_id, video_url, final_caption)
                                
                                if video_data.get('video_hd') and video_data.get('video_sd'):
                                    handlers.send_video_with_quality_fallback(
                                        chat_id, video_data['video_hd'], video_data['video_sd'],
                                        final_caption, message_id, video_data.get('thumbnail'), video_keyboard
                                    )
                                else:
                                    handlers.send_video(chat_id, video_url, final_caption, message_id, video_data.get('thumbnail'), video_keyboard)
                            except Exception as e:
                                print(f"[Bot] sendVideo failed: {e}")
                                print("[Bot] Sending direct download link instead...")
                                handlers.send_link_message(chat_id, video_url, final_caption, message_id)
                        else:
                            handlers.progress_active = False
                            error_text = html_bold('⚠️ Could not get the video download link.') + '\n\nThe video might be private or the format is not supported.'
                            if progress_message_id:
                                handlers.edit_message(chat_id, progress_message_id, error_text)
                            else:
                                handlers.send_message(chat_id, error_text, message_id)
                    except Exception as e:
                        handlers.progress_active = False
                        print(f"[Bot] Error: {e}")
                        error_text = html_bold('❌ An error occurred while processing the video.')
                        if progress_message_id:
                            handlers.edit_message(chat_id, progress_message_id, error_text)
                        else:
                            handlers.send_message(chat_id, error_text, message_id)
                
                threading.Thread(target=process_tiktok).start()
                return jsonify({"ok": True})
            
            if text:
                help_text = """📌 <b>Available Commands:</b>

<b>🎥 /tiktok [url]</b>
Download TikTok videos without watermark
Example: <code>/tiktok https://vm.tiktok.com/xxx</code>

<b>🎵 /song [name or url]</b>
Download songs from YouTube
Example: <code>/song new sinhala dj song</code>

◇───────────────◇
Send <b>/start</b> for more info!"""
                handlers.send_message(chat_id, help_text, message_id, user_inline_keyboard)
                return jsonify({"ok": True})
        
        if callback_query:
            chat_id = callback_query['message']['chat']['id']
            data = callback_query['data']
            callback_message_id = callback_query['message']['message_id']
            is_owner = bool(OWNER_ID and str(chat_id) == str(OWNER_ID))
            
            all_buttons = []
            if callback_query['message'].get('reply_markup', {}).get('inline_keyboard'):
                for row in callback_query['message']['reply_markup']['inline_keyboard']:
                    all_buttons.extend(row)
            button = next((b for b in all_buttons if b.get('callback_data') == data), None)
            button_text = button['text'] if button else "Action Complete"
            
            if data in ['ignore_progress', 'ignore_branding']:
                handlers.answer_callback_query(callback_query['id'], button_text)
                return jsonify({"ok": True})
            
            # Extract audio - ONLY for owner
            if data.startswith('extract_audio_'):
                if not is_owner:
                    handlers.answer_callback_query(callback_query['id'], '❌ Only the owner can use this feature.')
                    return jsonify({"ok": True})
                
                handlers.answer_callback_query(callback_query['id'], '🎵 Extracting audio...')
                video_data = handlers.get_video_for_audio(chat_id, data)
                if video_data:
                    def do_extract():
                        success = extract_tiktok_audio(video_data['video_url'], chat_id, video_data['caption'], handlers)
                        if not success:
                            handlers.send_message(chat_id, html_bold('❌ Failed to extract audio. Please try again.'), None)
                        handlers.clear_video_for_audio(chat_id, data)
                    
                    threading.Thread(target=do_extract).start()
                else:
                    handlers.send_message(chat_id, html_bold('❌ Video data expired. Please send the link again.'), None)
                return jsonify({"ok": True})
            
            if data.startswith('songcount_'):
                parts = data.split('_')
                count = int(parts[1])
                query_id = '_'.join(parts[2:])
                
                cached_data = song_query_cache.get(query_id)
                
                if not cached_data:
                    handlers.answer_callback_query(callback_query['id'], '❌ Request expired')
                    handlers.edit_message(chat_id, callback_message_id, html_bold('❌ Request expired. Please send the /song command again.'))
                    return jsonify({"ok": True})
                
                handlers.answer_callback_query(callback_query['id'], f'🎵 Downloading {count} song(s)...')
                
                del song_query_cache[query_id]
                
                handlers.edit_message(
                    chat_id, callback_message_id,
                    html_bold('🎵 Starting YouTube search...') + '\n\n' +
                    f'🔍 Query: <i>{cached_data["query"]}</i>\n' +
                    f'📥 Downloading {count} song(s)...'
                )
                
                def do_song_download():
                    try:
                        history_functions = {
                            'is_already_downloaded': is_already_downloaded,
                            'add_to_history': add_to_history
                        }
                        download_and_send_songs(cached_data['query'], count, handlers, chat_id, callback_message_id, history_functions)
                    except Exception as e:
                        print(f"[Bot] Song download error: {e}")
                        handlers.edit_message(chat_id, callback_message_id, html_bold('❌ Error downloading songs') + '\n\n' + str(e))
                
                threading.Thread(target=do_song_download).start()
                return jsonify({"ok": True})
            
            # Admin callbacks - only for owner
            if OWNER_ID and str(chat_id) != str(OWNER_ID):
                handlers.answer_callback_query(callback_query['id'], "❌ You cannot use this command.")
                return jsonify({"ok": True})
            
            if data == 'set_mode_owner':
                owner_mode = 'owner'
                handlers.answer_callback_query(callback_query['id'], '✅ Owner Mode activated')
                owner_mode_keyboard = [
                    [
                        {"text": "✅ Owner Mode", "callback_data": "set_mode_owner"},
                        {"text": "👤 User Mode", "callback_data": "set_mode_user"}
                    ],
                    [{"text": "📊 Users Count", "callback_data": "admin_users_count"}],
                    [{"text": "📣 Broadcast", "callback_data": "admin_broadcast"}],
                    [{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]
                ]
                handlers.edit_message(chat_id, callback_message_id, html_bold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.\n\n" + html_bold("Current Mode: 👑 Owner Mode"), owner_mode_keyboard)
            
            elif data == 'set_mode_user':
                owner_mode = 'user'
                handlers.answer_callback_query(callback_query['id'], '✅ User Mode activated')
                user_mode_keyboard = [
                    [
                        {"text": "👑 Owner Mode", "callback_data": "set_mode_owner"},
                        {"text": "✅ User Mode", "callback_data": "set_mode_user"}
                    ],
                    [{"text": "📊 Users Count", "callback_data": "admin_users_count"}],
                    [{"text": "📣 Broadcast", "callback_data": "admin_broadcast"}],
                    [{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]
                ]
                handlers.edit_message(chat_id, callback_message_id, html_bold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.\n\n" + html_bold("Current Mode: 👤 User Mode"), user_mode_keyboard)
            
            elif data == 'admin_users_count':
                count = handlers.get_all_users_count()
                handlers.answer_callback_query(callback_query['id'], f'📊 Total Users: {count}')
            
            elif data == 'admin_broadcast':
                handlers.answer_callback_query(callback_query['id'], '📣 Broadcast Mode')
                handlers.send_message(chat_id, html_bold("📣 Broadcast Mode") + "\n\nPlease reply with the message you want to broadcast:", callback_message_id)
        
        return jsonify({"ok": True})
        
    except Exception as e:
        print(f"[Bot] Webhook error: {e}")
        return jsonify({"ok": False, "error": str(e)})

if __name__ == '__main__':
    print(f"[Server] TikTok Download Bot running on port 5000")
    print(f"[Server] Webhook endpoint: http://0.0.0.0:5000/")
    if not BOT_TOKEN:
        print("[Server] WARNING: BOT_TOKEN is not set!")
    if not OWNER_ID:
        print("[Server] WARNING: OWNER_ID is not set!")
    
    app.run(host='0.0.0.0', port=5000)
