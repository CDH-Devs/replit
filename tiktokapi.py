import requests
import re

def extract_video_url(video_data, full_response=None):
    if not video_data:
        return None
    
    if isinstance(video_data, str):
        return video_data
    
    if isinstance(video_data, list) and len(video_data) > 0:
        return extract_video_url(video_data[0], full_response)
    
    if isinstance(video_data, dict):
        for key in ['noWatermark', 'watermark', 'downloadAddr', 'playAddr', 
                    'downloadUrl', 'download', 'url', 'link', 'mp4', 'video']:
            if video_data.get(key):
                return video_data.get(key)
    
    return None

def extract_video_url_from_response(data):
    video_url = extract_video_url(data.get('video'))
    if video_url:
        return video_url
    
    if data.get('videoHD'):
        video_url = extract_video_url(data.get('videoHD'))
        if video_url:
            return video_url
    
    if data.get('videoSD'):
        video_url = extract_video_url(data.get('videoSD'))
        if video_url:
            return video_url
    
    if data.get('videoWatermark'):
        video_url = extract_video_url(data.get('videoWatermark'))
        if video_url:
            return video_url
    
    return None

def get_tiktok_video_tikwm(url):
    print(f"[TikTok API] Fetching video via TikWM: {url}")
    
    try:
        api_url = "https://www.tikwm.com/api/"
        response = requests.post(api_url, data={"url": url, "hd": 1}, timeout=30)
        result = response.json()
        
        if result.get('code') != 0 or not result.get('data'):
            print(f"[TikTok API] TikWM failed: {result.get('msg', 'Unknown error')}")
            return None
        
        data = result['data']
        
        video_url = data.get('hdplay') or data.get('play') or data.get('wmplay')
        
        if not video_url:
            print("[TikTok API] No video URL in TikWM response")
            return None
        
        author_data = data.get('author', {})
        music_data = data.get('music_info', {}) or data.get('music', {})
        
        return {
            'success': True,
            'type': 'image' if data.get('images') else 'video',
            'video_url': video_url,
            'video_hd': data.get('hdplay'),
            'video_sd': data.get('play'),
            'thumbnail': data.get('cover') or data.get('origin_cover'),
            'title': data.get('title', 'TikTok Video'),
            'author': author_data.get('nickname', 'Unknown') if isinstance(author_data, dict) else 'Unknown',
            'author_username': author_data.get('unique_id', '') if isinstance(author_data, dict) else '',
            'duration': data.get('duration', 0),
            'plays': data.get('play_count', 0),
            'likes': data.get('digg_count', 0),
            'comments': data.get('comment_count', 0),
            'shares': data.get('share_count', 0),
            'music': music_data.get('title') if isinstance(music_data, dict) else None,
            'music_author': music_data.get('author') if isinstance(music_data, dict) else None,
            'images': data.get('images')
        }
        
    except Exception as e:
        print(f"[TikTok API] TikWM error: {e}")
        return None

def get_tiktok_video_ttsave(url):
    print(f"[TikTok API] Fetching video via TTSave: {url}")
    
    try:
        api_url = f"https://ttsave.app/download?mode=video&key={url}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(api_url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            return None
        
        html = response.text
        
        no_wm_match = re.search(r'href="([^"]+)"[^>]*>.*?Without Watermark', html, re.DOTALL)
        if no_wm_match:
            video_url = no_wm_match.group(1)
            return {
                'success': True,
                'type': 'video',
                'video_url': video_url,
                'title': 'TikTok Video',
                'author': 'Unknown',
                'author_username': '',
                'duration': 0
            }
        
        return None
        
    except Exception as e:
        print(f"[TikTok API] TTSave error: {e}")
        return None

def download_tiktok_video(url):
    result = get_tiktok_video_tikwm(url)
    
    if result and result.get('success') and result.get('video_url'):
        return result
    
    print('[TikTok] TikWM failed, trying TTSave...')
    result = get_tiktok_video_ttsave(url)
    
    if result and result.get('success') and result.get('video_url'):
        return result
    
    return {
        'success': False,
        'error': 'Could not download TikTok video from any source'
    }
