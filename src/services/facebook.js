import { chromium } from 'playwright';

let browser = null;
let browserContext = null;

async function initBrowser() {
  if (!browser) {
    console.log('🌐 Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });
    
    browserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    
    console.log('✅ Browser launched successfully');
  }
  return browserContext;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    browserContext = null;
    console.log('🔒 Browser closed');
  }
}

async function extractVideoWithPlaywright(videoUrl) {
  let page = null;
  try {
    const context = await initBrowser();
    page = await context.newPage();
    
    console.log('📱 Navigating to Facebook video...');
    
    const videoUrls = [];
    
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.mp4') || url.includes('video')) {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('video')) {
          console.log('🎥 Found video URL:', url.substring(0, 100) + '...');
          videoUrls.push(url);
        }
      }
    });
    
    await page.goto(videoUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    
    const videoElements = await page.$$('video');
    for (const video of videoElements) {
      const src = await video.getAttribute('src');
      if (src && src.includes('http')) {
        videoUrls.push(src);
      }
    }
    
    if (videoUrls.length > 0) {
      const uniqueUrls = [...new Set(videoUrls)];
      const hdUrl = uniqueUrls.find(url => url.includes('hd') || url.includes('720') || url.includes('1080'));
      const sdUrl = uniqueUrls.find(url => !url.includes('hd') && (url.includes('sd') || url.includes('480')));
      
      return {
        url: hdUrl || sdUrl || uniqueUrls[0],
        hd: hdUrl || uniqueUrls[0],
        sd: sdUrl || uniqueUrls[0],
        title: 'Facebook Video',
        service: 'Playwright'
      };
    }
    
    throw new Error('No video URLs captured');
  } catch (error) {
    console.error('Playwright extraction failed:', error.message);
    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function tryGetFVid(videoUrl) {
  try {
    const response = await fetch('https://www.getfvid.com/downloader', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.getfvid.com/'
      },
      body: `url=${encodeURIComponent(videoUrl)}`
    });
    
    if (!response.ok) {
      throw new Error(`GetFVid returned status ${response.status}`);
    }
    
    const html = await response.text();
    
    const hdMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Download\s+in\s+(?:HD|High)/i);
    const sdMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Download\s+in\s+(?:SD|Normal)/i);
    
    const hdUrl = hdMatch ? hdMatch[1] : null;
    const sdUrl = sdMatch ? sdMatch[1] : null;
    
    if (!hdUrl && !sdUrl) {
      const anyDownload = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
      if (anyDownload) {
        return {
          url: anyDownload[1],
          hd: anyDownload[1],
          sd: anyDownload[1],
          title: 'Facebook Video',
          service: 'GetFVid'
        };
      }
      throw new Error('No download links found');
    }
    
    return {
      url: hdUrl || sdUrl,
      hd: hdUrl,
      sd: sdUrl,
      title: 'Facebook Video',
      service: 'GetFVid'
    };
  } catch (error) {
    console.error('GetFVid failed:', error.message);
    throw error;
  }
}

export async function getFbVideoInfo(videoUrl, env) {
  console.log(`Fetching video info for: ${videoUrl}`);
  
  const quickServices = [
    { name: 'GetFVid', func: tryGetFVid }
  ];
  
  for (const service of quickServices) {
    try {
      console.log(`Trying ${service.name}...`);
      const result = await service.func(videoUrl);
      console.log(`✅ Success with ${service.name}`);
      return {
        url: result.url,
        hd: result.hd,
        sd: result.sd,
        title: result.title,
        thumbnail: '',
        duration: 0,
        author: ''
      };
    } catch (error) {
      console.log(`❌ ${service.name} failed: ${error.message}`);
      continue;
    }
  }
  
  console.log('⚙️ Quick services failed, using browser automation...');
  
  try {
    const result = await extractVideoWithPlaywright(videoUrl);
    console.log('✅ Success with browser automation');
    return {
      url: result.url,
      hd: result.hd,
      sd: result.sd,
      title: result.title,
      thumbnail: '',
      duration: 0,
      author: ''
    };
  } catch (error) {
    console.log(`❌ Browser automation failed: ${error.message}`);
  }
  
  console.log('\n⚠️ All methods failed. Providing helpful message to user.');
  
  return {
    error: '❌ වීඩියෝව බාගත කිරීමට නොහැකි විය. / Unable to download video.\n\n' +
           '💡 කරුණාකර පරීක්ෂා කරන්න / Please check:\n' +
           '• වීඩියෝව ප්‍රසිද්ධ (public) දැයි / Video is public\n' +
           '• වීඩියෝව තවමත් ලබා ගත හැකි දැයි / Video is still available\n' +
           '• URL එක නිවැරදි දැයි / URL is correct\n\n' +
           '🔄 සේවාවන් තාවකාලිකව අක්‍රීය විය හැක. කරුණාකර පසුව නැවත උත්සාහ කරන්න.\n' +
           'Services may be temporarily down. Please try again later.'
  };
}

process.on('SIGINT', async () => {
  await closeBrowser();
});

process.on('SIGTERM', async () => {
  await closeBrowser();
});
