const SITE_ORIGIN = "https://official-knightly.github.io";
const PROJECT_PATH = "/Berserk-web";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/_worker-health") {
      return json({
        status: "ok",
        service: "Berserk Web static-site proxy",
        upstream: SITE_ORIGIN + PROJECT_PATH + "/",
        engine: "Runs locally in the browser through WebAssembly"
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed" }, 405);
    }

    const projectRelativePath = incoming.pathname === "/" ? "/" : incoming.pathname;
    const upstreamUrl = new URL(PROJECT_PATH + projectRelativePath + incoming.search, SITE_ORIGIN);

    // Keep every request inside the GitHub Pages project path.
    if (!upstreamUrl.pathname.startsWith(PROJECT_PATH + "/")) {
      return json({ error: "Invalid path" }, 400);
    }

    try {
      const upstreamRequest = new Request(upstreamUrl, request);
      const upstream = await fetch(upstreamRequest);
      const headers = new Headers(upstream.headers);
      headers.set("x-berserk-edge", "cloudflare");
      headers.set("x-content-type-options", "nosniff");

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
      });
    } catch (error) {
      return json({
        error: "Berserk Web upstream is unavailable",
        detail: error instanceof Error ? error.message : String(error)
      }, 502);
    }
  }
};
