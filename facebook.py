import re
import requests
import tempfile
import os
import time

def is_facebook_url(url):
    if not url:
        return False
    facebook_patterns = [
        r'facebook\.com',
        r'fb\.com',
        r'fb\.watch',
        r'm\.facebook\.com',
        r'www\.facebook\.com',
        r'web\.facebook\.com'
    ]
    return any(re.search(pattern, url, re.IGNORECASE) for pattern in facebook_patterns)

def is_facebook_profile_url(url):
    if not is_facebook_url(url):
        return False
    profile_patterns = [
        r'facebook\.com/(?!watch|videos|photo|reel|story|events|groups|pages|marketplace|gaming|live)([a-zA-Z0-9_.]+)/?$',
        r'facebook\.com/(?!watch|videos|photo|reel|story|events|groups|pages|marketplace|gaming|live)([a-zA-Z0-9_.]+)\?',
        r'facebook\.com/profile\.php\?id=(\d+)',
    ]
    return any(re.search(pattern, url, re.IGNORECASE) for pattern in profile_patterns)

def extract_facebook_username(url):
    if not url:
        return None
    
    url = url.rstrip('/')
    
    profile_id_match = re.search(r'facebook\.com/profile\.php\?id=(\d+)', url)
    if profile_id_match:
        return profile_id_match.group(1)
    
    username_match = re.search(r'facebook\.com/([a-zA-Z0-9_.]+)', url)
    if username_match:
        username = username_match.group(1)
        excluded = ['watch', 'videos', 'photo', 'reel', 'story', 'events', 'groups', 'pages', 'marketplace', 'gaming', 'live', 'stories', 'reels', 'share', 'p']
        if username.lower() not in excluded:
            return username
    
    return None

def get_facebook_photos(profile_url):
    print(f"[Facebook] Fetching photos for: {profile_url}")
    
    username = extract_facebook_username(profile_url)
    if not username:
        return {'success': False, 'error': 'Could not extract username from URL'}
    
    print(f"[Facebook] Extracted username: {username}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.fbprofileviewer.com/',
        'Origin': 'https://www.fbprofileviewer.com'
    }
    
    try:
        api_url = f'https://www.fbprofileviewer.com/api/profile?username={username}'
        print(f"[Facebook] Calling API: {api_url}")
        
        response = requests.get(api_url, headers=headers, timeout=30)
        
        if response.status_code == 429:
            return {'success': False, 'error': 'Rate limit exceeded. Please try again later.'}
        
        if response.status_code != 200:
            print(f"[Facebook] API returned status {response.status_code}")
            return {'success': False, 'error': f'API error (status {response.status_code})'}
        
        data = response.json()
        print(f"[Facebook] API response: {str(data)[:200]}")
        
        photos = {
            'profile_photo': data.get('profile_pic_url'),
            'cover_photo': data.get('cover_photo_url'),
            'username': data.get('name') or data.get('username') or username
        }
        
        if photos['profile_photo'] or photos['cover_photo']:
            print(f"[Facebook] Found profile: {photos['username']}, DP: {'Yes' if photos['profile_photo'] else 'No'}, Cover: {'Yes' if photos['cover_photo'] else 'No'}")
            return {'success': True, 'photos': photos}
        else:
            return {'success': False, 'error': 'No profile picture or cover photo found. The profile may be private.'}
            
    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'Request timed out'}
    except requests.exceptions.JSONDecodeError:
        print(f"[Facebook] Invalid JSON response")
        return {'success': False, 'error': 'Invalid response from server'}
    except Exception as e:
        print(f"[Facebook] Error fetching photos: {e}")
        return {'success': False, 'error': str(e)}

def download_photo_to_temp(photo_url, prefix="fb_photo"):
    if not photo_url:
        return None
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        response = requests.get(photo_url, headers=headers, timeout=30, stream=True)
        response.raise_for_status()
        
        content_type = response.headers.get('content-type', 'image/jpeg')
        ext = '.jpg'
        if 'png' in content_type:
            ext = '.png'
        elif 'webp' in content_type:
            ext = '.webp'
        
        temp_dir = tempfile.gettempdir()
        temp_file = os.path.join(temp_dir, f"{prefix}_{int(time.time())}{ext}")
        
        with open(temp_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"[Facebook] Downloaded photo to: {temp_file}")
        return temp_file
        
    except Exception as e:
        print(f"[Facebook] Failed to download photo: {e}")
        return None
