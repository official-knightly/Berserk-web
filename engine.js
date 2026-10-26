(function () {
  "use strict";

  function BerserkEngine(options) {
    options = options || {};
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : function () {};
    this.onInfo = typeof options.onInfo === "function" ? options.onInfo : function () {};
    this.onError = typeof options.onError === "function" ? options.onError : function () {};
    this.worker = new Worker("./engine-worker.js", { type: "module" });
    this.pending = new Map();
    this.sequence = 0;
    this.stopped = false;
    var self = this;

    this.ready = new Promise(function (resolve, reject) {
      self.resolveReady = resolve;
      self.rejectReady = reject;
    });
    this.worker.onmessage = function (event) {
      var message = event.data || {};
      if (message.type === "ready") {
        self.onStatus("ready");
        self.resolveReady(self);
      } else if (message.type === "init-error") {
        self.fail(new Error(message.error));
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
    this.worker.onerror = function (event) { self.fail(new Error(event.message || "Berserk worker failed.")); };
    this.onStatus("loading");
    this.worker.postMessage({ type: "init" });
  }

  BerserkEngine.prototype.fail = function (error) {
    this.onStatus("error");
    this.onError(error);
    if (this.rejectReady) this.rejectReady(error);
  };

  BerserkEngine.prototype.search = async function (fen, milliseconds, multiPV, context) {
    await this.ready;
    if (this.stopped) throw new Error("Berserk engine has been stopped.");
    var id = ++this.sequence;
    var self = this;
    return new Promise(function (resolve, reject) {
      self.pending.set(id, { resolve: resolve, reject: reject });
      self.worker.postMessage({ type: "search", id: id, context: context, fen: fen,
        milliseconds: Math.max(100, Math.min(10000, Math.round(Number(milliseconds) || 1000))),
        multiPV: Math.max(1, Math.min(8, Math.round(Number(multiPV) || 1))) });
    });
  };

  BerserkEngine.prototype.terminate = function () {
    this.stopped = true;
    this.worker.terminate();
    this.pending.forEach(function (request) { request.reject(new Error("Berserk engine stopped.")); });
    this.pending.clear();
  };

  window.BerserkEngine = BerserkEngine;
})();
