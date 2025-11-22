async function getApiMetadata(link, API_URL) {
    try {
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CloudflareWorker/1.0'
            },
            body: JSON.stringify({ url: link })
        });
        
        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }
        
        const videoData = await apiResponse.json();
        
        const info = videoData.video_info || videoData.data || videoData;
        
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let uploader = 'Unknown Uploader';
        let duration = 0;
        let views = 0;
        let uploadDate = 'N/A';
        let filesize = 0; 
        
        if (info) {
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
        }

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
        return { 
            thumbnailLink: null, 
            videoTitle: "Facebook Video", 
            uploader: 'Unknown Uploader',
            duration: 0,
            views: 0,
            uploadDate: 'N/A',
            filesize: 0 
        };
    }
}

async function scrapeVideoLinkAndThumbnail(link) {
    const fdownUrl = "https://fdown.net/download.php";
    
    const formData = new URLSearchParams();
    formData.append('URLz', link); 

    const fdownResponse = await fetch(fdownUrl, {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://fdown.net/',
        },
        body: formData.toString(),
        redirect: 'follow'
    });

    if (!fdownResponse.ok) {
        throw new Error(`Scraper request failed with status ${fdownResponse.status}`);
    }

    const resultHtml = await fdownResponse.text();
    let videoUrl = null;
    let fallbackThumbnail = null;

    const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
    let match = resultHtml.match(hdLinkRegex);

    if (match && match[1]) {
        videoUrl = match[1];
    } else {
        const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
        match = resultHtml.match(normalLinkRegex);

        if (match && match[1]) {
            videoUrl = match[1];
        }
    }
    
    const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
    let thumbnailMatch = resultHtml.match(thumbnailRegex);
    if (thumbnailMatch && thumbnailMatch[1]) {
         fallbackThumbnail = thumbnailMatch[1];
    }

    return {
        videoUrl: videoUrl ? videoUrl.replace(/&amp;/g, '&') : null,
        fallbackThumbnail: fallbackThumbnail ? fallbackThumbnail.replace(/&amp;/g, '&') : null
    };
}

export {
    getApiMetadata,
    scrapeVideoLinkAndThumbnail
};
