const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

// <<< NAYE IMPORTS START >>>
// Cookies ko handle karne ke liye
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
// <<< NAYE IMPORTS END >>>

const app = express();
const PORT = process.env.PORT || 3000;

// <<< AXIOS INSTANCE WITH COOKIE SUPPORT START >>>
// Hum ek naya Axios instance banayenge jo cookies ko automatically handle karega.
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));
// <<< AXIOS INSTANCE WITH COOKIE SUPPORT END >>>


// Blocklist bilkul waisi hi rahegi
const blocklist = [
    'doubleclick.net',
    'googlesyndication.com',
    'google-analytics.com',
    'googletagmanager.com',
    '/assets/jquery/static.js', // Query parameters hatane se block karna aasan hoga
    'bvtpk.com',
    'nm.bustleusurps.com'
];


app.get('/', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send(`
            <h1>Adblocker Proxy</h1>
            <p>Please provide a URL in the query parameter.</p>
            <p>Example: <a href="/?url=https://www.w3schools.com/html/">/?url=https://www.w3schools.com/html/</a></p>
        `);
    }

    try {
        // <<< YAHAN BADLAV KIYA GAYA HAI >>>
        // Hum ab 'client' (cookie-supported axios) ka istemal karenge aur behtar headers bhejenge
        const response = await client.get(targetUrl, {
            headers: {
                // Real browser jaise dikhne ke liye zaroori headers
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': new URL(targetUrl).origin, // Website ko batana ki hum usi ki site se aaye hain
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'DNT': '1' // Do Not Track
            },
            // Gzip/compressed data ko handle karne ke liye
            responseType: 'arraybuffer', 
            decompress: true
        });

        // Response ke buffer ko HTML string me badalna
        const html = response.data.toString();
        // <<< BADLAV YAHAN KHATAM >>>
        
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;

        console.log(`Proxying and cleaning: ${targetUrl}`);

        $('script, iframe, img, link').each((index, element) => {
            const el = $(element);
            let src = el.attr('src') || el.attr('href');

            if (!src) {
                return;
            }
            
            // '//' se shuru hone wale URLs ko handle karna
            if(src.startsWith('//')){
                src = new URL(targetUrl).protocol + src;
            }

            const absoluteSrc = new URL(src, targetUrl).href;
            const shouldBlock = blocklist.some(blockedDomain => absoluteSrc.includes(blockedDomain));

            if (shouldBlock) {
                console.log(`[BLOCKED] ==> ${absoluteSrc}`);
                el.remove();
            } else {
                if (el.attr('src')) el.attr('src', absoluteSrc);
                if (el.attr('href')) el.attr('href', absoluteSrc);
            }
        });
        
        console.log("Blocking div with class 'jw-logo'...");
        $('.jw-logo').remove();

        console.log("Blocking common ad containers...");
        $('[class*="ad"], [id*="ad"], [class*="banner"]').remove();

        res.send($.html());

    } catch (error) {
        console.error("Error fetching or processing URL:", error.message);
        if (error.response) {
             // Agar website ne error bheja hai (like 403 Forbidden)
            res.status(error.response.status).send(`Error from target server: ${error.response.statusText} <br> The website is likely blocking our proxy. <br> ${error.message}`);
        } else {
            res.status(500).send(`Error fetching the URL: ${targetUrl}. <br> ${error.message}`);
        }
    }
});

// <<< DEPLOYMENT KE LIYE BADLAV >>>
// '0.0.0.0' add karna zaroori hai taaki server Render jaise platform par sahi se chale
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
