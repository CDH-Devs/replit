function htmlBold(text) {
    return `<b>${text}</b>`;
}

function formatDuration(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return 'N/A';
    
    const totalSeconds = Math.round(seconds);

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
        return `${m}:${String(s).padStart(2, '0')}`;
    }
}

function formatNumber(num) {
    if (typeof num !== 'number') return '0';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatTikTokCaption(data) {
    const { title, author, authorUsername, duration, music, musicAuthor } = data;
    
    const formattedDuration = formatDuration(duration);
    
    let caption = '';
    
    if (title && title !== 'TikTok Video') {
        const shortTitle = title.length > 100 ? title.substring(0, 100) + '...' : title;
        caption += `${htmlBold('Description:')} ${shortTitle}\n\n`;
    }
    
    caption += `👤 ${htmlBold('Author:')} ${author}`;
    if (authorUsername) {
        caption += ` (@${authorUsername})`;
    }
    caption += '\n';
    
    if (duration > 0) {
        caption += `⏱️ ${htmlBold('Duration:')} ${formattedDuration}\n`;
    }
    
    if (music) {
        caption += `\n🎵 ${htmlBold('Music:')} ${music}`;
        if (musicAuthor) {
            caption += ` - ${musicAuthor}`;
        }
        caption += '\n';
    }
    
    caption += `\n◇───────────────◇\n`;
    caption += `🚀 LK NEWS Download Bot\n`;
    caption += `🔥 TikTok Video Downloader`;

    return caption;
}

export { 
    htmlBold, 
    formatDuration,
    formatNumber,
    formatTikTokCaption 
};
