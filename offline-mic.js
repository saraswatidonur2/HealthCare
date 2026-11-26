/* offline-mic.js: voice input that works OFFLINE, for any website.
   How: Chrome 139+ (desktop and Android) can recognise speech on the device itself (Web Speech API, "processLocally").
   The first time, the browser downloads a small language pack (needs internet once). After that it works with no internet,
   and the audio never leaves the device, which is good for patient privacy.
   Browsers without on-device support use the normal online recognition (or show a message if offlineOnly is true).

   Use it on a page with a button and a text box:
     <button id="mic">&#127908;</button> <input id="msg"> <div id="micStatus"></div>
     <script src="offline-mic.js"></script>
     <script>
       OfflineMic.attach({
         button: document.getElementById("mic"),
         getLang: function () { return "en"; },                 // "en", "hi", "kn", "ta", ... or a full code like "en-IN"
         onStatus: function (text) { document.getElementById("micStatus").textContent = text; },
         onInterim: function (text) { document.getElementById("msg").value = text; },   // words appear while speaking
         onResult: function (text) { document.getElementById("msg").value = text; }     // final sentence
         // offlineOnly: true      // never use online recognition
       });
     </script>
   If the page runs inside an iframe, the iframe tag needs: allow="microphone; on-device-speech-recognition" */
(function (global) {
  "use strict";
  var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  // on-device recognition needs these three pieces (older Chrome versions have only the online recogniser)
  var LOCAL_API = !!(SR && typeof SR.available === "function" && typeof SR.install === "function" && "processLocally" in SR.prototype);

  var SPEECH = {en: "en-IN", hi: "hi-IN", kn: "kn-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN", ta: "ta-IN", ur: "ur-IN",
                gu: "gu-IN", ml: "ml-IN", or: "or-IN", pa: "pa-IN", as: "as-IN", ne: "ne-NP"};
  var MSG = {
    downloading: "Downloading the voice pack (one time only, needs internet)...",
    listeningOffline: "Listening (offline, on this device)...",
    listeningOnline: "Listening (online)...",
    noOffline: "Offline voice is not available for this language on this device. Please type your message.",
    unsupported: "Voice input is not supported in this browser. Please type your message.",
    denied: "Microphone is blocked. Allow it from the lock icon next to the web address.",
    noMic: "No microphone found.",
    noSpeech: "I did not hear anything. Tap the mic and try again.",
    network: "Voice needs internet for this language. Please type your message.",
    langUnsupported: "Voice is not supported for this language on this device. Please type your message.",
    error: "Voice input failed. Please type your message.",
    idle: ""
  };
  var ERR = {"not-allowed": "denied", "service-not-allowed": "denied", "audio-capture": "noMic", "no-speech": "noSpeech",
             "network": "network", "language-not-supported": "langUnsupported", "aborted": "idle"};

  function toBcp47(code) {
    code = code || "en";
    return SPEECH[code] || (code.indexOf("-") > 0 ? code : code + "-IN");
  }

  // Makes sure the on-device language pack is installed. Returns true if recognition can run on the device.
  async function prepare(bcp, say) {
    if (!LOCAL_API) return false;
    try {
      var state = await SR.available({langs: [bcp], processLocally: true});
      if (state === "available") return true;
      if (state === "unavailable") return false;
      say("downloading");                                   // "downloadable" or "downloading"
      return !!(await SR.install({langs: [bcp], processLocally: true}));
    } catch (e) {
      return false;                                         // blocked by a permissions policy, or not supported
    }
  }

  // One round of listening. Returns the recogniser (call .stop() to finish early) or null if it could not start.
  async function listen(opts) {
    var messages = Object.assign({}, MSG, opts.messages || {});
    var say = function (key) { if (opts.onStatus) opts.onStatus(messages[key] !== undefined ? messages[key] : key, key); };
    if (!SR) { say("unsupported"); return null; }

    var bcp = toBcp47(opts.lang);
    var local = await prepare(bcp, say);
    if (!local && opts.offlineOnly) { say("noOffline"); return null; }

    var rec = new SR(), failed = false;
    rec.lang = bcp; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    if ("processLocally" in rec) rec.processLocally = local;

    rec.onstart = function () { say(local ? "listeningOffline" : "listeningOnline"); if (opts.onStart) opts.onStart(local); };
    rec.onresult = function (e) {
      var text = "", isFinal = false;
      for (var i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      text = text.trim();
      if (isFinal) { if (text && opts.onResult) opts.onResult(text); }
      else if (opts.onInterim) opts.onInterim(text);
    };
    rec.onerror = function (e) { failed = true; say(ERR[e.error] || "error"); };
    rec.onend = function () { if (!failed) say("idle"); if (opts.onEnd) opts.onEnd(); };
    rec.start();
    return rec;
  }

  // Connects a mic button: tap to speak, tap again to stop.
  function attach(opts) {
    var btn = opts.button;
    if (!btn) return;
    if (!SR) { btn.style.display = "none"; if (opts.onStatus) opts.onStatus(MSG.unsupported, "unsupported"); return; }
    var idleLabel = btn.innerHTML, busy = false, current = null;
    var restore = function () { busy = false; current = null; btn.innerHTML = idleLabel; };

    btn.addEventListener("click", async function () {
      if (current) { current.stop(); return; }
      if (busy) return;
      busy = true; btn.textContent = "...";
      current = await listen({
        lang: opts.getLang ? opts.getLang() : "en",
        offlineOnly: opts.offlineOnly, messages: opts.messages,
        onStatus: opts.onStatus, onInterim: opts.onInterim, onResult: opts.onResult,
        onStart: function () { btn.textContent = "\u25cf"; },
        onEnd: restore
      });
      if (!current) restore();
    });
  }

  global.OfflineMic = {supported: !!SR, canRunOffline: LOCAL_API, attach: attach, listen: listen, prepare: prepare, toBcp47: toBcp47};
})(typeof window !== "undefined" ? window : globalThis);
