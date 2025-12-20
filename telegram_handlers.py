import os
import time
import requests
import tempfile
from config import TELEGRAM_API, MAX_FILE_SIZE_BYTES


class TelegramHandlers:
    def __init__(self, bot_token, owner_id):
        self.bot_token = bot_token
        self.owner_id = owner_id
        self.api_base = f"https://api.telegram.org/bot{bot_token}"
    
    def _make_request(self, method, data=None, files=None, timeout=120):
        try:
            url = f"{self.api_base}/{method}"
            if files:
                response = requests.post(url, data=data, files=files, timeout=timeout)
            else:
                response = requests.post(url, json=data, timeout=timeout)
            return response.json()
        except Exception as e:
            print(f"[TelegramHandlers] Request error: {e}")
            return {'ok': False, 'error': str(e)}
    
    def send_message(self, chat_id, text, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = {'inline_keyboard': reply_markup}
        
        result = self._make_request('sendMessage', data)
        if result.get('ok'):
            return result.get('result', {}).get('message_id')
        return None
    
    def edit_message(self, chat_id, message_id, text, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'message_id': message_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        if reply_markup:
            data['reply_markup'] = {'inline_keyboard': reply_markup}
        return self._make_request('editMessageText', data)
    
    def delete_message(self, chat_id, message_id):
        data = {
            'chat_id': chat_id,
            'message_id': message_id
        }
        return self._make_request('deleteMessage', data)
    
    def send_action(self, chat_id, action):
        data = {
            'chat_id': chat_id,
            'action': action
        }
        return self._make_request('sendChatAction', data)
    
    def send_photo(self, chat_id, photo_url, caption=None, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'photo': photo_url,
            'parse_mode': 'HTML'
        }
        if caption:
            data['caption'] = caption
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = {'inline_keyboard': reply_markup}
        return self._make_request('sendPhoto', data)
    
    def send_photo_with_caption(self, chat_id, photo_url, caption, reply_to_message_id=None, reply_markup=None):
        return self.send_photo(chat_id, photo_url, caption, reply_to_message_id, reply_markup)
    
    def send_photo_file(self, chat_id, file_path, caption=None, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'parse_mode': 'HTML'
        }
        if caption:
            data['caption'] = caption
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = str({'inline_keyboard': reply_markup})
        
        with open(file_path, 'rb') as photo:
            files = {'photo': photo}
            return self._make_request('sendPhoto', data, files)
    
    def send_photos(self, chat_id, photo_urls, caption, reply_to_message_id=None, reply_markup=None):
        if not photo_urls:
            return None
        
        if len(photo_urls) == 1:
            return self.send_photo(chat_id, photo_urls[0], caption, reply_to_message_id, reply_markup)
        
        media = []
        for i, url in enumerate(photo_urls[:10]):
            item = {'type': 'photo', 'media': url}
            if i == 0 and caption:
                item['caption'] = caption
                item['parse_mode'] = 'HTML'
            media.append(item)
        
        data = {
            'chat_id': chat_id,
            'media': media
        }
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        
        return self._make_request('sendMediaGroup', data)
    
    def send_video(self, chat_id, video_url, caption=None, reply_to_message_id=None, thumbnail=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'video': video_url,
            'parse_mode': 'HTML'
        }
        if caption:
            data['caption'] = caption
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if thumbnail:
            data['thumbnail'] = thumbnail
        if reply_markup:
            data['reply_markup'] = {'inline_keyboard': reply_markup}
        return self._make_request('sendVideo', data)
    
    def send_video_with_quality_fallback(self, chat_id, hd_url, sd_url, caption, reply_to_message_id=None, thumbnail=None, reply_markup=None):
        result = self.send_video(chat_id, hd_url, caption, reply_to_message_id, thumbnail, reply_markup)
        if not result or not result.get('ok'):
            result = self.send_video(chat_id, sd_url, caption, reply_to_message_id, thumbnail, reply_markup)
        return result
    
    def send_video_file(self, chat_id, file_path, caption=None, reply_to_message_id=None, thumbnail=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'parse_mode': 'HTML'
        }
        if caption:
            data['caption'] = caption
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = str({'inline_keyboard': reply_markup})
        
        with open(file_path, 'rb') as video:
            files = {'video': video}
            return self._make_request('sendVideo', data, files, timeout=300)
    
    def send_audio(self, chat_id, audio_url, title=None, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'audio': audio_url,
            'parse_mode': 'HTML'
        }
        if title:
            data['title'] = title
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = {'inline_keyboard': reply_markup}
        return self._make_request('sendAudio', data)
    
    def send_audio_file(self, chat_id, file_path, title=None, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'parse_mode': 'HTML'
        }
        if title:
            data['title'] = title
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = str({'inline_keyboard': reply_markup})
        
        with open(file_path, 'rb') as audio:
            files = {'audio': audio}
            return self._make_request('sendAudio', data, files, timeout=300)
    
    def send_document(self, chat_id, document, caption=None, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'document': document,
            'parse_mode': 'HTML'
        }
        if caption:
            data['caption'] = caption
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = {'inline_keyboard': reply_markup}
        return self._make_request('sendDocument', data)
    
    def send_document_file(self, chat_id, file_path, caption=None, reply_to_message_id=None, reply_markup=None):
        data = {
            'chat_id': chat_id,
            'parse_mode': 'HTML'
        }
        if caption:
            data['caption'] = caption
        if reply_to_message_id:
            data['reply_to_message_id'] = reply_to_message_id
        if reply_markup:
            data['reply_markup'] = str({'inline_keyboard': reply_markup})
        
        with open(file_path, 'rb') as doc:
            files = {'document': doc}
            return self._make_request('sendDocument', data, files)
    
    def answer_callback_query(self, callback_query_id, text=None, show_alert=False):
        data = {
            'callback_query_id': callback_query_id,
            'show_alert': show_alert
        }
        if text:
            data['text'] = text
        return self._make_request('answerCallbackQuery', data)
    
    def get_file(self, file_id):
        data = {'file_id': file_id}
        return self._make_request('getFile', data)
    
    def download_file(self, file_path):
        url = f"https://api.telegram.org/file/bot{self.bot_token}/{file_path}"
        try:
            response = requests.get(url, timeout=60)
            if response.status_code == 200:
                return response.content
        except Exception as e:
            print(f"[TelegramHandlers] Download file error: {e}")
        return None
