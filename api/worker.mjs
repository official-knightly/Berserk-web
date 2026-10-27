import { Container } from "@cloudflare/containers";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export class BerserkEngineContainer extends Container {
  defaultPort = 8787;
  requiredPorts = [8787];
  sleepAfter = "10m";
  pingEndpoint = "/health";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type, Authorization",
          "access-control-max-age": "86400"
        }
      });
    }

    if (url.pathname === "/") {
      return json({
        name: "Berserk Engine API",
        engine: "Berserk",
        endpoints: {
          "GET /health": "Health check",
          "POST /v1/bestmove": "Get the engine's best move",
          "POST /v1/analyse": "Get the best move and search information"
        }
      });
    }

    if (url.pathname !== "/health" &&
        url.pathname !== "/v1/bestmove" &&
        url.pathname !== "/v1/analyse") {
      return json({ error: "Not found" }, 404);
    }

    if (url.pathname !== "/health" && request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const container = env.BERSERK_ENGINE.getByName("berserk-engine");
      await container.startAndWaitForPorts();
      const upstream = await container.fetch(request);
      const headers = new Headers(upstream.headers);
      headers.set("access-control-allow-origin", "*");
      headers.set("vary", "Origin");
      headers.set("cache-control", "no-store");
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
      });
    } catch (error) {
      console.error("Berserk engine container request failed", error);
      return json({
        error: "Berserk engine is temporarily unavailable",
        hint: "Check the Cloudflare Containers deployment and engine logs."
      }, 503);
    }
  }
};
