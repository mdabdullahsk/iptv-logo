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

const RAM_CACHE = {}; 
const activeStreams = {};

function startFFmpegStream(channelKey, sourceUrl) {
    if (activeStreams[channelKey]) return;

    console.log(`[Low-CPU Stream Started] Channel: ${channelKey}`);

    RAM_CACHE[channelKey] = {};

    const ffmpegArgs = [
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
        '-i', sourceUrl,
        '-vf', `scale=640:-2,drawtext=text=${BRAND_NAME}:x=w-tw-20:y=20:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.4:boxborderw=2`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-bf', '0',             
        '-b:v', '600k',         
        '-maxrate', '700k',
        '-bufsize', '1400k',
        '-c:a', 'aac',
        '-b:a', '48k',
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
        console.log(`[Cleared RAM] Channel Stopped: ${channelKey}`);
        delete RAM_CACHE[channelKey];
        delete activeStreams[channelKey];
    });
}

setInterval(() => {
    const now = Date.now();
    for (const key in activeStreams) {
        if (now - activeStreams[key].lastRequested > 180000) {
            console.log(`[Idle Timeout] Closing stream: ${key}`);
            activeStreams[key].process.kill('SIGKILL');
        }
    }
}, 30000);

const server = http.createServer((req, res) => {

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

    const urlParts = req.url.split('?')[0].split('/').filter(p => p);

    if (urlParts.length === 0) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('Lightweight RAM IPTV Server Active');
    }

    const channelKey = urlParts[0];
    const fileName = urlParts[1] || 'index.m3u8';

    const sourceUrl = channelConfig[channelKey];

    if (!sourceUrl) {
        res.writeHead(404);
        return res.end('Channel Not Found');
    }

    if (!activeStreams[channelKey]) {
        startFFmpegStream(channelKey, sourceUrl);
    }
    
    activeStreams[channelKey].lastRequested = Date.now();

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
            if (attempts < 25) {
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
    console.log(` Pure RAM In-Memory IPTV Server Running on http://localhost:${PORT}`);
});
