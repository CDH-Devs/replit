import requests
import time
import os
import re
from config import PROGRESS_STATES, MAX_FILE_SIZE_BYTES

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
