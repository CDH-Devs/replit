import os
import json
import random
import tempfile
import subprocess
import requests

PEXELS_API_KEY = os.environ.get('PEXELS_API_KEY', '')
SENT_VIDEOS_FILE = 'sent_korean_videos.json'

VIRAL_SONGS = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
]

FUNNY_CAPTIONS = [
    "When Monday hits different 😂",
    "POV: You're living your best life 🔥",
    "This is the vibe we all need 💯",
    "No thoughts, just vibes ✨",
    "Living rent free in my head 🧠",
    "Main character energy 🎬",
    "That one friend who always does this 😭",
    "Me pretending everything is fine 🙃",
    "When the beat drops 🎵",
    "Certified classic moment 📸",
]

def load_sent_videos():
    if os.path.exists(SENT_VIDEOS_FILE):
        try:
            with open(SENT_VIDEOS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_sent_video(video_id):
    sent = load_sent_videos()
    if video_id not in sent:
        sent.append(video_id)
        with open(SENT_VIDEOS_FILE, 'w') as f:
            json.dump(sent, f)

def is_video_sent(video_id):
    sent = load_sent_videos()
    return video_id in sent

def search_korean_videos(page=1, per_page=80):
    if not PEXELS_API_KEY:
        return {'success': False, 'error': 'PEXELS_API_KEY not configured'}
    
    try:
        headers = {'Authorization': PEXELS_API_KEY}
        params = {
            'query': 'korea',
            'orientation': 'portrait',
            'page': page,
            'per_page': per_page,
            'min_duration': 5,
            'max_duration': 30
        }
        
        response = requests.get(
            'https://api.pexels.com/videos/search',
            headers=headers,
            params=params,
            timeout=30
        )
        
        if response.status_code != 200:
            return {'success': False, 'error': f'API error: {response.status_code}'}
        
        data = response.json()
        videos = data.get('videos', [])
        
        if not videos:
            return {'success': False, 'error': 'No videos found'}
        
        return {'success': True, 'videos': videos, 'total': data.get('total_results', 0)}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_random_unsent_video():
    sent_videos = load_sent_videos()
    
    for page in range(1, 5):
        result = search_korean_videos(page=page)
        
        if not result.get('success'):
            continue
        
        videos = result.get('videos', [])
        unsent = [v for v in videos if str(v['id']) not in sent_videos]
        
        if unsent:
            video = random.choice(unsent)
            return {'success': True, 'video': video}
    
    return {'success': False, 'error': 'No new videos available. All videos have been sent.'}

def get_best_video_file(video):
    video_files = video.get('video_files', [])
    
    hd_files = [f for f in video_files if f.get('quality') == 'hd']
    if hd_files:
        hd_files.sort(key=lambda x: x.get('width', 0), reverse=True)
        return hd_files[0].get('link')
    
    if video_files:
        video_files.sort(key=lambda x: x.get('width', 0), reverse=True)
        return video_files[0].get('link')
    
    return None

def download_video(url, output_path):
    try:
        response = requests.get(url, stream=True, timeout=120)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return True
    except Exception as e:
        print(f"[Pexels] Download error: {e}")
        return False

def download_viral_audio():
    try:
        temp_dir = tempfile.gettempdir()
        audio_path = os.path.join(temp_dir, f"viral_audio_{random.randint(1000, 9999)}.mp3")
        
        song_url = random.choice(VIRAL_SONGS)
        
        cmd = [
            'yt-dlp', '-x', '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', audio_path.replace('.mp3', '.%(ext)s'),
            song_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        possible_paths = [
            audio_path,
            audio_path.replace('.mp3', '.mp3'),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                return path
        
        for f in os.listdir(temp_dir):
            if f.startswith('viral_audio_') and f.endswith('.mp3'):
                return os.path.join(temp_dir, f)
        
        return None
        
    except Exception as e:
        print(f"[Pexels] Audio download error: {e}")
        return None

def add_audio_to_video(video_path, audio_path, output_path):
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-i', audio_path,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-map', '0:v:0',
            '-map', '1:a:0',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return True
        
        print(f"[FFmpeg] Error: {result.stderr}")
        return False
        
    except Exception as e:
        print(f"[FFmpeg] Error: {e}")
        return False

def get_random_caption():
    return random.choice(FUNNY_CAPTIONS)

def process_korean_video():
    result = get_random_unsent_video()
    
    if not result.get('success'):
        return result
    
    video = result['video']
    video_id = str(video['id'])
    video_url = get_best_video_file(video)
    
    if not video_url:
        return {'success': False, 'error': 'No video URL found'}
    
    temp_dir = tempfile.gettempdir()
    video_path = os.path.join(temp_dir, f"korean_{video_id}.mp4")
    output_path = os.path.join(temp_dir, f"korean_final_{video_id}.mp4")
    
    print(f"[Pexels] Downloading video {video_id}...")
    if not download_video(video_url, video_path):
        return {'success': False, 'error': 'Failed to download video'}
    
    print("[Pexels] Downloading viral audio...")
    audio_path = download_viral_audio()
    
    if audio_path and os.path.exists(audio_path):
        print("[Pexels] Adding audio to video...")
        if add_audio_to_video(video_path, audio_path, output_path):
            final_path = output_path
        else:
            final_path = video_path
        
        try:
            os.unlink(audio_path)
        except:
            pass
    else:
        final_path = video_path
    
    caption = get_random_caption()
    user_info = video.get('user', {})
    photographer = user_info.get('name', 'Unknown')
    
    full_caption = (
        f"🇰🇷 <b>Korean Vibes</b>\n\n"
        f"{caption}\n\n"
        f"📸 Video by: {photographer} on Pexels\n"
        f"🎵 With viral music added\n\n"
        f"#Korea #Viral #Trending"
    )
    
    save_sent_video(video_id)
    
    return {
        'success': True,
        'video_path': final_path,
        'caption': full_caption,
        'video_id': video_id,
        'photographer': photographer,
        'cleanup_paths': [video_path, output_path]
    }

def cleanup_files(paths):
    for path in paths:
        try:
            if os.path.exists(path):
                os.unlink(path)
        except:
            pass
