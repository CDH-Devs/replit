import requests
import re
import os
import tempfile
import time
from bs4 import BeautifulSoup
import json

LOCOLOADER_URL = 'https://www.locoloader.com/'

def scrape_locoloader(video_url, format_type='video'):
    """Scrape locoloader.com to get download links"""
    try:
        session = requests.Session()
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://www.locoloader.com/',
        }
        
        print(f"[Locoloader] Fetching main page...")
        main_page = session.get(LOCOLOADER_URL, headers=headers, timeout=30)
        
        extract_url = f'https://www.locoloader.com/extract/?url={requests.utils.quote(video_url)}'
        
        headers['Referer'] = LOCOLOADER_URL
        headers['X-Requested-With'] = 'XMLHttpRequest'
        
        print(f"[Locoloader] Extracting: {video_url}")
        response = session.get(extract_url, headers=headers, timeout=60)
        
        if response.status_code != 200:
            print(f"[Locoloader] Error: Status {response.status_code}")
            return {'success': False, 'error': f'Status {response.status_code}'}
        
        content = response.text
        
        try:
            data = response.json()
            print(f"[Locoloader] Got JSON response")
            return parse_json_response(data, format_type, session, headers)
        except json.JSONDecodeError:
            print(f"[Locoloader] Got HTML response, parsing...")
            return parse_html_response(content, format_type, session, headers)
            
    except requests.Timeout:
        return {'success': False, 'error': 'Request timed out'}
    except Exception as e:
        print(f"[Locoloader] Error: {e}")
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
            
            if any(x in href.lower() for x in ['.mp4', '.webm', '.mp3', '.m4a', 'download', 'video', 'audio']):
                download_links.append({
                    'url': href,
                    'text': text,
                    'is_audio': 'audio' in text or '.mp3' in href or '.m4a' in href
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
