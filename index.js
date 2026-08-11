const http = require('http');
const { spawn } = require('child_process');

const channelConfig = {
    'jalsha-movies': 'http://180.94.28.28:8097/JALSHA-MOVIES/index.m3u8',
    'colors-bangla': 'http://180.94.28.28:8097/COLORS-BANGLA/index.m3u8',
    'star-jalsha':   'http://180.94.28.28:8097/STAR-JALSHA/index.m3u8',
    'zee-bangla':    'http://180.94.28.28:8097/ZEE-BANGLA/index.m3u8',
    'btv':           'http://180.94.28.28:8097/BTV/index.m3u8',
    'asports':       'http://180.94.28.28:8097/A-Sports/index.m3u8',
    'star-ss1':      'http://180.94.28.28:8097/Star-Sports-Select-1/index.m3u8',
    'star-ss2':      'http://180.94.28.28:8097/star-Sports-Select-2/index.m3u8',
    'ten5':          'http://180.94.28.28:8097/Sony-Ten-5/index.m3u8',
    'ten2':          'http://180.94.28.28:8097/Sony-Ten-2/index.m3u8',
    'ten1':          'http://180.94.28.28:8097/Sony-Ten-1/index.m3u8',
    'star2':         'http://180.94.28.28:8097/Star-Sports-2/index.m3u8',
    'star1':         'http://180.94.28.28:8097/STAR-SPORTS-1/index.m3u8',
    'sonyaath':      'http://180.94.28.28:8097/SONY-AATH/index.m3u8',

    'ptv':           'http://103.165.93.31:8095/ptv/index.m3u8',
    'tsports':       'http://103.165.93.31:8095/tsports/index.m3u8'
};

const BRAND_NAME = "MY_BRAND_TV";

// সম্পূর্ণ RAM মেমোরিতে ফাইল জমা রাখার অবজেক্ট (জিরো ডিস্ক স্টোরেজ)
const RAM_CACHE = {}; 
const activeStreams = {};

function startFFmpegStream(channelKey, sourceUrl) {
    if (activeStreams[channelKey]) return;

    console.log(`[🚀 RAM Stream Started] Transcoding for: ${channelKey}`);

    RAM_CACHE[channelKey] = {};

    const ffmpegArgs = [
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
        '-i', sourceUrl,
        '-vf', `scale=960:-2,drawtext=text=${BRAND_NAME}:x=w-tw-20:y=20:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.4:boxborderw=3`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-b:v', '800k',         // অত্যন্ত হালকা বিটরেট (৮০০ kbps)
        '-maxrate', '900k',
        '-bufsize', '1800k',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        '-method', 'PUT',
        `http://127.0.0.1:8181/upload/${channelKey}/index.m3u8`
    ];

    const process = spawn('ffmpeg', ffmpegArgs);

    activeStreams[channelKey] = {
        process,
        lastRequested: Date.now()
    };

    process.on('exit', () => {
        console.log(`[🛑 Cleared RAM] Channel Stopped: ${channelKey}`);
        delete RAM_CACHE[channelKey];
        delete activeStreams[channelKey];
    });
}

// ইন-অ্যাক্টিভ চ্যানেল ৩ মিনিট পর RAM থেকে রিমুভ করার টাইমার
setInterval(() => {
    const now = Date.now();
    for (const key in activeStreams) {
        if (now - activeStreams[key].lastRequested > 180000) { // ৩ মিনিট
            console.log(`[💤 Idle Timeout] Closing stream: ${key}`);
            activeStreams[key].process.kill('SIGKILL');
        }
    }
}, 30000);

const server = http.createServer((req, res) => {

    // ১. FFmpeg থেকে RAM এ HLS ফাইল আপলোড রিসিভ করা (PUT Method)
    if (req.method === 'PUT' && req.url.startsWith('/upload/')) {
        const parts = req.url.replace('/upload/', '').split('/');
        const channelKey = parts[0];
        const fileName = parts[1];

        if (!RAM_CACHE[channelKey]) RAM_CACHE[channelKey] = {};

        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            RAM_CACHE[channelKey][fileName] = Buffer.concat(chunks);
            res.writeHead(200);
            res.end();
        });
        return;
    }

    // ২. ইউজারের প্লেয়ার রিকোয়েস্ট হ্যান্ডেল করা (GET Method)
    const urlParts = req.url.split('?')[0].split('/').filter(p => p);

    if (urlParts.length === 0) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('Lightweight RAM IPTV Server Active');
    }

    const channelKey = urlParts[0];
    const fileName = urlParts[1] || 'index.m3u8'; // ডিফল্ট প্লেলিস্ট

    const sourceUrl = channelConfig[channelKey];

    if (!sourceUrl) {
        res.writeHead(404);
        return res.end('Channel Not Found');
    }

    // ব্যাকগ্রাউন্ডে FFmpeg চালু না থাকলে চালুকরো
    if (!activeStreams[channelKey]) {
        startFFmpegStream(channelKey, sourceUrl);
    }
    
    activeStreams[channelKey].lastRequested = Date.now();

    // RAM থেকে ডাটা নিয়ে ক্লায়েন্টকে দেওয়া
    let attempts = 0;
    const sendFromRAM = () => {
        if (RAM_CACHE[channelKey] && RAM_CACHE[channelKey][fileName]) {
            const data = RAM_CACHE[channelKey][fileName];
            const isM3u8 = fileName.endsWith('.m3u8');

            res.writeHead(200, {
                'Content-Type': isM3u8 ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
            });
            res.end(data);
        } else {
            attempts++;
            if (attempts < 25) { // ফাইল র‍্যামে তৈরি হওয়া পর্যন্ত ৪ সেকেন্ড অপেক্ষা
                setTimeout(sendFromRAM, 150);
            } else {
                res.writeHead(404);
                res.end('Stream Loading...');
            }
        }
    };

    sendFromRAM();
});

const PORT = 8181;
server.listen(PORT, () => {
    console.log(`🚀 Pure RAM In-Memory IPTV Server Running on http://localhost:${PORT}`);
});
