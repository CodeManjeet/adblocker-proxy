const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url'); // Relative URL ko Absolute me badalne ke liye

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// ====> YAHAN APNI BLOCKLIST BANAYEIN <====
// In domains/sources se aane wale scripts, iframes, images block ho jayenge.
// Aap is list ko aur bada kar sakte hain.
const blocklist = [
    'doubleclick.net',
    '/assets/jquery/static.js?type=mainstream&u=30334&v=2.0',
    'https://www.googletagmanager.com/gtag/js?id=UA-123456789-1',
    '//bvtpk.com/tag.min.js',
    'nm.bustleusurps.com/g78AJDwy64Rnl59l/40913'
];
// ==========================================================


app.get('/', async (req, res) => {
    // 1. User se URL lena (Query parameter se)
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send(`
            <h1>Adblocker Proxy</h1>
            <p>Please provide a URL in the query parameter.</p>
            <p>Example: <a href="/?url=https://www.w3schools.com/html/">/?url=https://www.w3schools.com/html/</a></p>
        `);
    }

    try {
        // 2. Axios ka use karke target website ka HTML fetch karna
        const response = await axios.get(targetUrl, {
            headers: {
                // Kuch websites alag user-agent ko block karti hain, isliye browser jaisa dikhana behtar hai
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data;

        // 3. Cheerio se HTML ko load karna (server-side jQuery jaisa)
        const $ = cheerio.load(html);

        // Website ka base URL nikalna taaki relative links (jaise /images/logo.png) ko theek kar sakein
        const baseUrl = new URL(targetUrl).origin;

        console.log(`Proxying and cleaning: ${targetUrl}`);

        // 4. Sabhi scripts, iframes, images, aur links ko check karna
        $('script, iframe, img, link').each((index, element) => {
            const el = $(element);
            let src = el.attr('src') || el.attr('href');

            if (!src) {
                return; // Agar src ya href nahi hai to kuch na karein
            }

            // Relative URL (jaise '/style.css') ko full URL (jaise 'https://website.com/style.css') me badalna
            const absoluteSrc = new URL(src, targetUrl).href;

            // 5. Check karna ki source blocklist me hai ya nahi
            const shouldBlock = blocklist.some(blockedDomain => absoluteSrc.includes(blockedDomain));

            if (shouldBlock) {
                // Agar source blocklist me hai, to use HTML se हटा do
                console.log(`[BLOCKED] ==> ${absoluteSrc}`);
                el.remove();
            } else {
                // Agar block nahi karna hai, to uska relative path aane par use absolute path me badal do
                // Taaki hamare proxy server par sab aache se load ho
                if (el.attr('src')) el.attr('src', absoluteSrc);
                if (el.attr('href')) el.attr('href', absoluteSrc);
            }
        });
        
        // <==== NAYA CODE START ====>
        // Ab specific div ko uski class se block karte hain.
        
        // Tarika 1: Seedhe class ke naam se
        // Ye aapki di hui div jisme 'jw-logo' class hai, use hata dega.
        console.log("Blocking div with class 'jw-logo'...");
        $('.jw-logo').remove();

        // Tarika 2 (Extra): General ad-divs ko block karna
        // Aise koi bhi element jinki class ya id me "ad" शब्द aata ho, unhe hata do.
        console.log("Blocking common ad containers...");
        $('[class*="ad"], [id*="ad"]').remove();
        // <==== NAYA CODE END ====>


        // 6. Saaf kiya hua HTML user ko bhejna
        res.send($.html());

    } catch (error) {
        console.error("Error fetching or processing URL:", error.message);
        res.status(500).send(`Error fetching the URL: ${targetUrl}. <br> ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Adblocker Proxy server is running on http://localhost:${PORT}`);
});
