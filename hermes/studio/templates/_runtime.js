/*
 * Newsroom Studio scene runtime.
 *
 * The renderer loads a scene page, calls `await studio.init()` once and then
 * `await studio.seek(t)` for every frame (t = seconds into the scene) before
 * taking a screenshot. Everything visible must therefore be a pure function of t:
 *
 *   - CSS animations / Web Animations: paused and driven via currentTime
 *     (all animations share the scene clock; schedule with animation-delay)
 *   - studio.onFrame((t, duration) => ...): JS-driven effects (count-ups ...)
 *   - <video> elements: paused and seeked to t (+ data-start)
 *   - [data-studio-media] slots: filled with the scene media (image or
 *     pre-extracted video frame sequence)
 *   - captions: rendered from word timings
 *
 * Helpers for templates: studio.props, studio.duration, studio.fps,
 * studio.words, studio.cue(text, fallback), studio.ease.*, studio.clamp,
 * studio.lerp, studio.progress(t, start, dur), studio.fit(el) (auto-fit text;
 * use data-fit="MAX,MIN" on an element with a fixed height or data-fit-h).
 */
(() => {
  const C = window.STUDIO || {};
  const hooks = [];
  const initHooks = [];
  const known = new Set();
  const warnings = [];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    linear: (k) => k,
    outCubic: (k) => 1 - Math.pow(1 - k, 3),
    outQuart: (k) => 1 - Math.pow(1 - k, 4),
    outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  };
  const norm = (s) => String(s).toLowerCase().replace(/[^0-9a-z]+/g, "");
  const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "are", "was", "its", "their", "than", "then", "will", "have", "has"]);

  const studio = {
    duration: C.duration || 3,
    fps: C.fps || 30,
    props: C.props || {},
    words: C.words || [],
    brand: C.brand || {},
    t: 0,
    clamp, lerp, ease,
    progress: (t, start, dur) => clamp((t - start) / Math.max(dur, 1e-6)),
    onFrame(fn) { hooks.push(fn); },
    onInit(fn) { initHooks.push(fn); },
    warn(msg) { warnings.push(String(msg)); },

    /** Time (s) when the narration first says a significant word of `text`. */
    cue(text, fallback, after = 0) {
      const keys = String(text).split(/\s+/).map(norm).filter((w) => w.length >= 3 && !STOP.has(w));
      for (const w of studio.words) {
        if (w.start + 1e-3 < after) continue;
        const n = norm(w.text);
        if (n.length >= 3 && keys.some((k) => k === n || (n.length >= 4 && (k.startsWith(n) || n.startsWith(k))))) {
          return Math.max(0, w.start - 0.12);
        }
      }
      return fallback;
    },

    /** Shrink an element's font-size until its text fits its box. */
    fit(el) {
      const spec = (el.dataset.fit || "").split(",").map(Number);
      const max = spec[0] || parseFloat(getComputedStyle(el).fontSize);
      const min = spec[1] || Math.round(max * 0.4);
      const boxH = el.dataset.fitH ? Number(el.dataset.fitH) : null;
      // Layout sizes (offset*/scroll*) ignore transforms, so entry animations
      // do not influence the result. Children are measured directly because
      // overflow towards the start edge (flex-end alignment) is not scrollable.
      const kids = Array.from(el.children).filter((c) => getComputedStyle(c).position !== "absolute");
      const fits = () => {
        const h = boxH !== null ? boxH : el.clientHeight;
        let contentH = el.scrollHeight;
        if (kids.length) {
          const top = Math.min(...kids.map((c) => c.offsetTop));
          const bottom = Math.max(...kids.map((c) => c.offsetTop + c.offsetHeight));
          contentH = bottom - top;
        }
        // single text element without an explicit box height: width is what matters
        if (!kids.length && boxH === null) return el.scrollWidth <= el.clientWidth + 1;
        const wideOk = el.scrollWidth <= el.clientWidth + 1 && kids.every((c) => c.scrollWidth <= c.clientWidth + 1);
        return wideOk && contentH <= h + 1;
      };
      let lo = min, hi = max, best = min;
      el.style.fontSize = max + "px";
      if (fits()) return max;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        el.style.fontSize = mid + "px";
        if (fits()) { best = mid; lo = mid; } else { hi = mid; }
      }
      el.style.fontSize = best + "px";
      if (!fits()) warnings.push(`text does not fit even at ${min}px: "${el.textContent.trim().slice(0, 40)}"`);
      return best;
    },
  };
  window.studio = studio;

  // ------------------------------------------------------------- media slots
  const mediaFrames = [];

  function buildMedia() {
    const m = C.media;
    const slots = document.querySelectorAll("[data-studio-media]");
    if (!m) { slots.forEach((s) => s.classList.add("is-empty")); return []; }
    const waits = [];
    slots.forEach((slot) => {
      const img = document.createElement("img");
      img.className = "media-el";
      img.style.objectFit = m.fit || "cover";
      img.style.objectPosition = m.position || "center";
      img.alt = "";
      if (m.kind === "video") {
        img.src = `${m.url}/f_00000.jpg`;
        mediaFrames.push({ img, url: m.url, count: m.frameCount, fps: m.fps, idx: 0 });
      } else {
        img.src = m.url;
      }
      slot.appendChild(img);
      slot.classList.add("has-media", `is-${m.kind}`);
      waits.push(img.decode().catch(() => warnings.push(`media failed to load: ${img.src}`)));
    });
    return waits;
  }

  // --------------------------------------------------------------- captions
  const cap = { el: null, chunks: (C.captions && C.captions.chunks) || [], style: (C.captions && C.captions.style) || "karaoke", nodes: [], current: -1 };

  function buildCaptions(hidden) {
    cap.el = document.getElementById("captions");
    if (!cap.el) return;
    if (hidden || !C.captions || !C.captions.enabled) { cap.el.style.display = "none"; cap.chunks = []; return; }
    cap.el.classList.add(`style-${cap.style}`);
    cap.nodes = cap.chunks.map((ch) => {
      const line = document.createElement("div");
      line.className = "cap-chunk";
      const spans = ch.words.map((w) => {
        const s = document.createElement("span");
        s.className = "cap-w";
        // drop trailing , ; : and sentence periods (keep "U.S." and ?/!) for a cleaner look
        let txt = w.text.replace(/[,;:]+$/, "");
        if (/\.$/.test(txt) && !/\..*\.$/.test(txt) && !/^\W*\d/.test(txt.slice(-3))) txt = txt.replace(/\.+$/, "");
        s.textContent = C.captions.uppercase ? txt.toUpperCase() : txt;
        line.appendChild(s);
        line.appendChild(document.createTextNode(" "));
        return s;
      });
      line.style.display = "none";
      cap.el.appendChild(line);
      return { line, spans };
    });
  }

  function updateCaptions(t) {
    if (!cap.el || !cap.chunks.length) return;
    let idx = -1;
    for (let i = 0; i < cap.chunks.length; i++) {
      if (t >= cap.chunks[i].start && t < cap.chunks[i].end) { idx = i; break; }
    }
    if (idx !== cap.current) {
      if (cap.current >= 0) cap.nodes[cap.current].line.style.display = "none";
      if (idx >= 0) cap.nodes[idx].line.style.display = "";
      cap.current = idx;
    }
    if (idx < 0) return;
    const ch = cap.chunks[idx];
    const node = cap.nodes[idx];
    // quick pop-in when a chunk appears (deterministic, from t)
    const k = ease.outCubic(clamp((t - ch.start) / 0.12));
    node.line.style.transform = `translateY(${lerp(14, 0, k)}px) scale(${lerp(0.94, 1, k)})`;
    node.line.style.opacity = String(lerp(0.0, 1, clamp((t - ch.start) / 0.06)));
    let active = -1;
    ch.words.forEach((w, i) => { if (t >= w.start - 0.02) active = i; });
    node.spans.forEach((s, i) => {
      s.classList.toggle("on", i === active && cap.style !== "plain");
      s.classList.toggle("done", i < active);
      s.classList.toggle("todo", i > active);
    });
  }

  // ------------------------------------------------------------ init / seek
  studio.init = async (opts = {}) => {
    document.documentElement.style.setProperty("--scene-dur", `${studio.duration}s`);
    // Request the brand fonts explicitly: document.fonts.ready alone resolves before a
    // font is fetched when nothing on the page uses it yet (captions are built later),
    // and under load the first captured frames then show invisible caption text.
    try {
      await Promise.all(['800 40px "Inter Tight"', '400 40px "Inter Tight"', '700 20px "JetBrains Mono"']
        .map((f) => document.fonts.load(f)));
      await document.fonts.ready;
    } catch (e) { warnings.push("fonts not ready: " + e); }
    const waits = buildMedia();
    document.querySelectorAll("img:not(.media-el)").forEach((img) => waits.push(img.decode().catch(() => warnings.push(`image failed: ${img.src}`))));
    await Promise.all(waits);
    // measure text without animation transforms (they inflate scroll sizes)
    const freeze = document.createElement("style");
    freeze.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }";
    document.head.appendChild(freeze);
    document.querySelectorAll("[data-fit]").forEach((el) => studio.fit(el));
    freeze.remove();
    for (const fn of initHooks) await fn();
    document.querySelectorAll("video").forEach((v) => { v.muted = true; v.pause(); });
    buildCaptions(!!opts.hideCaptions);
    if (document.fonts && document.fonts.check && !document.fonts.check('800 40px "Inter Tight"')) {
      warnings.push('font "Inter Tight" not available; using fallback (run setup.sh)');
    }
    await studio.seek(0);
    return { ok: true, warnings, animations: known.size };
  };

  studio.seek = async (t) => {
    studio.t = t;
    for (const a of document.getAnimations()) known.add(a);
    const ms = t * 1000;
    for (const a of known) {
      try { a.pause(); a.currentTime = ms; } catch (e) { /* removed animation */ }
    }
    const waits = [];
    for (const f of mediaFrames) {
      const idx = Math.max(0, Math.min(f.count - 1, Math.floor(t * f.fps + 1e-6)));
      if (idx !== f.idx) {
        f.idx = idx;
        f.img.src = `${f.url}/f_${String(idx).padStart(5, "0")}.jpg`;
        waits.push(f.img.decode().catch(() => {}));
      }
    }
    document.querySelectorAll("video").forEach((v) => {
      const target = t + Number(v.dataset.start || 0);
      const dur = isFinite(v.duration) ? v.duration : Infinity;
      const tt = v.loop && isFinite(dur) && dur > 0 ? target % dur : Math.min(target, Math.max(0, dur - 0.04));
      if (Math.abs(v.currentTime - tt) > 1e-3) {
        waits.push(new Promise((res) => { v.addEventListener("seeked", res, { once: true }); setTimeout(res, 2000); v.currentTime = tt; }));
      }
    });
    if (waits.length) await Promise.all(waits);
    for (const fn of hooks) fn(t, studio.duration);
    updateCaptions(t);
    return true;
  };
})();
