import subprocess
import tempfile
import os
import json
import re
import time
import requests
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from functools import lru_cache
from locoloader_scraper import scrape_locoloader, try_direct_scrape

SUPPORTED_PLATFORMS = [
    'youtube', 'instagram', 'twitter', 'tiktok', 'facebook', 
    'vimeo', 'dailymotion', 'reddit', 'twitch', 'soundcloud',
    'spotify', 'bandcamp', 'mixcloud', 'bilibili', 'pornhub', 'xhamster', 'xhamster2'
]

SESSION_POOL = requests.Session()
SESSION_POOL.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

MEDIA_INFO_CACHE = {}
CACHE_TTL = 300

EXECUTOR = ThreadPoolExecutor(max_workers=4)

def detect_platform(url):
    """Detect the platform from URL"""
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'instagram.com' in url_lower:
        return 'instagram'
    elif 'xhamster.com' in url_lower or 'xhamster2.com' in url_lower:
        return 'xhamster'
    elif 'twitter.com' in url_lower or 'x.com' in url_lower:
        return 'twitter'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    elif 'facebook.com' in url_lower or 'fb.watch' in url_lower or 'fb.com' in url_lower:
        return 'facebook'
    elif 'vimeo.com' in url_lower:
        return 'vimeo'
    elif 'dailymotion.com' in url_lower:
        return 'dailymotion'
    elif 'reddit.com' in url_lower or 'redd.it' in url_lower:
        return 'reddit'
    elif 'twitch.tv' in url_lower:
        return 'twitch'
    elif 'soundcloud.com' in url_lower:
        return 'soundcloud'
    elif 'spotify.com' in url_lower:
        return 'spotify'
    elif 'bandcamp.com' in url_lower:
        return 'bandcamp'
    elif 'bilibili.com' in url_lower or 'b23.tv' in url_lower:
        return 'bilibili'
    elif 'pornhub.com' in url_lower:
        return 'pornhub'
    return 'unknown'

def get_cached_info(url):
    """Get cached media info if available and not expired"""
    if url in MEDIA_INFO_CACHE:
        cached = MEDIA_INFO_CACHE[url]
        if time.time() - cached['timestamp'] < CACHE_TTL:
            return cached['data']
    return None

def cache_info(url, data):
    """Cache media info with timestamp"""
    MEDIA_INFO_CACHE[url] = {'data': data, 'timestamp': time.time()}

def get_media_info(url):
    """Get media information using yt-dlp with caching"""
    cached = get_cached_info(url)
    if cached:
        print(f"[Downloader] Using cached info for: {url[:50]}...")
        return cached
    
    try:
        cmd = ['yt-dlp', '-j', '--no-playlist', '--socket-timeout', '15', url]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            return {'success': False, 'error': result.stderr or 'Failed to fetch info'}
        
        info = json.loads(result.stdout)
        
        formats = info.get('formats', [])
        available_formats = []
        
        video_formats = {}
        audio_formats = {}
        
        for f in formats:
            format_id = f.get('format_id', '')
            ext = f.get('ext', '')
            height = f.get('height')
            filesize = f.get('filesize') or f.get('filesize_approx') or 0
            vcodec = f.get('vcodec', 'none')
            acodec = f.get('acodec', 'none')
            
            if vcodec != 'none' and height:
                quality_label = f"{height}p"
                if quality_label not in video_formats or filesize > video_formats[quality_label].get('filesize', 0):
                    video_formats[quality_label] = {
                        'format_id': format_id,
                        'ext': ext,
                        'height': height,
                        'filesize': filesize,
                        'type': 'video'
                    }
            
            if acodec != 'none' and vcodec == 'none':
                abr = f.get('abr') or f.get('tbr') or 0
                quality_label = f"{int(abr)}kbps" if abr else 'audio'
                if quality_label not in audio_formats or filesize > audio_formats[quality_label].get('filesize', 0):
                    audio_formats[quality_label] = {
                        'format_id': format_id,
                        'ext': ext,
                        'abr': abr,
                        'filesize': filesize,
                        'type': 'audio'
                    }
        
        sorted_videos = sorted(video_formats.items(), key=lambda x: x[1].get('height', 0), reverse=True)
        sorted_audios = sorted(audio_formats.items(), key=lambda x: x[1].get('abr', 0), reverse=True)
        
        result = {
            'success': True,
            'title': info.get('title', 'Unknown'),
            'duration': info.get('duration'),
            'thumbnail': info.get('thumbnail'),
            'uploader': info.get('uploader', 'Unknown'),
            'view_count': info.get('view_count'),
            'platform': detect_platform(url),
            'video_formats': dict(sorted_videos[:5]),
            'audio_formats': dict(sorted_audios[:3]),
            'url': url
        }
        cache_info(url, result)
        return result
        
    except subprocess.TimeoutExpired:
        return {'success': False, 'error': 'Request timed out'}
    except json.JSONDecodeError:
        return {'success': False, 'error': 'Failed to parse response'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_youtube_quality_options(url):
    """Get simplified quality options for YouTube (user mode)"""
    try:
        cmd = ['yt-dlp', '-j', '--no-playlist', url]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            return {'success': False, 'error': result.stderr or 'Failed to fetch info'}
        
        info = json.loads(result.stdout)
        
        options = []
        
        options.append({
            'id': 'video_best',
            'label': '🎬 Best Video Quality',
            'type': 'video',
            'format_code': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        })
        
        options.append({
            'id': 'video_720',
            'label': '🎬 720p Video',
            'type': 'video',
            'format_code': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best'
        })
        
        options.append({
            'id': 'audio_best',
            'label': '🎵 Best Audio (MP3)',
            'type': 'audio',
            'format_code': 'bestaudio'
        })
        
        return {
            'success': True,
            'title': info.get('title', 'Unknown'),
            'thumbnail': info.get('thumbnail'),
            'duration': info.get('duration'),
            'uploader': info.get('uploader', 'Unknown'),
            'options': options,
            'url': url
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def download_with_ytdlp(url, format_type, quality, output_template):
    """Download using yt-dlp (for ThreadPoolExecutor)"""
    import glob as glob_module
    
    common_opts = [
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        '--referer', url,
        '--no-check-certificates',
        '--geo-bypass',
        '--no-playlist',
        '--socket-timeout', '30',
        '--retries', '5',
        '--fragment-retries', '5',
        '--concurrent-fragments', '4',
        '--buffer-size', '32K',
        '--extractor-retries', '3',
        '--no-warnings',
        '--prefer-free-formats',
        '--ignore-errors',
    ]
    
    if format_type == 'audio':
        cmd = [
            'yt-dlp', '-x', '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', f"{output_template}.%(ext)s",
        ] + common_opts + [url]
    else:
        if quality == '720':
            format_str = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best'
        elif quality == '480':
            format_str = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best'
        elif quality == '360':
            format_str = 'bestvideo[height<=360]+bestaudio/best[height<=360]/best'
        else:
            format_str = 'bestvideo+bestaudio/best'
        
        cmd = [
            'yt-dlp', '-f', format_str,
            '--merge-output-format', 'mp4',
            '-o', f"{output_template}.%(ext)s",
        ] + common_opts + [url]
    
    print(f"[yt-dlp] Running: {' '.join(cmd[:10])}...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    
    possible_files = glob_module.glob(f"{output_template}.*")
    
    if format_type == 'audio':
        for path in possible_files:
            if path.endswith(('.mp3', '.m4a', '.opus', '.webm', '.ogg')):
                return {'success': True, 'path': path, 'type': 'audio'}
    else:
        for path in possible_files:
            if path.endswith(('.mp4', '.mkv', '.webm', '.avi')):
                return {'success': True, 'path': path, 'type': 'video'}
    
    if possible_files:
        return {'success': True, 'path': possible_files[0], 'type': format_type}
    
    return {'success': False, 'error': result.stderr or 'yt-dlp download failed'}

def download_media(url, format_type='video', quality='best'):
    """Download media using yt-dlp with DirectScrape fallback"""
    try:
        temp_dir = tempfile.gettempdir()
        timestamp = int(time.time() * 1000)
        output_template = os.path.join(temp_dir, f"download_{timestamp}")
        
        print(f"[Downloader] Starting download for: {url}")
        print(f"[Downloader] Format: {format_type}, Quality: {quality}")
        
        try:
            future = EXECUTOR.submit(download_with_ytdlp, url, format_type, quality, output_template)
            result = future.result(timeout=300)
            
            if result.get('success'):
                print(f"[Downloader] yt-dlp success: {result.get('path')}")
                return result
            else:
                print(f"[Downloader] yt-dlp returned error: {result.get('error')}")
        except FuturesTimeoutError:
            print(f"[Downloader] yt-dlp timed out after 300s")
        except Exception as e:
            print(f"[Downloader] yt-dlp exception: {type(e).__name__}: {e}")
        
        platform = detect_platform(url)
        if platform not in ['youtube']:
            print(f"[Downloader] Trying DirectScrape fallback for {platform}...")
            direct_result = try_direct_scrape(url, format_type)
            if direct_result.get('success'):
                print(f"[Downloader] DirectScrape success: {direct_result.get('path')}")
                return direct_result
            
            print(f"[Downloader] Trying locoloader scraper fallback...")
            scraper_result = scrape_locoloader(url, format_type)
            if scraper_result.get('success'):
                print(f"[Downloader] Scraper success: {scraper_result.get('path')}")
                return scraper_result
        
        return {'success': False, 'error': 'Download failed - please try again later'}
        
    except Exception as e:
        print(f"[Downloader] Error: {e}")
        return {'success': False, 'error': str(e)}

def format_duration(seconds):
    """Format duration in seconds to MM:SS or HH:MM:SS"""
    if not seconds:
        return "Unknown"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def format_views(count):
    """Format view count"""
    if not count:
        return "N/A"
    if count >= 1000000:
        return f"{count/1000000:.1f}M"
    if count >= 1000:
        return f"{count/1000:.1f}K"
    return str(count)

def is_supported_url(url):
    """Check if URL is from a supported platform"""
    platform = detect_platform(url)
    return platform != 'unknown'
