const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const channelConfig = {
    'jalsha-movies': 'http://180.94.28.28:8097/JALSHA-MOVIES/',
    'colors-bangla': 'http://180.94.28.28:8097/COLORS-BANGLA/',
    'star-jalsha':   'http://180.94.28.28:8097/STAR-JALSHA/',
    'zee-bangla':    'http://180.94.28.28:8097/ZEE-BANGLA/',
    'btv':           'http://180.94.28.28:8097/BTV/',
    'asports':       'http://180.94.28.28:8097/A-Sports/',
    'star-ss1':      'http://180.94.28.28:8097/Star-Sports-Select-1/',
    'star-ss2':      'http://180.94.28.28:8097/star-Sports-Select-2/',
    'ten5':          'http://180.94.28.28:8097/Sony-Ten-5/',
    'ten2':          'http://180.94.28.28:8097/Sony-Ten-2/',
    'ten1':          'http://180.94.28.28:8097/Sony-Ten-1/',
    'star2':         'http://180.94.28.28:8097/Star-Sports-2/',
    'star1':         'http://180.94.28.28:8097/STAR-SPORTS-1/',
    'sonyaath':      'http://180.94.28.28:8097/SONY-AATH/',

    'ptv':           'http://103.165.93.31:8095/ptv/',
    'tsports':       'http://103.165.93.31:8095/tsports/'
};

const BRAND_NAME = "MY_BRAND_TV";

const server = http.createServer((req, res) => {
    const urlParts = req.url.split('?')[0].split('/').filter(p => p);
    const channelKey = urlParts[0]; 
    const fileName = urlParts.slice(1).join('/') || 'index.m3u8';

    const baseUrl = channelConfig[channelKey];

    if (baseUrl) {
        const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
        const targetUrl = baseUrl + fileName + queryString;

        // ১. ভিডিও সেগমেন্ট (.ts): -copyts যোগ করায় আসল সময় বজায় থাকবে
        if (fileName.endsWith('.ts')) {
            const ffmpegArgs = [
                '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
                '-copyts', // 👈 মূল ফিক্স: আসল টাইমস্ট্যাম্প বজায় রাখবে (১১ সেকেন্ডে সময় আটকাবে না)
                '-i', targetUrl,
                '-vf', `scale=1280:-2,drawtext=text=${BRAND_NAME}:x=w-tw-25:y=25:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.4:boxborderw=3`,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-bf', '0',
                '-c:a', 'copy',
                '-muxdelay', '0',
                '-f', 'mpegts',
                'pipe:1'
            ];

            res.writeHead(200, {
                'Content-Type': 'video/mp2t',
                'Access-Control-Allow-Origin': '*'
            });

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            ffmpegProcess.stdout.pipe(res);

            req.on('close', () => {
                ffmpegProcess.kill('SIGKILL');
            });

            ffmpegProcess.on('error', () => res.end());
            return;
        }

        // ২. প্লেলিস্ট (.m3u8) ডাইরেক্ট প্রক্সি
        try {
            const parsedUrl = new URL(targetUrl);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const options = {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Host': parsedUrl.host,
                    'Referer': parsedUrl.origin,
                    'Connection': 'keep-alive'
                }
            };

            const proxyReq = protocol.request(targetUrl, options, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, {
                    ...proxyRes.headers,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                proxyRes.pipe(res);
            });

            proxyReq.on('error', () => {
                res.writeHead(502);
                res.end();
            });

            proxyReq.setTimeout(10000, () => proxyReq.destroy());
            req.pipe(proxyReq);

        } catch (e) {
            res.writeHead(500);
            res.end();
        }
    } else {
        res.writeHead(404);
        res.end('Channel Not Found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Original Pure Proxy Server with Continuous PTS running on port ${PORT}`);
});
