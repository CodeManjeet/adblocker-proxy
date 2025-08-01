const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// ====> YOUR BLOCKLIST <====
// Scripts, iframes, and images from these sources will be blocked.
const blocklist = [
    'doubleclick.net',
    'google-analytics.com',
    'googletagmanager.com',
    'googlesyndication.com',
    'adservice.google.com',
    '/assets/jquery/static.js?type=mainstream&u=30334&v=2.0',
    '//bvtpk.com/tag.min.js',
    'nm.bustleusurps.com/g78AJDwy64Rnl59l/40913'
];
// ==========================================================


// Root route to provide instructions
app.get('/', (req, res) => {
    res.send(`
        <h1>Adblocker Proxy Server</h1>
        <p>This proxy fetches a website, removes ads and trackers, and serves the clean content.</p>
        <p><b>Usage:</b> Append <code>/proxy/</code> followed by the full URL you want to visit.</p>
        <p><b>Example:</b> <a href="/proxy/https://www.w3schools.com/html/">/proxy/https://www.w3schools.com/html/</a></p>
    `);
});


// This is the new, primary proxy route. It handles all requests.
app.get('/proxy/*', async (req, res) => {
    // Extract the target URL from the request path
    // The '/*' captures everything after '/proxy/'
    const targetUrl = req.params[0];

    if (!targetUrl) {
        return res.status(400).send('Please provide a target URL in the path. Example: /proxy/https://example.com');
    }

    console.log(`[PROXY] ==> Request for: ${targetUrl}`);

    try {
        // Fetch the target URL. 'responseType: stream' is crucial for handling all content types (images, etc.)
        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                // Forward some headers from the original request to seem more like a real user
                'Accept': req.headers.accept,
                'Accept-Language': req.headers['accept-language'],
                'Referer': new URL(targetUrl).origin // Set a plausible referer
            }
        });

        // Get the content type from the original response
        const contentType = response.headers['content-type'];
        
        // Transfer the original headers to our response to the client
        res.set(response.headers);

        // If the content is HTML, we need to process and clean it.
        if (contentType && contentType.toLowerCase().includes('text/html')) {
            
            // Convert the response stream to a string to parse it
            let html = '';
            for await (const chunk of response.data) {
                html += chunk.toString();
            }

            const $ = cheerio.load(html);

            // This is the base URL of the site we are proxying (e.g., https://www.w3schools.com)
            const baseUrl = new URL(targetUrl).origin;

            // === CORE LOGIC: Find all elements with src or href attributes ===
            $('script, iframe, img, link, a').each((index, element) => {
                const el = $(element);
                // Get the original URL from src or href
                const originalUrlAttr = el.attr('src') || el.attr('href');

                if (!originalUrlAttr) {
                    return;
                }

                // Create a full, absolute URL from the original attribute
                // (e.g., '/path/style.css' becomes 'https://example.com/path/style.css')
                const absoluteUrl = new URL(originalUrlAttr, targetUrl).href;

                // 1. --- BLOCKING LOGIC ---
                const shouldBlock = blocklist.some(blockedItem => absoluteUrl.includes(blockedItem));

                if (shouldBlock) {
                    console.log(`[BLOCKED] ==> ${absoluteUrl}`);
                    el.remove(); // Remove the element from the HTML
                    return; // Skip to the next element
                }

                // 2. --- REWRITING LOGIC ---
                // Rewrite the URL to point back to our proxy
                const proxyUrl = `/proxy/${absoluteUrl}`;

                if (el.attr('src')) {
                    el.attr('src', proxyUrl);
                }
                if (el.attr('href')) {
                    // Don't proxy anchor links (#)
                    if (originalUrlAttr.startsWith('#')) {
                        return;
                    }
                    el.attr('href', proxyUrl);
                }
            });
            
            // === AD-DIV BLOCKING LOGIC ===
            console.log("Blocking specific ad containers...");
            $('.jw-logo').remove();
            $('[class*="ad"], [id*="ad"]').remove();

            // Send the cleaned and rewritten HTML to the user
            res.send($.html());

        } else {
            // If the content is NOT HTML (e.g., CSS, JS, an image), just pass it through directly.
            // .pipe() sends the data stream directly to the user, which is very efficient.
            console.log(`[STREAM] ==> Piping content of type: ${contentType}`);
            response.data.pipe(res);
        }

    } catch (error) {
        console.error("Error in proxy request:", error.message);
        res.status(500).send(`Error fetching the URL via proxy. <br> ${error.message}`);
    }
});


app.listen(PORT, () => {
    console.log(`Adblocker Proxy server is running on http://localhost:${PORT}`);
    console.log(`Usage: Open http://localhost:${PORT}/proxy/https://example.com`);
});
