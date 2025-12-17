import re
import os
import time
import tempfile
import requests
from duckduckgo_search import DDGS

INTENT_PATTERNS = {
    'download_video': [
        r'download\s+(?:a\s+)?video',
        r'get\s+(?:me\s+)?(?:a\s+)?video',
        r'find\s+(?:me\s+)?(?:a\s+)?video',
        r'youtube\s+video',
        r'video\s+(?:of|about|for)',
        r'(?:need|want)\s+(?:a\s+)?video',
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
    'search_news': [
        r'(?:latest|recent|new)\s+news',
        r'news\s+(?:about|on|for)',
        r'what\'?s\s+happening',
        r'current\s+events',
    ],
}

def detect_intent(text):
    """Detect user intent from message text using pattern matching"""
    text_lower = text.lower().strip()
    
    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                query = extract_query(text_lower, pattern)
                return {'intent': intent, 'query': query, 'confidence': 0.8}
    
    if any(word in text_lower for word in ['video', 'youtube', 'watch']):
        return {'intent': 'download_video', 'query': text, 'confidence': 0.6}
    if any(word in text_lower for word in ['song', 'music', 'audio', 'mp3']):
        return {'intent': 'download_audio', 'query': text, 'confidence': 0.6}
    if any(word in text_lower for word in ['photo', 'image', 'picture', 'pic']):
        return {'intent': 'search_photo', 'query': text, 'confidence': 0.6}
    
    return {'intent': 'search_web', 'query': text, 'confidence': 0.5}

def extract_query(text, matched_pattern):
    """Extract the actual search query from the text"""
    cleaned = re.sub(matched_pattern, '', text, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'^(for|about|of|a|an|the|me)\s+', '', cleaned).strip()
    return cleaned if cleaned else text

def search_web(query, max_results=5):
    """Search the web using DuckDuckGo"""
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
    """Search for images using DuckDuckGo"""
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

def search_videos(query, max_results=5):
    """Search for videos using DuckDuckGo"""
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

def search_news(query, max_results=5):
    """Search for news using DuckDuckGo"""
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
    """Download an image to a temporary file"""
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
    """Format web search results for Telegram"""
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
    """Format video search results for Telegram"""
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
    """Format image search results for Telegram"""
    if not results.get('success') or not results.get('images'):
        return None, "No images found."
    
    images = results['images'][:5]
    return images, f"Found {len(images)} images"

def format_news_results(results):
    """Format news search results for Telegram"""
    if not results.get('success') or not results.get('news'):
        return "No news found."
    
    formatted = []
    for i, n in enumerate(results['news'][:5], 1):
        title = n.get('title', 'No title')
        body = n.get('body', '')[:100]
        source = n.get('source', 'Unknown')
        url = n.get('url', '')
        date = n.get('date', '')
        formatted.append(f"{i}. <b>{title}</b>\n📰 {source} | {date}\n{body}...\n<a href='{url}'>Read more</a>")
    
    return "\n\n".join(formatted)


class AIBot:
    """AI-powered bot handler for intelligent request processing"""
    
    def __init__(self, handlers, video_cache=None):
        self.handlers = handlers
        self.video_cache = video_cache if video_cache is not None else {}
    
    def process_message(self, text, chat_id, message_id, is_owner):
        """Process any message and respond intelligently"""
        intent_result = detect_intent(text)
        intent = intent_result['intent']
        query = intent_result['query']
        
        print(f"[AI Bot] Detected intent: {intent}, query: {query}")
        
        if intent == 'download_video':
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
    
    def handle_video_request(self, query, chat_id, message_id):
        """Handle video download/search requests"""
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for videos...</b>', message_id)
        
        results = search_videos(query)
        videos, formatted = format_video_results(results)
        
        if videos:
            cache_id = f"aiv_{chat_id}_{int(time.time() * 1000)}"
            self.video_cache[cache_id] = {'videos': videos, 'timestamp': time.time()}
            
            keyboard = []
            for i, v in enumerate(videos[:3]):
                url = v.get('content', '')
                if url:
                    keyboard.append([{"text": f"📥 Download #{i+1}", "callback_data": f"ai_dl_video_{i}_{cache_id}"}])
            keyboard.append([{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}])
            
            self.handlers.edit_message(chat_id, status_msg, f"<b>🎬 Videos found for:</b> {query}\n\n{formatted}", keyboard)
            return {'videos': videos, 'cache_id': cache_id}
        else:
            self.handlers.edit_message(chat_id, status_msg, f"<b>❌ No videos found for:</b> {query}")
            return None
    
    def handle_audio_request(self, query, chat_id, message_id):
        """Handle audio/song search requests"""
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for music...</b>', message_id)
        
        results = search_videos(f"{query} audio music")
        videos, formatted = format_video_results(results)
        
        if videos:
            cache_id = f"aia_{chat_id}_{int(time.time() * 1000)}"
            self.video_cache[cache_id] = {'videos': videos, 'timestamp': time.time()}
            
            keyboard = []
            for i, v in enumerate(videos[:3]):
                keyboard.append([{"text": f"🎵 Download Audio #{i+1}", "callback_data": f"ai_dl_audio_{i}_{cache_id}"}])
            keyboard.append([{"text": "LK NEWS Download Bot", "callback_data": "ignore_branding"}])
            
            self.handlers.edit_message(chat_id, status_msg, f"<b>🎵 Music found for:</b> {query}\n\n{formatted}", keyboard)
            return {'videos': videos, 'cache_id': cache_id}
        else:
            self.handlers.edit_message(chat_id, status_msg, f"<b>❌ No music found for:</b> {query}")
            return None
    
    def handle_photo_request(self, query, chat_id, message_id):
        """Handle photo/image search requests"""
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for images...</b>', message_id)
        
        results = search_images(query)
        images, _ = format_image_results(results)
        
        if images:
            self.handlers.edit_message(chat_id, status_msg, f"<b>📷 Sending {len(images)} images for:</b> {query}")
            
            sent_count = 0
            for img in images[:5]:
                img_url = img.get('image')
                if img_url:
                    temp_file = download_image(img_url)
                    if temp_file and os.path.exists(temp_file):
                        try:
                            title = img.get('title', 'Image')[:100]
                            self.handlers.send_photo_file(chat_id, temp_file, f"📷 {title}", None)
                            sent_count += 1
                            os.unlink(temp_file)
                        except Exception as e:
                            print(f"[AI Bot] Failed to send image: {e}")
                    else:
                        try:
                            self.handlers.send_photo_with_caption(chat_id, img_url, f"📷 {img.get('title', 'Image')[:100]}", None)
                            sent_count += 1
                        except:
                            pass
            
            if sent_count > 0:
                self.handlers.edit_message(chat_id, status_msg, f"<b>✅ Sent {sent_count} images for:</b> {query}")
            else:
                self.handlers.edit_message(chat_id, status_msg, f"<b>❌ Could not send images for:</b> {query}")
            return {'sent': sent_count}
        else:
            self.handlers.edit_message(chat_id, status_msg, f"<b>❌ No images found for:</b> {query}")
            return None
    
    def handle_news_request(self, query, chat_id, message_id):
        """Handle news search requests"""
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching for news...</b>', message_id)
        
        results = search_news(query)
        formatted = format_news_results(results)
        
        self.handlers.edit_message(chat_id, status_msg, f"<b>📰 News for:</b> {query}\n\n{formatted}")
        return results
    
    def handle_link_request(self, query, chat_id, message_id):
        """Handle link creation requests"""
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
        """Handle general web search requests"""
        self.handlers.send_action(chat_id, 'typing')
        status_msg = self.handlers.send_message(chat_id, '<b>🔍 Searching the web...</b>', message_id)
        
        results = search_web(query)
        formatted = format_web_results(results)
        
        self.handlers.edit_message(chat_id, status_msg, f"<b>🌐 Results for:</b> {query}\n\n{formatted}")
        return results
