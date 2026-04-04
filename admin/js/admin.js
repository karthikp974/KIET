(function () {
  var cred = { credentials: "same-origin" };
  var data = null;
  var adminRole = null;
  var selectedChatSession = null;
  var chatPollTimer = null;
  var pendingExportKind = null;
  var prevChatUnread = null;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return String(iso);
    }
  }

  async function apiUpload(file) {
    var fd = new FormData();
    fd.append("file", file);
    var r = await fetch("/api/upload", { method: "POST", body: fd, credentials: "same-origin" });
    if (!r.ok) throw new Error("upload failed");
    var j = await r.json();
    return j.url;
  }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!(t && t.matches && t.matches("input[data-upload-target]"))) return;
    var id = t.getAttribute("data-upload-target");
    var dest = document.getElementById(id);
    if (!t.files || !t.files[0] || !dest) return;
    if (adminRole !== "full") {
      t.value = "";
      alert("Uploads require the full admin password.");
      return;
    }
    apiUpload(t.files[0])
      .then(function (url) {
        dest.value = url;
        t.value = "";
        var block = dest.closest(".block");
        if (block) updatePlacePreview(block);
      })
      .catch(function () {
        alert("Upload failed — are you signed in as full admin?");
      });
  });

  function showLogin() {
    adminRole = null;
    selectedChatSession = null;
    prevChatUnread = null;
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = null;
    $("login-panel").classList.remove("hidden");
    $("main-panel").classList.add("hidden");
    $("chat-badge").classList.add("hidden");
  }

  function showMain() {
    $("login-panel").classList.add("hidden");
    $("main-panel").classList.remove("hidden");
  }

  function setRoleUi() {
    var full = adminRole === "full";
    document.querySelectorAll(".tab-full").forEach(function (el) {
      el.classList.toggle("hidden", !full);
    });
    $("btn-save-all").classList.toggle("hidden", !full);
    var clr = $("btn-clear-chat");
    if (clr) clr.classList.toggle("hidden", !full);
    if (!full) {
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("on");
      });
      $("t-up").classList.add("on");
      document.querySelectorAll("#main-tabs button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-tab") === "t-up");
      });
    }
  }

  function block(html, onRemove) {
    var wrap = document.createElement("div");
    wrap.className = "block";
    wrap.innerHTML = html;
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn rm";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () {
      wrap.remove();
      if (onRemove) onRemove();
    });
    wrap.appendChild(rm);
    return wrap;
  }

  function updatePlacePreview(wrap) {
    var inp = wrap.querySelector(".p-img");
    var img = wrap.querySelector(".p-thumb-img");
    if (!inp || !img) return;
    var u = inp.value.trim();
    if (u) {
      img.src = u;
      img.style.display = "block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
  }

  function wirePlaceBlock(wrap) {
    var inp = wrap.querySelector(".p-img");
    if (inp) {
      inp.addEventListener("input", function () {
        updatePlacePreview(wrap);
      });
      updatePlacePreview(wrap);
    }
  }

  function campusBlock(ev) {
    var uid = "ci-" + Math.random().toString(36).slice(2);
    return block(
      "<h3>Campus event</h3>" +
        '<label>Title<input type="text" class="c-title" value="' +
        escAttr(ev.title) +
        '" /></label>' +
        '<label>Summary<input type="text" class="c-sum" value="' +
        escAttr(ev.summary) +
        '" /></label>' +
        '<div class="up-row"><label>Media</label><input type="file" accept="image/*,video/*" data-upload-target="' +
        uid +
        '" /><input type="text" class="grow c-img" id="' +
        uid +
        '" value="' +
        escAttr(ev.image) +
        '" /></div>' +
        '<label>Long text (modal)<textarea class="c-body" rows="3">' +
        escText(ev.body) +
        "</textarea></label>" +
        '<label>Gallery URLs (one per line)<textarea class="c-gal" rows="2">' +
        escText((ev.gallery || []).join("\n")) +
        "</textarea></label>",
      null
    );
  }

  function placeBlock(p) {
    var uid = "pimg-" + Math.random().toString(36).slice(2);
    var imgUrl = p.image || "";
    var w = block(
      "<h3>Placement</h3>" +
        '<div class="up-row"><label>Photo URL / upload</label><input type="file" accept="image/*" data-upload-target="' +
        uid +
        '" /><input type="text" class="grow p-img" id="' +
        uid +
        '" value="' +
        escAttr(imgUrl) +
        '" /></div>' +
        '<div class="admin-place-thumb"><img class="p-thumb-img" alt="Preview" /></div>' +
        '<label>Name<input type="text" class="p-n" value="' +
        escAttr(p.studentName) +
        '" /></label>' +
        '<label>Branch<input type="text" class="p-b" value="' +
        escAttr(p.branch) +
        '" /></label>' +
        '<label>Company<input type="text" class="p-c" value="' +
        escAttr(p.company) +
        '" /></label>' +
        '<label>Package<input type="text" class="p-p" value="' +
        escAttr(p.package) +
        '" /></label>' +
        '<label>Year<input type="text" class="p-y" value="' +
        escAttr(p.year) +
        '" /></label>',
      null
    );
    wirePlaceBlock(w);
    return w;
  }

  function mouBlock(m) {
    var uid = "mou-" + Math.random().toString(36).slice(2);
    return block(
      "<h3>MOU partner</h3>" +
        '<label>Name<input type="text" class="m-n" value="' +
        escAttr(m.name) +
        '" /></label>' +
        '<div class="up-row"><label>Logo</label><input type="file" accept="image/*" data-upload-target="' +
        uid +
        '" /><input type="text" class="grow m-logo" id="' +
        uid +
        '" value="' +
        escAttr(m.logo) +
        '" /></div>',
      null
    );
  }

  function visBlock(v) {
    var uid = "v-" + Math.random().toString(36).slice(2);
    return block(
      "<h3>Visionary</h3>" +
        '<label>Name<input type="text" class="v-n" value="' +
        escAttr(v.name) +
        '" /></label>' +
        '<label>Role<input type="text" class="v-r" value="' +
        escAttr(v.role) +
        '" /></label>' +
        '<div class="up-row"><label>Photo</label><input type="file" accept="image/*" data-upload-target="' +
        uid +
        '" /><input type="text" class="grow v-img" id="' +
        uid +
        '" value="' +
        escAttr(v.image) +
        '" /></div>',
      null
    );
  }

  function clubBlock(c) {
    var uid = "cl-" + Math.random().toString(36).slice(2);
    return block(
      "<h3>Club</h3>" +
        '<label>Title<input type="text" class="cl-t" value="' +
        escAttr(c.title) +
        '" /></label>' +
        '<label>Subtitle / tagline<input type="text" class="cl-s" value="' +
        escAttr(c.subtitle) +
        '" /></label>' +
        '<label>Short blurb<textarea class="cl-b" rows="2">' +
        escText(c.blurb) +
        "</textarea></label>" +
        '<label>Instagram link (full URL)<input type="text" class="cl-i" value="' +
        escAttr(c.instagram) +
        '" /></label>' +
        '<div class="up-row"><label>Club cover photo</label><input type="file" accept="image/*" data-upload-target="' +
        uid +
        '" /><input type="text" class="grow cl-img" id="' +
        uid +
        '" value="' +
        escAttr(c.image) +
        '" /></div>',
      null
    );
  }

  function diffBlock(d) {
    return block(
      "<h3>Difference item</h3>" +
        '<label>Title (e.g. KIOT)<input type="text" class="d-t" value="' +
        escAttr(d.title) +
        '" /></label>' +
        '<label>Teaser line<input type="text" class="d-te" value="' +
        escAttr(d.teaser) +
        '" /></label>' +
        '<label>Full text<textarea class="d-b" rows="3">' +
        escText(d.body) +
        "</textarea></label>" +
        '<label>Gallery URLs (one per line)<textarea class="d-g" rows="2">' +
        escText((d.gallery || []).join("\n")) +
        "</textarea></label>",
      null
    );
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escText(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
  }

  function readCampus() {
    var out = [];
    $("campus-box").querySelectorAll(".block").forEach(function (w) {
      out.push({
        id: "c-" + Math.random().toString(36).slice(2),
        title: w.querySelector(".c-title").value.trim(),
        summary: w.querySelector(".c-sum").value.trim(),
        image: w.querySelector(".c-img").value.trim(),
        body: w.querySelector(".c-body").value.trim(),
        gallery: w
          .querySelector(".c-gal")
          .value.split("\n")
          .map(function (x) {
            return x.trim();
          })
          .filter(Boolean),
      });
    });
    return out;
  }

  function readList(sel, mapFn) {
    var out = [];
    document.querySelectorAll(sel).forEach(function (w) {
      out.push(mapFn(w));
    });
    return out;
  }

  function collect() {
    data.collegeName = $("college-name").value.trim();
    data.shortName = $("short-name").value.trim();
    data.menuLogo = $("menu-logo").value.trim();
    data.footerLine = $("footer-line").value.trim();
    data.hero = {
      image: $("hero-image").value.trim(),
      headline: $("hero-headline").value.trim(),
      line1: $("hero-line1").value.trim(),
      tagline: $("hero-tagline").value.trim(),
      statLeftValue: $("hero-sv-l").value.trim(),
      statLeftLabel: $("hero-sl-l").value.trim(),
      statRightValue: $("hero-sv-r").value.trim(),
      statRightLabel: $("hero-sl-r").value.trim(),
      packageLine: $("hero-pkg").value.trim(),
    };
    data.pixels = {
      metaPixelId: $("px-meta").value.trim(),
      googleTagId: $("px-google").value.trim(),
      snapPixelId: $("px-snap").value.trim(),
    };
    data.whatsappNumber = $("wa-num").value.trim();
    data.chatWidgetUrl = $("chat-url").value.trim();
    data.campusSpotlight = readCampus();
    data.placements = readList("#place-box .block", function (w) {
      var imgEl = w.querySelector(".p-img");
      return {
        id: "p-" + Math.random().toString(36).slice(2),
        studentName: w.querySelector(".p-n").value.trim(),
        branch: w.querySelector(".p-b").value.trim(),
        company: w.querySelector(".p-c").value.trim(),
        package: w.querySelector(".p-p").value.trim(),
        year: w.querySelector(".p-y").value.trim(),
        image: imgEl ? imgEl.value.trim() : "",
      };
    });
    data.industryMOU = readList("#mou-box .block", function (w) {
      return {
        name: w.querySelector(".m-n").value.trim(),
        logo: w.querySelector(".m-logo").value.trim(),
      };
    });
    data.visionaries = readList("#vis-box .block", function (w) {
      return {
        id: "v-" + Math.random().toString(36).slice(2),
        name: w.querySelector(".v-n").value.trim(),
        role: w.querySelector(".v-r").value.trim(),
        image: w.querySelector(".v-img").value.trim(),
      };
    });
    data.clubs = readList("#club-box .block", function (w) {
      return {
        id: "cl-" + Math.random().toString(36).slice(2),
        title: w.querySelector(".cl-t").value.trim(),
        subtitle: w.querySelector(".cl-s").value.trim(),
        blurb: w.querySelector(".cl-b").value.trim(),
        instagram: w.querySelector(".cl-i").value.trim(),
        image: w.querySelector(".cl-img").value.trim(),
      };
    });
    data.differenceTitle = $("diff-title").value.trim();
    data.differenceSubtitle = $("diff-sub").value.trim();
    data.difference = readList("#diff-box .block", function (w) {
      return {
        id: "d-" + Math.random().toString(36).slice(2),
        title: w.querySelector(".d-t").value.trim(),
        teaser: w.querySelector(".d-te").value.trim(),
        body: w.querySelector(".d-b").value.trim(),
        gallery: w
          .querySelector(".d-g")
          .value.split("\n")
          .map(function (x) {
            return x.trim();
          })
          .filter(Boolean),
      };
    });
    data.aboutPage = {
      heroImage: $("about-hero").value.trim(),
      body: $("about-body").value.trim(),
    };
    data.admissionsPage = { heroImage: $("adm-hero").value.trim() };
    data.contactPage = {
      address: $("c-address").value.trim(),
      phone1: $("c-p1").value.trim(),
      phone2: $("c-p2").value.trim(),
      website: $("c-web").value.trim(),
      instagramUrl: $("c-insta").value.trim(),
      youtubeUrl: $("c-yt").value.trim(),
    };
    try {
      data.programStreams = JSON.parse($("programs-json").value);
    } catch (e) {
      alert("Programs JSON is invalid — fix syntax or undo.");
      throw e;
    }
  }

  function fill() {
    $("college-name").value = data.collegeName || "";
    $("short-name").value = data.shortName || "";
    $("menu-logo").value = data.menuLogo || "";
    $("footer-line").value = data.footerLine || "";
    var h = data.hero || {};
    $("hero-image").value = h.image || "";
    $("hero-headline").value = h.headline || "";
    $("hero-line1").value = h.line1 || "";
    $("hero-tagline").value = h.tagline || "";
    $("hero-sv-l").value = h.statLeftValue || "";
    $("hero-sl-l").value = h.statLeftLabel || "";
    $("hero-sv-r").value = h.statRightValue || "";
    $("hero-sl-r").value = h.statRightLabel || "";
    $("hero-pkg").value = h.packageLine || "";
    var px = data.pixels || {};
    $("px-meta").value = px.metaPixelId || "";
    $("px-google").value = px.googleTagId || "";
    $("px-snap").value = px.snapPixelId || "";
    $("wa-num").value = data.whatsappNumber || "";
    $("chat-url").value = data.chatWidgetUrl || "";
    $("diff-title").value = data.differenceTitle || "";
    $("diff-sub").value = data.differenceSubtitle || "";
    var ap = data.aboutPage || {};
    $("about-hero").value = ap.heroImage || "";
    $("about-body").value = ap.body || "";
    $("adm-hero").value = (data.admissionsPage || {}).heroImage || "";
    var cp = data.contactPage || {};
    $("c-address").value = cp.address || "";
    $("c-p1").value = cp.phone1 || "";
    $("c-p2").value = cp.phone2 || "";
    $("c-web").value = cp.website || "";
    $("c-insta").value = cp.instagramUrl || "";
    $("c-yt").value = cp.youtubeUrl || "";
    $("programs-json").value = JSON.stringify(data.programStreams || [], null, 2);

    $("campus-box").innerHTML = "";
    (data.campusSpotlight || []).forEach(function (x) {
      $("campus-box").appendChild(campusBlock(x));
    });
    $("place-box").innerHTML = "";
    (data.placements || []).forEach(function (x) {
      $("place-box").appendChild(placeBlock(x));
    });
    $("mou-box").innerHTML = "";
    (data.industryMOU || []).forEach(function (x) {
      $("mou-box").appendChild(mouBlock(x));
    });
    $("vis-box").innerHTML = "";
    (data.visionaries || []).forEach(function (x) {
      $("vis-box").appendChild(visBlock(x));
    });
    $("club-box").innerHTML = "";
    (data.clubs || []).forEach(function (x) {
      $("club-box").appendChild(clubBlock(x));
    });
    $("diff-box").innerHTML = "";
    (data.difference || []).forEach(function (x) {
      $("diff-box").appendChild(diffBlock(x));
    });
  }

  async function loadSite() {
    var r = await fetch("/api/site", cred);
    data = await r.json();
    fill();
  }

  async function save() {
    collect();
    var r = await fetch("/api/site", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(data),
    });
    if (r.status === 401) {
      showLogin();
      return;
    }
    if (!r.ok) {
      var errMsg = "Save failed (" + r.status + ")";
      try {
        var ej = await r.json();
        if (ej && ej.error) errMsg += ": " + ej.error;
      } catch (e) {
        /* ignore */
      }
      if (r.status === 413) errMsg += " — site JSON too large; remove huge images or contact host.";
      alert(errMsg);
      return;
    }
    $("save-status").textContent = "Saved.";
    setTimeout(function () {
      $("save-status").textContent = "";
    }, 2500);
  }

  function groupVisitors(events) {
    var by = {};
    (events || []).forEach(function (e) {
      var sid = e.sessionId || "unknown";
      if (!by[sid]) by[sid] = { sections: {}, last: e.at };
      if (e.at > by[sid].last) by[sid].last = e.at;
      if (e.type === "section_view" && e.section) by[sid].sections[e.section] = true;
      if (e.type === "route" && e.section) by[sid].sections["page:" + e.section] = true;
    });
    return by;
  }

  function updateChatBadge(n) {
    var b = $("chat-badge");
    if (!b) return;
    if (n > 0) {
      b.textContent = String(n);
      b.classList.remove("hidden");
    } else {
      b.classList.add("hidden");
    }
  }

  function maybeNotifyNewChat(current) {
    if (typeof current !== "number") return;
    if (
      prevChatUnread !== null &&
      current > prevChatUnread &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      var delta = current - prevChatUnread;
      var body = delta === 1 ? "1 new unread message" : delta + " new unread messages";
      try {
        new Notification("Live chat — visitor", {
          body: body,
          tag: "prok-chat-unread",
        });
      } catch (e) {
        /* ignore */
      }
    }
    prevChatUnread = current;
  }

  function wireChatNotifyButton() {
    var btn = $("btn-chat-notify");
    var st = $("chat-notify-status");
    if (!btn) return;
    function sync() {
      if (typeof Notification === "undefined") {
        if (st) st.textContent = "Not supported in this browser.";
        btn.disabled = true;
        return;
      }
      if (Notification.permission === "granted") {
        if (st) st.textContent = "On: you will get alerts when unread count goes up.";
        btn.textContent = "Notifications enabled";
        btn.disabled = true;
      } else if (Notification.permission === "denied") {
        if (st) st.textContent = "Blocked — allow notifications in your browser settings for this site.";
        btn.disabled = true;
      } else {
        btn.textContent = "Enable desktop notifications";
        btn.disabled = false;
        if (st) st.textContent = "";
      }
    }
    sync();
    btn.addEventListener("click", function () {
      Notification.requestPermission().then(function () {
        sync();
      });
    });
  }

  function closeExportModal() {
    var m = $("export-fmt-modal");
    if (m) {
      m.classList.add("hidden");
      m.setAttribute("aria-hidden", "true");
    }
    pendingExportKind = null;
  }

  function openExportModal(kind) {
    pendingExportKind = kind;
    var m = $("export-fmt-modal");
    if (!m) return;
    m.classList.remove("hidden");
    m.setAttribute("aria-hidden", "false");
  }

  async function downloadExport(kind, fmt) {
    var origin = window.location.origin;
    if (!origin || origin === "null" || String(window.location.protocol) === "file:") {
      alert("Use the live admin URL from the server, e.g. http://localhost:3750/admin/ (run npm start). Downloads do not work from a saved file.");
      return;
    }
    var f = fmt || "json";
    var url =
      origin + "/api/admin/export/" + encodeURIComponent(kind) + "?fmt=" + encodeURIComponent(f);
    var r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (r.status === 401) {
      showLogin();
      return;
    }
    if (!r.ok) {
      var msg = "Download failed (" + r.status + ").";
      try {
        var j = await r.json();
        if (j && j.error) msg += " " + j.error;
      } catch (e) {
        /* ignore */
      }
      alert(msg + " Restart the server (npm start) if you just updated the code.");
      return;
    }
    var blob = await r.blob();
    var disp = r.headers.get("Content-Disposition") || "";
    var m = /filename="([^"]+)"/.exec(disp);
    var name = m
      ? m[1]
      : "export." +
        (f === "csv" || f === "gsheets" ? "csv" : f === "pdf" ? "pdf" : "json");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function loadUpdates() {
    var r = await fetch("/api/admin/updates", cred);
    if (r.status === 401) {
      showLogin();
      return;
    }
    var u = await r.json();
    if (typeof u.chatUnread === "number") {
      maybeNotifyNewChat(u.chatUnread);
      updateChatBadge(u.chatUnread);
    }

    var g = groupVisitors(u.analytics);
    var rows = Object.keys(g)
      .sort(function (a, b) {
        return g[b].last.localeCompare(g[a].last);
      })
      .slice(0, 80)
      .map(function (sid) {
        var secs = Object.keys(g[sid].sections).sort().join(", ") || "—";
        return "<tr><td>" + escText(fmtWhen(g[sid].last)) + "</td><td>" + escText(secs) + "</td></tr>";
      });
    $("visitors-out").innerHTML =
      "<table><thead><tr><th>Last visit</th><th>Pages / sections seen</th></tr></thead><tbody>" +
      rows.join("") +
      "</tbody></table>";

    function tbl(rows2) {
      return (
        "<table><thead><tr>" +
        rows2.headers
          .map(function (h) {
            return "<th>" + escText(h) + "</th>";
          })
          .join("") +
        "</tr></thead><tbody>" +
        rows2.body +
        "</tbody></table>"
      );
    }

    var af = (u.admissionsFull || []).slice().reverse();
    $("adm-full-out").innerHTML = tbl({
      headers: ["When", "Name", "Email", "Phone", "Stream", "Branch", "City", "District", "%"],
      body: af
        .filter(function (x) {
          return x.source === "admissions_page";
        })
        .map(function (x) {
          return (
            "<tr><td>" +
            escText(fmtWhen(x.at)) +
            "</td><td>" +
            escText(x.fullName || "—") +
            "</td><td>" +
            escText(x.email || "—") +
            "</td><td>" +
            escText(x.phone || "—") +
            "</td><td>" +
            escText(x.stream || "—") +
            "</td><td>" +
            escText(x.branch || "—") +
            "</td><td>" +
            escText(x.city || "—") +
            "</td><td>" +
            escText(x.district || "—") +
            "</td><td>100%</td></tr>"
          );
        })
        .join(""),
    });

    var ap = (u.admissionsPartial || []).slice().reverse().slice(0, 200);
    $("adm-part-out").innerHTML = tbl({
      headers: ["When", "Email", "Phone", "Name", "Progress", "Stream", "Branch"],
      body: ap
        .map(function (x) {
          var f = x.fields || {};
          return (
            "<tr><td>" +
            escText(fmtWhen(x.at)) +
            "</td><td>" +
            escText(f.email || "—") +
            "</td><td>" +
            escText(f.phone || "—") +
            "</td><td>" +
            escText(f.fullName || "—") +
            "</td><td>" +
            escText(String(x.completionPercent)) +
            "%</td><td>" +
            escText(f.stream || "—") +
            "</td><td>" +
            escText(f.branch || "—") +
            "</td></tr>"
          );
        })
        .join(""),
    });

    $("apply-out").innerHTML = tbl({
      headers: ["When", "Name", "Phone", "Email", "Branch"],
      body: af
        .filter(function (x) {
          return x.source === "program_apply";
        })
        .map(function (x) {
          return (
            "<tr><td>" +
            escText(fmtWhen(x.at)) +
            "</td><td>" +
            escText(x.name || "—") +
            "</td><td>" +
            escText(x.phone || "—") +
            "</td><td>" +
            escText(x.email || "—") +
            "</td><td>" +
            escText(x.branch || "—") +
            "</td></tr>"
          );
        })
        .join(""),
    });
  }

  async function loadChatInbox() {
    var r = await fetch("/api/admin/chat", cred);
    if (r.status === 401) {
      showLogin();
      return;
    }
    var j = await r.json();
    var tu = j.totalUnread || 0;
    updateChatBadge(tu);
    maybeNotifyNewChat(tu);
    var sessions = j.sessions || [];
    var html = sessions
      .map(function (s) {
        var un = s.unread ? '<span class="chat-unread">' + escText(String(s.unread)) + "</span> " : "";
        var url = (s.lastPageUrl || "").trim();
        var urlHtml = url
          ? '<br /><small class="chat-session-url" title="' +
            escAttr(url) +
            '">Page: ' +
            escText(url.length > 96 ? url.slice(0, 96) + "…" : url) +
            "</small>"
          : "";
        return (
          '<button type="button" class="chat-session-row" data-sid="' +
          escAttr(s.sessionId) +
          '">' +
          un +
          escText(s.sessionId.slice(0, 24)) +
          "…<br /><small>" +
          escText(s.preview.slice(0, 80)) +
          "</small>" +
          urlHtml +
          "</button>"
        );
      })
      .join("");
    $("chat-sessions").innerHTML = html || "<p class=\"hint\">No conversations yet.</p>";
  }

  function renderThreadMsgs(msgs) {
    var box = $("chat-thread-msgs");
    box.innerHTML = (msgs || [])
      .map(function (m) {
        var cl = m.role === "admin" ? "admin" : "visitor";
        var pu = (m.pageUrl || "").trim();
        var urlLine =
          cl === "visitor" && pu
            ? '<div class="chat-msg-url"><a href="' +
              escAttr(pu) +
              '" target="_blank" rel="noopener">' +
              escText(pu.length > 120 ? pu.slice(0, 120) + "…" : pu) +
              "</a></div>"
            : "";
        return (
          '<div class="chat-line ' +
          cl +
          '"><div class="chat-bubble">' +
          escText(m.body) +
          "</div>" +
          urlLine +
          "<small>" +
          escText(m.at) +
          "</small></div>"
        );
      })
      .join("");
    box.scrollTop = box.scrollHeight;
  }

  async function openChatThread(sid, markRead) {
    selectedChatSession = sid;
    $("chat-thread-title").textContent = "Session: " + sid;
    $("chat-reply-form").classList.remove("hidden");
    var q = "sessionId=" + encodeURIComponent(sid) + (markRead === false ? "&markRead=0" : "");
    var r = await fetch("/api/admin/chat/thread?" + q, cred);
    if (r.status === 401) {
      showLogin();
      return;
    }
    var j = await r.json();
    renderThreadMsgs(j.messages || []);
    loadChatInbox();
    loadUpdates();
  }

  async function postReply(e) {
    e.preventDefault();
    if (!selectedChatSession) return;
    var ta = $("chat-reply-input");
    var text = String(ta.value || "").trim();
    if (!text) return;
    var r = await fetch("/api/admin/chat/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ sessionId: selectedChatSession, message: text }),
    });
    if (!r.ok) {
      alert("Send failed");
      return;
    }
    ta.value = "";
    await openChatThread(selectedChatSession, true);
  }

  function startChatPoll() {
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(function () {
      var panel = $("t-chat");
      if (panel && panel.classList.contains("on")) {
        loadChatInbox();
        if (selectedChatSession) openChatThread(selectedChatSession, false);
      }
      loadUpdates();
    }, 5000);
  }

  $("btn-in").addEventListener("click", async function () {
    $("login-err").textContent = "";
    var r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password: $("pw").value }),
    });
    if (!r.ok) {
      $("login-err").textContent = "Wrong password or server not running.";
      return;
    }
    var j = await r.json();
    adminRole = j.role || "full";
    showMain();
    setRoleUi();
    if (adminRole === "full") {
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("on");
      });
      $("t-home").classList.add("on");
      document.querySelectorAll("#main-tabs button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-tab") === "t-home");
      });
      await loadSite();
    }
    await loadUpdates();
    await loadChatInbox();
    startChatPoll();
    if (adminRole === "visi") {
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("on");
      });
      $("t-up").classList.add("on");
      document.querySelectorAll("#main-tabs button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-tab") === "t-up");
      });
    }
  });

  $("btn-out").addEventListener("click", async function () {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    showLogin();
  });

  $("btn-save-all").addEventListener("click", function () {
    save().catch(function () {});
  });

  $("add-campus").addEventListener("click", function () {
    $("campus-box").appendChild(
      campusBlock({ id: "n", title: "", summary: "", image: "", body: "", gallery: [] })
    );
  });
  $("add-place").addEventListener("click", function () {
    $("place-box").appendChild(
      placeBlock({ studentName: "", branch: "", company: "", package: "", year: "", image: "" })
    );
  });
  $("add-mou").addEventListener("click", function () {
    $("mou-box").appendChild(mouBlock({ name: "", logo: "" }));
  });
  $("add-vis").addEventListener("click", function () {
    $("vis-box").appendChild(visBlock({ name: "", role: "", image: "" }));
  });
  $("add-club").addEventListener("click", function () {
    $("club-box").appendChild(clubBlock({ title: "", subtitle: "", blurb: "", instagram: "", image: "" }));
  });
  $("add-diff").addEventListener("click", function () {
    $("diff-box").appendChild(diffBlock({ title: "", teaser: "", body: "", gallery: [] }));
  });

  $("main-tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (!b) return;
    $("main-tabs").querySelectorAll("button").forEach(function (x) {
      x.classList.toggle("on", x === b);
    });
    var id = b.getAttribute("data-tab");
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("on", p.id === id);
    });
    if (id === "t-up") loadUpdates();
    if (id === "t-chat") {
      loadChatInbox();
      loadUpdates();
    }
  });

  $("t-up").addEventListener("click", function (e) {
    var dl = e.target.closest("[data-export]");
    if (!dl) return;
    e.preventDefault();
    openExportModal(dl.getAttribute("data-export"));
  });

  var exModal = $("export-fmt-modal");
  if (exModal) {
    exModal.addEventListener("click", function (e) {
      if (e.target.matches("[data-close-export]")) {
        closeExportModal();
        return;
      }
      var pick = e.target.closest("[data-pick-fmt]");
      if (!pick || !exModal.contains(pick)) return;
      var fmt = pick.getAttribute("data-pick-fmt");
      var kind = pendingExportKind;
      closeExportModal();
      if (kind) {
        downloadExport(kind, fmt).catch(function () {
          alert("Download failed.");
        });
      }
    });
  }

  var btnClrChat = $("btn-clear-chat");
  if (btnClrChat) {
    btnClrChat.addEventListener("click", async function () {
      if (!confirm("Delete all visitor chat messages from the server? This cannot be undone.")) return;
      var r = await fetch("/api/admin/chat/clear", { method: "POST", credentials: "same-origin" });
      if (r.status === 401) {
        showLogin();
        return;
      }
      if (!r.ok) {
        alert("Could not clear chat (full admin only).");
        return;
      }
      selectedChatSession = null;
      $("chat-reply-form").classList.add("hidden");
      $("chat-thread-msgs").innerHTML = "";
      $("chat-thread-title").textContent = "Select a session";
      await loadChatInbox();
      await loadUpdates();
    });
  }

  $("btn-refresh-up").addEventListener("click", loadUpdates);
  $("btn-refresh-chat").addEventListener("click", function () {
    loadChatInbox();
    if (selectedChatSession) openChatThread(selectedChatSession, true);
  });

  $("chat-sessions").addEventListener("click", function (e) {
    var btn = e.target.closest(".chat-session-row");
    if (!btn) return;
    var sid = btn.getAttribute("data-sid");
    if (sid) openChatThread(sid, true);
  });

  $("chat-reply-form").addEventListener("submit", postReply);

  $("admin-to-top").addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  wireChatNotifyButton();

  fetch("/api/me", cred)
    .then(function (r) {
      return r.json();
    })
    .then(function (j) {
      if (j.ok && j.role) {
        adminRole = j.role;
        showMain();
        setRoleUi();
        if (adminRole === "full") {
          loadSite();
        } else {
          document.querySelectorAll(".tab-panel").forEach(function (p) {
            p.classList.remove("on");
          });
          $("t-up").classList.add("on");
          document.querySelectorAll("#main-tabs button").forEach(function (b) {
            b.classList.toggle("on", b.getAttribute("data-tab") === "t-up");
          });
        }
        loadUpdates();
        loadChatInbox();
        startChatPoll();
      } else showLogin();
    });
})();
