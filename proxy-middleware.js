/**
 * Simple API Proxy Middleware
 *
 * Forwards API requests from the dev server to the API server
 * This allows widgets to call /api/* on the same origin during development
 * 
 * IMPORTANT: This proxy forces cache: 'no-store' semantics to ensure
 * Cloudflare edge caching settings only apply in production.
 */

const http = require("http");

const API_HOST = "localhost";
const API_PORT = 3001;

function proxyToAPI(req, res) {
  // Clone headers but ensure no caching for dev
  const headers = { ...req.headers };
  headers["cache-control"] = "no-store, no-cache, must-revalidate";
  headers["pragma"] = "no-cache";
  
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Force no-cache headers for development responses
    const responseHeaders = { ...proxyRes.headers };
    responseHeaders["cache-control"] = "no-store, no-cache, must-revalidate";
    responseHeaders["x-dev-proxy"] = "true";
    
    // Copy status code with modified headers
    res.writeHead(proxyRes.statusCode, responseHeaders);

    // Pipe response
    proxyRes.pipe(res);
  });

  // Handle errors
  proxyReq.on("error", (err) => {
    console.error(`❌ API Proxy Error: ${err.message}`);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Bad Gateway",
        message: `API server not reachable at ${API_HOST}:${API_PORT}`,
        suggestion: "Make sure API server is running: npm run api:dev",
      })
    );
  });

  // Pipe request body
  req.pipe(proxyReq);
}

module.exports = { proxyToAPI };
