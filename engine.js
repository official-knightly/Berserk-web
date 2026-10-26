(function () {
  "use strict";

  var rawBase = window.BERSERK_API_URL || "";
  var apiBase = rawBase.trim().replace(/\/+$/, "");

  function BerserkEngine(options) {
    options = options || {};
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : function () {};
    this.onInfo = typeof options.onInfo === "function" ? options.onInfo : function () {};
    this.onError = typeof options.onError === "function" ? options.onError : function () {};
    this.sequence = 0;
    this.stopped = false;
    var self = this;

    this.onStatus("loading");
    this.ready = (async function () {
      if (!apiBase || /YOUR|PASTE|CHANGE[-_ ]?ME/i.test(apiBase)) {
        throw new Error("Set window.BERSERK_API_URL in index.html to your deployed Berserk API HTTPS URL. See the README.");
      }
      var response = await fetch(apiBase + "/health", {
        method: "GET",
        cache: "no-store",
        credentials: "omit"
      });
      if (!response.ok) throw new Error("Berserk API health check failed (HTTP " + response.status + ").");
      var health = await response.json();
      if (health.status !== "ok") throw new Error("Berserk API is not healthy.");
      self.onStatus("ready");
      return self;
    })().catch(function (error) {
      self.onStatus("error");
      self.onError(error);
      throw error;
    });
  }

  BerserkEngine.prototype.search = async function (fen, milliseconds, multiPV, context) {
    await this.ready;
    if (this.stopped) throw new Error("Berserk API client has been stopped.");

    var id = ++this.sequence;
    this.onInfo({ context: context, line: "info string Requesting move from Berserk API" });

    var response = await fetch(apiBase + "/api/analyze", {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fen: String(fen),
        think_time_ms: Math.max(100, Math.min(10000, Math.round(Number(milliseconds) || 1000))),
        multi_pv: Math.max(1, Math.min(8, Math.round(Number(multiPV) || 1))),
        threads: 1,
        context: context === undefined ? id : context
      })
    });

    var result;
    try {
      result = await response.json();
    } catch (_) {
      result = {};
    }
    if (!response.ok) {
      throw new Error(result.detail || ("Berserk API search failed (HTTP " + response.status + ")."));
    }
    if (!result.bestmove) throw new Error("Berserk API returned no best move.");

    return {
      type: "result",
      id: id,
      context: context,
      bestmove: result.bestmove,
      scoreCp: result.scoreCp,
      depth: result.depth,
      nodes: result.nodes,
      candidates: Array.isArray(result.candidates) ? result.candidates : []
    };
  };

  BerserkEngine.prototype.terminate = function () {
    this.stopped = true;
  };

  window.BerserkEngine = BerserkEngine;
})();
