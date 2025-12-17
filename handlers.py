import re
import os
import time
import tempfile
import requests
from duckduckgo_search import DDGS
from platform_search import search_platform, is_adult_platform, ADULT_PLATFORMS

PLATFORM_PATTERNS = {
    'facebook': [r'facebook\s+video', r'fb\s+video', r'facebook', r'fb\s+'],
    'pornhub': [r'pornhub\s+video', r'pornhub', r'ph\s+video', r'porn\s+hub'],
    'xhamster': [r'xhamster\s+video', r'xhamster', r'x\s*hamster'],
    'xvideos': [r'xvideos\s+video', r'xvideos', r'x\s*videos'],
    'xnxx': [r'xnxx\s+video', r'xnxx'],
    'redtube': [r'redtube\s+video', r'redtube', r'red\s*tube'],
    'youporn': [r'youporn\s+video', r'youporn', r'you\s*porn'],
    'spankbang': [r'spankbang\s+video', r'spankbang', r'spank\s*bang'],
    'tnaflix': [r'tnaflix\s+video', r'tnaflix'],
    'beeg': [r'beeg\s+video', r'beeg'],
    'eporner': [r'eporner\s+video', r'eporner'],
    'motherless': [r'motherless\s+video', r'motherless'],
    'youtube': [r'youtube\s+video', r'yt\s+video', r'youtube'],
    'tiktok': [r'tiktok\s+video', r'tiktok', r'tt\s+video'],
    'instagram': [r'instagram\s+video', r'insta\s+video', r'instagram', r'ig\s+'],
    'twitter': [r'twitter\s+video', r'x\s+video', r'twitter', r'tweet'],
    'reddit': [r'reddit\s+video', r'reddit'],
    'vimeo': [r'vimeo\s+video', r'vimeo'],
    'dailymotion': [r'dailymotion\s+video', r'dailymotion'],
    'twitch': [r'twitch\s+video', r'twitch', r'twitch\s+stream'],
    'kick': [r'kick\s+video', r'kick\s+stream', r'kick'],
    'soundcloud': [r'soundcloud\s+', r'soundcloud'],
    'spotify': [r'spotify\s+', r'spotify'],
    'snackvideo': [r'snackvideo', r'snack\s*video'],
    'likee': [r'likee\s+video', r'likee'],
    'triller': [r'triller\s+video', r'triller'],
}

INTENT_PATTERNS = {
    'download_video': [
        r'download\s+(?:a\s+)?video',
        r'get\s+(?:me\s+)?(?:a\s+)?video',
        r'find\s+(?:me\s+)?(?:a\s+)?video',
        r'video\s+(?:of|about|for)',
        r'(?:need|want)\s+(?:a\s+)?video',
        r'search\s+video',
        r'show\s+(?:me\s+)?video',
    ],
    'download_audio': [
        r'download\s+(?:a\s+)?(?:song|audio|music|mp3)',
        r'get\s+(?:me\s+)?(?:a\s+)?(?:song|audio|music)',
        r'find\s+(?:me\s+)?(?:a\s+)?(?:song|audio|music)',
        r'play\s+(?:a\s+)?(?:song|music)',
        r'(?:need|want)\s+(?:a\s+)?(?:song|audio|music)',
        r'music\s+(?:of|by|from)',
    ],
    'search_photo': [
        r'(?:search|find|get|show)\s+(?:me\s+)?(?:a\s+)?(?:photo|image|picture|pic)',
        r'(?:photo|image|picture|pic)\s+(?:of|about|for)',
        r'(?:need|want)\s+(?:a\s+)?(?:photo|image|picture)',
        r'show\s+(?:me\s+)?(?:photo|image|picture)',
    ],
    'search_news': [
        r'(?:latest|recent|new|today|to\s*day)\s+(?:\w+\s+)?news',
        r'news\s+(?:about|on|for|today)',
        r'what\'?s\s+happening',
        r'current\s+events',
        r'breaking\s+news',
        r'(?:sri\s*lanka|sinhala|tamil)\s+news',
    ],
    'search_web': [
        r'search\s+(?:for|about)?',
        r'(?:what|who|where|when|why|how)\s+(?:is|are|was|were|do|does|did)',
        r'tell\s+me\s+about',
        r'find\s+(?:me\s+)?(?:info|information)',
        r'look\s+up',
    ],
    'create_link': [
        r'create\s+(?:a\s+)?link',
        r'make\s+(?:a\s+)?link',
        r'generate\s+(?:a\s+)?link',
        r'shorten\s+(?:this\s+)?(?:url|link)',
    ],
}

def detect_platform(text):
    text_lower = text.lower().strip()
    for platform, patterns in PLATFORM_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return platform
    return None

def detect_intent(text):
    text_lower = text.lower().strip()
    
    platform = detect_platform(text_lower)
    if platform:
        query = extract_platform_query(text_lower, platform)
        return {
            'intent': 'platform_video_search',
            'platform': platform,
            'query': query,
            'confidence': 0.9
        }
    
    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                query = extract_query(text_lower, pattern)
                return {'intent': intent, 'query': query, 'confidence': 0.8}
    
    if any(word in text_lower for word in ['video', 'youtube', 'watch', 'clip']):
        return {'intent': 'download_video', 'query': text, 'confidence': 0.6}
    if any(word in text_lower for word in ['song', 'music', 'audio', 'mp3']):
        return {'intent': 'download_audio', 'query': text, 'confidence': 0.6}
    if any(word in text_lower for word in ['photo', 'image', 'picture', 'pic']):
        return {'intent': 'search_photo', 'query': text, 'confidence': 0.6}
    if any(word in text_lower for word in ['news', 'happening', 'today']):
        return {'intent': 'search_news', 'query': text, 'confidence': 0.6}
    
    return {'intent': 'search_web', 'query': text, 'confidence': 0.5}

def extract_platform_query(text, platform):
    for pattern in PLATFORM_PATTERNS.get(platform, []):
        text = re.sub(pattern, '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'^(for|about|of|a|an|the|me|video|videos)\s+', '', text).strip()
    text = re.sub(r'\s+(video|videos)$', '', text).strip()
    return text if text else platform

def extract_query(text, matched_pattern):
    cleaned = re.sub(matched_pattern, '', text, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'^(for|about|of|a|an|the|me)\s+', '', cleaned).strip()
    return cleaned if cleaned else text

def search_web(query, max_results=5):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            return {
                'success': True,
                'results': results,
                'query': query
            }
    except Exception as e:
        return {'success': False, 'error': str(e), 'query': query}

def search_images(query, max_results=5):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.images(query, max_results=max_results))
            return {
                'success': True,
                'images': results,
                'query': query
            }
    except Exception as e:
        return {'success': False, 'error': str(e), 'query': query}

def search_videos(query, max_results=10):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.videos(query, max_results=max_results))
            return {
                'success': True,
                'videos': results,
                'query': query
            }
    except Exception as e:
        return {'success': False, 'error': str(e), 'query': query}

def search_platform_videos(platform, query, max_results=10):
    if is_adult_platform(platform):
        print(f"[AI Handler] Using platform-specific search for {platform}")
        return search_platform(platform, query, max_results)
    
    site_map = {
        'facebook': 'site:facebook.com video',
        'youtube': 'site:youtube.com',
        'tiktok': 'site:tiktok.com',
        'instagram': 'site:instagram.com',
        'twitter': 'site:twitter.com OR site:x.com',
        'reddit': 'site:reddit.com video',
        'vimeo': 'site:vimeo.com',
        'dailymotion': 'site:dailymotion.com',
        'twitch': 'site:twitch.tv',
        'kick': 'site:kick.com',
        'soundcloud': 'site:soundcloud.com',
        'spotify': 'site:spotify.com',
        'snackvideo': 'site:snackvideo.com',
        'likee': 'site:likee.video',
        'triller': 'site:triller.co',
    }
    
    site_filter = site_map.get(platform, '')
    full_query = f"{query} {site_filter}".strip()
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.videos(full_query, max_results=max_results))
            
            if results:
                return {
                    'success': True,
                    'videos': results,
                    'query': query,
                    'platform': platform
                }
            
            results = list(ddgs.videos(query, max_results=max_results))
            return {
                'success': True,
                'videos': results,
                'query': query,
                'platform': platform
            }
    except Exception as e:
        return {'success': False, 'error': str(e), 'query': query, 'platform': platform}

def search_news(query, max_results=10):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.news(query, max_results=max_results))
            return {
                'success': True,
                'news': results,
                'query': query
            }
    except Exception as e:
        return {'success': False, 'error': str(e), 'query': query}

def download_image(url, prefix="img"):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30, stream=True)
        response.raise_for_status()
        
        ext = '.jpg'
        content_type = response.headers.get('content-type', '')
        if 'png' in content_type:
            ext = '.png'
        elif 'gif' in content_type:
            ext = '.gif'
        elif 'webp' in content_type:
            ext = '.webp'
        
        temp_file = os.path.join(tempfile.gettempdir(), f"{prefix}_{int(time.time())}{ext}")
        with open(temp_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return temp_file
    except Exception as e:
        print(f"[AI Handler] Failed to download image: {e}")
        return None

def format_web_results(results):
    if not results.get('success') or not results.get('results'):
        return "No results found."
    
    formatted = []
    for i, r in enumerate(results['results'][:5], 1):
        title = r.get('title', 'No title')
        body = r.get('body', '')[:150]
        href = r.get('href', '')
        formatted.append(f"{i}. <b>{title}</b>\n{body}...\n<a href='{href}'>Read more</a>")
    
    return "\n\n".join(formatted)

def format_video_results(results):
    if not results.get('success') or not results.get('videos'):
        return None, "No videos found."
    
    formatted = []
    videos = results['videos'][:5]
    for i, v in enumerate(videos, 1):
        title = v.get('title', 'No title')
        duration = v.get('duration', 'Unknown')
        publisher = v.get('publisher', 'Unknown')
        url = v.get('content', '')
        formatted.append(f"{i}. <b>{title}</b>\n⏱ {duration} | 📺 {publisher}\n<a href='{url}'>Watch</a>")
    
    return videos, "\n\n".join(formatted)

def format_image_results(results):
    if not results.get('success') or not results.get('images'):
        return None, "No images found."
    
    images = results['images'][:5]
    return images, f"Found {len(images)} images"

def format_news_results(results):
    if not results.get('success') or not results.get('news'):
        return "No news found."
    
    formatted = []
    for i, n in enumerate(results['news'][:10], 1):
        title = n.get('title', 'No title')
        body = n.get('body', '')[:100]
        source = n.get('source', 'Unknown')
        url = n.get('url', '')
        date = n.get('date', '')
        formatted.append(f"{i}. <b>{title}</b>\n📰 {source} | {date}\n{body}...\n<a href='{url}'>Read more</a>")
    
    return "\n\n".join(formatted)


class AIBot:
    
    def __init__(self, handlers, video_cache=None):
        self.handlers = handlers
        self.video_cache = video_cache if video_cache is not None else {}
        self.paginated_cache = {}
    
    def process_message(self, text, chat_id, message_id, is_owner):
        intent_result = detect_intent(text)
        intent = intent_result['intent']
        query = intent_result['query']
        platform = intent_result.get('platform')
        
        print(f"[AI Bot] Detected intent: {intent}, query: {query}, platform: {platform}")
        
        if intent == 'platform_video_search':
            return self.handle_platform_video_search(platform, query, chat_id, message_id)
        elif intent == 'download_video':
            return self.handle_video_request(query, chat_id, message_id)
        elif intent == 'download_audio':
            return self.handle_audio_request(query, chat_id, message_id)
        elif intent == 'search_photo':
            return self.handle_photo_request(query, chat_id, message_id)
        elif intent == 'search_news':
            return self.handle_news_request(query, chat_id, message_id)
        elif intent == 'create_link':
            return self.handle_link_request(query, chat_id, message_id)
        else:
            return self.handle_web_search(query, chat_id, message_id)
    
    def handle_platform_video_search(self, platform, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        
        platform_emoji = {
            'pornhub': '🔞', 'xhamster': '🔞', 'xvideos': '🔞', 'xnxx': '🔞',
            'redtube': '🔞', 'youporn': '🔞', 'spankbang': '🔞', 'tnaflix': '🔞',
            'beeg': '🔞', 'eporner': '🔞', 'motherless': '🔞',
            'facebook': '📘', 'youtube': '📺', 'tiktok': '🎵', 'instagram': '📷',
            'twitter': '🐦', 'reddit': '🔴', 'vimeo': '🎬', 'dailymotion': '📹',
            'twitch': '💜', 'kick': '💚', 'soundcloud': '🔊', 'spotify': '🎧',
            'snackvideo': '🍿', 'likee': '❤️', 'triller': '🎤'
        }
        emoji = platform_emoji.get(platform, '🎬')
        
        status_msg = self.handlers.send_message(
            chat_id, 
            f'<b>{emoji} Searching {platform.capitalize()} videos...</b>\n\n🔍 Query: {query}', 
            message_id
        )
        
        results = search_platform_videos(platform, query, max_results=10)
        
        if not results.get('success') or not results.get('videos'):
            self.handlers.edit_message(
                chat_id, status_msg, 
                f'<b>❌ No {platform.capitalize()} videos found for:</b> {query}'
            )
            return None
        
        videos = results['videos'][:10]
        
        cache_id = f"pv_{chat_id}_{int(time.time() * 1000)}"
        self.paginated_cache[cache_id] = {
            'videos': videos,
            'platform': platform,
            'query': query,
            'current_index': 0,
            'timestamp': time.time()
        }
        
        self.handlers.delete_message(chat_id, status_msg)
        self._send_video_page(chat_id, cache_id, 0, message_id)
        
        return {'videos': videos, 'cache_id': cache_id, 'platform': platform}
    
    def _send_video_page(self, chat_id, cache_id, index, reply_to=None):
        cached = self.paginated_cache.get(cache_id)
        if not cached:
            return
        
        videos = cached['videos']
        platform = cached['platform']
        
        if index < 0 or index >= len(videos):
            return
        
        video = videos[index]
        total = len(videos)
        
        title = video.get('title', 'Unknown')[:100]
        duration = video.get('duration', 'Unknown')
        publisher = video.get('publisher', 'Unknown')
        thumbnail = video.get('images', {}).get('large') or video.get('images', {}).get('medium') or video.get('images', {}).get('small')
        video_url = video.get('content', '')
        
        platform_emoji = {
            'pornhub': '🔞', 'xhamster': '🔞', 'xvideos': '🔞', 'xnxx': '🔞',
            'redtube': '🔞', 'youporn': '🔞', 'spankbang': '🔞', 'tnaflix': '🔞',
            'beeg': '🔞', 'eporner': '🔞', 'motherless': '🔞',
            'facebook': '📘', 'youtube': '📺', 'tiktok': '🎵', 'instagram': '📷',
            'twitter': '🐦', 'reddit': '🔴', 'vimeo': '🎬', 'dailymotion': '📹',
            'twitch': '💜', 'kick': '💚', 'soundcloud': '🔊', 'spotify': '🎧',
            'snackvideo': '🍿', 'likee': '❤️', 'triller': '🎤'
        }
        emoji = platform_emoji.get(platform, '🎬')
        
        caption = (
            f"{emoji} <b>{platform.capitalize()} Video</b> ({index + 1}/{total})\n\n"
            f"🎬 <b>{title}</b>\n"
            f"⏱ <b>Duration:</b> {duration}\n"
            f"📺 <b>Publisher:</b> {publisher}\n\n"
            f"🔗 <a href='{video_url}'>Open Link</a>"
        )
        
        keyboard = []
        
        quality_row = [
            {"text": "🎬 Video (Best)", "callback_data": f"aipv_video_best_{index}_{cache_id}"},
            {"text": "🎵 Audio", "callback_data": f"aipv_audio_best_{index}_{cache_id}"}
        ]
        keyboard.append(quality_row)
        
        nav_row = []
        if index > 0:
            nav_row.append({"text": "⬅️ Previous", "callback_data": f"aipv_prev_{index}_{cache_id}"})
        if index < total - 1:
            nav_row.append({"text": "Next ➡️", "callback_data": f"aipv_next_{index}_{cache_id}"})
        if nav_row:
            keyboard.append(nav_row)
        
        keyboard.append([{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}])
        
        if thumbnail:
            self.handlers.send_photo_with_caption(chat_id, thumbnail, caption, reply_to, keyboard)
        else:
            self.handlers.send_message(chat_id, caption, reply_to, keyboard)
    
    def handle_pagination_callback(self, data, chat_id, callback_message_id, callback_query_id):
        parts = data.split('_')
        action = parts[1]
        
        if action in ['video', 'audio']:
            format_type = action
            quality = parts[2]
            video_index = int(parts[3])
            cache_id = '_'.join(parts[4:])
            
            cached = self.paginated_cache.get(cache_id)
            if not cached:
                self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
                return None
            
            if time.time() - cached.get('timestamp', 0) > 600:
                del self.paginated_cache[cache_id]
                self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
                return None
            
            if video_index >= len(cached['videos']):
                self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
                return None
            
            video = cached['videos'][video_index]
            video_url = video.get('content', '')
            title = video.get('title', 'Video')
            
            self.handlers.answer_callback_query(callback_query_id, f'📥 Starting {format_type} download...')
            
            return {
                'action': 'download',
                'format': format_type,
                'quality': quality,
                'url': video_url,
                'title': title,
                'cache_id': cache_id,
                'video_index': video_index
            }
        
        current_index = int(parts[2])
        cache_id = '_'.join(parts[3:])
        
        cached = self.paginated_cache.get(cache_id)
        if not cached:
            self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
            return None
        
        if time.time() - cached.get('timestamp', 0) > 600:
            del self.paginated_cache[cache_id]
            self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
            return None
        
        if action == 'prev':
            new_index = max(0, current_index - 1)
            self.handlers.answer_callback_query(callback_query_id, f'Video {new_index + 1}/{len(cached["videos"])}')
            self.handlers.delete_message(chat_id, callback_message_id)
            self._send_video_page(chat_id, cache_id, new_index)
            return {'action': 'navigate', 'index': new_index}
        
        elif action == 'next':
            new_index = min(len(cached['videos']) - 1, current_index + 1)
            self.handlers.answer_callback_query(callback_query_id, f'Video {new_index + 1}/{len(cached["videos"])}')
            self.handlers.delete_message(chat_id, callback_message_id)
            self._send_video_page(chat_id, cache_id, new_index)
            return {'action': 'navigate', 'index': new_index}
        
        return None
    
    def handle_video_request(self, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for videos...</b>', message_id)
        
        results = search_videos(query, max_results=10)
        
        if not results.get('success') or not results.get('videos'):
            self.handlers.edit_message(chat_id, status_msg, f"<b>❌ No videos found for:</b> {query}")
            return None
        
        videos = results['videos'][:10]
        
        cache_id = f"pv_{chat_id}_{int(time.time() * 1000)}"
        self.paginated_cache[cache_id] = {
            'videos': videos,
            'platform': 'general',
            'query': query,
            'current_index': 0,
            'timestamp': time.time()
        }
        
        self.handlers.delete_message(chat_id, status_msg)
        self._send_video_page(chat_id, cache_id, 0, message_id)
        
        return {'videos': videos, 'cache_id': cache_id}
    
    def handle_audio_request(self, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for music...</b>', message_id)
        
        results = search_videos(f"{query} audio music", max_results=10)
        
        if not results.get('success') or not results.get('videos'):
            self.handlers.edit_message(chat_id, status_msg, f"<b>❌ No music found for:</b> {query}")
            return None
        
        videos = results['videos'][:10]
        
        cache_id = f"pa_{chat_id}_{int(time.time() * 1000)}"
        self.paginated_cache[cache_id] = {
            'videos': videos,
            'platform': 'music',
            'query': query,
            'current_index': 0,
            'timestamp': time.time()
        }
        
        self.handlers.delete_message(chat_id, status_msg)
        self._send_video_page(chat_id, cache_id, 0, message_id)
        
        return {'videos': videos, 'cache_id': cache_id}
    
    def handle_photo_request(self, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for images...</b>', message_id)
        
        results = search_images(query, max_results=10)
        
        if not results.get('success') or not results.get('images'):
            self.handlers.edit_message(chat_id, status_msg, f"<b>❌ No images found for:</b> {query}")
            return None
        
        images = results['images'][:10]
        
        cache_id = f"pi_{chat_id}_{int(time.time() * 1000)}"
        self.paginated_cache[cache_id] = {
            'images': images,
            'query': query,
            'current_index': 0,
            'timestamp': time.time()
        }
        
        self.handlers.delete_message(chat_id, status_msg)
        self._send_image_page(chat_id, cache_id, 0, message_id)
        
        return {'images': images, 'cache_id': cache_id}
    
    def _send_image_page(self, chat_id, cache_id, index, reply_to=None):
        cached = self.paginated_cache.get(cache_id)
        if not cached:
            return
        
        images = cached['images']
        if index < 0 or index >= len(images):
            return
        
        image = images[index]
        total = len(images)
        
        title = image.get('title', 'Image')[:100]
        source = image.get('source', 'Unknown')
        image_url = image.get('image', '')
        thumbnail = image.get('thumbnail', image_url)
        
        caption = (
            f"📷 <b>Image</b> ({index + 1}/{total})\n\n"
            f"🖼 <b>{title}</b>\n"
            f"📰 <b>Source:</b> {source}"
        )
        
        keyboard = []
        
        keyboard.append([{"text": "📥 Download Full Image", "callback_data": f"aipi_dl_{index}_{cache_id}"}])
        
        nav_row = []
        if index > 0:
            nav_row.append({"text": "⬅️ Previous", "callback_data": f"aipi_prev_{index}_{cache_id}"})
        if index < total - 1:
            nav_row.append({"text": "Next ➡️", "callback_data": f"aipi_next_{index}_{cache_id}"})
        if nav_row:
            keyboard.append(nav_row)
        
        keyboard.append([{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}])
        
        if thumbnail:
            self.handlers.send_photo_with_caption(chat_id, thumbnail, caption, reply_to, keyboard)
        else:
            self.handlers.send_message(chat_id, caption, reply_to, keyboard)
    
    def handle_image_pagination_callback(self, data, chat_id, callback_message_id, callback_query_id):
        parts = data.split('_')
        action = parts[1]
        
        if action == 'dl':
            image_index = int(parts[2])
            cache_id = '_'.join(parts[3:])
            
            cached = self.paginated_cache.get(cache_id)
            if not cached:
                self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
                return None
            
            if image_index >= len(cached.get('images', [])):
                self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
                return None
            
            image = cached['images'][image_index]
            image_url = image.get('image', '')
            title = image.get('title', 'Image')
            
            self.handlers.answer_callback_query(callback_query_id, '📥 Downloading image...')
            
            return {
                'action': 'download',
                'url': image_url,
                'title': title
            }
        
        current_index = int(parts[2])
        cache_id = '_'.join(parts[3:])
        
        cached = self.paginated_cache.get(cache_id)
        if not cached:
            self.handlers.answer_callback_query(callback_query_id, '❌ Request expired')
            return None
        
        if action == 'prev':
            new_index = max(0, current_index - 1)
            self.handlers.answer_callback_query(callback_query_id, f'Image {new_index + 1}/{len(cached["images"])}')
            self.handlers.delete_message(chat_id, callback_message_id)
            self._send_image_page(chat_id, cache_id, new_index)
            return {'action': 'navigate', 'index': new_index}
        
        elif action == 'next':
            new_index = min(len(cached['images']) - 1, current_index + 1)
            self.handlers.answer_callback_query(callback_query_id, f'Image {new_index + 1}/{len(cached["images"])}')
            self.handlers.delete_message(chat_id, callback_message_id)
            self._send_image_page(chat_id, cache_id, new_index)
            return {'action': 'navigate', 'index': new_index}
        
        return None
    
    def handle_news_request(self, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for news...</b>', message_id)
        
        results = search_news(query, max_results=10)
        formatted = format_news_results(results)
        
        self.handlers.edit_message(chat_id, status_msg, f"<b>📰 News for:</b> {query}\n\n{formatted}")
        return results
    
    def handle_link_request(self, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        
        results = search_web(query)
        if results.get('success') and results.get('results'):
            first_result = results['results'][0]
            link = first_result.get('href', '')
            title = first_result.get('title', 'Link')
            
            self.handlers.send_message(
                chat_id, 
                f"<b>🔗 Link created:</b>\n\n<b>{title}</b>\n{link}",
                message_id
            )
            return {'link': link}
        else:
            self.handlers.send_message(chat_id, f"<b>❌ Could not create link for:</b> {query}", message_id)
            return None
    
    def handle_web_search(self, query, chat_id, message_id):
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching the web...</b>', message_id)
        
        results = search_web(query)
        formatted = format_web_results(results)
        
        self.handlers.edit_message(chat_id, status_msg, f"<b>🌐 Results for:</b> {query}\n\n{formatted}")
        return results
