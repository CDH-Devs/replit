import os
import asyncio
import threading
from pyrogram import Client
from pyrogram.errors import FloodWait
import time

API_ID = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
BOT_TOKEN = os.environ.get('BOT_TOKEN')

class MTProtoClient:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.client = None
        self.loop = None
        self.thread = None
        self._initialized = True
        self._started = False
    
    def _run_loop(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()
    
    def start(self):
        if self._started:
            return True
        
        if not API_ID or not API_HASH or not BOT_TOKEN:
            print("[MTProto] Missing API credentials (TELEGRAM_API_ID, TELEGRAM_API_HASH, BOT_TOKEN)")
            return False
        
        try:
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()
            
            time.sleep(0.5)
            
            self.client = Client(
                "bot_session",
                api_id=int(API_ID),
                api_hash=API_HASH,
                bot_token=BOT_TOKEN,
                workdir="."
            )
            
            future = asyncio.run_coroutine_threadsafe(self.client.start(), self.loop)
            future.result(timeout=30)
            
            self._started = True
            print("[MTProto] Client started successfully")
            return True
            
        except Exception as e:
            print(f"[MTProto] Failed to start client: {e}")
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
        if not self._started:
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
        
        future = asyncio.run_coroutine_threadsafe(_send(), self.loop)
        return future.result(timeout=600)
    
    def send_document(self, chat_id, file_path, caption=None, reply_to_message_id=None, progress_callback=None):
        if not self._started:
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
        
        future = asyncio.run_coroutine_threadsafe(_send(), self.loop)
        return future.result(timeout=600)
    
    def send_audio(self, chat_id, file_path, title=None, caption=None, reply_to_message_id=None):
        if not self._started:
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
        
        future = asyncio.run_coroutine_threadsafe(_send(), self.loop)
        return future.result(timeout=600)
    
    def is_available(self):
        return bool(API_ID and API_HASH and BOT_TOKEN)

mtproto_client = MTProtoClient()
