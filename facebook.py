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
    
    # Share links are treated as profile URLs - they will be resolved later
    if '/share/' in url:
        return True
    
    profile_patterns = [
        r'facebook\.com/(?!watch|videos|photo|reel|story|events|groups|pages|marketplace|gaming|live)([a-zA-Z0-9_.]+)/?$',
        r'facebook\.com/(?!watch|videos|photo|reel|story|events|groups|pages|marketplace|gaming|live)([a-zA-Z0-9_.]+)\?',
        r'facebook\.com/profile\.php\?id=(\d+)',
    ]
    return any(re.search(pattern, url, re.IGNORECASE) for pattern in profile_patterns)

def resolve_facebook_share_url(url):
    """Resolve Facebook share URLs to get the actual destination URL"""
    if not url or '/share/' not in url:
        return url
    
    try:
        import subprocess
        # Use curl to follow redirects and get the final URL
        result = subprocess.run(
            ['curl', '-sI', '-L', '-o', '/dev/null', '-w', '%{url_effective}', url],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and result.stdout:
            resolved = result.stdout.strip()
            if resolved and resolved != url:
                print(f"[Facebook] Resolved share URL: {url} -> {resolved}")
                return resolved
    except Exception as e:
        print(f"[Facebook] curl method failed: {e}")
    
    # Fallback to requests
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, allow_redirects=False, timeout=10)
        print(f"[Facebook] Request status: {response.status_code}")
        
        if response.status_code in [301, 302, 303, 307, 308]:
            location = response.headers.get('Location', '')
            if location:
                print(f"[Facebook] Resolved share URL: {url} -> {location}")
                return location
        
        response = requests.get(url, headers=headers, allow_redirects=True, timeout=10)
        print(f"[Facebook] Resolved share URL (final): {url} -> {response.url}")
        return response.url
    except Exception as e:
        print(f"[Facebook] Failed to resolve share URL: {e}")
        return url

def extract_facebook_username(url):
    if not url:
        return None
    
    # Resolve share URLs first
    if '/share/' in url:
        url = resolve_facebook_share_url(url)
    
    url = url.rstrip('/')
    
    # Handle profile.php?id= format
    profile_id_match = re.search(r'facebook\.com/profile\.php\?id=(\d+)', url)
    if profile_id_match:
        return profile_id_match.group(1)
    
    # Handle /people/Name/ format - extract the name (prioritize name over pfbid)
    people_name_match = re.search(r'facebook\.com/people/([^/]+)', url)
    if people_name_match:
        name = people_name_match.group(1)
        # URL decode the name (replace - with space, handle %20, etc)
        name = name.replace('-', ' ')
        print(f"[Facebook] Extracted name from people URL: {name}")
        return name
    
    username_match = re.search(r'facebook\.com/([a-zA-Z0-9_.]+)', url)
    if username_match:
        username = username_match.group(1)
        excluded = ['watch', 'videos', 'photo', 'reel', 'story', 'events', 'groups', 'pages', 'marketplace', 'gaming', 'live', 'stories', 'reels', 'share', 'p', 'people']
        if username.lower() not in excluded:
            return username
    
    return None

def get_facebook_photos(profile_url):
    print(f"[Facebook] Fetching photos for: {profile_url}")
    
    # Resolve share URLs first
    resolved_url = profile_url
    if '/share/' in profile_url:
        resolved_url = resolve_facebook_share_url(profile_url)
        print(f"[Facebook] Using resolved URL: {resolved_url}")
    
    username = extract_facebook_username(profile_url)
    if not username:
        return {'success': False, 'error': 'Could not extract username from URL'}
    
    print(f"[Facebook] Extracted username: {username}")
    
    # Check if this is a /people/ URL - these don't have regular usernames
    is_people_url = '/people/' in resolved_url
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.fbprofileviewer.com/',
        'Origin': 'https://www.fbprofileviewer.com'
    }
    
    # For /people/ URLs, try to extract pfbid and use it
    if is_people_url:
        pfbid_match = re.search(r'/(pfbid[a-zA-Z0-9]+)', resolved_url)
        if pfbid_match:
            pfbid = pfbid_match.group(1)
            print(f"[Facebook] Trying with pfbid: {pfbid}")
            # Try fbprofileviewer API with pfbid first
            try:
                api_url = f'https://www.fbprofileviewer.com/api/profile?username={pfbid}'
                print(f"[Facebook] Calling API with pfbid: {api_url}")
                response = requests.get(api_url, headers=headers, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('profile_pic_url') or data.get('cover_photo_url'):
                        photos = {
                            'profile_photo': data.get('profile_pic_url'),
                            'cover_photo': data.get('cover_photo_url'),
                            'username': data.get('name') or username
                        }
                        print(f"[Facebook] Found profile via pfbid: {photos['username']}")
                        return {'success': True, 'photos': photos}
            except Exception as e:
                print(f"[Facebook] pfbid API attempt failed: {e}")
    
    # Standard API call with username
    try:
        import time as time_module
        
        # Add small delay to avoid rate limiting
        time_module.sleep(1)
        
        api_url = f'https://www.fbprofileviewer.com/api/profile?username={username}'
        print(f"[Facebook] Calling API: {api_url}")
        
        response = requests.get(api_url, headers=headers, timeout=30)
        
        if response.status_code == 429:
            # Rate limited - wait and retry once
            print("[Facebook] Rate limited, waiting 5 seconds...")
            time_module.sleep(5)
            response = requests.get(api_url, headers=headers, timeout=30)
            if response.status_code == 429:
                return {'success': False, 'error': 'Rate limit exceeded. Please try again in a few minutes.'}
        
        if response.status_code != 200:
            print(f"[Facebook] API returned status {response.status_code}")
            return {'success': False, 'error': f'API error (status {response.status_code})'}
        
        data = response.json()
        print(f"[Facebook] API response: {str(data)[:200]}")
        
        # Check for rate limit in JSON response
        if data.get('error') and 'too many' in data.get('error', '').lower():
            return {'success': False, 'error': 'Rate limit exceeded. Please try again in a few minutes.'}
        
        photos = {
            'profile_photo': data.get('profile_pic_url'),
            'cover_photo': data.get('cover_photo_url'),
            'username': data.get('name') or data.get('username') or username
        }
        
        if photos['profile_photo'] or photos['cover_photo']:
            print(f"[Facebook] Found profile: {photos['username']}, DP: {'Yes' if photos['profile_photo'] else 'No'}, Cover: {'Yes' if photos['cover_photo'] else 'No'}")
            return {'success': True, 'photos': photos}
        else:
            return {'success': False, 'error': 'No profile picture or cover photo found. The profile may be private or does not have a Facebook username.'}
            
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
