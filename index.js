const http = require('http');
const { spawn } = require('child_process');

const channelConfig = {
    'jalsha-movies': 'https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8',
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

// RAM Cache for HLS Files
const RAM_CACHE = {}; 
const activeStreams = {};

function startFFmpegStream(channelKey, sourceUrl) {
    if (activeStreams[channelKey]) return;

    console.log(`[Stream Started] Channel: ${channelKey}`);

    RAM_CACHE[channelKey] = {};
    
    const ffmpegArgs = [
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
        '-i', sourceUrl,
        '-vf', `scale=1280:-2,drawtext=text=${BRAND_NAME}:x=w-tw-25:y=25:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.4:boxborderw=3`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-bf', '0',
        '-g', '30',
        '-r', '25',
        '-b:v', '1200k',
        '-maxrate', '1400k',
        '-bufsize', '2800k',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+omit_endlist',
        '-method', 'PUT',
        `http://127.0.0.1:8181/upload/${channelKey}/index.m3u8`
    ];

    const process = spawn('ffmpeg', ffmpegArgs);

    activeStreams[channelKey] = {
        process,
        lastRequested: Date.now()
    };

    process.on('exit', () => {
        console.log(`[Channel Stopped] Cleared RAM: ${channelKey}`);
        delete RAM_CACHE[channelKey];
        delete activeStreams[channelKey];
    });
}

setInterval(() => {
    const now = Date.now();
    for (const key in activeStreams) {
        if (now - activeStreams[key].lastRequested > 300000) {
            console.log(`[ Auto Timeout] Stopping stream: ${key}`);
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
            
            const files = Object.keys(RAM_CACHE[channelKey]);
            if (files.length > 22) {
                const tsFiles = files.filter(f => f.endsWith('.ts')).sort();
                while (tsFiles.length > 12) {
                    const oldest = tsFiles.shift();
                    delete RAM_CACHE[channelKey][oldest];
                }
            }

            res.writeHead(200);
            res.end();
        });
        return;
    }
    
    const urlParts = req.url.split('?')[0].split('/').filter(p => p);

    if (urlParts.length === 0) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('Pro Reseller IPTV RAM Server Active');
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
           
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*'
            };

            if (isM3u8) {
                headers['Content-Type'] = 'application/vnd.apple.mpegurl';
                headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0';
                headers['Pragma'] = 'no-cache';
                headers['Expires'] = '0';
            } else {
                headers['Content-Type'] = 'video/mp2t';
                headers['Cache-Control'] = 'public, max-age=86400';
            }

            res.writeHead(200, headers);
            res.end(data);
        } else {
            attempts++;
            if (attempts < 30) {
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
    console.log(` Pro Reseller IPTV Server Running on http://localhost:${PORT}`);
});
