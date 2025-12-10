import re
import requests
import tempfile
import os

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
    
    profile_id_match = re.search(r'facebook\.com/profile\.php\?id=(\d+)', url)
    if profile_id_match:
        return profile_id_match.group(1)
    
    username_match = re.search(r'facebook\.com/([a-zA-Z0-9_.]+)', url)
    if username_match:
        username = username_match.group(1)
        excluded = ['watch', 'videos', 'photo', 'reel', 'story', 'events', 'groups', 'pages', 'marketplace', 'gaming', 'live', 'stories', 'reels']
        if username.lower() not in excluded:
            return username
    
    return None

def get_facebook_photos(profile_url):
    print(f"[Facebook] Fetching photos for: {profile_url}")
    
    username = extract_facebook_username(profile_url)
    if not username:
        return {'success': False, 'error': 'Could not extract username from URL'}
    
    photos = {
        'profile_photo': None,
        'cover_photo': None,
        'username': username
    }
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    }
    
    try:
        if username.isdigit():
            page_url = f'https://www.facebook.com/profile.php?id={username}'
        else:
            page_url = f'https://www.facebook.com/{username}'
        
        print(f"[Facebook] Fetching page: {page_url}")
        response = requests.get(page_url, headers=headers, timeout=30, allow_redirects=True)
        html_content = response.text
        
        profile_patterns = [
            r'"profilePicLarge"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"',
            r'"profilePic"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"',
            r'<img[^>]*class="[^"]*profilePic[^"]*"[^>]*src="([^"]+)"',
            r'"profile_pic_url"\s*:\s*"([^"]+)"',
            r'<image[^>]*xlink:href="(https://[^"]*fbcdn[^"]*)"',
            r'"profile_picture_overlay_sample"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"',
            r'"photoUrl"\s*:\s*"([^"]+)"',
        ]
        
        for pattern in profile_patterns:
            match = re.search(pattern, html_content)
            if match:
                url = match.group(1).replace('\\u0025', '%').replace('\\/', '/').replace('\\u003C', '<').replace('\\u003E', '>')
                url = url.encode().decode('unicode_escape')
                if 'fbcdn' in url or 'scontent' in url:
                    photos['profile_photo'] = url
                    print(f"[Facebook] Found profile photo: {url[:100]}...")
                    break
        
        cover_patterns = [
            r'"coverPhoto"\s*:\s*\{\s*"photo"\s*:\s*\{\s*"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"',
            r'"cover_photo"\s*:\s*\{\s*"photo"\s*:\s*\{\s*"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"',
            r'"coverPhotoMedia"\s*:\s*\{[^}]*"photoUrl"\s*:\s*"([^"]+)"',
            r'<img[^>]*id="[^"]*cover[^"]*"[^>]*src="([^"]+)"',
            r'"cover"\s*:\s*\{\s*"source"\s*:\s*"([^"]+)"',
            r'"cover_photo_image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"',
        ]
        
        for pattern in cover_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                url = match.group(1).replace('\\u0025', '%').replace('\\/', '/').replace('\\u003C', '<').replace('\\u003E', '>')
                url = url.encode().decode('unicode_escape')
                if 'fbcdn' in url or 'scontent' in url:
                    photos['cover_photo'] = url
                    print(f"[Facebook] Found cover photo: {url[:100]}...")
                    break
        
        if not photos['profile_photo'] and not photos['cover_photo']:
            graph_url = f"https://graph.facebook.com/{username}/picture?type=large&redirect=false"
            try:
                graph_response = requests.get(graph_url, timeout=10)
                graph_data = graph_response.json()
                if graph_data.get('data', {}).get('url'):
                    photos['profile_photo'] = graph_data['data']['url']
                    print(f"[Facebook] Found profile via Graph API")
            except:
                pass
        
        if photos['profile_photo'] or photos['cover_photo']:
            return {'success': True, 'photos': photos}
        else:
            return {'success': False, 'error': 'Could not find profile or cover photos. The account may be private or the page structure has changed.'}
            
    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'Request timed out'}
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
        temp_file = os.path.join(temp_dir, f"{prefix}_{int(__import__('time').time())}{ext}")
        
        with open(temp_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"[Facebook] Downloaded photo to: {temp_file}")
        return temp_file
        
    except Exception as e:
        print(f"[Facebook] Failed to download photo: {e}")
        return None
