import requests
import time
import os
import re
import subprocess
import tempfile
from config import PROGRESS_STATES, MAX_FILE_SIZE_BYTES

try:
    from mtproto_client import mtproto_client
    MTPROTO_AVAILABLE = mtproto_client.is_available()
except ImportError:
    MTPROTO_AVAILABLE = False
    mtproto_client = None

MAX_MTPROTO_SIZE = 2 * 1024 * 1024 * 1024

class TelegramHandlers:
    def __init__(self, bot_token, owner_id=None):
        self.bot_token = bot_token
        self.owner_id = owner_id
        self.telegram_api = f"https://api.telegram.org/bot{bot_token}"
        self.progress_active = False
        self.video_cache = {}
        self.user_database = {}
    
    def telegram_request(self, method, data=None, files=None):
        url = f"{self.telegram_api}/{method}"
        try:
            if files:
                response = requests.post(url, data=data, files=files, timeout=120)
            else:
                response = requests.post(url, json=data, timeout=60)
            return response.json()
        except Exception as e:
            print(f"[Telegram] Request error: {e}")
            return {"ok": False, "error": str(e)}
    
    def send_message(self, chat_id, text, reply_to_message_id=None, keyboard=None):
        data = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        
        if reply_to_message_id:
            data["reply_to_message_id"] = reply_to_message_id
        
        if keyboard:
            data["reply_markup"] = {"inline_keyboard": keyboard}
        
        result = self.telegram_request("sendMessage", data)
        if result.get("ok") and result.get("result"):
            return result["result"]["message_id"]
        return None
    
    def edit_message(self, chat_id, message_id, text, keyboard=None):
        data = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        
        if keyboard:
            data["reply_markup"] = {"inline_keyboard": keyboard}
        
        return self.telegram_request("editMessageText", data)
    
    def delete_message(self, chat_id, message_id):
        return self.telegram_request("deleteMessage", {
            "chat_id": chat_id,
            "message_id": message_id
        })
    
    def send_action(self, chat_id, action):
        return self.telegram_request("sendChatAction", {
            "chat_id": chat_id,
            "action": action
        })
    
    def answer_callback_query(self, callback_query_id, text=None):
        data = {"callback_query_id": callback_query_id}
        if text:
            data["text"] = text
            data["show_alert"] = False
        return self.telegram_request("answerCallbackQuery", data)
    
    def send_video(self, chat_id, video_url, caption, reply_to_message_id=None, thumbnail=None, keyboard=None):
        data = {
            "chat_id": chat_id,
            "video": video_url,
            "caption": caption,
            "parse_mode": "HTML",
            "supports_streaming": True
        }
        
        if reply_to_message_id:
            data["reply_to_message_id"] = reply_to_message_id
        
        if thumbnail:
            data["thumbnail"] = thumbnail
        
        if keyboard:
            data["reply_markup"] = {"inline_keyboard": keyboard}
        
        return self.telegram_request("sendVideo", data)
    
    def send_video_with_quality_fallback(self, chat_id, hd_url, sd_url, caption, reply_to_message_id=None, thumbnail=None, keyboard=None):
        try:
            result = self.send_video(chat_id, hd_url, caption, reply_to_message_id, thumbnail, keyboard)
            if result.get("ok"):
                return result
        except Exception as e:
            print(f"[Handlers] HD video failed: {e}, trying SD...")
        
        return self.send_video(chat_id, sd_url, caption, reply_to_message_id, thumbnail, keyboard)
    
    def send_photos(self, chat_id, images, caption, reply_to_message_id=None, keyboard=None):
        if not images:
            return
        
        if len(images) == 1:
            data = {
                "chat_id": chat_id,
                "photo": images[0],
                "caption": caption,
                "parse_mode": "HTML"
            }
            if reply_to_message_id:
                data["reply_to_message_id"] = reply_to_message_id
            if keyboard:
                data["reply_markup"] = {"inline_keyboard": keyboard}
            return self.telegram_request("sendPhoto", data)
        
        media = []
        for i, url in enumerate(images[:10]):
            item = {"type": "photo", "media": url}
            if i == 0:
                item["caption"] = caption
                item["parse_mode"] = "HTML"
            media.append(item)
        
        data = {"chat_id": chat_id, "media": media}
        if reply_to_message_id:
            data["reply_to_message_id"] = reply_to_message_id
        
        return self.telegram_request("sendMediaGroup", data)
    
    def send_photo_with_caption(self, chat_id, photo_url, caption, reply_to_message_id=None, keyboard=None):
        data = {
            "chat_id": chat_id,
            "photo": photo_url,
            "caption": caption,
            "parse_mode": "HTML"
        }
        if reply_to_message_id:
            data["reply_to_message_id"] = reply_to_message_id
        if keyboard:
            data["reply_markup"] = {"inline_keyboard": keyboard}
        return self.telegram_request("sendPhoto", data)
    
    def send_audio(self, chat_id, audio_url, caption, reply_to_message_id=None, keyboard=None):
        data = {
            "chat_id": chat_id,
            "audio": audio_url,
            "caption": caption,
            "parse_mode": "HTML"
        }
        
        if reply_to_message_id:
            data["reply_to_message_id"] = reply_to_message_id
        
        if keyboard:
            data["reply_markup"] = {"inline_keyboard": keyboard}
        
        return self.telegram_request("sendAudio", data)
    
    def send_link_message(self, chat_id, video_url, caption, reply_to_message_id=None):
        text = f"{caption}\n\n📥 <b>Download Link:</b>\n{video_url}"
        return self.send_message(chat_id, text, reply_to_message_id)
    
    def simulate_progress(self, chat_id, message_id, original_message_id):
        self.progress_active = True
        
        for i in range(1, len(PROGRESS_STATES)):
            if not self.progress_active:
                break
            
            time.sleep(0.8)
            
            if not self.progress_active:
                break
            
            try:
                text = PROGRESS_STATES[i]["text"]
                plain_text = re.sub(r'<[^>]*>', '', text)
                self.edit_message(chat_id, message_id, text, [
                    [{"text": plain_text, "callback_data": "ignore_progress"}]
                ])
            except:
                break
    
    def save_user_id(self, user_id):
        key = f"user_{user_id}"
        self.user_database[key] = {
            "id": user_id,
            "joined": time.time()
        }
    
    def get_all_users_count(self):
        return len([k for k in self.user_database.keys() if k.startswith("user_")])
    
    def broadcast_message(self, from_chat_id, message_id):
        successful_sends = 0
        failed_sends = 0
        
        users = [k for k in self.user_database.keys() if k.startswith("user_")]
        
        for user_key in users:
            user_id = user_key.replace("user_", "")
            try:
                self.telegram_request("copyMessage", {
                    "chat_id": user_id,
                    "from_chat_id": from_chat_id,
                    "message_id": message_id
                })
                successful_sends += 1
                time.sleep(0.05)
            except:
                failed_sends += 1
        
        return {"successful_sends": successful_sends, "failed_sends": failed_sends}
    
    def cache_video_for_audio(self, chat_id, button_id, video_url, caption):
        key = f"{chat_id}_{button_id}"
        self.video_cache[key] = {
            "video_url": video_url,
            "caption": caption,
            "timestamp": time.time()
        }
    
    def get_video_for_audio(self, chat_id, button_id):
        key = f"{chat_id}_{button_id}"
        return self.video_cache.get(key)
    
    def clear_video_for_audio(self, chat_id, button_id):
        key = f"{chat_id}_{button_id}"
        if key in self.video_cache:
            del self.video_cache[key]
    
    def extract_audio_from_video(self, video_url, caption, chat_id, reply_to_message_id=None, keyboard=None):
        audio_caption = caption.replace('🎬', '🎵').replace('Video', 'Audio')
        
        try:
            result = self.send_audio(chat_id, video_url, audio_caption, reply_to_message_id, keyboard)
            if not result.get("ok"):
                raise Exception("Failed to send audio")
            return result
        except Exception as e:
            print(f"[Handlers] Audio extraction failed: {e}")
            raise e
    
    def send_audio_file(self, chat_id, file_path, title, reply_to_message_id=None, keyboard=None):
        try:
            file_size = os.path.getsize(file_path)
            print(f"[Handlers] Sending audio file: {file_path} ({file_size} bytes)")
            
            if file_size > MAX_FILE_SIZE_BYTES:
                raise Exception("File too large for Telegram")
            
            safe_title = re.sub(r'[^a-zA-Z0-9\s]', '', title)[:50]
            
            data = {
                "chat_id": str(chat_id),
                "title": title[:64],
                "parse_mode": "HTML"
            }
            
            if reply_to_message_id:
                data["reply_to_message_id"] = str(reply_to_message_id)
            
            if keyboard:
                import json
                data["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
            
            with open(file_path, 'rb') as f:
                files = {"audio": (f"{safe_title}.mp3", f, "audio/mpeg")}
                result = self.telegram_request("sendAudio", data, files)
            
            if not result.get("ok"):
                print(f"[Handlers] sendAudioFile error: {result}")
            else:
                print(f"[Handlers] Audio sent successfully: {title[:30]}")
            
            return result
        except Exception as e:
            print(f"[Handlers] sendAudioFile failed: {e}")
            raise e
    
    def send_photo_file(self, chat_id, file_path, caption, reply_to_message_id=None, keyboard=None):
        try:
            file_size = os.path.getsize(file_path)
            print(f"[Handlers] Sending photo file: {file_path} ({file_size} bytes)")
            
            if file_size > MAX_FILE_SIZE_BYTES:
                raise Exception("File too large for Telegram")
            
            data = {
                "chat_id": str(chat_id),
                "caption": caption,
                "parse_mode": "HTML"
            }
            
            if reply_to_message_id:
                data["reply_to_message_id"] = str(reply_to_message_id)
            
            if keyboard:
                import json
                data["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
            
            with open(file_path, 'rb') as f:
                files = {"photo": ("photo.jpg", f, "image/jpeg")}
                result = self.telegram_request("sendPhoto", data, files)
            
            if not result.get("ok"):
                print(f"[Handlers] sendPhotoFile error: {result}")
            else:
                print(f"[Handlers] Photo sent successfully")
            
            return result
        except Exception as e:
            print(f"[Handlers] sendPhotoFile failed: {e}")
            raise e
    
    def compress_video(self, input_path, target_size_mb=48):
        """Compress video to fit within Telegram's size limit using ffmpeg"""
        try:
            file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
            print(f"[Handlers] Compressing video from {file_size_mb:.1f}MB to under {target_size_mb}MB")
            
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
                 '-of', 'default=noprint_wrappers=1:nokey=1', input_path],
                capture_output=True, text=True, timeout=30
            )
            duration = float(result.stdout.strip()) if result.stdout.strip() else 60
            
            target_bitrate = int((target_size_mb * 8 * 1024) / duration)
            video_bitrate = max(target_bitrate - 128, 300)
            
            temp_dir = tempfile.gettempdir()
            output_path = os.path.join(temp_dir, f"compressed_{int(time.time())}.mp4")
            
            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-c:v', 'libx264', '-preset', 'fast',
                '-b:v', f'{video_bitrate}k',
                '-maxrate', f'{video_bitrate * 2}k',
                '-bufsize', f'{video_bitrate * 2}k',
                '-vf', 'scale=-2:720',
                '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart',
                output_path
            ]
            
            print(f"[Handlers] Running ffmpeg compression (target {video_bitrate}kbps)...")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            
            if os.path.exists(output_path):
                compressed_size_mb = os.path.getsize(output_path) / (1024 * 1024)
                print(f"[Handlers] Compression complete: {compressed_size_mb:.1f}MB")
                
                if compressed_size_mb <= target_size_mb:
                    return output_path
                elif compressed_size_mb <= 50:
                    return output_path
                else:
                    cmd[cmd.index('-vf') + 1] = 'scale=-2:480'
                    cmd[cmd.index('-b:v') + 1] = f'{max(video_bitrate // 2, 200)}k'
                    output_path2 = os.path.join(temp_dir, f"compressed2_{int(time.time())}.mp4")
                    cmd[cmd.index(output_path)] = output_path2
                    
                    print(f"[Handlers] Re-compressing at lower quality...")
                    subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                    
                    if os.path.exists(output_path2) and os.path.getsize(output_path2) <= 50 * 1024 * 1024:
                        os.unlink(output_path)
                        return output_path2
                    
                    return output_path
            
            print(f"[Handlers] Compression failed: {result.stderr[:200]}")
            return None
            
        except Exception as e:
            print(f"[Handlers] Compression error: {e}")
            return None
    
    def send_video_file(self, chat_id, file_path, caption, reply_to_message_id=None, keyboard=None):
        try:
            file_size = os.path.getsize(file_path)
            print(f"[Handlers] Sending video file: {file_path} ({file_size} bytes, {file_size / (1024*1024):.1f}MB)")
            
            if file_size > MAX_FILE_SIZE_BYTES:
                if MTPROTO_AVAILABLE and file_size <= MAX_MTPROTO_SIZE:
                    print(f"[Handlers] File exceeds 50MB, using MTProto for upload...")
                    result = mtproto_client.send_video(
                        chat_id=chat_id,
                        file_path=file_path,
                        caption=caption,
                        reply_to_message_id=reply_to_message_id
                    )
                    
                    if result.get('ok'):
                        print(f"[Handlers] Video sent successfully via MTProto")
                        return result
                    else:
                        print(f"[Handlers] MTProto failed: {result.get('error')}, falling back to compression")
                
                print(f"[Handlers] Compressing video...")
                compressed_path = self.compress_video(file_path)
                
                if compressed_path and os.path.exists(compressed_path):
                    compressed_size = os.path.getsize(compressed_path)
                    print(f"[Handlers] Compressed to {compressed_size / (1024*1024):.1f}MB")
                    
                    if compressed_size <= MAX_FILE_SIZE_BYTES:
                        result = self._send_video_via_api(chat_id, compressed_path, caption + "\n\n<i>📦 Compressed</i>", reply_to_message_id, keyboard)
                        try:
                            os.unlink(compressed_path)
                        except:
                            pass
                        return result
                    else:
                        try:
                            os.unlink(compressed_path)
                        except:
                            pass
                
                raise Exception("File too large and compression/MTProto not available")
            
            return self._send_video_via_api(chat_id, file_path, caption, reply_to_message_id, keyboard)
            
        except Exception as e:
            print(f"[Handlers] sendVideoFile failed: {e}")
            raise e
    
    def _send_video_via_api(self, chat_id, file_path, caption, reply_to_message_id=None, keyboard=None):
        """Send video via standard Bot API (for files under 50MB)"""
        data = {
            "chat_id": str(chat_id),
            "caption": caption,
            "parse_mode": "HTML"
        }
        
        if reply_to_message_id:
            data["reply_to_message_id"] = str(reply_to_message_id)
        
        if keyboard:
            import json
            data["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
        
        with open(file_path, 'rb') as f:
            files = {"video": ("video.mp4", f, "video/mp4")}
            result = self.telegram_request("sendVideo", data, files)
        
        if not result.get("ok"):
            print(f"[Handlers] sendVideoFile error: {result}")
        else:
            print(f"[Handlers] Video sent successfully")
        
        return result
