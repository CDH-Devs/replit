// api.js - ENV විචල්‍යයන් භාවිතා කිරීමට යාවත්කාලීන කරන ලදී

async function getApiMetadata(link, env) { // env parameter එක receive කරයි
    try {
        const apiResponse = await fetch(env.API_URL, { // env.API_URL භාවිතා කරයි
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CloudflareWorker/1.0'
            },
            body: JSON.stringify({ url: link })
        });
        
        // ... (ඉතිරි කේතය නොවෙනස්ව පවතී) ...
    } catch (e) {
        throw e;
    }
}


async function scrapeVideoLinkAndThumbnail(link) {
    // ... (මෙහි වෙනසක් නැත) ...
}

export {
    getApiMetadata,
    scrapeVideoLinkAndThumbnail
};
