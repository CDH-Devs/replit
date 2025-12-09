import { readFileSync, writeFileSync, existsSync } from 'fs';

const HISTORY_FILE = 'downloaded_songs.json';

function loadHistory() {
    try {
        if (existsSync(HISTORY_FILE)) {
            const data = readFileSync(HISTORY_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log(`[SongHistory] Error loading history: ${e.message}`);
    }
    return { songs: [] };
}

function saveHistory(history) {
    try {
        writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.log(`[SongHistory] Error saving history: ${e.message}`);
    }
}

export function isAlreadyDownloaded(identifier) {
    const history = loadHistory();
    return history.songs.some(song => 
        song.url === identifier || 
        song.videoId === identifier ||
        song.title?.toLowerCase() === identifier?.toLowerCase()
    );
}

export function addToHistory(songInfo) {
    const history = loadHistory();
    
    const exists = history.songs.some(song => 
        song.url === songInfo.url || 
        song.videoId === songInfo.videoId
    );
    
    if (!exists) {
        history.songs.push({
            title: songInfo.title,
            url: songInfo.url,
            videoId: songInfo.videoId,
            downloadedAt: new Date().toISOString()
        });
        saveHistory(history);
        console.log(`[SongHistory] Added: ${songInfo.title}`);
        return true;
    }
    
    console.log(`[SongHistory] Already exists: ${songInfo.title}`);
    return false;
}

export function getDownloadedCount() {
    const history = loadHistory();
    return history.songs.length;
}
