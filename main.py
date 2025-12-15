import re
import time
import threading
import os
import tempfile
import subprocess
from flask import Flask, request, jsonify, render_template, redirect, url_for, send_file, Response
from config import BOT_TOKEN, OWNER_ID, PROGRESS_STATES
from handlers import TelegramHandlers
from tiktok_api import download_tiktok_video
from helpers import format_tiktok_caption, html_bold, strip_html_tags
from youtube import download_and_send_songs, search_youtube, download_audio, get_video_metadata, is_youtube_url, extract_video_id
from songHistory import is_already_downloaded, add_to_history
from facebook import is_facebook_profile_url, get_facebook_photos, download_photo_to_temp
from universal_downloader import (
    detect_platform, get_media_info, get_youtube_quality_options,
    download_media, format_duration, format_views, is_supported_url
)
from pexels_downloader import process_korean_video, cleanup_files

app = Flask(__name__)

handlers = TelegramHandlers(BOT_TOKEN, OWNER_ID)

user_inline_keyboard = [
    [{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]
]

song_query_cache = {}
download_cache = {}
youtube_quality_cache = {}
url_download_cache = {}
owner_mode = 'owner'

URL_PATTERN = re.compile(
    r'https?://(?:[\w-]+\.)*(?:'
    r'youtube\.com|youtu\.be|'
    r'tiktok\.com|'
    r'instagram\.com|'
    r'twitter\.com|x\.com|'
    r'facebook\.com|fb\.watch|fb\.com|'
    r'vimeo\.com|'
    r'dailymotion\.com|'
    r'reddit\.com|redd\.it|'
    r'twitch\.tv|'
    r'soundcloud\.com|'
    r'spotify\.com|'
    r'bandcamp\.com|'
    r'bilibili\.com|b23\.tv|'
    r'xhamster\.com|xhamster2\.com|'
    r'pornhub\.com'
    r')[^\s<>\[\]]*',
    re.IGNORECASE
)

def extract_url_from_text(text):
    """Extract the first supported URL from text"""
    if not text:
        return None
    match = URL_PATTERN.search(text)
    return match.group(0) if match else None

def get_platform_emoji(platform):
    """Get emoji for platform"""
    emojis = {
        'youtube': '📺',
        'tiktok': '🎵',
        'instagram': '📷',
        'twitter': '🐦',
        'facebook': '📘',
        'vimeo': '🎬',
        'reddit': '🔴',
        'twitch': '💜',
        'soundcloud': '🔊',
        'spotify': '🎧',
        'bandcamp': '🎸',
        'dailymotion': '📹',
        'bilibili': '📺',
        'xhamster': '🔞',
        'pornhub': '🔞'
    }
    return emojis.get(platform, '📥')

def process_auto_url_download(url, handlers, chat_id, message_id, is_owner):
    """Process any detected URL and show download options"""
    try:
        handlers.send_action(chat_id, 'typing')
        
        platform = detect_platform(url)
        platform_name = platform.capitalize() if platform != 'unknown' else 'Media'
        platform_emoji = get_platform_emoji(platform)
        
        status_msg_id = handlers.send_message(
            chat_id,
            html_bold(f'{platform_emoji} Fetching {platform_name} info...') + '\n\n⏳ Please wait...',
            message_id
        )
        
        if platform == 'tiktok':
            handlers.edit_message(chat_id, status_msg_id, html_bold('🎵 Downloading TikTok video...'))
            video_data = download_tiktok_video(url)
            
            if video_data.get('success'):
                if video_data.get('type') == 'image' and video_data.get('images'):
                    handlers.delete_message(chat_id, status_msg_id)
                    caption = format_tiktok_caption(video_data)
                    handlers.send_photos(chat_id, video_data['images'], caption, message_id, user_inline_keyboard)
                    return
                
                video_url = video_data.get('video_url')
                if video_url:
                    handlers.delete_message(chat_id, status_msg_id)
                    final_caption = format_tiktok_caption(video_data)
                    handlers.send_action(chat_id, 'upload_video')
                    
                    cache_id = f"tkaudio_{chat_id}_{int(time.time() * 1000)}"
                    keyboard = [
                        [{"text": "🎵 Extract Audio", "callback_data": f"urldl_tkaudio_{cache_id}"}],
                        [{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]
                    ]
                    url_download_cache[cache_id] = {'url': url, 'video_url': video_url, 'caption': final_caption, 'timestamp': time.time()}
                    
                    if video_data.get('video_hd') and video_data.get('video_sd'):
                        handlers.send_video_with_quality_fallback(
                            chat_id, video_data['video_hd'], video_data['video_sd'],
                            final_caption, message_id, video_data.get('thumbnail'), keyboard
                        )
                    else:
                        handlers.send_video(chat_id, video_url, final_caption, message_id, video_data.get('thumbnail'), keyboard)
                    return
            
            handlers.edit_message(chat_id, status_msg_id, html_bold('❌ Failed to download TikTok video'))
            return
        
        info = get_media_info(url)
        
        if not info.get('success'):
            handlers.edit_message(chat_id, status_msg_id, html_bold('❌ Failed to fetch info: ') + info.get('error', 'Unknown error'))
            return
        
        cache_id = f"urldl_{chat_id}_{int(time.time() * 1000)}"
        url_download_cache[cache_id] = {
            'url': url,
            'info': info,
            'chat_id': chat_id,
            'timestamp': time.time()
        }
        
        caption = (
            f"{platform_emoji} <b>{platform_name} Download</b>\n\n"
            f"🎬 <b>{info.get('title', 'Unknown')}</b>\n"
            f"⏱ <b>Duration:</b> {format_duration(info.get('duration'))}\n"
            f"👁 <b>Views:</b> {format_views(info.get('view_count'))}\n"
            f"📺 <b>Uploader:</b> {info.get('uploader', 'Unknown')}\n\n"
            f"<b>Select download option:</b>"
        )
        
        keyboard = []
        
        video_formats = info.get('video_formats', {})
        if video_formats:
            video_row = []
            for quality, fmt in list(video_formats.items())[:2]:
                video_row.append({"text": f"🎬 {quality}", "callback_data": f"urldl_video_{quality}_{cache_id}"})
            if video_row:
                keyboard.append(video_row)
        
        if not keyboard:
            keyboard.append([{"text": "🎬 Best Video", "callback_data": f"urldl_video_best_{cache_id}"}])
        
        keyboard.append([{"text": "🎵 Audio (MP3)", "callback_data": f"urldl_audio_best_{cache_id}"}])
        keyboard.append([{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}])
        
        if info.get('thumbnail'):
            handlers.delete_message(chat_id, status_msg_id)
            handlers.send_photo_with_caption(chat_id, info['thumbnail'], caption, message_id, keyboard)
        else:
            handlers.edit_message(chat_id, status_msg_id, caption, keyboard)
        
    except Exception as e:
        print(f"[Auto URL] Error: {e}")
        handlers.send_message(chat_id, html_bold('❌ Error processing URL: ') + str(e), message_id)

def process_facebook_profile(url, handlers, chat_id, message_id, is_owner):
    """Download Facebook profile and cover photos - Owner only"""
    if not is_owner:
        handlers.send_message(chat_id, html_bold('❌ This feature is only available for the owner.'), message_id)
        return
    
    try:
        handlers.send_action(chat_id, 'typing')
        status_msg_id = handlers.send_message(
            chat_id,
            html_bold('📥 Fetching Facebook profile photos...') + '\n\n⏳ Please wait...',
            message_id
        )
        
        result = get_facebook_photos(url)
        
        if not result.get('success'):
            handlers.edit_message(
                chat_id, status_msg_id,
                html_bold('❌ Failed to fetch photos') + f"\n\n{result.get('error', 'Unknown error')}"
            )
            return
        
        photos = result.get('photos', {})
        username = photos.get('username', 'Unknown')
        photos_sent = 0
        
        if photos.get('profile_photo'):
            handlers.edit_message(chat_id, status_msg_id, html_bold('📤 Sending profile photo...'))
            handlers.send_action(chat_id, 'upload_photo')
            
            temp_file = download_photo_to_temp(photos['profile_photo'], 'fb_profile')
            if temp_file and os.path.exists(temp_file):
                caption = f"👤 <b>Profile Photo</b>\n\n📛 Username: <code>{username}</code>"
                handlers.send_photo_file(chat_id, temp_file, caption, message_id)
                try:
                    os.unlink(temp_file)
                except:
                    pass
                photos_sent += 1
            else:
                handlers.send_photo_with_caption(
                    chat_id, photos['profile_photo'],
                    f"👤 <b>Profile Photo</b>\n\n📛 Username: <code>{username}</code>",
                    message_id
                )
                photos_sent += 1
        
        if photos.get('cover_photo'):
            handlers.edit_message(chat_id, status_msg_id, html_bold('📤 Sending cover photo...'))
            handlers.send_action(chat_id, 'upload_photo')
            
            temp_file = download_photo_to_temp(photos['cover_photo'], 'fb_cover')
            if temp_file and os.path.exists(temp_file):
                caption = f"🖼 <b>Cover Photo</b>\n\n📛 Username: <code>{username}</code>"
                handlers.send_photo_file(chat_id, temp_file, caption, message_id)
                try:
                    os.unlink(temp_file)
                except:
                    pass
                photos_sent += 1
            else:
                handlers.send_photo_with_caption(
                    chat_id, photos['cover_photo'],
                    f"🖼 <b>Cover Photo</b>\n\n📛 Username: <code>{username}</code>",
                    message_id
                )
                photos_sent += 1
        
        if photos_sent > 0:
            handlers.edit_message(
                chat_id, status_msg_id,
                html_bold('✅ Download Complete!') + f"\n\n📛 Profile: <code>{username}</code>\n📷 Photos sent: {photos_sent}"
            )
        else:
            handlers.edit_message(
                chat_id, status_msg_id,
                html_bold('⚠️ No photos found') + '\n\nThe profile may be private or no photos are available.'
            )
            
    except Exception as e:
        print(f"[Facebook] Error: {e}")
        handlers.send_message(chat_id, html_bold('❌ Error processing Facebook profile: ') + str(e), message_id)

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

def process_universal_download(url, handlers, chat_id, message_id, is_owner, selected_format='video', quality='best'):
    """Process download from various platforms using universal downloader"""
    try:
        handlers.send_action(chat_id, 'typing')
        
        platform = detect_platform(url)
        platform_name = platform.capitalize() if platform != 'unknown' else 'Media'
        
        handlers.edit_message(chat_id, message_id, html_bold(f'📥 Downloading {platform_name} {selected_format}...'))
        
        result = download_media(url, selected_format, quality)
        
        if not result.get('success'):
            handlers.edit_message(chat_id, message_id, html_bold('❌ Download failed: ') + result.get('error', 'Unknown error'))
            return
        
        file_path = result.get('path')
        if not file_path or not os.path.exists(file_path):
            handlers.edit_message(chat_id, message_id, html_bold('❌ Downloaded file not found'))
            return
        
        file_size = os.path.getsize(file_path)
        print(f"[Upload] Starting upload: {file_path} ({file_size} bytes)")
        handlers.edit_message(chat_id, message_id, html_bold(f'📤 Uploading {selected_format}... ({file_size // 1024 // 1024}MB)'))
        
        if result.get('type') == 'audio':
            handlers.send_action(chat_id, 'upload_audio')
            send_result = handlers.send_audio_file(chat_id, file_path, f"{platform_name} Audio", None)
        else:
            handlers.send_action(chat_id, 'upload_video')
            send_result = handlers.send_video_file(chat_id, file_path, f"📥 Downloaded from {platform_name}", None)
        
        print(f"[Upload] Send result: {send_result}")
        
        try:
            os.unlink(file_path)
        except:
            pass
        
        if send_result and send_result.get('ok'):
            handlers.edit_message(chat_id, message_id, html_bold('✅ Download Complete!'))
        else:
            error_msg = send_result.get('description', 'Upload failed') if send_result else 'No response'
            print(f"[Upload] Failed: {error_msg}")
            handlers.edit_message(chat_id, message_id, html_bold('❌ Upload failed: ') + error_msg)
        
    except Exception as e:
        print(f"[Universal Download] Error: {e}")
        handlers.edit_message(chat_id, message_id, html_bold('❌ Error: ') + str(e))

def process_youtube_user_mode(url, handlers, chat_id, message_id):
    """Show YouTube video thumbnail with quality selection for users"""
    try:
        handlers.send_action(chat_id, 'typing')
        
        info = get_youtube_quality_options(url)
        
        if not info.get('success'):
            handlers.edit_message(chat_id, message_id, html_bold('❌ Failed to fetch video info: ') + info.get('error', 'Unknown error'))
            return
        
        cache_id = f"ytq_{chat_id}_{int(time.time() * 1000)}"
        youtube_quality_cache[cache_id] = {
            'url': url,
            'title': info.get('title'),
            'chat_id': chat_id,
            'timestamp': time.time()
        }
        
        caption = (
            f"🎬 <b>{info.get('title', 'Unknown')}</b>\n\n"
            f"⏱ <b>Duration:</b> {format_duration(info.get('duration'))}\n"
            f"📺 <b>Channel:</b> {info.get('uploader', 'Unknown')}\n\n"
            f"<b>Select download quality:</b>"
        )
        
        keyboard = [
            [
                {"text": "🎬 Best Video", "callback_data": f"ytdl_video_best_{cache_id}"},
                {"text": "🎬 720p Video", "callback_data": f"ytdl_video_720_{cache_id}"}
            ],
            [
                {"text": "🎵 Audio (MP3)", "callback_data": f"ytdl_audio_best_{cache_id}"}
            ]
        ]
        
        if info.get('thumbnail'):
            result = handlers.send_photo_with_caption(chat_id, info['thumbnail'], caption, None, keyboard)
            if result and result.get('ok'):
                handlers.delete_message(chat_id, message_id)
            else:
                handlers.edit_message(chat_id, message_id, caption, keyboard)
        else:
            handlers.edit_message(chat_id, message_id, caption, keyboard)
        
    except Exception as e:
        print(f"[YouTube User Mode] Error: {e}")
        handlers.edit_message(chat_id, message_id, html_bold('❌ Error: ') + str(e))

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

@app.route('/hacker', methods=['GET'])
def hacker_page():
    return render_template('hacker.html')

@app.route('/hacker/preview', methods=['POST'])
def hacker_preview():
    url = request.form.get('url', '').strip()
    
    if not url:
        return render_template('hacker.html', error='No URL provided. Please enter a valid URL.')
    
    if not is_youtube_url(url) and not is_supported_url(url):
        return render_template('hacker.html', error='Invalid or unsupported URL. Please enter a valid YouTube or media URL.')
    
    try:
        info = get_media_info(url)
        
        if not info.get('success'):
            return render_template('hacker.html', error=f"Failed to fetch media info: {info.get('error', 'Unknown error')}")
        
        code_snippets = [
            '<input name="4" onclick="button(4,\')" type="button" value=" 4 ">',
            'SELECT * FROM media WHERE url = "encrypted";',
            'function extract(hash) { return decode(hash); }',
            'const API = process.env.SECRET_KEY;',
            'ssh -i key.pem root@server.extract',
            'PASSWORD_DECRYPT... ████████░░',
        ]
        import random
        code_text = '\n'.join(random.sample(code_snippets, min(4, len(code_snippets))))
        
        preview = {
            'title': info.get('title', 'Unknown'),
            'thumbnail': info.get('thumbnail', ''),
            'duration': format_duration(info.get('duration')),
            'uploader': info.get('uploader', 'Unknown'),
            'views': format_views(info.get('view_count'))
        }
        
        return render_template('hacker.html', preview=preview, url=url, code_text=code_text)
        
    except Exception as e:
        print(f"[Hacker Preview] Error: {e}")
        return render_template('hacker.html', error=f'Error processing URL: {str(e)}')

@app.route('/hacker/download', methods=['POST'])
def hacker_download():
    url = request.form.get('url', '').strip()
    format_type = request.form.get('format', 'video')
    
    if not url:
        return render_template('hacker.html', error='No URL provided.')
    
    try:
        result = download_media(url, format_type, 'best')
        
        if not result.get('success'):
            return render_template('hacker.html', error=f"Download failed: {result.get('error', 'Unknown error')}")
        
        file_path = result.get('path')
        if not file_path or not os.path.exists(file_path):
            return render_template('hacker.html', error='Downloaded file not found.')
        
        filename = os.path.basename(file_path)
        
        def generate_and_cleanup():
            try:
                with open(file_path, 'rb') as f:
                    while True:
                        chunk = f.read(8192)
                        if not chunk:
                            break
                        yield chunk
            finally:
                try:
                    os.unlink(file_path)
                except:
                    pass
        
        return Response(
            generate_and_cleanup(),
            mimetype='application/octet-stream',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
        
    except Exception as e:
        print(f"[Hacker Download] Error: {e}")
        return render_template('hacker.html', error=f'Download error: {str(e)}')

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

<b>🔗 Just send any link to download!</b>
The bot automatically detects and downloads from:

📺 YouTube • 🎵 TikTok • 📷 Instagram
🐦 Twitter/X • 📘 Facebook • 🎬 Vimeo
🔴 Reddit • 💜 Twitch • 🔊 SoundCloud
🎧 Spotify • 🎸 Bandcamp • And more!

<b>📌 Or use commands:</b>
• <b>/song [name]</b> - Search & download songs
• <b>/tiktok [url]</b> - Download TikTok videos

◇───────────────◇
🚀 <b>Universal Media Downloader</b>
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
            
            # /korean command - Download Korean videos from Pexels with viral music
            if text and text.lower().startswith('/korean'):
                if not is_owner:
                    handlers.send_message(chat_id, html_bold('❌ This command is only available for the owner.'), message_id)
                    return jsonify({"ok": True})
                
                status_msg_id = handlers.send_message(
                    chat_id,
                    html_bold('🇰🇷 Korean Video Generator') + '\n\n' +
                    '📥 Fetching random Korean video...\n' +
                    '🎵 Adding viral music...\n' +
                    '⏳ Please wait...',
                    message_id
                )
                
                def process_korean():
                    try:
                        handlers.send_action(chat_id, 'upload_video')
                        
                        result = process_korean_video()
                        
                        if not result.get('success'):
                            handlers.edit_message(
                                chat_id, status_msg_id,
                                html_bold('❌ Failed to get video') + f"\n\n{result.get('error', 'Unknown error')}"
                            )
                            return
                        
                        video_path = result.get('video_path')
                        caption = result.get('caption')
                        cleanup_paths = result.get('cleanup_paths', [])
                        
                        handlers.edit_message(chat_id, status_msg_id, html_bold('📤 Uploading video...'))
                        handlers.send_action(chat_id, 'upload_video')
                        
                        keyboard = [[{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}]]
                        send_result = handlers.send_video_file(chat_id, video_path, caption, message_id, keyboard)
                        
                        cleanup_files(cleanup_paths)
                        
                        if send_result and send_result.get('ok'):
                            handlers.edit_message(
                                chat_id, status_msg_id,
                                html_bold('✅ Korean Video Sent!') + '\n\n' +
                                f"📹 Video ID: {result.get('video_id')}\n" +
                                f"📸 By: {result.get('photographer')}"
                            )
                        else:
                            error_msg = send_result.get('description', 'Upload failed') if send_result else 'No response'
                            handlers.edit_message(
                                chat_id, status_msg_id,
                                html_bold('❌ Upload failed') + f"\n\n{error_msg}"
                            )
                        
                    except Exception as e:
                        print(f"[Korean] Error: {e}")
                        handlers.edit_message(
                            chat_id, status_msg_id,
                            html_bold('❌ Error processing video') + f"\n\n{str(e)}"
                        )
                
                threading.Thread(target=process_korean).start()
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
            
            # Facebook profile photo download - OWNER ONLY
            if text and is_owner and is_facebook_profile_url(text):
                threading.Thread(target=process_facebook_profile, args=(text, handlers, chat_id, message_id, is_owner)).start()
                return jsonify({"ok": True})
            
            # /dl command - Owner mode multi-platform downloader
            if text and text.lower().startswith('/dl'):
                if not is_owner or owner_mode != 'owner':
                    handlers.send_message(chat_id, html_bold('❌ This command is only available for the owner in Owner Mode.'), message_id)
                    return jsonify({"ok": True})
                
                dl_url = re.sub(r'^/dl\s*', '', text, flags=re.IGNORECASE).strip()
                
                if not dl_url:
                    handlers.send_message(
                        chat_id,
                        html_bold('📥 Universal Downloader') + '\n\n' +
                        'Usage: <code>/dl [url]</code>\n\n' +
                        '<b>Supported platforms:</b>\n' +
                        '• YouTube, Instagram, Twitter/X\n' +
                        '• TikTok, Facebook, Vimeo\n' +
                        '• Reddit, Twitch, SoundCloud\n' +
                        '• And many more...\n\n' +
                        'Example:\n' +
                        '• <code>/dl https://youtube.com/watch?v=xxx</code>\n' +
                        '• <code>/dl https://instagram.com/p/xxx</code>',
                        message_id
                    )
                    return jsonify({"ok": True})
                
                if not is_supported_url(dl_url):
                    handlers.send_message(chat_id, html_bold('❌ Unsupported URL or platform.'), message_id)
                    return jsonify({"ok": True})
                
                status_msg_id = handlers.send_message(
                    chat_id,
                    html_bold('📥 Fetching media info...') + '\n\n⏳ Please wait...',
                    message_id
                )
                
                def do_owner_download():
                    try:
                        info = get_media_info(dl_url)
                        
                        if not info.get('success'):
                            handlers.edit_message(chat_id, status_msg_id, html_bold('❌ Failed to fetch info: ') + info.get('error', 'Unknown error'))
                            return
                        
                        cache_id = f"dl_{chat_id}_{int(time.time() * 1000)}"
                        download_cache[cache_id] = {
                            'url': dl_url,
                            'info': info,
                            'chat_id': chat_id,
                            'timestamp': time.time()
                        }
                        
                        platform = info.get('platform', 'unknown').capitalize()
                        caption = (
                            f"📥 <b>{platform} Downloader</b>\n\n"
                            f"🎬 <b>{info.get('title', 'Unknown')}</b>\n"
                            f"⏱ <b>Duration:</b> {format_duration(info.get('duration'))}\n"
                            f"👁 <b>Views:</b> {format_views(info.get('view_count'))}\n"
                            f"📺 <b>Uploader:</b> {info.get('uploader', 'Unknown')}\n\n"
                            f"<b>Select quality:</b>"
                        )
                        
                        keyboard = []
                        
                        video_formats = info.get('video_formats', {})
                        if video_formats:
                            video_row = []
                            for quality, fmt in list(video_formats.items())[:3]:
                                video_row.append({"text": f"🎬 {quality}", "callback_data": f"owndl_video_{quality}_{cache_id}"})
                            if video_row:
                                keyboard.append(video_row)
                        
                        audio_formats = info.get('audio_formats', {})
                        if audio_formats:
                            audio_row = []
                            for quality, fmt in list(audio_formats.items())[:2]:
                                audio_row.append({"text": f"🎵 {quality}", "callback_data": f"owndl_audio_{quality}_{cache_id}"})
                            if audio_row:
                                keyboard.append(audio_row)
                        
                        if not keyboard:
                            keyboard.append([{"text": "🎬 Best Video", "callback_data": f"owndl_video_best_{cache_id}"}])
                            keyboard.append([{"text": "🎵 Audio", "callback_data": f"owndl_audio_best_{cache_id}"}])
                        
                        if info.get('thumbnail'):
                            handlers.delete_message(chat_id, status_msg_id)
                            handlers.send_photo_with_caption(chat_id, info['thumbnail'], caption, message_id, keyboard)
                        else:
                            handlers.edit_message(chat_id, status_msg_id, caption, keyboard)
                        
                    except Exception as e:
                        print(f"[Owner Download] Error: {e}")
                        handlers.edit_message(chat_id, status_msg_id, html_bold('❌ Error: ') + str(e))
                
                threading.Thread(target=do_owner_download).start()
                return jsonify({"ok": True})
            
            # Auto-detect any supported URL and show download options
            if text:
                detected_url = extract_url_from_text(text)
                if detected_url and is_supported_url(detected_url):
                    def do_auto_download():
                        process_auto_url_download(detected_url, handlers, chat_id, message_id, is_owner)
                    
                    threading.Thread(target=do_auto_download).start()
                    return jsonify({"ok": True})
            
            if text:
                help_text = """📌 <b>How to use this bot:</b>

<b>🔗 Just send a link!</b>
The bot will automatically detect and download from:

📺 YouTube • 🎵 TikTok • 📷 Instagram
🐦 Twitter/X • 📘 Facebook • 🎬 Vimeo
🔴 Reddit • 💜 Twitch • 🔊 SoundCloud
🎧 Spotify • 🎸 Bandcamp • And more!

<b>📌 Or use commands:</b>
<b>/song [name]</b> - Search & download songs
<b>/tiktok [url]</b> - Download TikTok videos

◇───────────────◇
🚀 <b>Powered by LK NEWS Download Bot</b>"""
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
            
            # YouTube quality selection - User mode
            if data.startswith('ytdl_'):
                parts = data.split('_')
                format_type = parts[1]
                quality = parts[2]
                cache_id = '_'.join(parts[3:])
                
                cached_data = youtube_quality_cache.get(cache_id)
                
                if not cached_data:
                    handlers.answer_callback_query(callback_query['id'], '❌ Request expired')
                    handlers.delete_message(chat_id, callback_message_id)
                    handlers.send_message(chat_id, html_bold('❌ Request expired. Please send the link again.'), None)
                    return jsonify({"ok": True})
                
                handlers.answer_callback_query(callback_query['id'], f'📥 Starting download...')
                
                handlers.delete_message(chat_id, callback_message_id)
                
                status_msg_id = handlers.send_message(
                    chat_id,
                    html_bold(f'📥 Downloading {format_type}...') + f'\n\n🎬 {cached_data.get("title", "Video")}',
                    None
                )
                
                del youtube_quality_cache[cache_id]
                
                def do_ytdl_download():
                    process_universal_download(cached_data['url'], handlers, chat_id, status_msg_id, False, format_type, quality)
                
                threading.Thread(target=do_ytdl_download).start()
                return jsonify({"ok": True})
            
            # Universal URL download callbacks
            if data.startswith('urldl_'):
                parts = data.split('_')
                action_type = parts[1]
                
                if action_type == 'tkaudio':
                    cache_id = '_'.join(parts[2:])
                    cached_data = url_download_cache.get(cache_id)
                    
                    if not cached_data:
                        handlers.answer_callback_query(callback_query['id'], '❌ Request expired')
                        return jsonify({"ok": True})
                    
                    handlers.answer_callback_query(callback_query['id'], '🎵 Extracting audio...')
                    
                    def do_tiktok_audio():
                        success = extract_tiktok_audio(cached_data['video_url'], chat_id, cached_data['caption'], handlers)
                        if not success:
                            handlers.send_message(chat_id, html_bold('❌ Failed to extract audio.'), None)
                        if cache_id in url_download_cache:
                            del url_download_cache[cache_id]
                    
                    threading.Thread(target=do_tiktok_audio).start()
                    return jsonify({"ok": True})
                
                format_type = action_type
                quality = parts[2]
                cache_id = '_'.join(parts[3:])
                
                cached_data = url_download_cache.get(cache_id)
                
                if not cached_data:
                    handlers.answer_callback_query(callback_query['id'], '❌ Request expired')
                    handlers.delete_message(chat_id, callback_message_id)
                    handlers.send_message(chat_id, html_bold('❌ Request expired. Please send the link again.'), None)
                    return jsonify({"ok": True})
                
                handlers.answer_callback_query(callback_query['id'], f'📥 Starting download...')
                
                handlers.delete_message(chat_id, callback_message_id)
                
                info = cached_data.get('info', {})
                status_msg_id = handlers.send_message(
                    chat_id,
                    html_bold(f'📥 Downloading {format_type}...') + f'\n\n🎬 {info.get("title", "Media")}',
                    None
                )
                
                if cache_id in url_download_cache:
                    del url_download_cache[cache_id]
                
                def do_urldl_download():
                    process_universal_download(cached_data['url'], handlers, chat_id, status_msg_id, False, format_type, quality)
                
                threading.Thread(target=do_urldl_download).start()
                return jsonify({"ok": True})
            
            # Owner mode multi-platform download
            if data.startswith('owndl_'):
                if not is_owner:
                    handlers.answer_callback_query(callback_query['id'], '❌ Owner only')
                    return jsonify({"ok": True})
                
                parts = data.split('_')
                format_type = parts[1]
                quality = parts[2]
                cache_id = '_'.join(parts[3:])
                
                cached_data = download_cache.get(cache_id)
                
                if not cached_data:
                    handlers.answer_callback_query(callback_query['id'], '❌ Request expired')
                    handlers.delete_message(chat_id, callback_message_id)
                    handlers.send_message(chat_id, html_bold('❌ Request expired. Please send the /dl command again.'), None)
                    return jsonify({"ok": True})
                
                handlers.answer_callback_query(callback_query['id'], f'📥 Starting download...')
                
                handlers.delete_message(chat_id, callback_message_id)
                
                info = cached_data.get('info', {})
                status_msg_id = handlers.send_message(
                    chat_id,
                    html_bold(f'📥 Downloading {format_type} ({quality})...') + f'\n\n🎬 {info.get("title", "Media")}',
                    None
                )
                
                del download_cache[cache_id]
                
                def do_owndl_download():
                    process_universal_download(cached_data['url'], handlers, chat_id, status_msg_id, True, format_type, quality)
                
                threading.Thread(target=do_owndl_download).start()
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
