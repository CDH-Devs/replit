/**
 * Fetches Facebook video information using Cloudflare-compatible methods
 * Multiple fallback APIs for reliability
 */

export async function getFbVideoInfo(videoUrl) {
  console.log(`Fetching video info for: ${videoUrl}`);
  
  const apis = [
    { name: 'FDown', handler: tryFDownAPI },
    { name: 'GetFVid', handler: tryGetFVidAPI },
    { name: 'SaveFrom', handler: trySaveFromAPI },
    { name: 'Direct', handler: tryDirectMethod }
  ];
  
  for (const api of apis) {
    try {
      console.log(`Trying ${api.name} API...`);
      const result = await api.handler(videoUrl);
      if (result && (result.hd || result.sd)) {
        console.log(`Success with ${api.name} API`);
        return result;
      }
    } catch (error) {
      console.error(`${api.name} API failed:`, error.message);
    }
  }
  
  return { 
    error: 'Unable to fetch video. The video might be private, deleted, or temporarily unavailable.' 
  };
}

/**
 * Method 1: FDown.net API (most reliable)
 */
async function tryFDownAPI(videoUrl) {
  const apiUrl = 'https://www.fdown.net/download.php';
  
  const formData = new URLSearchParams();
  formData.append('URLz', videoUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    },
    body: formData.toString()
  });
  
  if (!response.ok) {
    throw new Error(`FDown API failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Extract video URLs from HTML response
  const hdMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*>\s*Download\s+High\s+Quality/i);
  const sdMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*>\s*Download\s+(?:Normal|Standard|Low)\s+Quality/i);
  
  if (hdMatch || sdMatch) {
    return {
      url: videoUrl,
      hd: hdMatch ? hdMatch[1] : null,
      sd: sdMatch ? sdMatch[1] : (hdMatch ? hdMatch[1] : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found in response');
}

/**
 * Method 2: GetFVid API
 */
async function tryGetFVidAPI(videoUrl) {
  const apiUrl = 'https://getfvid.com/downloader';
  
  const formData = new URLSearchParams();
  formData.append('url', videoUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: formData.toString()
  });
  
  if (!response.ok) {
    throw new Error(`GetFVid API failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Extract video URLs - GetFVid returns direct download links
  const hdMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*>\s*Download\s+in\s+(?:HD|High)/i);
  const sdMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*>\s*Download\s+in\s+(?:SD|Normal)/i);
  
  if (hdMatch || sdMatch) {
    return {
      url: videoUrl,
      hd: hdMatch ? hdMatch[1] : null,
      sd: sdMatch ? sdMatch[1] : (hdMatch ? hdMatch[1] : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found');
}

/**
 * Method 3: SaveFrom.net API
 */
async function trySaveFromAPI(videoUrl) {
  const apiUrl = `https://www.savefrom.net/download?url=${encodeURIComponent(videoUrl)}`;
  
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });
  
  if (!response.ok) {
    throw new Error(`SaveFrom API failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Extract download links
  const linkMatch = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
  
  if (linkMatch) {
    return {
      url: videoUrl,
      hd: linkMatch[1],
      sd: linkMatch[1],
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found');
}

/**
 * Method 4: Direct extraction (last resort)
 */
async function tryDirectMethod(videoUrl) {
  // Try to fetch the Facebook page directly
  const response = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Direct fetch failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Look for video URLs in page source (Facebook embeds them)
  const hdMatch = html.match(/"playable_url_quality_hd":"(https?:[^"]+)"/);
  const sdMatch = html.match(/"playable_url":"(https?:[^"]+)"/);
  
  if (hdMatch || sdMatch) {
    const decodeUrl = (url) => url.replace(/\\u0025/g, '%').replace(/\\\//g, '/');
    
    return {
      url: videoUrl,
      hd: hdMatch ? decodeUrl(hdMatch[1]) : null,
      sd: sdMatch ? decodeUrl(sdMatch[1]) : (hdMatch ? decodeUrl(hdMatch[1]) : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found in page source');
}
