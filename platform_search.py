import re
from duckduckgo_search import DDGS

ADULT_PLATFORMS = [
    'pornhub', 'xhamster', 'xvideos', 'xnxx', 'redtube', 
    'youporn', 'spankbang', 'tnaflix', 'beeg', 'eporner', 'motherless'
]

PLATFORM_DOMAINS = {
    'youtube': ['youtube.com', 'youtu.be'],
    'tiktok': ['tiktok.com', 'vm.tiktok.com'],
    'instagram': ['instagram.com'],
    'twitter': ['twitter.com', 'x.com'],
    'facebook': ['facebook.com', 'fb.com', 'fb.watch'],
    'reddit': ['reddit.com', 'redd.it'],
    'vimeo': ['vimeo.com'],
    'dailymotion': ['dailymotion.com'],
    'twitch': ['twitch.tv'],
    'soundcloud': ['soundcloud.com'],
    'spotify': ['spotify.com'],
    'pornhub': ['pornhub.com'],
    'xhamster': ['xhamster.com', 'xhamster2.com'],
    'xvideos': ['xvideos.com'],
    'xnxx': ['xnxx.com'],
    'redtube': ['redtube.com'],
    'youporn': ['youporn.com'],
    'spankbang': ['spankbang.com'],
    'tnaflix': ['tnaflix.com'],
    'beeg': ['beeg.com'],
    'eporner': ['eporner.com'],
    'motherless': ['motherless.com'],
}


def is_adult_platform(platform):
    return platform.lower() in ADULT_PLATFORMS


def search_platform(query, platform=None, max_results=5):
    try:
        search_query = query
        if platform:
            domain = PLATFORM_DOMAINS.get(platform.lower(), [f'{platform}.com'])[0]
            search_query = f"site:{domain} {query}"
        
        with DDGS() as ddgs:
            results = list(ddgs.text(search_query, max_results=max_results))
        
        formatted_results = []
        for result in results:
            formatted_results.append({
                'title': result.get('title', ''),
                'url': result.get('href', result.get('link', '')),
                'description': result.get('body', result.get('snippet', ''))
            })
        
        return formatted_results
    except Exception as e:
        print(f"[PlatformSearch] Error: {e}")
        return []


def search_videos(query, platform=None, max_results=5):
    try:
        search_query = query
        if platform:
            domain = PLATFORM_DOMAINS.get(platform.lower(), [f'{platform}.com'])[0]
            search_query = f"site:{domain} {query}"
        
        with DDGS() as ddgs:
            results = list(ddgs.videos(search_query, max_results=max_results))
        
        formatted_results = []
        for result in results:
            formatted_results.append({
                'title': result.get('title', ''),
                'url': result.get('content', result.get('embed_url', '')),
                'thumbnail': result.get('images', {}).get('large', result.get('thumbnail', '')),
                'duration': result.get('duration', ''),
                'publisher': result.get('publisher', '')
            })
        
        return formatted_results
    except Exception as e:
        print(f"[PlatformSearch] Video search error: {e}")
        return []


def search_images(query, max_results=5):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.images(query, max_results=max_results))
        
        formatted_results = []
        for result in results:
            formatted_results.append({
                'title': result.get('title', ''),
                'url': result.get('image', ''),
                'thumbnail': result.get('thumbnail', ''),
                'source': result.get('source', '')
            })
        
        return formatted_results
    except Exception as e:
        print(f"[PlatformSearch] Image search error: {e}")
        return []
