(function () {
  "use strict";

  // Capture the script URL while document.currentScript is still available.
  // This keeps the worker and WASM paths correct on GitHub Pages project URLs.
  var loaderScript = document.currentScript;
  var loaderUrl = loaderScript && loaderScript.src
    ? loaderScript.src
    : new URL("./engine/engine.js", document.baseURI).href;
  var defaultWorkerUrl = new URL("./engine-worker.js", loaderUrl).href;
  var defaultWasmUrl = new URL("./berserk_bg.wasm", defaultWorkerUrl).href;

  function BerserkEngine(options) {
    options = options || {};
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : function () {};
    this.onInfo = typeof options.onInfo === "function" ? options.onInfo : function () {};
    this.onError = typeof options.onError === "function" ? options.onError : function () {};
    this.pending = new Map();
    this.sequence = 0;
    this.stopped = false;
    this.failed = false;
    this.settled = false;

    var self = this;
    this.ready = new Promise(function (resolve, reject) {
      self.resolveReady = resolve;
      self.rejectReady = reject;
    });

    try {
      var workerUrl = options.workerUrl || defaultWorkerUrl;
      this.wasmUrl = options.wasmUrl || defaultWasmUrl;
      this.worker = new Worker(workerUrl, { type: "module", name: "Berserk-WASM" });
    } catch (error) {
      this.fail(error);
      return;
    }

    this.worker.onmessage = function (event) {
      var message = event.data || {};
      if (message.type === "ready") {
        if (!self.settled) {
          self.settled = true;
          self.onStatus("ready");
          self.resolveReady(self);
        }
      } else if (message.type === "init-error") {
        self.fail(new Error(message.error || "Berserk WASM initialization failed."));
      } else if (message.type === "info") {
        self.onInfo(message);
      } else if (message.type === "result" || message.type === "search-error") {
        var request = self.pending.get(message.id);
        if (!request) return;
        self.pending.delete(message.id);
        if (message.type === "search-error") request.reject(new Error(message.error));
        else request.resolve(message);
      }
    };

    this.worker.onerror = function (event) {
      self.fail(new Error(event.message || "Berserk worker failed. Check the worker and WASM URLs."));
    };
    this.worker.onmessageerror = function () {
      self.fail(new Error("Berserk worker returned a message that could not be decoded."));
    };

    this.onStatus("loading");
    this.worker.postMessage({ type: "init", wasmUrl: this.wasmUrl });
  }

  BerserkEngine.prototype.fail = function (error) {
    if (this.failed || this.stopped) return;
    this.failed = true;
    this.onStatus("error");
    this.onError(error);
    if (!this.settled) {
      this.settled = true;
      this.rejectReady(error);
    }
    this.pending.forEach(function (request) { request.reject(error); });
    this.pending.clear();
  };

  BerserkEngine.prototype.search = async function (fen, milliseconds, multiPV, context) {
    await this.ready;
    if (this.stopped) throw new Error("Berserk engine has been stopped.");
    if (this.failed) throw new Error("Berserk engine is unavailable.");
    var id = ++this.sequence;
    var self = this;
    return new Promise(function (resolve, reject) {
      self.pending.set(id, { resolve: resolve, reject: reject });
      try {
        self.worker.postMessage({
          type: "search",
          id: id,
          context: context,
          fen: fen,
          milliseconds: Math.max(100, Math.min(10000, Math.round(Number(milliseconds) || 1000))),
          multiPV: Math.max(1, Math.min(8, Math.round(Number(multiPV) || 1)))
        });
      } catch (error) {
        self.pending.delete(id);
        reject(error);
      }
    });
  };

  BerserkEngine.prototype.terminate = function () {
    if (this.stopped) return;
    this.stopped = true;
    if (this.worker) this.worker.terminate();
    var error = new Error("Berserk engine stopped.");
    this.pending.forEach(function (request) { request.reject(error); });
    this.pending.clear();
    if (!this.settled) {
      this.settled = true;
      this.rejectReady(error);
    }
  };

  window.BerserkEngine = BerserkEngine;
})();