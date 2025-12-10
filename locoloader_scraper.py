import requests
import re
import os
import tempfile
import time
import subprocess
from urllib.parse import quote, urlencode
from bs4 import BeautifulSoup
import json

def scrape_locoloader(video_url, format_type='video'):
    """Try multiple scrapers to download video"""
    
    result = try_tubeoffline(video_url, format_type)
    if result.get('success'):
        return result
    
    result = try_direct_scrape(video_url, format_type)
    if result.get('success'):
        return result
    
    return {'success': False, 'error': 'All download methods failed'}

def try_tubeoffline(video_url, format_type):
    """Try tubeoffline.com scraper"""
    try:
        session = requests.Session()
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
        }
        
        print(f"[TubeOffline] Trying to download: {video_url}")
        
        api_url = 'https://www.tubeoffline.com/getvideoinfo.php'
        form_data = {'url': video_url}
        
        headers['Referer'] = 'https://www.tubeoffline.com/'
        headers['Origin'] = 'https://www.tubeoffline.com'
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        
        response = session.post(api_url, data=form_data, headers=headers, timeout=60)
        
        print(f"[TubeOffline] Response status: {response.status_code}")
        
        if response.status_code != 200:
            return {'success': False, 'error': f'TubeOffline status {response.status_code}'}
        
        content = response.text
        
        video_urls = re.findall(r'(https?://[^\s"\'<>]+\.(?:mp4|webm|m4v)[^\s"\'<>]*)', content)
        
        if video_urls:
            download_url = video_urls[0]
            print(f"[TubeOffline] Found video URL: {download_url[:80]}...")
            return download_file_from_url(download_url, format_type, session, headers)
        
        return {'success': False, 'error': 'No video URL found in TubeOffline response'}
        
    except Exception as e:
        print(f"[TubeOffline] Error: {e}")
        return {'success': False, 'error': str(e)}

def try_direct_scrape(video_url, format_type):
    """Try to scrape video URL directly from the page"""
    try:
        session = requests.Session()
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
        }
        
        print(f"[DirectScrape] Fetching page: {video_url}")
        response = session.get(video_url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            return {'success': False, 'error': f'Page fetch failed: {response.status_code}'}
        
        content = response.text
        
        direct_mp4_patterns = [
            r'"contentUrl"\s*:\s*"([^"]+\.mp4)"',
            r'"videoUrl"\s*:\s*"([^"]+\.mp4)"',
            r'source\s+src="([^"]+\.mp4)"',
            r'<source[^>]+src="([^"]+\.mp4)"',
            r'file:\s*["\']([^"\']+\.mp4)["\']',
            r'(https?://[^\s"\'<>\\]+\.mp4)(?:[?\s"\'<>]|$)',
        ]
        
        for pattern in direct_mp4_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                video_file_url = matches[0]
                video_file_url = video_file_url.replace('\\/', '/').replace('\\', '')
                if video_file_url.startswith('//'):
                    video_file_url = 'https:' + video_file_url
                if '.m3u8' not in video_file_url:
                    print(f"[DirectScrape] Found direct MP4: {video_file_url[:80]}...")
                    headers['Referer'] = video_url
                    return download_file_from_url(video_file_url, format_type, session, headers)
        
        m3u8_patterns = [
            r'(https?://[^\s"\'<>\\]+\.m3u8[^\s"\'<>\\]*)',
            r'"([^"]+\.m3u8[^"]*)"',
        ]
        
        for pattern in m3u8_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                m3u8_url = matches[0]
                m3u8_url = m3u8_url.replace('\\/', '/').replace('\\', '')
                if m3u8_url.startswith('//'):
                    m3u8_url = 'https:' + m3u8_url
                print(f"[DirectScrape] Found m3u8 stream: {m3u8_url[:80]}...")
                return download_m3u8_stream(m3u8_url, video_url, format_type)
        
        return {'success': False, 'error': 'No video URL found in page'}
        
    except Exception as e:
        print(f"[DirectScrape] Error: {e}")
        return {'success': False, 'error': str(e)}

def download_m3u8_stream(m3u8_url, referer_url, format_type):
    """Download m3u8 stream using ffmpeg"""
    try:
        
        temp_dir = tempfile.gettempdir()
        ext = '.mp4' if format_type == 'video' else '.mp3'
        output_path = os.path.join(temp_dir, f"stream_{int(time.time())}{ext}")
        
        print(f"[M3U8] Downloading stream with ffmpeg...")
        
        cmd = [
            'ffmpeg', '-y',
            '-headers', f'Referer: {referer_url}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n',
            '-i', m3u8_url,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
            print(f"[M3U8] Download complete: {output_path} ({os.path.getsize(output_path)} bytes)")
            return {'success': True, 'path': output_path, 'type': format_type}
        else:
            print(f"[M3U8] ffmpeg error: {result.stderr[:500] if result.stderr else 'Unknown error'}")
            return {'success': False, 'error': 'Stream download failed'}
            
    except subprocess.TimeoutExpired:
        return {'success': False, 'error': 'Stream download timed out'}
    except Exception as e:
        print(f"[M3U8] Error: {e}")
        return {'success': False, 'error': str(e)}


def parse_json_response(data, format_type, session, headers):
    """Parse JSON response from locoloader"""
    try:
        if isinstance(data, dict):
            if data.get('error'):
                return {'success': False, 'error': data.get('error')}
            
            download_url = None
            
            if 'url' in data:
                download_url = data['url']
            elif 'download' in data:
                download_url = data['download']
            elif 'video' in data:
                download_url = data['video']
            elif 'formats' in data:
                formats = data['formats']
                if isinstance(formats, list) and formats:
                    if format_type == 'audio':
                        for f in formats:
                            if 'audio' in str(f.get('type', '')).lower():
                                download_url = f.get('url')
                                break
                    if not download_url:
                        download_url = formats[0].get('url')
            
            if download_url:
                return download_file_from_url(download_url, format_type, session, headers)
        
        return {'success': False, 'error': 'Could not parse JSON response'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def parse_html_response(html, format_type, session, headers):
    """Parse HTML response from locoloader"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        download_links = []
        
        for a in soup.find_all('a', href=True):
            href = a['href']
            text = a.get_text().lower()
            
            if any(x in str(href).lower() for x in ['.mp4', '.webm', '.mp3', '.m4a', 'download', 'video', 'audio']):
                download_links.append({
                    'url': href,
                    'text': text,
                    'is_audio': 'audio' in text or '.mp3' in str(href) or '.m4a' in str(href)
                })
        
        for video in soup.find_all('video'):
            src = video.get('src')
            if src:
                download_links.append({'url': src, 'text': 'video', 'is_audio': False})
            for source in video.find_all('source'):
                src = source.get('src')
                if src:
                    download_links.append({'url': src, 'text': 'video', 'is_audio': False})
        
        video_match = re.search(r'(https?://[^\s"\'<>]+\.(?:mp4|webm|m4a|mp3))', html)
        if video_match:
            download_links.append({'url': video_match.group(1), 'text': 'direct', 'is_audio': '.mp3' in video_match.group(1) or '.m4a' in video_match.group(1)})
        
        if not download_links:
            return {'success': False, 'error': 'No download links found'}
        
        selected_link = None
        if format_type == 'audio':
            for link in download_links:
                if link['is_audio']:
                    selected_link = link['url']
                    break
        
        if not selected_link:
            selected_link = download_links[0]['url']
        
        if not selected_link.startswith('http'):
            selected_link = 'https://www.locoloader.com' + selected_link
        
        return download_file_from_url(selected_link, format_type, session, headers)
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def download_file_from_url(url, format_type, session, headers):
    """Download file from URL"""
    try:
        temp_dir = tempfile.gettempdir()
        ext = '.mp4' if format_type == 'video' else '.mp3'
        output_path = os.path.join(temp_dir, f"locoloader_{int(time.time())}{ext}")
        
        print(f"[Locoloader] Downloading from: {url[:100]}...")
        
        download_headers = headers.copy()
        download_headers['Accept'] = '*/*'
        
        response = session.get(url, headers=download_headers, stream=True, timeout=300)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            print(f"[Locoloader] Download complete: {output_path} ({os.path.getsize(output_path)} bytes)")
            return {'success': True, 'path': output_path, 'type': format_type}
        else:
            if os.path.exists(output_path):
                os.unlink(output_path)
            return {'success': False, 'error': 'Downloaded file too small or empty'}
            
    except Exception as e:
        print(f"[Locoloader] Download error: {e}")
        return {'success': False, 'error': str(e)}
