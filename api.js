import Tiktok from '@tobyg74/tiktok-api-dl';

function extractVideoUrl(videoData, fullResponse = null) {
    if (!videoData) {
        return null;
    }
    
    // If it's already a string (direct URL)
    if (typeof videoData === 'string') {
        return videoData;
    }
    
    // If it's an array, take the first element
    if (Array.isArray(videoData)) {
        return extractVideoUrl(videoData[0], fullResponse);
    }
    
    // If it's an object, try various properties
    if (typeof videoData === 'object') {
        return videoData.noWatermark || 
               videoData.watermark ||
               videoData.downloadAddr || 
               videoData.playAddr ||
               videoData.downloadUrl ||
               videoData.download ||
               videoData.url ||
               videoData.link ||
               videoData.mp4 ||
               videoData.video ||
               null;
    }
    
    return null;
}

function extractVideoUrlFromResponse(data) {
    // Try direct video property first
    let videoUrl = extractVideoUrl(data.video);
    if (videoUrl) return videoUrl;
    
    // Try HD video
    if (data.videoHD) {
        videoUrl = extractVideoUrl(data.videoHD);
        if (videoUrl) return videoUrl;
    }
    
    // Try SD video
    if (data.videoSD) {
        videoUrl = extractVideoUrl(data.videoSD);
        if (videoUrl) return videoUrl;
    }
    
    // Try watermark version
    if (data.videoWatermark) {
        videoUrl = extractVideoUrl(data.videoWatermark);
        if (videoUrl) return videoUrl;
    }
    
    return null;
}

async function getTikTokVideo(url) {
    console.log(`[TikTok API] Fetching video: ${url}`);
    
    try {
        const result = await Tiktok.Downloader(url, {
            version: "v3"
        });
        
        console.log(`[TikTok API] Response status: ${result.status}`);
        
        if (result.status !== 'success' || !result.result) {
            console.log(`[TikTok API] Failed: ${result.message || 'Unknown error'}`);
            return {
                success: false,
                error: result.message || 'Failed to get video'
            };
        }
        
        const data = result.result;
        
        // Log all available keys for debugging
        console.log(`[TikTok API] Available keys:`, Object.keys(data).join(', '));
        
        // Extract video URL using the proper response handler
        const videoUrl = extractVideoUrlFromResponse(data);
        
        if (!videoUrl) {
            console.log(`[TikTok API] No URL found. Result keys:`, Object.keys(data).join(', '));
        }
        
        // Try multiple possible locations for stats
        let plays = 0, likes = 0, comments = 0, shares = 0;
        
        // Check if stats are in video sub-object
        if (data.video) {
            plays = data.video.playCount || data.video.play_count || plays;
            likes = data.video.likeCount || data.video.like_count || likes;
            comments = data.video.commentCount || data.video.comment_count || comments;
            shares = data.video.shareCount || data.video.share_count || shares;
        }
        
        // Check top level
        plays = data.playCount || data.play_count || data.plays || plays;
        likes = data.likeCount || data.like_count || data.likes || likes;
        comments = data.commentCount || data.comment_count || data.comments || comments;
        shares = data.shareCount || data.share_count || data.shares || shares;
        
        // Check statistics object
        plays = data.statistics?.playCount || data.statistics?.play_count || plays;
        likes = data.statistics?.likeCount || data.statistics?.like_count || likes;
        comments = data.statistics?.commentCount || data.statistics?.comment_count || comments;
        shares = data.statistics?.shareCount || data.statistics?.share_count || shares;
        
        console.log(`[TikTok API] Stats - Plays: ${plays}, Likes: ${likes}, Comments: ${comments}, Shares: ${shares}`);
        
        const videoData = {
            success: !!videoUrl,
            type: data.type || 'video',
            videoUrl: videoUrl,
            videoHD: extractVideoUrl(data.videoHD) || null,
            videoSD: extractVideoUrl(data.videoSD) || null,
            thumbnail: data.cover || data.thumbnail || null,
            title: data.desc || data.title || 'TikTok Video',
            author: data.author?.nickname || data.author?.name || 'Unknown',
            authorUsername: data.author?.username || data.author?.unique_id || '',
            duration: data.duration || 0,
            plays: plays,
            likes: likes,
            comments: comments,
            shares: shares,
            music: data.music?.title || data.music_info?.title || null,
            musicAuthor: data.music?.author || data.music_info?.author || null,
            images: data.images || null
        };
        
        if (videoData.title && videoData.title !== 'TikTok Video') {
            console.log(`[TikTok API] Success: ${videoData.title.substring(0, 50)}...`);
        }
        console.log(`[TikTok API] Video URL found: ${videoUrl ? 'Yes' : 'No'}`);
        
        return videoData;
        
    } catch (error) {
        console.log(`[TikTok API] Error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

async function downloadTikTokVideo(url) {
    let result = await getTikTokVideo(url);
    
    // If v3 failed, try v2
    if (!result.success || !result.videoUrl) {
        console.log('[TikTok] V3 failed, trying V2...');
        try {
            const v2Result = await Tiktok.Downloader(url, { version: "v2" });
            if (v2Result.status === 'success' && v2Result.result) {
                const data = v2Result.result;
                const videoUrl = extractVideoUrlFromResponse(data);
                if (videoUrl) {
                    result = {
                        ...result,
                        success: true,
                        videoUrl: videoUrl,
                        videoHD: extractVideoUrl(data.videoHD) || null,
                        videoSD: extractVideoUrl(data.videoSD) || null,
                        thumbnail: data.cover || data.thumbnail,
                        title: data.desc || data.title || 'TikTok Video',
                        author: data.author?.nickname || data.author?.name || 'Unknown',
                        authorUsername: data.author?.username || data.author?.unique_id || '',
                        duration: data.duration || 0,
                        plays: data.statistics?.playCount || data.play_count || 0,
                        likes: data.statistics?.likeCount || data.like_count || 0,
                        comments: data.statistics?.commentCount || data.comment_count || 0,
                        shares: data.statistics?.shareCount || data.share_count || 0,
                        music: data.music?.title || data.music_info?.title || null,
                        musicAuthor: data.music?.author || data.music_info?.author || null,
                        images: data.images || null
                    };
                }
            }
        } catch (e) {
            console.log(`[TikTok] V2 error: ${e.message}`);
        }
    }
    
    // If both failed, try v1
    if (!result.success || !result.videoUrl) {
        console.log('[TikTok] Trying V1...');
        try {
            const v1Result = await Tiktok.Downloader(url, { version: "v1" });
            if (v1Result.status === 'success' && v1Result.result) {
                const data = v1Result.result;
                const videoUrl = extractVideoUrlFromResponse(data);
                if (videoUrl) {
                    result = {
                        ...result,
                        success: true,
                        videoUrl: videoUrl,
                        videoHD: extractVideoUrl(data.videoHD) || null,
                        videoSD: extractVideoUrl(data.videoSD) || null,
                        thumbnail: data.cover || data.thumbnail,
                        title: data.desc || data.title || 'TikTok Video',
                        author: data.author?.nickname || data.author?.name || 'Unknown',
                        authorUsername: data.author?.username || data.author?.unique_id || '',
                        duration: data.duration || 0,
                        plays: data.statistics?.playCount || data.play_count || 0,
                        likes: data.statistics?.likeCount || data.like_count || 0,
                        comments: data.statistics?.commentCount || data.comment_count || 0,
                        shares: data.statistics?.shareCount || data.share_count || 0,
                        music: data.music?.title || data.music_info?.title || null,
                        musicAuthor: data.music?.author || data.music_info?.author || null,
                        images: data.images || null
                    };
                }
            }
        } catch (e) {
            console.log(`[TikTok] V1 error: ${e.message}`);
        }
    }
    
    return result;
}

export {
    getTikTokVideo,
    downloadTikTokVideo
};
