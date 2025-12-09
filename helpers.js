import re

def html_bold(text):
    return f"<b>{text}</b>"

def format_duration(seconds):
    if not isinstance(seconds, (int, float)) or seconds < 0:
        return 'N/A'
    
    total_seconds = round(seconds)
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    
    if h > 0:
        return f"{h}:{str(m).zfill(2)}:{str(s).zfill(2)}"
    else:
        return f"{m}:{str(s).zfill(2)}"

def format_number(num):
    if not isinstance(num, (int, float)):
        return '0'
    if num >= 1000000:
        return f"{num / 1000000:.1f}M"
    elif num >= 1000:
        return f"{num / 1000:.1f}K"
    return str(int(num))

def format_tiktok_caption(data):
    title = data.get('title', '')
    author = data.get('author', 'Unknown')
    author_username = data.get('author_username', '')
    duration = data.get('duration', 0)
    music = data.get('music')
    music_author = data.get('music_author')
    
    formatted_duration = format_duration(duration)
    caption = ''
    
    if title and title != 'TikTok Video':
        short_title = title[:100] + '...' if len(title) > 100 else title
        caption += f"{html_bold('Description:')} {short_title}\n\n"
    
    caption += f"👤 {html_bold('Author:')} {author}"
    if author_username:
        caption += f" (@{author_username})"
    caption += '\n'
    
    if duration > 0:
        caption += f"⏱️ {html_bold('Duration:')} {formatted_duration}\n"
    
    if music:
        caption += f"\n🎵 {html_bold('Music:')} {music}"
        if music_author:
            caption += f" - {music_author}"
        caption += '\n'
    
    caption += "\n◇───────────────◇\n"
    caption += "🚀 LK NEWS Download Bot\n"
    caption += "🔥 TikTok Video Downloader"
    
    return caption

def strip_html_tags(text):
    return re.sub(r'<[^>]*>', '', text)
