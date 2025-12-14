import os
import json
import asyncio
import threading
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pyrogram import Client
from pyrogram.errors import FloodWait
import time
from concurrent.futures import ThreadPoolExecutor

API_ID = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
BOT_TOKEN = os.environ.get('BOT_TOKEN')

USER_IDS_FILE = 'user_ids.json'

TELEGRAM_SESSION = requests.Session()
retry_strategy = Retry(total=3, backoff_factor=0.1, status_forcelist=[500, 502, 503, 504])
adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
TELEGRAM_SESSION.mount("https://", adapter)
TELEGRAM_SESSION.mount("http://", adapter)

HANDLER_EXECUTOR = ThreadPoolExecutor(max_workers=6)


class TelegramHandlers:
    def __init__(self, bot_token, owner_id):
        self.bot_token = bot_token
        self.owner_id = owner_id
        self.api_url = f"https://api.telegram.org/bot{bot_token}"
        self.progress_active = {}
        self.video_audio_cache = {}
        self.session = TELEGRAM_SESSION
    
    def _make_request(self, method, data=None, files=None):
        url = f"{self.api_url}/{method}"
        try:
            if files:
                response = self.session.post(url, data=data, files=files, timeout=300)
            else:
                response = self.session.post(url, json=data, timeout=30)
            return response.json()
        except Exception as e:
            print(f"[Telegram API] Error in {method}: {e}")
            return {'ok': False, 'error': str(e)}
    
    def send_message(self, chat_id, text, reply_to_message_id=None, keyboard=None):
        data = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if keyboard:
            data['reply_markup'] = {'inline_keyboard': keyboard}
        result = self._make_request('sendMessage', data)
        if result.get('ok'):
            return result['result']['message_id']
        return None
    
    def edit_message(self, chat_id, message_id, text, keyboard=None):
        data = {
            'chat_id': chat_id,
            'message_id': message_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        if keyboard:
            data['reply_markup'] = {'inline_keyboard': keyboard}
        return self._make_request('editMessageText', data)
    
    def delete_message(self, chat_id, message_id):
        return self._make_request('deleteMessage', {
            'chat_id': chat_id,
            'message_id': message_id
        })
    
    def send_action(self, chat_id, action):
        return self._make_request('sendChatAction', {
            'chat_id': chat_id,
            'action': action
        })
    
    def answer_callback_query(self, callback_query_id, text=None, show_alert=False):
        data = {'callback_query_id': callback_query_id}
        if text:
            data['text'] = text
        data['show_alert'] = show_alert
        return self._make_request('answerCallbackQuery', data)
    
    def send_photo_with_caption(self, chat_id, photo_url, caption, reply_to_message_id=None, keyboard=None):
        data = {
            'chat_id': chat_id,
            'photo': photo_url,
            'caption': caption,
            'parse_mode': 'HTML'
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if keyboard:
            data['reply_markup'] = {'inline_keyboard': keyboard}
        return self._make_request('sendPhoto', data)
    
    def send_photo_file(self, chat_id, file_path, caption, reply_to_message_id=None, keyboard=None):
        data = {
            'chat_id': chat_id,
            'caption': caption,
            'parse_mode': 'HTML'
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if keyboard:
            data['reply_markup'] = json.dumps({'inline_keyboard': keyboard})
        
        with open(file_path, 'rb') as f:
            return self._make_request('sendPhoto', data, files={'photo': f})
    
    def send_photos(self, chat_id, photos, caption, reply_to_message_id=None, keyboard=None):
        if len(photos) == 1:
            return self.send_photo_with_caption(chat_id, photos[0], caption, reply_to_message_id, keyboard)
        
        media = []
        for i, photo in enumerate(photos[:10]):
            item = {'type': 'photo', 'media': photo}
            if i == 0:
                item['caption'] = caption
                item['parse_mode'] = 'HTML'
            media.append(item)
        
        data = {'chat_id': chat_id, 'media': media}
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        return self._make_request('sendMediaGroup', data)
    
    def send_video(self, chat_id, video_url, caption, reply_to_message_id=None, thumbnail=None, keyboard=None):
        data = {
            'chat_id': chat_id,
            'video': video_url,
            'caption': caption,
            'parse_mode': 'HTML',
            'supports_streaming': True
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if thumbnail:
            data['thumbnail'] = thumbnail
        if keyboard:
            data['reply_markup'] = {'inline_keyboard': keyboard}
        return self._make_request('sendVideo', data)
    
    def send_video_with_quality_fallback(self, chat_id, hd_url, sd_url, caption, reply_to_message_id=None, thumbnail=None, keyboard=None):
        result = self.send_video(chat_id, hd_url, caption, reply_to_message_id, thumbnail, keyboard)
        if not result.get('ok'):
            result = self.send_video(chat_id, sd_url, caption, reply_to_message_id, thumbnail, keyboard)
        return result
    
    def send_video_file(self, chat_id, file_path, caption, reply_to_message_id=None, keyboard=None):
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        
        # Always use MTProto for video uploads - it's much faster
        if mtproto_client.is_available() and file_size > 5 * 1024 * 1024:
            result = mtproto_client.send_video(chat_id, file_path, caption, reply_to_message_id)
            if result.get('ok'):
                return result
        
        data = {
            'chat_id': chat_id,
            'caption': caption,
            'parse_mode': 'HTML',
            'supports_streaming': 'true'
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if keyboard:
            data['reply_markup'] = json.dumps({'inline_keyboard': keyboard})
        
        with open(file_path, 'rb') as f:
            return self._make_request('sendVideo', data, files={'video': f})
    
    def send_audio_file(self, chat_id, file_path, title, reply_to_message_id=None, keyboard=None):
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        
        # Use MTProto for audio uploads over 5MB - it's faster
        if mtproto_client.is_available() and file_size > 5 * 1024 * 1024:
            result = mtproto_client.send_audio(chat_id, file_path, title, None, reply_to_message_id)
            if result.get('ok'):
                return result
        
        data = {
            'chat_id': chat_id,
            'title': title,
            'parse_mode': 'HTML'
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if keyboard:
            data['reply_markup'] = json.dumps({'inline_keyboard': keyboard})
        
        with open(file_path, 'rb') as f:
            return self._make_request('sendAudio', data, files={'audio': f})
    
    def send_link_message(self, chat_id, text, keyboard=None, reply_to_message_id=None):
        return self.send_message(chat_id, text, reply_to_message_id, keyboard)
    
    def save_user_id(self, user_id):
        try:
            user_ids = set()
            if os.path.exists(USER_IDS_FILE):
                with open(USER_IDS_FILE, 'r') as f:
                    user_ids = set(json.load(f))
            user_ids.add(user_id)
            with open(USER_IDS_FILE, 'w') as f:
                json.dump(list(user_ids), f)
        except Exception as e:
            print(f"[Handlers] Error saving user ID: {e}")
    
    def get_all_users_count(self):
        try:
            if os.path.exists(USER_IDS_FILE):
                with open(USER_IDS_FILE, 'r') as f:
                    return len(json.load(f))
        except:
            pass
        return 0
    
    def broadcast_message(self, from_chat_id, message_id):
        results = {'successful_sends': 0, 'failed_sends': 0}
        try:
            if os.path.exists(USER_IDS_FILE):
                with open(USER_IDS_FILE, 'r') as f:
                    user_ids = json.load(f)
                
                for user_id in user_ids:
                    try:
                        self._make_request('copyMessage', {
                            'chat_id': user_id,
                            'from_chat_id': from_chat_id,
                            'message_id': message_id
                        })
                        results['successful_sends'] += 1
                        time.sleep(0.05)
                    except:
                        results['failed_sends'] += 1
        except Exception as e:
            print(f"[Broadcast] Error: {e}")
        return results
    
    def cache_video_for_audio(self, key, video_url, caption):
        self.video_audio_cache[key] = {'video_url': video_url, 'caption': caption}
    
    def get_video_for_audio(self, key):
        return self.video_audio_cache.get(key)
    
    def clear_video_for_audio(self, key):
        self.video_audio_cache.pop(key, None)
    
    def simulate_progress(self, chat_id, message_id, states, interval=0.5):
        key = f"{chat_id}_{message_id}"
        self.progress_active[key] = True
        
        def run_progress():
            for state in states:
                if not self.progress_active.get(key):
                    break
                self.edit_message(chat_id, message_id, state['text'])
                time.sleep(interval)
            self.progress_active.pop(key, None)
        
        threading.Thread(target=run_progress, daemon=True).start()

class MTProtoClient:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._do_init()
        return cls._instance
    
    def _do_init(self):
        self.client = None
        self.loop = None
        self.thread = None
        self._started = False
        self._loop_ready = threading.Event()
        self._start_lock = threading.Lock()
        self._client_ready = threading.Event()
    
    def __init__(self):
        pass
    
    def _run_loop(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self._loop_ready.set()
        self.loop.run_forever()
    
    def _ensure_loop(self):
        if self.loop is None or not self.loop.is_running():
            if self.thread is None or not self.thread.is_alive():
                self._loop_ready.clear()
                self.thread = threading.Thread(target=self._run_loop, daemon=True)
                self.thread.start()
                if not self._loop_ready.wait(timeout=10):
                    raise Exception("Event loop failed to start")
        return self.loop
    
    def start(self):
        with self._start_lock:
            if self._started:
                return True
            
            if not API_ID or not API_HASH or not BOT_TOKEN:
                print("[MTProto] Missing API credentials (TELEGRAM_API_ID, TELEGRAM_API_HASH, BOT_TOKEN)")
                return False
            
            try:
                loop = self._ensure_loop()
                
                if self.client is None:
                    self.client = Client(
                        "bot_session",
                        api_id=int(API_ID),
                        api_hash=API_HASH,
                        bot_token=BOT_TOKEN,
                        workdir="."
                    )
                
                async def _start_client():
                    if not self.client.is_connected:
                        await self.client.start()
                    return True
                
                future = asyncio.run_coroutine_threadsafe(_start_client(), loop)
                future.result(timeout=60)
                self._started = True
                print("[MTProto] Client started successfully")
                return True
                
            except Exception as e:
                print(f"[MTProto] Failed to start client: {e}")
                import traceback
                traceback.print_exc()
                self._started = False
                return False
    
    def stop(self):
        if self.client and self._started:
            try:
                future = asyncio.run_coroutine_threadsafe(self.client.stop(), self.loop)
                future.result(timeout=10)
            except:
                pass
        
        if self.loop:
            self.loop.call_soon_threadsafe(self.loop.stop)
        
        self._started = False
    
    def send_video(self, chat_id, file_path, caption=None, reply_to_message_id=None, progress_callback=None):
        if not self.start():
            return {'ok': False, 'error': 'MTProto client not available'}
        
        async def _send():
            try:
                message = await self.client.send_video(
                    chat_id=chat_id,
                    video=file_path,
                    caption=caption,
                    parse_mode="html",
                    reply_to_message_id=reply_to_message_id,
                    supports_streaming=True,
                    progress=progress_callback
                )
                return {'ok': True, 'result': {'message_id': message.id}}
            except FloodWait as e:
                print(f"[MTProto] FloodWait: waiting {e.value} seconds")
                await asyncio.sleep(e.value)
                return await _send()
            except Exception as e:
                print(f"[MTProto] Send video error: {e}")
                return {'ok': False, 'error': str(e)}
        
        try:
            future = asyncio.run_coroutine_threadsafe(_send(), self.loop)
            return future.result(timeout=600)
        except Exception as e:
            print(f"[MTProto] Future error: {e}")
            return {'ok': False, 'error': str(e)}
    
    def send_document(self, chat_id, file_path, caption=None, reply_to_message_id=None, progress_callback=None):
        if not self.start():
            return {'ok': False, 'error': 'MTProto client not available'}
        
        async def _send():
            try:
                message = await self.client.send_document(
                    chat_id=chat_id,
                    document=file_path,
                    caption=caption,
                    parse_mode="html",
                    reply_to_message_id=reply_to_message_id,
                    progress=progress_callback
                )
                return {'ok': True, 'result': {'message_id': message.id}}
            except FloodWait as e:
                print(f"[MTProto] FloodWait: waiting {e.value} seconds")
                await asyncio.sleep(e.value)
                return await _send()
            except Exception as e:
                print(f"[MTProto] Send document error: {e}")
                return {'ok': False, 'error': str(e)}
        
        try:
            future = asyncio.run_coroutine_threadsafe(_send(), self.loop)
            return future.result(timeout=600)
        except Exception as e:
            print(f"[MTProto] Future error: {e}")
            return {'ok': False, 'error': str(e)}
    
    def send_audio(self, chat_id, file_path, title=None, caption=None, reply_to_message_id=None):
        if not self.start():
            return {'ok': False, 'error': 'MTProto client not available'}
        
        async def _send():
            try:
                message = await self.client.send_audio(
                    chat_id=chat_id,
                    audio=file_path,
                    caption=caption,
                    title=title,
                    parse_mode="html",
                    reply_to_message_id=reply_to_message_id
                )
                return {'ok': True, 'result': {'message_id': message.id}}
            except FloodWait as e:
                print(f"[MTProto] FloodWait: waiting {e.value} seconds")
                await asyncio.sleep(e.value)
                return await _send()
            except Exception as e:
                print(f"[MTProto] Send audio error: {e}")
                return {'ok': False, 'error': str(e)}
        
        try:
            future = asyncio.run_coroutine_threadsafe(_send(), self.loop)
            return future.result(timeout=600)
        except Exception as e:
            print(f"[MTProto] Future error: {e}")
            return {'ok': False, 'error': str(e)}
    
    def is_available(self):
        return bool(API_ID and API_HASH and BOT_TOKEN)

mtproto_client = MTProtoClient()

def init_mtproto():
    """Initialize MTProto client at startup"""
    if mtproto_client.is_available():
        print("[MTProto] Initializing client at startup...")
        mtproto_client.start()

init_mtproto()
