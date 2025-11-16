export async function getFbVideoInfo(videoUrl) {
  console.log(`Fetching video info for: ${videoUrl}`);
  
  try {
    const apiUrl = `https://www.facebook.com/watch/?v=${extractVideoId(videoUrl)}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    
    if (!response.ok) {
      return {
        error: 'Unable to fetch video information'
      };
    }
    
    const html = await response.text();
    
    const hdMatch = html.match(/"playable_url_quality_hd":"([^"]+)"/);
    const sdMatch = html.match(/"playable_url":"([^"]+)"/);
    const titleMatch = html.match(/"title":"([^"]+)"/);
    
    const hdUrl = hdMatch ? hdMatch[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/') : null;
    const sdUrl = sdMatch ? sdMatch[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/') : null;
    const title = titleMatch ? titleMatch[1] : 'Facebook Video';
    
    if (!hdUrl && !sdUrl) {
      return {
        error: 'Could not extract video URL. Video might be private or unavailable.'
      };
    }
    
    return {
      url: hdUrl || sdUrl,
      hd: hdUrl,
      sd: sdUrl,
      title: title,
      thumbnail: '',
      duration: 0,
      author: ''
    };
  } catch (error) {
    console.error('Facebook video fetch error:', error.message);
    
    if (error.message.includes('private') || error.message.includes('unavailable')) {
      return {
        error: 'This video is private or not available'
      };
    }
    
    return {
      error: `Failed to fetch video: ${error.message}`
    };
  }
}

function extractVideoId(url) {
  const patterns = [
    /facebook\.com\/.*\/videos\/(\d+)/,
    /facebook\.com\/watch\/?\?v=(\d+)/,
    /fb\.watch\/([a-zA-Z0-9_-]+)/,
    /facebook\.com\/.*\/posts\/(\d+)/,
    /facebook\.com\/reel\/(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return url.split('/').pop().split('?')[0];
}
