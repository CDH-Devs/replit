<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title id="pageTitle">File Download - C D H Corporation</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        :root {
            --primary-color: #0088cc; /* Telegram Blue */
            --success-color: #28a745;
        }
        body { 
            background-color: #f8f9fa; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .container { 
            max-width: 800px; 
            margin-top: 50px; 
            margin-bottom: 50px;
        }
        .download-box { 
            background: #ffffff; 
            border-radius: 10px; 
            padding: 40px; 
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1); 
        }
        .btn-download { 
            background-color: var(--success-color); 
            border-color: var(--success-color); 
            font-size: 1.5rem; 
            padding: 15px 40px; 
            border-radius: 50px; 
            transition: background-color 0.3s, transform 0.3s; 
        }
        .btn-download:hover { 
            background-color: #1e7e34; 
            border-color: #1e7e34;
            transform: translateY(-2px);
        }
        .thumbnail-img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }
        .info-label {
            font-weight: 600;
            color: var(--primary-color);
        }
    </style>
</head>
<body>

<div class="container">
    <div class="download-box text-center">
        
        <h1 class="mb-4 text-dark fw-bold">⬇️ File Download Ready</h1>
        
        <div id="loadingState" class="alert alert-info" role="alert">
            Loading video details...
        </div>
        
        <div id="videoDetails" class="d-none">
            
            <h2 id="videoTitle" class="mt-2 mb-4 text-primary"></h2>

            <a id="downloadButton" href="#" class="btn btn-download text-white mt-4 mb-4" download>
                Click to Download Video
            </a>
            
            <div class="row text-start mt-4 border rounded p-3 bg-light">
                <div class="col-md-6 mb-2">
                    <span class="info-label">👤 Uploader:</span> <span id="uploaderText">N/A</span>
                </div>
                <div class="col-md-6 mb-2">
                    <span class="info-label">⏱️ Duration:</span> <span id="durationText">N/A</span>
                </div>
                <div class="col-md-6 mb-2">
                    <span class="info-label">👁️ Views:</span> <span id="viewsText">N/A</span>
                </div>
                <div class="col-md-6 mb-2">
                    <span class="info-label">📅 Uploaded:</span> <span id="uploadDateText">N/A</span>
                </div>
            </div>

            <p class="mt-3 text-muted small">
                If the download doesn't start, please right-click the button and select "Save Link As..."
            </p>
        </div>
        
        <div id="errorState" class="d-none alert alert-danger" role="alert">
            ❌ Error: Invalid video link or required data is missing.
        </div>
    </div>
    
    <footer class="text-center mt-4">
        <p class="small text-muted mb-0">Powered by C D H Corporation © | Cloudflare Worker Bot</p>
    </footer>
</div>

<script>
    // formatCaption function එකේ logic එක සරල කර මෙහි භාවිතා කර ඇත.
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

    document.addEventListener('DOMContentLoaded', function() {
        const params = new URLSearchParams(window.location.search);
        
        // Base64 Encoded දත්ත ලබාගැනීම
        const encodedUrl = params.get('url');
        const encodedTitle = params.get('title');
        const encodedUploader = params.get('uploader');
        const encodedDuration = params.get('duration');
        const encodedViews = params.get('views');
        const encodedUploadDate = params.get('uploadDate');
        // encodedThumbnail අවශ්‍ය නැත, මන්ද එය කෙලින්ම URL එකට යැවිය නොහැක.
        
        const downloadButton = document.getElementById('downloadButton');
        const videoTitleElement = document.getElementById('videoTitle');
        const loadingState = document.getElementById('loadingState');
        const videoDetails = document.getElementById('videoDetails');
        const errorState = document.getElementById('errorState');
        
        const uploaderText = document.getElementById('uploaderText');
        const durationText = document.getElementById('durationText');
        const viewsText = document.getElementById('viewsText');
        const uploadDateText = document.getElementById('uploadDateText');
        const pageTitle = document.getElementById('pageTitle');

        if (encodedUrl) {
            try {
                // Base64 Decode
                const decodedUrl = atob(encodedUrl);
                const decodedTitle = encodedTitle ? atob(encodedTitle) : 'Facebook Video';
                const decodedUploader = encodedUploader ? atob(encodedUploader) : 'Unknown Uploader';
                const decodedDuration = encodedDuration ? formatDuration(parseInt(atob(encodedDuration))) : 'N/A';
                const decodedViews = encodedViews ? parseInt(atob(encodedViews)).toLocaleString('en-US') : 'N/A';
                
                let decodedUploadDate = encodedUploadDate ? atob(encodedUploadDate) : 'N/A';
                if (decodedUploadDate && /^\d{8}$/.test(decodedUploadDate)) {
                    decodedUploadDate = decodedUploadDate.substring(0, 4) + '-' + decodedUploadDate.substring(4, 6) + '-' + decodedUploadDate.substring(6, 8);
                }

                // UI Update
                loadingState.classList.add('d-none');
                videoDetails.classList.remove('d-none');
                
                videoTitleElement.textContent = decodedTitle;
                pageTitle.textContent = `Download: ${decodedTitle}`;
                
                downloadButton.href = decodedUrl;
                downloadButton.download = decodedTitle.replace(/[^a-z0-9]/gi, '_') + '.mp4'; // File name set

                uploaderText.textContent = decodedUploader;
                durationText.textContent = decodedDuration;
                viewsText.textContent = decodedViews;
                uploadDateText.textContent = decodedUploadDate;

            } catch (e) {
                loadingState.classList.add('d-none');
                errorState.classList.remove('d-none');
                pageTitle.textContent = "Error Loading Link";
                console.error("Decoding error:", e);
            }
        } else {
            loadingState.classList.add('d-none');
            videoTitleElement.textContent = "Welcome to the Bot Download Page.";
            errorState.textContent = "Please use the Telegram Bot to generate a valid download link.";
            errorState.classList.remove('d-none');
        }
    });
</script>

</body>
</html>
