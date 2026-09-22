(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || script.dataset.elacheeLoaded === "true") return;
  script.dataset.elacheeLoaded = "true";

  function validUrl(value) {
    try {
      var parsed = new URL(value, script.src);
      var local =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]";
      if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  var scriptUrl = validUrl(script.src);
  if (!scriptUrl) return;
  var requestedUrl = script.getAttribute("data-chatbot-url");
  var chatbotUrl = validUrl(
    requestedUrl || new URL("/embed", scriptUrl.origin).toString(),
  );
  if (!chatbotUrl || chatbotUrl.origin !== scriptUrl.origin) {
    if (window.console && typeof window.console.warn === "function") {
      window.console.warn(
        "Elachee chatbot loader: data-chatbot-url must use the loader's origin.",
      );
    }
    return;
  }

  var position =
    script.getAttribute("data-position") === "bottom-left"
      ? "bottom-left"
      : "bottom-left";
  var requestedTheme = script.getAttribute("data-theme");
  var theme =
    requestedTheme === "dark" || requestedTheme === "auto"
      ? requestedTheme
      : "light";
  var requestedLabel = (script.getAttribute("data-label") || "Ask Elachee").trim();
  var label = requestedLabel.slice(0, 40) || "Ask Elachee";
  var promptEnabled = script.getAttribute("data-prompt") !== "hidden";
  var requestedPromptText = (
    script.getAttribute("data-prompt-text") || "Ask Elachee chatbot"
  ).trim();
  var promptText = requestedPromptText.slice(0, 80) || "Ask Elachee chatbot";

  chatbotUrl.searchParams.set("launcher", "hidden");
  chatbotUrl.searchParams.set("position", position);
  chatbotUrl.searchParams.set("theme", theme);

  var host = document.createElement("div");
  host.setAttribute("data-elachee-chatbot", "");
  host.setAttribute("data-theme", theme);
  host.style.position = "fixed";
  host.style.zIndex = "2147482000";
  host.style.bottom = "18px";
  host.style[position === "bottom-left" ? "left" : "right"] = "18px";
  host.style.fontFamily =
    'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
  var style = document.createElement("style");
  style.textContent =
    ":host{all:initial}" +
    "*,*::before,*::after{box-sizing:border-box}" +
    ".el-launcher{display:flex;align-items:center;gap:10px;min-height:56px;padding:7px 20px 7px 7px;color:#fff;background:#3f7549;border:1px solid rgba(255,255,255,.18);border-radius:999px;box-shadow:0 14px 38px rgba(63,117,73,.3);cursor:pointer;font:700 14px/1 system-ui,-apple-system,Segoe UI,sans-serif}" +
    ".el-launcher:hover{transform:translateY(-2px)}" +
    ".el-launcher:focus-visible,.el-close:focus-visible,.el-resize:focus-visible,.el-nudge-action:focus-visible,.el-nudge-close:focus-visible{outline:3px solid #e58d3e;outline-offset:3px}" +
    ".el-logo{display:grid;width:108px;height:40px;padding:7px 8px;place-items:center;background:#fff;border-radius:999px}" +
    ".el-logo img{display:block;width:91px;height:auto}" +
    ".el-nudge{position:absolute;bottom:70px;display:none;width:238px;grid-template-columns:minmax(0,1fr) auto;align-items:start;overflow:visible;color:#343046;background:#fff;border:1px solid #ded3dc;border-radius:14px;box-shadow:0 14px 34px rgba(28,26,48,.2)}" +
    ".el-nudge[data-visible=true]{display:grid;animation:el-nudge-pop .24s ease-out}" +
    ".el-nudge-bottom-right{right:0}.el-nudge-bottom-left{left:0}" +
    ".el-nudge::after{position:absolute;bottom:-7px;width:13px;height:13px;content:'';background:#fff;border-right:1px solid #ded3dc;border-bottom:1px solid #ded3dc;transform:rotate(45deg)}" +
    ".el-nudge-bottom-right::after{right:31px}.el-nudge-bottom-left::after{left:31px}" +
    ".el-nudge-action{display:flex;min-width:0;align-items:center;gap:9px;padding:11px 6px 11px 11px;color:inherit;background:transparent;border:0;border-radius:14px 0 0 14px;cursor:pointer;text-align:left}" +
    ".el-nudge-action:hover strong{color:#5b9847}.el-nudge-action>span:last-child{display:flex;min-width:0;flex-direction:column;gap:2px}" +
    ".el-nudge-action strong{font:750 12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif}.el-nudge-action small{color:#777181;font:400 10px/1.3 system-ui,-apple-system,Segoe UI,sans-serif}" +
    ".el-nudge-icon{display:grid;flex:0 0 auto;width:28px;height:28px;place-items:center;color:#fff;background:#5b9847;border-radius:9px}.el-nudge-icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}" +
    ".el-nudge-close{display:grid;width:31px;height:31px;margin:5px 5px 0 0;place-items:center;padding:0;color:#777181;background:transparent;border:0;border-radius:8px;cursor:pointer}.el-nudge-close:hover{color:#5b9847;background:#eaf3e6}.el-nudge-close svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round}" +
    ":host([data-theme=dark]) .el-nudge,[data-elachee-chatbot][data-theme=dark] .el-nudge{color:#f1edf4;background:#24293e;border-color:#444960}:host([data-theme=dark]) .el-nudge::after,[data-elachee-chatbot][data-theme=dark] .el-nudge::after{background:#24293e;border-color:#444960}:host([data-theme=dark]) .el-nudge-action small,:host([data-theme=dark]) .el-nudge-close,[data-elachee-chatbot][data-theme=dark] .el-nudge-action small,[data-elachee-chatbot][data-theme=dark] .el-nudge-close{color:#c7c2cd}" +
    ".el-panel{position:relative;display:none;width:min(390px,calc(100vw - 28px));height:min(650px,calc(100vh - 90px));margin-bottom:12px;overflow:hidden;background:#fff;border:1px solid rgba(37,33,62,.14);border-radius:20px;box-shadow:0 28px 80px rgba(19,21,42,.28)}" +
    ".el-panel[data-open=true]{display:block;animation:el-pop .2s ease-out}" +
    ".el-loading{position:absolute;inset:0;z-index:1;display:grid;place-content:center;gap:10px;color:#3f7549;background:#fbfcf8;font:700 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center}.el-loading::before{width:24px;height:24px;margin:auto;border:3px solid #d8e6d3;border-top-color:#3f7549;border-radius:50%;content:'';animation:el-spin .7s linear infinite}.el-panel[data-ready=true] .el-loading{display:none}" +
    ".el-frame{display:block;width:100%;height:100%;border:0;background:#fbfaf8}" +
    ".el-close{position:absolute;z-index:2;top:10px;display:grid;width:34px;height:34px;place-items:center;padding:0;color:#fff;background:#292f4c;border:1px solid rgba(255,255,255,.18);border-radius:9px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18)}" +
    ".el-close-bottom-right{right:10px}.el-close-bottom-left{left:10px}" +
    ".el-close:hover{background:#e58d3e}" +
    ".el-close svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}" +
    ".el-resize{position:absolute;z-index:3;top:0;display:grid;width:27px;height:27px;place-items:center;padding:0;color:#fff;background:#3f7549;border:0;cursor:nwse-resize;touch-action:none}" +
    ".el-resize-bottom-right{left:0;border-radius:19px 0 8px}.el-resize-bottom-left{right:0;border-radius:0 19px 0 8px;cursor:nesw-resize}" +
    ".el-resize span{width:10px;height:10px;border-top:2px solid currentColor;border-left:2px solid currentColor}" +
    ".el-resize-bottom-left span{border-right:2px solid currentColor;border-left:0}" +
    ".el-resize:hover{background:#5b9847}" +
    "@keyframes el-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}" +
    "@keyframes el-nudge-pop{from{opacity:0;transform:translateY(7px) scale(.97)}to{opacity:1;transform:none}}@keyframes el-spin{to{transform:rotate(360deg)}}" +
    "@media(max-width:560px){.el-panel{position:fixed;inset:0;width:100vw!important;height:100dvh!important;margin:0;border:0;border-radius:0}.el-nudge{bottom:64px;width:min(238px,calc(100vw - 36px))}.el-resize{display:none}.el-launcher{min-height:50px}}" +
    "@media(prefers-color-scheme:dark){:host([data-theme=auto]) .el-nudge,[data-elachee-chatbot][data-theme=auto] .el-nudge{color:#f1edf4;background:#24293e;border-color:#444960}:host([data-theme=auto]) .el-nudge::after,[data-elachee-chatbot][data-theme=auto] .el-nudge::after{background:#24293e;border-color:#444960}:host([data-theme=auto]) .el-nudge-action small,:host([data-theme=auto]) .el-nudge-close,[data-elachee-chatbot][data-theme=auto] .el-nudge-action small,[data-elachee-chatbot][data-theme=auto] .el-nudge-close{color:#c7c2cd}}" +
    "@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}";

  var panel = document.createElement("div");
  panel.className = "el-panel";
  panel.setAttribute("data-open", "false");

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "el-close el-close-" + position;
  closeButton.setAttribute("aria-label", "Close Elachee assistant");
  closeButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var resizeButton = document.createElement("button");
  resizeButton.type = "button";
  resizeButton.className = "el-resize el-resize-" + position;
  resizeButton.setAttribute(
    "aria-label",
    "Resize chat. Drag the corner, or use arrow keys while focused.",
  );
  resizeButton.title =
    "Resize chat. Drag the corner, or use arrow keys while focused.";
  resizeButton.innerHTML = '<span aria-hidden="true"></span>';

  var nudge = document.createElement("div");
  nudge.className = "el-nudge el-nudge-" + position;
  nudge.setAttribute("data-visible", "false");
  nudge.setAttribute("role", "status");
  var nudgeAction = document.createElement("button");
  nudgeAction.type = "button";
  nudgeAction.className = "el-nudge-action";
  nudgeAction.setAttribute(
    "aria-label",
    "Need help? Open Elachee chatbot",
  );
  var nudgeIcon = document.createElement("span");
  nudgeIcon.className = "el-nudge-icon";
  nudgeIcon.setAttribute("aria-hidden", "true");
  nudgeIcon.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M20.2 14.4a3.2 3.2 0 0 1-3.2 3.2H9l-4.6 3v-3.8a3.2 3.2 0 0 1-1.6-2.8V7.2A3.2 3.2 0 0 1 6 4h11a3.2 3.2 0 0 1 3.2 3.2z"/><path d="M7.3 9.1h9.4M7.3 12.6h6.4"/></svg>';
  var nudgeCopy = document.createElement("span");
  var nudgeHeading = document.createElement("strong");
  nudgeHeading.textContent = "Need help?";
  var nudgeText = document.createElement("small");
  nudgeText.textContent = promptText;
  nudgeCopy.appendChild(nudgeHeading);
  nudgeCopy.appendChild(nudgeText);
  nudgeAction.appendChild(nudgeIcon);
  nudgeAction.appendChild(nudgeCopy);
  var nudgeClose = document.createElement("button");
  nudgeClose.type = "button";
  nudgeClose.className = "el-nudge-close";
  nudgeClose.setAttribute("aria-label", "Dismiss chat suggestion");
  nudgeClose.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  nudge.appendChild(nudgeAction);
  nudge.appendChild(nudgeClose);

  var iframe = document.createElement("iframe");
  iframe.className = "el-frame";
  iframe.title = "Elachee information assistant";
  iframe.loading = "eager";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox",
  );
  iframe.src = chatbotUrl.toString();

  var loading = document.createElement("div");
  loading.className = "el-loading";
  loading.setAttribute("role", "status");
  loading.setAttribute("aria-live", "polite");
  loading.textContent = "Loading Elachee assistant…";

  function markFrameLoading() {
    panel.setAttribute("data-ready", "false");
    panel.setAttribute("aria-busy", "true");
    loading.textContent = "Loading Elachee assistant…";
  }

  iframe.addEventListener("load", function () {
    panel.setAttribute("data-ready", "true");
    panel.setAttribute("aria-busy", "false");
  });
  iframe.addEventListener("error", function () {
    panel.setAttribute("aria-busy", "false");
    loading.textContent = "The assistant could not load. Please close and try again.";
  });
  markFrameLoading();

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "el-launcher";
  launcher.setAttribute("aria-label", "Open Elachee assistant");
  launcher.setAttribute("aria-expanded", "false");
  var logo = document.createElement("span");
  logo.className = "el-logo";
  var logoImage = document.createElement("img");
  logoImage.src = new URL(
    "/branding/elachee-logo.png",
    scriptUrl.origin,
  ).toString();
  logoImage.alt = "";
  logoImage.width = 524;
  logoImage.height = 182;
  logo.appendChild(logoImage);
  var labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  launcher.appendChild(logo);
  launcher.appendChild(labelSpan);

  var NUDGE_SESSION_KEY = "elachee-chatbot-nudge-seen";
  var EMBED_CLOSE_MESSAGE_TYPE = "elachee-chatbot:close";
  var nudgeShowTimer;
  var nudgeHideTimer;
  function markNudgeSeen() {
    try {
      window.sessionStorage.setItem(NUDGE_SESSION_KEY, "true");
    } catch {
      // Storage can be unavailable in privacy-restricted host pages.
    }
  }
  function nudgeWasSeen() {
    try {
      return window.sessionStorage.getItem(NUDGE_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  }
  function hideNudge() {
    nudge.setAttribute("data-visible", "false");
    window.clearTimeout(nudgeShowTimer);
    window.clearTimeout(nudgeHideTimer);
  }
  function scheduleNudge() {
    if (!promptEnabled || nudgeWasSeen()) return;
    nudgeShowTimer = window.setTimeout(function () {
      nudge.setAttribute("data-visible", "true");
      markNudgeSeen();
      nudgeHideTimer = window.setTimeout(hideNudge, 9000);
    }, 2200);
  }

  function setOpen(open) {
    panel.setAttribute("data-open", open ? "true" : "false");
    launcher.style.display = open ? "none" : "flex";
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      markNudgeSeen();
      hideNudge();
      closeButton.focus();
    } else {
      launcher.focus();
    }
  }

  function constrainPanelSize(width, height) {
    var maximumWidth = Math.max(280, Math.min(720, window.innerWidth - 36));
    var maximumHeight = Math.max(360, Math.min(860, window.innerHeight - 90));
    var minimumWidth = Math.min(300, maximumWidth);
    var minimumHeight = Math.min(420, maximumHeight);
    return {
      width: Math.round(Math.min(Math.max(width, minimumWidth), maximumWidth)),
      height: Math.round(
        Math.min(Math.max(height, minimumHeight), maximumHeight),
      ),
    };
  }

  function applyPanelSize(width, height) {
    var size = constrainPanelSize(width, height);
    panel.style.width = size.width + "px";
    panel.style.height = size.height + "px";
  }

  var resizeStart = null;
  resizeButton.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || window.innerWidth <= 560) return;
    var bounds = panel.getBoundingClientRect();
    resizeStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: bounds.width,
      height: bounds.height,
    };
    if (typeof resizeButton.setPointerCapture === "function") {
      resizeButton.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  resizeButton.addEventListener("pointermove", function (event) {
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) return;
    var widthDelta =
      position === "bottom-right"
        ? resizeStart.x - event.clientX
        : event.clientX - resizeStart.x;
    applyPanelSize(
      resizeStart.width + widthDelta,
      resizeStart.height + resizeStart.y - event.clientY,
    );
  });
  function stopResize(event) {
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) return;
    resizeStart = null;
    if (typeof resizeButton.releasePointerCapture === "function") {
      resizeButton.releasePointerCapture(event.pointerId);
    }
  }

  window.addEventListener("message", function (event) {
    if (
      event.origin !== chatbotUrl.origin ||
      event.source !== iframe.contentWindow ||
      !event.data ||
      event.data.type !== EMBED_CLOSE_MESSAGE_TYPE
    ) {
      return;
    }
    setOpen(false);
  });
  resizeButton.addEventListener("pointerup", stopResize);
  resizeButton.addEventListener("pointercancel", stopResize);
  resizeButton.addEventListener("keydown", function (event) {
    var bounds = panel.getBoundingClientRect();
    var step = event.shiftKey ? 40 : 16;
    var width = bounds.width;
    var height = bounds.height;
    if (event.key === "ArrowRight") width += step;
    else if (event.key === "ArrowLeft") width -= step;
    else if (event.key === "ArrowUp") height += step;
    else if (event.key === "ArrowDown") height -= step;
    else return;
    event.preventDefault();
    applyPanelSize(width, height);
  });
  window.addEventListener("resize", function () {
    if (!panel.style.width || window.innerWidth <= 560) return;
    var bounds = panel.getBoundingClientRect();
    applyPanelSize(bounds.width, bounds.height);
  });

  launcher.addEventListener("click", function () {
    setOpen(true);
  });
  nudgeAction.addEventListener("click", function () {
    setOpen(true);
  });
  nudgeClose.addEventListener("click", function () {
    markNudgeSeen();
    hideNudge();
  });
  closeButton.addEventListener("click", function () {
    setOpen(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && panel.getAttribute("data-open") === "true") {
      setOpen(false);
    }
  });

  panel.appendChild(iframe);
  panel.appendChild(loading);
  panel.appendChild(resizeButton);
  panel.appendChild(closeButton);
  root.appendChild(style);
  root.appendChild(panel);
  root.appendChild(nudge);
  root.appendChild(launcher);
  (document.body || document.documentElement).appendChild(host);
  scheduleNudge();
})();
