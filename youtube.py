import subprocess
import os
import tempfile
import re
import requests

def search_youtube(query, limit=50):
    print(f"[YouTube] Searching for: {query} (limit: {limit})")
    
    try:
        cmd = [
            'yt-dlp', '--flat-playlist', 
            '--print', '%(id)s|%(title)s|%(duration)s',
            '--no-warnings',
            f'ytsearch{limit}:{query}'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        results = []
        for line in result.stdout.strip().split('\n'):
            if '|' in line:
                parts = line.split('|')
                if len(parts) >= 2:
                    video_id = parts[0].strip()
                    title = parts[1].strip() if len(parts) > 1 else 'Unknown'
                    duration = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
                    
                    if video_id:
                        results.append({
                            'id': video_id,
                            'title': title,
                            'duration': duration,
                            'url': f'https://www.youtube.com/watch?v={video_id}'
                        })
        
        print(f"[YouTube] Found {len(results)} results")
        return results
    except Exception as e:
        print(f"[YouTube] Search error: {e}")
        return []

def get_video_metadata(video_url):
    print(f"[YouTube] Fetching metadata for: {video_url}")
    
    try:
        cmd = [
            'yt-dlp', '--print', 
            '%(title)s|||%(duration)s|||%(view_count)s|||%(like_count)s|||%(upload_date)s|||%(channel)s|||%(description)s|||%(thumbnail)s',
            '--no-playlist',
            '--no-warnings',
            video_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        output = result.stdout.strip()
        print(f"[YouTube] Metadata output length: {len(output)}")
        
        if not output or '|||' not in output:
            print(f"[YouTube] No valid metadata output")
            return None
        
        parts = output.split('|||')
        if len(parts) < 8:
            print(f"[YouTube] Insufficient parts: {len(parts)}")
            return None
        
        title, duration, views, likes, upload_date, channel, description, thumbnail = parts[:8]
        
        duration_sec = int(duration) if duration.isdigit() else 0
        minutes = duration_sec // 60
        seconds = duration_sec % 60
        duration_formatted = f"{minutes}:{str(seconds).zfill(2)}"
        
        date_formatted = 'Unknown'
        if upload_date and len(upload_date) == 8:
            date_formatted = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
        
        def format_number(num_str):
            try:
                n = int(num_str)
                if n >= 1000000:
                    return f"{n / 1000000:.1f}M"
                if n >= 1000:
                    return f"{n / 1000:.1f}K"
                return str(n)
            except:
                return "0"
        
        metadata = {
            'title': title or 'Unknown',
            'duration': duration_formatted,
            'views': format_number(views),
            'likes': format_number(likes),
            'upload_date': date_formatted,
            'channel': channel or 'Unknown',
            'description': (description or '')[:200],
            'thumbnail': thumbnail if thumbnail else None
        }
        
        print(f"[YouTube] Got metadata: title={metadata['title'][:50]}, thumbnail={'Yes' if metadata['thumbnail'] else 'No'}")
        return metadata
    except Exception as e:
        print(f"[YouTube] Metadata error: {e}")
        return None

def download_audio(video_url, output_path):
    print(f"[YouTube] Downloading audio from: {video_url}")
    
    try:
        # Remove .mp3 extension if present, yt-dlp will add it
        base_path = output_path.replace('.mp3', '').replace('.%(ext)s', '')
        output_template = f"{base_path}.%(ext)s"
        
        cmd = [
            'yt-dlp', '-x', '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', output_template,
            video_url
        ]
        
        print(f"[YouTube] Running command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"[YouTube] yt-dlp stderr: {result.stderr}")
        
        # The final file will be base_path.mp3
        mp3_path = f"{base_path}.mp3"
        
        # Check multiple possible paths
        possible_paths = [
            mp3_path,
            output_path,
            f"{base_path}.m4a",
            f"{base_path}.webm"
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                print(f"[YouTube] Download complete: {path}")
                return path
        
        # List temp directory to debug
        temp_dir = os.path.dirname(base_path)
        print(f"[YouTube] Files in {temp_dir}: {os.listdir(temp_dir)[:10]}")
        
        raise Exception("File was not created")
    except subprocess.TimeoutExpired:
        print("[YouTube] Download timed out")
        raise Exception("Download timed out")
    except Exception as e:
        print(f"[YouTube] Download failed: {e}")
        raise e

def is_youtube_url(text):
    try:
        from urllib.parse import urlparse
        url = urlparse(text)
        hostname = url.hostname.lower() if url.hostname else ''
        youtube_hosts = [
            'youtube.com', 'www.youtube.com', 'm.youtube.com',
            'music.youtube.com', 'shorts.youtube.com',
            'youtube-nocookie.com', 'www.youtube-nocookie.com',
            'youtu.be'
        ]
        return any(hostname == host or hostname.endswith('.' + host) for host in youtube_hosts)
    except:
        return False

def extract_video_id(url_string):
    try:
        from urllib.parse import urlparse, parse_qs
        url = urlparse(url_string)
        
        if url.hostname == 'youtu.be':
            path_id = url.path[1:].split('/')[0]
            if path_id and len(path_id) == 11:
                return path_id
        
        v_param = parse_qs(url.query).get('v', [None])[0]
        if v_param and len(v_param) == 11:
            return v_param
        
        patterns = [
            r'/shorts/([a-zA-Z0-9_-]{11})',
            r'/embed/([a-zA-Z0-9_-]{11})',
            r'/v/([a-zA-Z0-9_-]{11})',
            r'/e/([a-zA-Z0-9_-]{11})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url.path)
            if match:
                return match.group(1)
        
        return None
    except:
        return None

def download_and_send_songs(query, limit, handlers, chat_id, status_message_id, history_functions=None):
    if is_youtube_url(query):
        video_id = extract_video_id(query)
        
        if history_functions and video_id and history_functions['is_already_downloaded'](video_id):
            handlers.edit_message(chat_id, status_message_id, "<b>⏭️ This song was already downloaded!</b>")
            return {'success': 0, 'failed': 0, 'skipped': 1}
        
        handlers.edit_message(chat_id, status_message_id, "<b>🎵 Fetching song info...</b>\n\n🔄 Processing...")
        
        metadata = get_video_metadata(query)
        
        if metadata and metadata.get('thumbnail'):
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
        
        handlers.edit_message(chat_id, status_message_id, "<b>🎵 Downloading audio...</b>\n\n🔄 Please wait...")
        handlers.send_action(chat_id, 'upload_audio')
        
        temp_dir = tempfile.gettempdir()
        output_path = os.path.join(temp_dir, f"song_url_{int(__import__('time').time())}.mp3")
        
        try:
            title = metadata['title'] if metadata else 'Unknown Song'
            
            downloaded_path = download_audio(query, output_path)
            
            if os.path.exists(downloaded_path):
                handlers.send_action(chat_id, 'upload_audio')
                handlers.send_audio_file(chat_id, downloaded_path, title, None)
                
                if history_functions:
                    history_functions['add_to_history']({
                        'title': title,
                        'url': query,
                        'video_id': video_id or query
                    })
                
                try:
                    os.unlink(downloaded_path)
                except:
                    pass
                
                handlers.edit_message(chat_id, status_message_id, f"<b>✅ Download Complete!</b>\n\n🎵 {title}")
                return {'success': 1, 'failed': 0, 'skipped': 0}
        except Exception as e:
            print(f"[YouTube] URL download failed: {e}")
            try:
                os.unlink(output_path)
            except:
                pass
        
        handlers.edit_message(chat_id, status_message_id, "<b>❌ Failed to download from URL</b>")
        return {'success': 0, 'failed': 1, 'skipped': 0}
    
    results = search_youtube(query, limit)
    
    if not results:
        handlers.edit_message(chat_id, status_message_id, f"<b>❌ No songs found for:</b> {query}")
        return {'success': 0, 'failed': 0, 'skipped': 0}
    
    success_count = 0
    failed_count = 0
    skipped_count = 0
    temp_dir = tempfile.gettempdir()
    
    for i, song in enumerate(results):
        if history_functions and history_functions['is_already_downloaded'](song['id']):
            print(f"[YouTube] Skipping duplicate: {song['title']}")
            skipped_count += 1
            continue
        
        handlers.edit_message(
            chat_id, status_message_id,
            f"<b>🎵 Downloading songs...</b>\n\n"
            f"📥 Progress: {success_count + failed_count + skipped_count}/{len(results)}\n"
            f"✅ Success: {success_count}\n"
            f"⏭️ Skipped: {skipped_count}\n"
            f"❌ Failed: {failed_count}\n\n"
            f"🔄 Processing: {song['title'][:30]}..."
        )
        
        output_path = os.path.join(temp_dir, f"song_{int(__import__('time').time())}_{i}.mp3")
        
        try:
            downloaded_path = download_audio(song['url'], output_path)
            
            if os.path.exists(downloaded_path):
                handlers.send_audio_file(chat_id, downloaded_path, song['title'], None)
                
                if history_functions:
                    history_functions['add_to_history']({
                        'title': song['title'],
                        'url': song['url'],
                        'video_id': song['id']
                    })
                
                try:
                    os.unlink(downloaded_path)
                except:
                    pass
                
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            print(f"[YouTube] Failed to download {song['title']}: {e}")
            try:
                os.unlink(output_path)
            except:
                pass
            failed_count += 1
        
        __import__('time').sleep(1)
    
    handlers.edit_message(
        chat_id, status_message_id,
        f"<b>✅ Download Complete!</b>\n\n"
        f"🔍 Query: <i>{query}</i>\n"
        f"📊 Total: {len(results)} songs\n"
        f"✅ Success: {success_count}\n"
        f"⏭️ Skipped (duplicates): {skipped_count}\n"
        f"❌ Failed: {failed_count}"
    )
    
    return {'success': success_count, 'failed': failed_count, 'skipped': skipped_count}
