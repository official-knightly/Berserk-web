(function () {
  "use strict";

  var currentScript = document.currentScript;
  var siteBase = currentScript && currentScript.src
    ? new URL(".", currentScript.src)
    : new URL("./", window.location.href);

  function BerserkEngine(options) {
    options = options || {};
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : function () {};
    this.onInfo = typeof options.onInfo === "function" ? options.onInfo : function () {};
    this.onError = typeof options.onError === "function" ? options.onError : function () {};
    this.pending = new Map();
    this.sequence = 0;
    this.worker = null;

    var self = this;
    this.ready = new Promise(function (resolve, reject) {
      self.resolveReady = resolve;
      self.rejectReady = reject;
      try {
        self.worker = new Worker(new URL("engine-worker.js", siteBase), { type: "module" });
      } catch (error) {
        reject(error);
        return;
      }

      self.worker.addEventListener("message", function (event) {
        var message = event.data || {};
        if (message.type === "ready") {
          self.onStatus("ready");
          self.resolveReady(self);
          return;
        }
        if (message.type === "init-error") {
          var initError = new Error(message.error || "Berserk WASM initialization failed");
          self.onStatus("error");
          self.onError(initError);
          self.rejectReady(initError);
          return;
        }
        if (message.type === "info") {
          self.onInfo(message);
          return;
        }
        if (message.type === "result" || message.type === "search-error") {
          var pending = self.pending.get(message.id);
          if (!pending) return;
          self.pending.delete(message.id);
          if (message.type === "result") pending.resolve(message);
          else pending.reject(new Error(message.error || "Berserk search failed"));
        }
      });

      self.worker.addEventListener("error", function (event) {
        var workerError = new Error(event.message || "The Berserk engine worker failed to load");
        self.onStatus("error");
        self.onError(workerError);
        self.pending.forEach(function (entry) { entry.reject(workerError); });
        self.pending.clear();
        self.rejectReady(workerError);
      });

      self.onStatus("loading");
      self.worker.postMessage({ type: "init" });
    });
  }

  BerserkEngine.prototype.search = async function (fen, milliseconds, multiPV, context) {
    await this.ready;
    var self = this;
    var id = ++this.sequence;
    return new Promise(function (resolve, reject) {
      self.pending.set(id, { resolve: resolve, reject: reject });
      self.worker.postMessage({
        type: "search",
        id: id,
        fen: fen,
        milliseconds: Math.max(100, Math.min(10000, Math.round(milliseconds))),
        multiPV: Math.max(1, Math.min(8, Math.round(multiPV))),
        context: context
      });
    });
  };

  BerserkEngine.prototype.terminate = function () {
    if (this.worker) this.worker.terminate();
    var error = new Error("Berserk engine worker was stopped");
    this.pending.forEach(function (entry) { entry.reject(error); });
    this.pending.clear();
  };

  window.BerserkEngine = BerserkEngine;
})();