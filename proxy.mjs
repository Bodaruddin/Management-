/**
 * Reverse proxy: port 5000 (external 80)
 *   /api/* → localhost:8080  (API server)
 *   /*     → localhost:18115 (Expo web)
 */
import http from "http";

const API_PORT = 8080;
const EXPO_PORT = 18115;
const PROXY_PORT = 5000;

function forward(req, res, targetPort) {
  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    console.error(`Proxy error → :${targetPort}`, err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  });

  req.pipe(proxy, { end: true });
}

http
  .createServer((req, res) => {
    const target = req.url.startsWith("/api") ? API_PORT : EXPO_PORT;
    forward(req, res, target);
  })
  .listen(PROXY_PORT, "0.0.0.0", () => {
    console.log(
      `Proxy listening on :${PROXY_PORT}  (/api → :${API_PORT}, rest → :${EXPO_PORT})`
    );
  });
