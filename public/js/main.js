(function () {
  var SITE = null;
  var sessionId =
    localStorage.getItem("kiet_sid") ||
    (function () {
      var id = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem("kiet_sid", id);
      return id;
    })();

  var chatPollTimer = null;
  var lastChatId = "";

  function $(id) {
    return document.getElementById(id);
  }

  function esc(t) {
    var d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  /** Site JSON from DB mistakes (e.g. programStreams as object) must not crash the whole page. */
  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function cssBgUrl(u) {
    var s = String(u || "").trim();
    return s ? "url(" + JSON.stringify(s) + ")" : "none";
  }

  function cardImgHtml(url, wrapClass) {
    var u = String(url || "").trim();
    if (!u) return '<div class="' + wrapClass + ' ph-empty"></div>';
    return (
      '<div class="' +
      wrapClass +
      '"><img src="' +
      esc(u) +
      '" alt="" loading="lazy" decoding="async" fetchpriority="low" /></div>'
    );
  }

  function track(type, section, payload) {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: type, sessionId: sessionId, section: section || "", payload: payload || {} }),
      keepalive: true,
    }).catch(function () {});
  }

  function isVideoUrl(u) {
    return /\.(mp4|webm|ogg)(\?|$)/i.test(u || "");
  }

  function mediaHtml(url) {
    if (!url) return "";
    if (isVideoUrl(url)) return "<video controls playsinline src=\"" + esc(url) + "\"></video>";
    return "<img src=\"" + esc(url) + "\" alt=\"\" loading=\"lazy\" decoding=\"async\" />";
  }

  function closeApply() {
    $("apply-modal").classList.remove("open");
    $("apply-modal").setAttribute("aria-hidden", "true");
  }

  function loadPixels(px) {
    if (!px) return;
    var mid = (px.metaPixelId || "").trim();
    if (mid) {
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = "2.0";
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", mid);
      fbq("track", "PageView");
    }
    var gid = (px.googleTagId || "").trim();
    if (gid) {
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gid);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      window.gtag = gtag;
      gtag("js", new Date());
      gtag("config", gid);
    }
    var snap = (px.snapPixelId || "").trim();
    if (snap) {
      (function (e, t, n) {
        if (e.snaptr) return;
        var a = (e.snaptr = function () {
          a.handleRequest ? a.handleRequest.apply(a, arguments) : a.queue.push(arguments);
        });
        a.queue = [];
        var r = t.createElement("script");
        r.async = !0;
        r.src = n;
        var u = t.getElementsByTagName("script")[0];
        u.parentNode.insertBefore(r, u);
      })(window, document, "https://sc-static.net/scevent.min.js");
      snaptr("init", snap, {});
      snaptr("track", "PAGE_VIEW");
    }
  }

  function fillDigitBox(containerId, value) {
    var el = $(containerId);
    if (!el) return;
    el.innerHTML = "";
    var s = String(value == null ? "" : value);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var cell = document.createElement("span");
      cell.className = "hero-digit-char hero-mix";
      cell.textContent = ch;
      el.appendChild(cell);
    }
  }

  function applyHeroPackageLine(el, text) {
    if (!el) return;
    var s = String(text || "");
    var parts = s.split(/(\d+)/);
    el.innerHTML = parts
      .map(function (p) {
        return /^\d+$/.test(p) ? '<span class="hero-mix hero-mix-inline">' + esc(p) + "</span>" : esc(p);
      })
      .join("");
  }

  function runHeroIntro() {
    var intro = $("hero-intro");
    if (!intro) return;
    var emp = $("hero-emp");
    var word = "EMPOWERING ";
    emp.textContent = "";
    intro.classList.remove("phase-power", "phase-digits-l", "phase-label-l", "phase-pkg", "phase-digits-r", "phase-label-r");
    var i = 0;
    function typeEmp() {
      if (i <= word.length) {
        emp.textContent = word.slice(0, i);
        i++;
        setTimeout(typeEmp, i < 4 ? 120 : 70);
      } else {
        setTimeout(function () {
          intro.classList.add("phase-power");
        }, 200);
        setTimeout(function () {
          intro.classList.add("phase-digits-l");
        }, 700);
        setTimeout(function () {
          intro.classList.add("phase-label-l");
        }, 950);
        setTimeout(function () {
          intro.classList.add("phase-pkg");
        }, 1150);
        setTimeout(function () {
          intro.classList.add("phase-digits-r");
        }, 1350);
        setTimeout(function () {
          intro.classList.add("phase-label-r");
        }, 1600);
      }
    }
    setTimeout(typeEmp, 400);
  }

  function renderMarquee() {
    var el = $("section-marquee");
    if (!el) return;
    var parts = [
      { id: "spotlight", lab: "Spotlight" },
      { id: "placements", lab: "Placements" },
      { id: "programs", lab: "Programs" },
      { id: "mou", lab: "Industry MOU" },
      { id: "vision", lab: "Visionaries" },
    ];
    var inner = parts
      .map(function (p) {
        return '<a href="#/" data-sec="' + p.id + '">' + esc(p.lab) + "</a>";
      })
      .join("");
    el.innerHTML = inner + inner + inner + inner;
    el.onclick = function (e) {
      var a = e.target.closest("a[data-sec]");
      if (!a) return;
      e.preventDefault();
      a.classList.remove("rgb-link");
      void a.offsetWidth;
      a.classList.add("rgb-link");
      setTimeout(function () {
        a.classList.remove("rgb-link");
      }, 2200);
      location.hash = "#/";
      var id = a.getAttribute("data-sec");
      setTimeout(function () {
        var t = document.getElementById(id);
        if (t) t.scrollIntoView({ behavior: "smooth" });
      }, 150);
    };
    var wrap = $("section-marquee-wrap");
    if (wrap) {
      var tiltX = 0;
      var tiltY = 0;
      wrap.addEventListener(
        "touchmove",
        function (ev) {
          if (!ev.touches || !ev.touches[0]) return;
          var t = ev.touches[0];
          var r = wrap.getBoundingClientRect();
          var px = (t.clientX - r.left) / r.width - 0.5;
          var py = (t.clientY - r.top) / r.height - 0.5;
          tiltX = py * -14;
          tiltY = px * 14;
          wrap.style.transform = "perspective(420px) rotateX(" + tiltX + "deg) rotateY(" + tiltY + "deg)";
        },
        { passive: true }
      );
      wrap.addEventListener("touchend", function () {
        wrap.style.transform = "";
      });
    }
  }

  function wireNavRgb() {
    document.querySelectorAll("#main-nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        a.classList.remove("rgb-flash");
        void a.offsetWidth;
        a.classList.add("rgb-flash");
      });
    });
  }

  function updateNavForPage(page) {
    document.querySelectorAll("#main-nav-links a[data-nav-page]").forEach(function (a) {
      var p = a.getAttribute("data-nav-page");
      a.classList.toggle("nav-link-hidden", p === page);
    });
  }

  function setupMarqueeScrollHide() {
    var hero = $("top");
    var row = $("nav-marquee-row");
    if (!hero || !row) return;
    function tick() {
      var h = hero.getBoundingClientRect().height || hero.offsetHeight || 0;
      var y = window.scrollY || document.documentElement.scrollTop;
      row.classList.toggle("marquee-scrolled-out", y > Math.max(80, h * 0.15));
    }
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick, { passive: true });
    tick();
  }

  function renderSpotlight() {
    var root = $("spotlight-list");
    root.innerHTML = "";
    asArray(SITE.campusSpotlight).forEach(function (ev) {
      var id = esc(ev.id || "");
      var a = document.createElement("a");
      a.className = "spot-card";
      a.href = "#/spotlight/" + encodeURIComponent(ev.id || "");
      a.innerHTML =
        cardImgHtml(ev.image, "spot-card-img") +
        '<div class="spot-card-body"><h3>' +
        esc(ev.title) +
        "</h3><p>" +
        esc(ev.summary) +
        "</p></div>";
      a.addEventListener("click", function () {
        track("spotlight_open", "spotlight", { id: ev.id });
      });
      root.appendChild(a);
    });
  }

  function renderPlacements() {
    var root = $("placements-list");
    root.innerHTML = "";
    var items = asArray(SITE.placements);
    function cardHtml(p) {
      return (
        '<div class="p-card-marquee"><div class="p-card-side"><h3>' +
        esc(p.studentName) +
        '</h3><div class="meta">' +
        esc(p.branch) +
        " · " +
        esc(p.company) +
        " · " +
        esc(p.year) +
        '</div><div class="pkg">' +
        esc(p.package) +
        "</div></div>" +
        cardImgHtml(p.image, "p-card-photo") +
        "</div>"
      );
    }
    var html = items.map(cardHtml).join("");
    if (!html) return;
    root.innerHTML = html + html;
  }

  var currentStream = null;
  var streamSelected = false;

  function renderPrograms() {
    var pick = $("stream-picker");
    var grid = $("branch-grid");
    pick.innerHTML = "";
    grid.innerHTML = "";
    grid.classList.add("branch-grid-hidden");
    streamSelected = false;
    currentStream = null;
    asArray(SITE.programStreams).forEach(function (st) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "stream-btn";
      b.textContent = st.name;
      b.dataset.streamId = st.id;
      b.addEventListener("click", function () {
        pick.querySelectorAll(".stream-btn").forEach(function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        currentStream = st;
        streamSelected = true;
        grid.classList.remove("branch-grid-hidden");
        renderBranches(st);
        track("stream_select", "programs", { stream: st.id });
      });
      pick.appendChild(b);
    });
  }

  function renderBranches(st) {
    var grid = $("branch-grid");
    grid.innerHTML = "";
    asArray(st.branches).forEach(function (br) {
      var card = document.createElement("div");
      card.className = "branch-card";
      card.innerHTML =
        cardImgHtml(br.image, "branch-card-img") +
        '<div class="branch-card-body"><h3>' +
        esc(br.name) +
        "</h3><p>" +
        esc(br.blurb) +
        '</p><div class="branch-dur">' +
        esc(br.duration) +
        '</div><button type="button" class="btn-primary apply-btn">Apply now</button></div>';
      card.querySelector(".apply-btn").addEventListener("click", function () {
        openApply(st.name, br.name);
        track("apply_open", "programs", { stream: st.id, branch: br.name });
      });
      grid.appendChild(card);
    });
  }

  function openApply(stream, branchName) {
    $("apply-stream").value = stream;
    $("apply-branch").value = branchName;
    $("apply-branch-lbl").textContent = branchName;
    $("apply-form").reset();
    $("apply-stream").value = stream;
    $("apply-branch").value = branchName;
    $("apply-modal").classList.add("open");
    $("apply-modal").setAttribute("aria-hidden", "false");
  }

  function renderMOU() {
    var wrap = $("mou-rows");
    if (!wrap) return;
    wrap.innerHTML = "";
    var list = asArray(SITE.industryMOU);
    if (!list.length) return;
    var names = list.map(function (c) {
      return '<span class="mou-ticker-name">' + esc(c.name) + "</span>";
    });
    var dot = '<span class="mou-ticker-dot" aria-hidden="true">·</span>';
    var segment = names.join(dot);
    var loop = segment + dot + segment;
    var inner = document.createElement("div");
    inner.className = "mou-ticker-wrap";
    inner.innerHTML = '<div class="mou-ticker-track">' + loop + "</div>";
    wrap.appendChild(inner);
  }

  function renderVision() {
    var root = $("vision-grid");
    root.innerHTML = "";
    asArray(SITE.visionaries).forEach(function (v) {
      var inner = v.image && String(v.image).trim()
        ? '<div class="v-card-img"><img src="' + esc(v.image) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" /></div>'
        : '<div class="v-card-img ph-empty"></div>';
      root.insertAdjacentHTML(
        "beforeend",
        '<div class="v-card">' +
          inner +
          '<div class="v-card-body"><h3>' +
          esc(v.name) +
          "</h3><p>" +
          esc(v.role) +
          "</p></div></div>"
      );
    });
  }

  function renderClubs(containerId) {
    var root = $(containerId);
    if (!root) return;
    root.innerHTML = "";
    asArray(SITE.clubs).forEach(function (c) {
      var insta =
        c.instagram && c.instagram.length
          ? '<a class="insta-link" href="' +
            esc(c.instagram) +
            '" target="_blank" rel="noopener" aria-label="Instagram"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M12 7.2A4.8 4.8 0 1 0 16.8 12 4.81 4.81 0 0 0 12 7.2Zm0 7.2A2.4 2.4 0 1 1 14.4 12 2.4 2.4 0 0 1 12 14.4Zm4.8-7.44a1.2 1.2 0 1 1-1.2-1.2 1.2 1.2 0 0 1 1.2 1.2ZM20.4 12a8.11 8.11 0 0 0-.18-1.71 5.43 5.43 0 0 0-1.53-3.1 5.43 5.43 0 0 0-3.1-1.53A8.11 8.11 0 0 0 12 3.6a8.11 8.11 0 0 0-1.71.18 5.43 5.43 0 0 0-3.1 1.53 5.43 5.43 0 0 0-1.53 3.1A8.11 8.11 0 0 0 3.6 12a8.11 8.11 0 0 0 .18 1.71 5.43 5.43 0 0 0 1.53 3.1 5.43 5.43 0 0 0 3.1 1.53A8.11 8.11 0 0 0 12 20.4a8.11 8.11 0 0 0 1.71-.18 5.43 5.43 0 0 0 3.1-1.53 5.43 5.43 0 0 0 1.53-3.1A8.11 8.11 0 0 0 20.4 12ZM18.3 6.66a2.4 2.4 0 0 1 .66 1.62c.06.9.08 1.17.08 3.72s0 2.82-.08 3.72a2.4 2.4 0 0 1-.66 1.62 2.4 2.4 0 0 1-1.62.66c-.9.06-1.17.08-3.72.08s-2.82 0-3.72-.08a2.4 2.4 0 0 1-1.62-.66 2.4 2.4 0 0 1-.66-1.62c-.06-.9-.08-1.17-.08-3.72s0-2.82.08-3.72a2.4 2.4 0 0 1 .66-1.62 2.4 2.4 0 0 1 1.62-.66c.9-.06 1.17-.08 3.72-.08s2.82 0 3.72.08a2.4 2.4 0 0 1 1.62.66 2.4 2.4 0 0 1 .66 1.62Z"/></svg></a>'
          : "";
      root.insertAdjacentHTML(
        "beforeend",
        '<div class="club-card">' +
          cardImgHtml(c.image, "club-card-img") +
          '<div class="club-card-body"><h3>' +
          esc(c.title) +
          '</h3><div class="club-sub">' +
          esc(c.subtitle) +
          "</div><p>" +
          esc(c.blurb) +
          "</p>" +
          insta +
          "</div></div>"
      );
    });
  }

  function renderTimeline() {
    $("diff-title").textContent = SITE.differenceTitle || "What makes us different?";
    $("diff-sub").textContent = SITE.differenceSubtitle || "";
    var root = $("timeline-items");
    root.innerHTML = "";
    asArray(SITE.difference).forEach(function (d) {
      var wrap = document.createElement("div");
      wrap.className = "tl-item";
      var a = document.createElement("a");
      a.className = "tl-card";
      a.href = "#/difference/" + encodeURIComponent(d.id || "");
      a.innerHTML =
        "<h3>" +
        esc(d.title) +
        "</h3><p>" +
        esc(d.teaser) +
        '</p><div class="tl-hint">Read full story →</div>';
      a.addEventListener("click", function () {
        track("difference_open", "difference", { id: d.id });
      });
      wrap.appendChild(a);
      root.appendChild(wrap);
    });
  }

  function setupTimelineScroll() {
    var fill = $("timeline-fill");
    var sec = $("difference");
    if (!fill || !sec) return;
    function upd() {
      var rect = sec.getBoundingClientRect();
      var h = sec.offsetHeight;
      var vh = window.innerHeight;
      var start = rect.top + window.scrollY;
      var scroll = window.scrollY + vh * 0.35 - start;
      var p = scroll / (h * 0.85);
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      fill.style.height = p * 100 + "%";
    }
    window.addEventListener("scroll", upd, { passive: true });
    upd();
  }

  function renderAbout() {
    var ap = SITE.aboutPage || {};
    $("about-body").textContent = ap.body || "";
  }

  function fillAdmissionsSelects() {
    var stSel = $("adm-stream");
    var brSel = $("adm-branch");
    stSel.innerHTML = '<option value="">Select stream</option>';
    asArray(SITE.programStreams).forEach(function (s) {
      stSel.insertAdjacentHTML("beforeend", '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>");
    });
    function refillBranches() {
      var id = stSel.value;
      brSel.innerHTML = '<option value="">Select branch</option>';
      var st = asArray(SITE.programStreams).find(function (x) {
        return x.id === id;
      });
      if (!st) return;
      (st.branches || []).forEach(function (b) {
        brSel.insertAdjacentHTML("beforeend", '<option value="' + esc(b.name) + '">' + esc(b.name) + "</option>");
      });
    }
    stSel.addEventListener("change", refillBranches);
    refillBranches();
  }

  var admFields = ["fullName", "email", "dob", "stream", "branch", "phone", "city", "district"];

  function admCompletion() {
    var fd = new FormData($("adm-form"));
    var filled = 0;
    admFields.forEach(function (f) {
      var v = fd.get(f);
      if (v && String(v).trim()) filled++;
    });
    return Math.round((filled / admFields.length) * 100);
  }

  function sendPartialAdm() {
    var fd = new FormData($("adm-form"));
    var fields = {};
    admFields.forEach(function (f) {
      fields[f] = fd.get(f) || "";
    });
    fetch("/api/admissions/partial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId,
        completionPercent: admCompletion(),
        fields: fields,
        page: "admissions",
      }),
      keepalive: true,
    }).catch(function () {});
  }

  var admTimer;
  function wireAdmissionsForm() {
    $("adm-form").addEventListener("input", function () {
      clearTimeout(admTimer);
      admTimer = setTimeout(sendPartialAdm, 600);
    });
    $("adm-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var body = {
        sessionId: sessionId,
        fullName: fd.get("fullName"),
        email: fd.get("email"),
        dob: fd.get("dob"),
        stream: fd.get("stream"),
        branch: fd.get("branch"),
        phone: fd.get("phone"),
        city: fd.get("city"),
        district: fd.get("district"),
      };
      var ok =
        String(body.fullName || "").trim() &&
        String(body.email || "").trim() &&
        String(body.stream || "").trim() &&
        String(body.branch || "").trim() &&
        String(body.phone || "").trim() &&
        String(body.city || "").trim() &&
        String(body.district || "").trim() &&
        String(body.dob || "").trim();
      if (!ok) {
        alert("Please fill every field before submitting.");
        return;
      }
      fetch("/api/admissions/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          alert("Thank you — we received your enquiry.");
          e.target.reset();
          if (window.gtag) gtag("event", "generate_lead");
          if (window.fbq) fbq("track", "Lead");
          track("admission_submit", "admissions", {});
        })
        .catch(function () {
          alert("Could not submit. Try again.");
        });
    });
  }

  function renderContact() {
    var c = SITE.contactPage || {};
    $("contact-address").textContent = c.address || "";
    $("contact-phones").innerHTML =
      "<a href=\"tel:" +
      esc((c.phone1 || "").replace(/\s/g, "")) +
      "\">" +
      esc(c.phone1) +
      "</a><br /><a href=\"tel:" +
      esc((c.phone2 || "").replace(/\s/g, "")) +
      "\">" +
      esc(c.phone2) +
      "</a>";
    var links = $("contact-links");
    links.innerHTML = "";
    if (c.website)
      links.insertAdjacentHTML(
        "beforeend",
        "<li><a href=\"" + esc(c.website) + "\" target=\"_blank\" rel=\"noopener\">Website — kietgroup.com</a></li>"
      );
    if (c.instagramUrl)
      links.insertAdjacentHTML(
        "beforeend",
        "<li><a href=\"" + esc(c.instagramUrl) + "\" target=\"_blank\" rel=\"noopener\">Instagram</a></li>"
      );
    if (c.youtubeUrl)
      links.insertAdjacentHTML(
        "beforeend",
        "<li><a href=\"" + esc(c.youtubeUrl) + "\" target=\"_blank\" rel=\"noopener\">YouTube — Kiet Kakinada</a></li>"
      );
  }

  function renderDetail(kind, rawId) {
    var id = decodeURIComponent(rawId || "");
    var root = $("detail-root");
    if (kind === "spotlight") {
      var ev = asArray(SITE.campusSpotlight).find(function (x) {
        return String(x.id) === id;
      });
      if (!ev) {
        root.innerHTML = "<p>Story not found.</p>";
        return;
      }
      var gal = (ev.gallery || []).map(mediaHtml).join("");
      root.innerHTML =
        "<h1>" +
        esc(ev.title) +
        '</h1><p class="detail-summary">' +
        esc(ev.summary) +
        '</p><div class="detail-body">' +
        esc(ev.body || "") +
        '</div><div class="media-grid">' +
        gal +
        "</div>";
      return;
    }
    if (kind === "difference") {
      var d = asArray(SITE.difference).find(function (x) {
        return String(x.id) === id;
      });
      if (!d) {
        root.innerHTML = "<p>Page not found.</p>";
        return;
      }
      var gal2 = (d.gallery || []).map(mediaHtml).join("");
      root.innerHTML =
        "<h1>" +
        esc(d.title) +
        '</h1><p class="detail-summary">' +
        esc(d.teaser) +
        '</p><div class="detail-body">' +
        esc(d.body || "") +
        '</div><div class="media-grid">' +
        gal2 +
        "</div>";
    }
  }

  function setRoute(name, sub, subId) {
    document.querySelectorAll(".route").forEach(function (r) {
      r.classList.add("hidden");
    });
    var secRow = document.querySelector(".dual-nav-sections-wrap");
    if (name === "detail") {
      $("route-detail").classList.remove("hidden");
      if (secRow) secRow.classList.add("hidden");
      renderDetail(sub, subId);
      updateNavForPage(null);
      window.scrollTo(0, 0);
      return;
    }
    var map = { home: "route-home", about: "route-about", admissions: "route-admissions", contact: "route-contact" };
    var rid = map[name] || "route-home";
    $(rid).classList.remove("hidden");
    if (secRow) secRow.classList.toggle("hidden", name !== "home");
    updateNavForPage(name);
    track("route", name, {});
  }

  function onHash() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    var page = parts[0] || "home";
    if (page === "spotlight" && parts[1]) {
      setRoute("detail", "spotlight", parts[1]);
      return;
    }
    if (page === "difference" && parts[1]) {
      setRoute("detail", "difference", parts[1]);
      return;
    }
    setRoute(page);
    fabPeekOnce();
  }

  function wireNav() {
    window.addEventListener("hashchange", onHash);
    $("detail-back").addEventListener("click", function () {
      history.back();
    });
    onHash();
  }

  function wireModals() {
    document.querySelectorAll("[data-close-apply]").forEach(function (el) {
      el.addEventListener("click", closeApply);
    });
    $("apply-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      fetch("/api/apply-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId,
          name: fd.get("name"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          dob: fd.get("dob"),
          branch: fd.get("branch"),
          stream: fd.get("stream"),
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          alert("Application note sent. We will contact you.");
          closeApply();
          if (window.fbq) fbq("track", "Lead");
          track("apply_submit", "programs", {});
        })
        .catch(function () {
          alert("Submit failed.");
        });
    });
  }

  function wireToTop() {
    $("to-top").addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener(
      "scroll",
      function () {
        $("to-top").style.opacity = window.scrollY > 400 ? "1" : "0.35";
      },
      { passive: true }
    );
  }

  function renderChatMsgs(arr) {
    var box = $("chat-sheet-msgs");
    if (!box) return;
    box.innerHTML = (arr || [])
      .map(function (m) {
        var cl = m.role === "admin" ? "wa-in" : "wa-out";
        return '<div class="wa-bubble ' + cl + '">' + esc(m.body) + "</div>";
      })
      .join("");
    box.scrollTop = box.scrollHeight;
  }

  function pollChatVisitor() {
    fetch("/api/chat/poll?sessionId=" + encodeURIComponent(sessionId) + (lastChatId ? "&after=" + encodeURIComponent(lastChatId) : ""))
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error("poll");
          return j;
        });
      })
      .then(function (j) {
        var msgs = j.messages || [];
        if (!msgs.length) return;
        var box = $("chat-sheet-msgs");
        if (!box) return;
        msgs.forEach(function (m) {
          var cl = m.role === "admin" ? "wa-in" : "wa-out";
          box.insertAdjacentHTML("beforeend", '<div class="wa-bubble ' + cl + '">' + esc(m.body) + "</div>");
          lastChatId = m.id;
        });
        box.scrollTop = box.scrollHeight;
      })
      .catch(function () {});
  }

  function startChatPoll() {
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(pollChatVisitor, 4000);
  }

  function stopChatPoll() {
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = null;
  }

  function loadChatHistory() {
    return fetch("/api/chat/poll?sessionId=" + encodeURIComponent(sessionId))
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error("chat");
          return j;
        });
      })
      .then(function (j) {
        var msgs = j.messages || [];
        renderChatMsgs(msgs);
        if (msgs.length) lastChatId = msgs[msgs.length - 1].id;
      })
      .catch(function () {});
  }

  function openChatSheet() {
    var p = $("fab-chat-sheet");
    if (!p) return;
    p.classList.remove("hidden");
    loadChatHistory().then(function () {
      startChatPoll();
    });
  }

  function closeChatSheet() {
    var p = $("fab-chat-sheet");
    if (p) p.classList.add("hidden");
    stopChatPoll();
  }

  function fabPeekOnce() {
    var menu = $("fab-menu");
    var main = $("fab-main");
    if (!menu || !main) return;
    var key = "kiet_fab_peek_" + (location.hash || "#/");
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    menu.classList.remove("hidden");
    main.setAttribute("aria-expanded", "true");
    setTimeout(function () {
      menu.classList.add("hidden");
      main.setAttribute("aria-expanded", "false");
    }, 1400);
  }

  function wireFab() {
    var menu = $("fab-menu");
    var main = $("fab-main");
    var wa = $("fab-wa");
    var chatFab = $("fab-chat");
    var num = (SITE.whatsappNumber || "917981893706").replace(/\D/g, "");
    wa.href = "https://wa.me/" + num;
    main.addEventListener("click", function () {
      var open = menu.classList.toggle("hidden");
      main.setAttribute("aria-expanded", open ? "false" : "true");
    });
    if (chatFab) {
      chatFab.addEventListener("click", function () {
        var u = (SITE.chatWidgetUrl || "").trim();
        if (u) {
          window.open(u, "_blank", "noopener");
        } else {
          openChatSheet();
        }
        menu.classList.add("hidden");
        main.setAttribute("aria-expanded", "false");
      });
    }
  }

  function wireFabChatSheet() {
    var sheet = $("fab-chat-sheet");
    var closeBtn = $("chat-sheet-close");
    var form = $("chat-sheet-form");
    if (!sheet || !closeBtn || !form) return;
    closeBtn.addEventListener("click", closeChatSheet);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = $("chat-sheet-input");
      var t = String(inp.value || "").trim();
      if (!t) return;
      var u = (SITE.chatWidgetUrl || "").trim();
      if (u) {
        window.open(u, "_blank", "noopener");
        return;
      }
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          sessionId: sessionId,
          message: t,
          pageUrl: String(window.location.href || "").slice(0, 512),
        }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            var j = {};
            try {
              j = text ? JSON.parse(text) : {};
            } catch (e) {
              throw new Error("Server error (" + r.status + ")");
            }
            if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
            return j;
          });
        })
        .then(function (j) {
          inp.value = "";
          var box = $("chat-sheet-msgs");
          if (box) {
            box.insertAdjacentHTML("beforeend", '<div class="wa-bubble wa-out">' + esc(t) + "</div>");
            lastChatId = j.id || lastChatId;
            box.scrollTop = box.scrollHeight;
          }
        })
        .catch(function (err) {
          var detail = err && err.message ? err.message : "Network or server issue";
          alert(
            "Could not send your message: " +
              detail +
              ". If you’re testing on your PC, run the site with npm start. On the live Railway URL, wait a moment and try again."
          );
        });
    });
  }

  function observeSections() {
    var seen = {};
    var io = new IntersectionObserver(
      function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.getAttribute("data-track") || en.target.id;
          if (!id || seen[id]) return;
          seen[id] = true;
          track("section_view", id, {});
        });
      },
      { threshold: 0.2 }
    );
    ["spotlight", "placements", "programs", "mou", "vision", "difference"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.setAttribute("data-track", id);
        io.observe(el);
      }
    });
    ["route-about", "route-admissions", "route-contact", "route-detail"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.setAttribute("data-track", id.replace("route-", ""));
        io.observe(el);
      }
    });
  }

  function init(data) {
    SITE = data;
    document.title = (SITE.shortName || "KIET") + " — " + (SITE.collegeName || "");
    loadPixels(SITE.pixels || {});

    var hero = SITE.hero || {};
    var heroImgPre = hero.image ? String(hero.image).trim() : "";
    if (heroImgPre && !document.querySelector("link[data-kiet-preload-hero]")) {
      var pl = document.createElement("link");
      pl.rel = "preload";
      pl.as = "image";
      pl.href = heroImgPre;
      pl.setAttribute("data-kiet-preload-hero", "1");
      document.head.appendChild(pl);
    }
    $("hero-bg").style.backgroundImage = cssBgUrl(hero.image);
    applyHeroPackageLine($("hero-package"), hero.packageLine || "");
    $("hero-lbl-left").textContent = hero.statLeftLabel || "Students";
    $("hero-lbl-right").textContent = hero.statRightLabel || "Placements";
    $("hero-headline-fallback").textContent = (hero.headline || "Empowering") + " future";
    var h1 = $("hero-line1");
    if (h1) h1.textContent = hero.line1 != null && hero.line1 !== "" ? hero.line1 : "Future Ready.";
    var tg = $("hero-tagline");
    if (tg) tg.textContent = hero.tagline || "";
    fillDigitBox("hero-digits-left", hero.statLeftValue || "");
    fillDigitBox("hero-digits-right", hero.statRightValue || "");

    var wt = $("wa-chat-title");
    if (wt) wt.textContent = SITE.shortName || "Chat";

    renderMarquee();
    wireNavRgb();
    setupMarqueeScrollHide();
    renderSpotlight();
    renderPlacements();
    renderPrograms();
    renderMOU();
    renderVision();
    renderClubs("clubs-grid-about");
    renderTimeline();
    setupTimelineScroll();
    renderAbout();
    fillAdmissionsSelects();
    wireAdmissionsForm();
    renderContact();
    $("footer-line").textContent = SITE.footerLine || "";

    wireNav();
    wireModals();
    wireToTop();
    wireFab();
    wireFabChatSheet();
    observeSections();
    track("page_load", "app", {});
    runHeroIntro();
    fabPeekOnce();
  }

  fetch("/api/site", { credentials: "omit" })
    .then(function (r) {
      if (!r.ok) throw new Error("bad status");
      return r.json();
    })
    .then(init)
    .catch(function () {
      return fetch("/data/site.json")
        .then(function (r) {
          return r.json();
        })
        .then(init);
    })
    .catch(function () {
      document.body.innerHTML =
        "<p style=\"padding:2rem;color:#fff;background:#111;\">Could not load site content. Deploy the API (Railway) and set <code>vercel.json</code> rewrites to that URL, or run locally: <code>npm start</code></p>";
    });
})();
