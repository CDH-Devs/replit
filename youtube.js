import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

async function searchYouTube(query, limit = 50) {
    console.log(`[YouTube] Searching for: ${query} (limit: ${limit})`);
    
    try {
        const { stdout } = await execAsync(
            `yt-dlp --flat-playlist --print "%(id)s|%(title)s|%(duration)s" "ytsearch${limit}:${query}"`,
            { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
        );
        
        const results = stdout.trim().split('\n')
            .filter(line => line.includes('|'))
            .map(line => {
                const [id, title, duration] = line.split('|');
                return {
                    id: id.trim(),
                    title: title ? title.trim() : 'Unknown',
                    duration: duration ? parseInt(duration) : 0,
                    url: `https://www.youtube.com/watch?v=${id.trim()}`
                };
            })
            .filter(item => item.id && item.id.length > 0);
        
        console.log(`[YouTube] Found ${results.length} results`);
        return results;
    } catch (error) {
        console.log(`[YouTube] Search error: ${error.message}`);
        return [];
    }
}

async function getVideoMetadata(videoUrl) {
    console.log(`[YouTube] Fetching metadata for: ${videoUrl}`);
    
    try {
        const { stdout } = await execAsync(
            `yt-dlp --print "%(title)s|||%(duration)s|||%(view_count)s|||%(like_count)s|||%(upload_date)s|||%(channel)s|||%(description)s|||%(thumbnail)s" --no-playlist "${videoUrl}"`,
            { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
        );
        
        const parts = stdout.trim().split('|||');
        const [title, duration, views, likes, uploadDate, channel, description, thumbnail] = parts;
        
        const durationSec = parseInt(duration) || 0;
        const minutes = Math.floor(durationSec / 60);
        const seconds = durationSec % 60;
        const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        let dateFormatted = 'Unknown';
        if (uploadDate && uploadDate.length === 8) {
            const year = uploadDate.substring(0, 4);
            const month = uploadDate.substring(4, 6);
            const day = uploadDate.substring(6, 8);
            dateFormatted = `${year}-${month}-${day}`;
        }
        
        const formatNumber = (num) => {
            const n = parseInt(num) || 0;
            if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
            if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
            return n.toString();
        };
        
        return {
            title: title || 'Unknown',
            duration: durationFormatted,
            views: formatNumber(views),
            likes: formatNumber(likes),
            uploadDate: dateFormatted,
            channel: channel || 'Unknown',
            description: (description || '').substring(0, 200),
            thumbnail: thumbnail || null
        };
    } catch (error) {
        console.log(`[YouTube] Metadata error: ${error.message}`);
        return null;
    }
}

async function downloadAudio(videoUrl, outputPath) {
    console.log(`[YouTube] Downloading audio from: ${videoUrl}`);
    
    return new Promise((resolve, reject) => {
        const args = [
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '128K',
            '-o', outputPath,
            '--no-playlist',
            '--no-warnings',
            '--quiet',
            '--max-filesize', '50M',
            videoUrl
        ];
        
        const process = spawn('yt-dlp', args);
        let stderr = '';
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            if (code === 0 && existsSync(outputPath)) {
                console.log(`[YouTube] Download complete: ${outputPath}`);
                resolve(outputPath);
            } else {
                console.log(`[YouTube] Download failed: ${stderr}`);
                reject(new Error(stderr || 'Download failed'));
            }
        });
        
        process.on('error', (err) => {
            reject(err);
        });
        
        setTimeout(() => {
            process.kill();
            reject(new Error('Download timeout'));
        }, 120000);
    });
}

function isYouTubeUrl(text) {
    try {
        const url = new URL(text);
        const hostname = url.hostname.toLowerCase();
        const youtubeHosts = [
            'youtube.com', 'www.youtube.com', 'm.youtube.com', 
            'music.youtube.com', 'shorts.youtube.com',
            'youtube-nocookie.com', 'www.youtube-nocookie.com',
            'youtu.be'
        ];
        return youtubeHosts.some(host => hostname === host || hostname.endsWith('.' + host));
    } catch {
        return false;
    }
}

function extractVideoId(urlString) {
    try {
        const url = new URL(urlString);
        
        if (url.hostname === 'youtu.be') {
            const id = url.pathname.slice(1).split('/')[0];
            if (id && id.length === 11) return id;
        }
        
        const vParam = url.searchParams.get('v');
        if (vParam && vParam.length === 11) return vParam;
        
        const pathPatterns = [
            /\/shorts\/([a-zA-Z0-9_-]{11})/,
            /\/embed\/([a-zA-Z0-9_-]{11})/,
            /\/v\/([a-zA-Z0-9_-]{11})/,
            /\/e\/([a-zA-Z0-9_-]{11})/
        ];
        
        for (const pattern of pathPatterns) {
            const match = url.pathname.match(pattern);
            if (match) return match[1];
        }
        
        return null;
    } catch {
        return null;
    }
}

async function downloadAndSendSongs(query, limit, handlers, chatId, statusMessageId, historyFunctions = null) {
    if (isYouTubeUrl(query)) {
        const videoId = extractVideoId(query);
        
        if (historyFunctions && videoId && historyFunctions.isAlreadyDownloaded(videoId)) {
            await handlers.editMessage(chatId, statusMessageId, `<b>⏭️ This song was already downloaded!</b>`);
            return { success: 0, failed: 0, skipped: 1 };
        }
        
        await handlers.editMessage(chatId, statusMessageId, `<b>🎵 Fetching song info...</b>\n\n🔄 Processing...`);
        
        const metadata = await getVideoMetadata(query);
        
        if (metadata && metadata.thumbnail) {
            const infoCaption = `🎵 <b>${metadata.title}</b>\n\n` +
                `⏱ <b>Duration:</b> ${metadata.duration}\n` +
                `👁 <b>Views:</b> ${metadata.views}\n` +
                `👍 <b>Likes:</b> ${metadata.likes}\n` +
                `📅 <b>Upload Date:</b> ${metadata.uploadDate}\n` +
                `📺 <b>Channel:</b> ${metadata.channel}\n\n` +
                `📝 <b>Description:</b>\n${metadata.description}${metadata.description.length >= 200 ? '...' : ''}`;
            
            await handlers.sendPhotoWithCaption(chatId, metadata.thumbnail, infoCaption, null);
        }
        
        await handlers.editMessage(chatId, statusMessageId, `<b>🎵 Downloading audio...</b>\n\n🔄 Please wait...`);
        await handlers.sendAction(chatId, 'upload_audio');
        
        const tempDir = tmpdir();
        const outputPath = join(tempDir, `song_url_${Date.now()}.mp3`);
        
        try {
            const title = metadata ? metadata.title : 'Unknown Song';
            
            await downloadAudio(query, outputPath);
            
            if (existsSync(outputPath)) {
                await handlers.sendAction(chatId, 'upload_audio');
                await handlers.sendAudioFile(chatId, outputPath, title, null);
                
                if (historyFunctions) {
                    historyFunctions.addToHistory({
                        title: title,
                        url: query,
                        videoId: videoId || query
                    });
                }
                
                try { unlinkSync(outputPath); } catch (e) {}
                await handlers.editMessage(chatId, statusMessageId, `<b>✅ Download Complete!</b>\n\n🎵 ${title}`);
                return { success: 1, failed: 0, skipped: 0 };
            }
        } catch (error) {
            console.log(`[YouTube] URL download failed: ${error.message}`);
            try { unlinkSync(outputPath); } catch (e) {}
        }
        
        await handlers.editMessage(chatId, statusMessageId, `<b>❌ Failed to download from URL</b>`);
        return { success: 0, failed: 1, skipped: 0 };
    }
    
    const results = await searchYouTube(query, limit);
    
    if (results.length === 0) {
        await handlers.editMessage(chatId, statusMessageId, `<b>❌ No songs found for:</b> ${query}`);
        return { success: 0, failed: 0, skipped: 0 };
    }
    
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const tempDir = tmpdir();
    
    const batchSize = 3;
    
    for (let i = 0; i < results.length; i += batchSize) {
        const batch = results.slice(i, i + batchSize);
        
        await handlers.editMessage(
            chatId, 
            statusMessageId, 
            `<b>🎵 Downloading songs...</b>\n\n` +
            `📥 Progress: ${successCount + failedCount + skippedCount}/${results.length}\n` +
            `✅ Success: ${successCount}\n` +
            `⏭️ Skipped: ${skippedCount}\n` +
            `❌ Failed: ${failedCount}\n\n` +
            `🔄 Processing batch ${Math.floor(i/batchSize) + 1}...`
        );
        
        const promises = batch.map(async (song, idx) => {
            if (historyFunctions && historyFunctions.isAlreadyDownloaded(song.id)) {
                console.log(`[YouTube] Skipping duplicate: ${song.title}`);
                return { success: false, skipped: true };
            }
            
            const safeTitle = song.title.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);
            const outputPath = join(tempDir, `song_${Date.now()}_${i + idx}.mp3`);
            
            try {
                await downloadAudio(song.url, outputPath);
                
                if (existsSync(outputPath)) {
                    await handlers.sendAudioFile(chatId, outputPath, song.title, null);
                    
                    if (historyFunctions) {
                        historyFunctions.addToHistory({
                            title: song.title,
                            url: song.url,
                            videoId: song.id
                        });
                    }
                    
                    try { unlinkSync(outputPath); } catch (e) {}
                    return { success: true, skipped: false };
                }
                return { success: false, skipped: false };
            } catch (error) {
                console.log(`[YouTube] Failed to download ${song.title}: ${error.message}`);
                try { unlinkSync(outputPath); } catch (e) {}
                return { success: false, skipped: false };
            }
        });
        
        const batchResults = await Promise.allSettled(promises);
        
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                if (result.value.skipped) {
                    skippedCount++;
                } else if (result.value.success) {
                    successCount++;
                } else {
                    failedCount++;
                }
            } else {
                failedCount++;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    await handlers.editMessage(
        chatId, 
        statusMessageId, 
        `<b>✅ Download Complete!</b>\n\n` +
        `🔍 Query: <i>${query}</i>\n` +
        `📊 Total: ${results.length} songs\n` +
        `✅ Success: ${successCount}\n` +
        `⏭️ Skipped (duplicates): ${skippedCount}\n` +
        `❌ Failed: ${failedCount}`
    );
    
    return { success: successCount, failed: failedCount, skipped: skippedCount };
}

export { searchYouTube, downloadAudio, downloadAndSendSongs, getVideoMetadata };
