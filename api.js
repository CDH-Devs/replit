// api.js - (403 Error) නිවැරදි කිරීම්

// getApiMetadata ශ්‍රිතය (වෙනස් නොවේ)
async function getApiMetadata(link, env) { 
    
    const apiUrl = env.API_URL || "https://fdown.isuru.eu.org/info"; 

    try {
        // ... (getApiMetadata ශ්‍රිතයේ පෙර කේතය) ...
        // ...
        // (මෙහිදී වෙනසක් නැත)
        
        const apiResponse = await fetch(apiUrl, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CloudflareWorker/1.0'
            },
            body: JSON.stringify({ url: link })
        });
        
        if (!apiResponse.ok) {
            throw new Error(`External API failed with status ${apiResponse.status}`);
        }
        
        const videoData = await apiResponse.json();
        
        const info = videoData.video_info || videoData.data || videoData;
        
        if (!info || (!info.title && !info.url && !info.thumbnail)) {
             throw new Error("API returned successfully, but no video metadata was found in the response.");
        }
        
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let uploader = 'Unknown Uploader';
        let duration = 0;
        let views = 0;
        let uploadDate = 'N/A';
        let filesize = 0; 
        
        if (info.thumbnail) {
            rawThumbnailLink = info.thumbnail.replace(/&amp;/g, '&');
        }
        if (info.title) {
            videoTitle = info.title;
        }
        uploader = info.uploader || info.page_name || 'Unknown Uploader';
        duration = info.duration || 0;
        views = info.view_count || info.views || 0;
        uploadDate = info.upload_date || 'N/A';
        filesize = info.filesize || 0; 

        return {
            thumbnailLink: rawThumbnailLink,
            videoTitle: videoTitle,
            uploader: uploader,
            duration: duration,
            views: views,
            uploadDate: uploadDate,
            filesize: filesize
        };

    } catch (e) {
        throw new Error(`API Metadata Error: ${e.message}`); 
    }
}


// scrapeVideoLinkAndThumbnail ශ්‍රිතය - Headers නිවැරදි කර ඇත
async function scrapeVideoLinkAndThumbnail(link) {
    const formData = new URLSearchParams();
    formData.append('URL', link);

    try {
        const fdownResponse = await fetch('https://fdown.net/download.php', {
            method: 'POST',
            headers: {
                // 🚨 යාවත්කාලීන කරන ලද User-Agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
                // 🚨 Referer header එක ඉවත් කර ඇත (403 මඟ හැරීමට)
                // 'Referer' header එක නොමැතිවීම සමහරවිට සේවාදායකය නොසලකා හැරීමට හේතු විය හැක
            },
            body: formData.toString(),
            redirect: 'follow'
        });

        if (!fdownResponse.ok) {
            // 403 status එකක් ලැබුණහොත්, Error එකක් Throw කරයි
            throw new Error(`Scraper request failed with status ${fdownResponse.status}`);
        }

        const resultHtml = await fdownResponse.text();
        let videoUrl = null;
        let fallbackThumbnail = null;

        // HD Link සොයයි
        const hdLinkRegex = /<a[^>]+href=[\"']?([^\"'\\s]+)[\"']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
        let match = resultHtml.match(hdLinkRegex);

        if (match && match[1]) {
            videoUrl = match[1];
        } else {
            // HD නොමැති නම් SD Link සොයයි
            const normalLinkRegex = /<a[^>]+href=[\"']?([^\"'\\s]+)[\"']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
            match = resultHtml.match(normalLinkRegex);

            if (match && match[1]) {
                videoUrl = match[1];
            }
        }
        
        // Thumbnail සොයයි
        const thumbnailRegex = /<img[^>]+class=[\"']?fb_img[\"']?[^>]*src=[\"']?([^\"'\\s]+)[\"']?/i;
        let thumbnailMatch = resultHtml.match(thumbnailRegex);
        if (thumbnailMatch && thumbnailMatch[1]) {
            fallbackThumbnail = thumbnailMatch[1];
        }

        return { videoUrl, fallbackThumbnail };
        
    } catch (e) {
        throw e;
    }

}


export {
    getApiMetadata,
    scrapeVideoLinkAndThumbnail
};
