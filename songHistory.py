import json
import os

HISTORY_FILE = 'downloaded_songs.json'

def load_history():
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"[SongHistory] Error loading history: {e}")
    return {"songs": []}

def save_history(history):
    try:
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"[SongHistory] Error saving history: {e}")

def is_already_downloaded(identifier):
    history = load_history()
    for song in history['songs']:
        if (song.get('url') == identifier or 
            song.get('video_id') == identifier or
            (song.get('title') and identifier and 
             song.get('title', '').lower() == identifier.lower())):
            return True
    return False

def add_to_history(song_info):
    history = load_history()
    
    for song in history['songs']:
        if (song.get('url') == song_info.get('url') or 
            song.get('video_id') == song_info.get('video_id')):
            print(f"[SongHistory] Already exists: {song_info.get('title')}")
            return False
    
    from datetime import datetime
    history['songs'].append({
        'title': song_info.get('title'),
        'url': song_info.get('url'),
        'video_id': song_info.get('video_id'),
        'downloaded_at': datetime.now().isoformat()
    })
    save_history(history)
    print(f"[SongHistory] Added: {song_info.get('title')}")
    return True

def get_downloaded_count():
    history = load_history()
    return len(history['songs'])
