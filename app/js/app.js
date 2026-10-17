/* /dev/null on TV: a big-screen client for dev-null.sh's public read API.
 * Written for the Tizen 6 web engine (about Chromium 76): ES2017, no `?.`/`??`. All post text goes
 * through textContent, never innerHTML. */
(function () {
  "use strict";

  var SITE = "https://dev-null.sh";
  var API = SITE + "/api/v1";
  var DEFAULT_PEOPLE = ["HelgeSverre", "nunomaduro", "xHeaven", "kasperhartwich"];
  var POLL_MS = 60 * 1000;
  var IDLE_MS = 2 * 60 * 1000;
  var AMBIENT_MS = 12 * 1000;      // time per commit in ambient mode
  var AMBIENT_HINT_MS = 5 * 1000;  // the counter and key hint fade out after this long
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8,
              CH_UP: 427, CH_DOWN: 428, PAGE_UP: 33, PAGE_DOWN: 34, PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252,
              IME_DONE: 65376, IME_CANCEL: 65385 };

  // ── small helpers ──────────────────────────────────────────────────────────────────────────────

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "style") node.setAttribute("style", v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  // Icons are fixed strings from this file, never data from the API.
  function icon(name) {
    var span = document.createElement("span");
    span.innerHTML = ICONS[name];
    return span.firstChild;
  }

  var ICONS = {
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="6" r="2.5"/><circle cx="7" cy="18" r="2.5"/><path d="M7 8.5v7M12 6h8M12 18h8M12 12h6"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
    ambient: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M10 10.5l2 2 3-3.5"/></svg>',
    about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></svg>',
    mark: '<svg viewBox="1.6 1.5 45 45"><path fill="#ececec" d="M2 42h10L26 6H16Z"/><path fill="#ff8a4c" fill-rule="evenodd" d="M17.81 43.5h13.22L46.19 4.5H32.97ZM22.19 40.5l12.84-33h6.78l-12.84 33Z"/></svg>'
  };

  function load(key, fallback) {
    try {
      var v = localStorage.getItem("devnull." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem("devnull." + key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }

  // The site's automatic lane: a 31-hash of the user id, mod 6 (User::automaticLane). A lane someone
  // picked in Settings isn't in the public API, so those people show their automatic color here.
  function laneOf(userId) {
    var hash = 0;
    var id = String(userId || "");
    for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return "var(--l" + (hash % 6) + ")";
  }

  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "now";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    if (s < 7 * 86400) return Math.floor(s / 86400) + "d";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function dayKey(iso) {
    var d = new Date(iso);
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  }

  function dayLabel(iso) {
    var d = new Date(iso);
    var today = new Date();
    var yesterday = new Date(Date.now() - 86400000);
    if (dayKey(d) === dayKey(today)) return "Today";
    if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }

  function hhmm(date) {
    return date.toTimeString().slice(0, 5);
  }

  // Like the site: no scheme or www, the whole host, then at most 20 characters ending in "…".
  function shortUrl(url) {
    var rest = url.replace(/^https?:\/\/(www\.)?/, "");
    var slash = rest.indexOf("/");
    if (slash < 0) return rest;
    var host = rest.slice(0, slash);
    var path = rest.slice(slash);
    return path.length > 20 ? host + path.slice(0, 19) + "…" : host + path;
  }

  function bodyNode(text, clamp, size) {
    var node = h("div", { class: "body" + (clamp ? " clamp" : ""), style: size ? "font-size:" + size + "px" : null });
    String(text || "").split(/(@[A-Za-z0-9-]+|https?:\/\/[^\s]+)/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) {
        var isMention = part.charAt(0) === "@";
        node.appendChild(h("span", { class: isMention ? "at" : "url", text: isMention ? part : shortUrl(part) }));
      } else {
        node.appendChild(document.createTextNode(part));
      }
    });
    return node;
  }

  function avatar(user, size) {
    return h("img", { class: "avatar", src: user.avatar_url, alt: "", style: "width:" + size + "px;height:" + size + "px" });
  }

  function commitUrl(c) {
    return SITE + "/@" + c.author.username + "/commits/" + c.id;
  }

  // ── API ────────────────────────────────────────────────────────────────────────────────────────

  function getJSON(path) {
    var request = fetch(API + path, { headers: { Accept: "application/json" } }).then(function (r) {
      if (r.status === 404) { var e = new Error("not found"); e.status = 404; throw e; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
    var timeout = new Promise(function (_, reject) { setTimeout(function () { reject(new Error("timed out")); }, 12000); });
    return Promise.race([request, timeout]);
  }

  var userCache = {};
  function getUser(username) {
    if (userCache[username]) return Promise.resolve(userCache[username]);
    return getJSON("/users/" + encodeURIComponent(username)).then(function (json) {
      userCache[username] = json.data;
      return json.data;
    });
  }

  function getCommits(username, replies) {
    return getJSON("/users/" + encodeURIComponent(username) + "/commits" + (replies ? "?replies=1" : ""))
      .then(function (json) { return json.data || []; });
  }

  function getCommit(id) {
    return getJSON("/commits/" + encodeURIComponent(id)).then(function (json) { return json.data; });
  }

  // ── app state ──────────────────────────────────────────────────────────────────────────────────

  var main = document.getElementById("main");
  var navEl = document.getElementById("nav");
  var viewerEl = document.getElementById("viewer");
  var ambientEl = document.getElementById("ambient");

  var people = load("people", DEFAULT_PEOPLE);
  var previousVisit = load("lastVisit", null);
  save("lastVisit", new Date().toISOString());

  var stack = [];          // screens to return to with Back
  var screen = null;       // current screen object
  var nav = { open: false, index: 0, items: [["log", "Log"], ["people", "People"], ["ambient", "Ambient"], ["about", "About"]] };
  var viewer = null;       // { images, index, commit }
  var ambient = null;      // { index, timer }
  var idleTimer = null;

  function show(next, push) {
    if (push && screen) stack.push(screen);
    if (screen && screen.leave) screen.leave();
    screen = next;
    main.textContent = "";
    screen.render(main);
    renderNav();
  }

  function back() {
    if (stack.length) {
      if (screen && screen.leave) screen.leave();
      screen = stack.pop();
      main.textContent = "";
      screen.render(main);
      renderNav();
      return;
    }
    if (screen && screen.name !== "log") { show(logScreen); return; }
    exitApp();
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* not on a TV */ }
  }

  function openUrl(url) {
    try {
      var control = new tizen.ApplicationControl("http://tizen.org/appcontrol/operation/view", url, null, null, null);
      tizen.application.launchAppControl(control, "org.tizen.browser", null, null, null);
    } catch (e) { /* not on a TV */ }
  }

  // ── navigation rail ────────────────────────────────────────────────────────────────────────────

  function renderNav() {
    navEl.textContent = "";
    navEl.className = nav.open ? "open" : "";
    var mark = icon("mark");
    mark.setAttribute("class", "mark");
    navEl.appendChild(mark);
    nav.items.forEach(function (item, i) {
      var active = screen && screen.section === item[0];
      var focus = nav.open && nav.index === i;
      navEl.appendChild(h("div", { class: "item" + (active ? " active" : "") + (focus ? " focus" : "") },
        icon(item[0]), h("span", { class: "label", text: item[1] })));
    });
  }

  function openNav() {
    nav.open = true;
    var current = screen ? screen.section : "log";
    nav.index = Math.max(0, nav.items.map(function (i) { return i[0]; }).indexOf(current));
    renderNav();
  }

  function navKey(code) {
    if (code === KEY.UP) nav.index = Math.max(0, nav.index - 1);
    else if (code === KEY.DOWN) nav.index = Math.min(nav.items.length - 1, nav.index + 1);
    else if (code === KEY.RIGHT || code === KEY.BACK || code === KEY.ESC) { nav.open = false; }
    else if (code === KEY.ENTER) {
      nav.open = false;
      var target = nav.items[nav.index][0];
      stack = [];
      if (target === "log") show(logScreen);
      else if (target === "people") show(peopleScreen);
      else if (target === "about") show(aboutScreen);
      else if (target === "ambient") { renderNav(); startAmbient(); return; }
    }
    renderNav();
  }

  // ── shared pieces ──────────────────────────────────────────────────────────────────────────────

  function railcol(c, prev, last) {
    var col = h("div", { class: "railcol" });
    col.appendChild(h("i", { class: "up", style: "background:" + (prev ? laneOf(prev.author.id) : "var(--rail)") }));
    if (!last) col.appendChild(h("i", { class: "down", style: "background:" + laneOf(c.author.id) }));
    col.appendChild(h("i", { class: "node", style: "color:" + laneOf(c.author.id) }));
    return col;
  }

  function commitRow(c, prev, opts) {
    opts = opts || {};
    var head = h("div", { class: "head" },
      avatar(c.author, 72),
      h("span", { class: "name", text: c.author.name || c.author.username }),
      h("span", { class: "m", text: "@" + c.author.username + " · " + ago(c.created_at) }),
      h("span", { class: "m hash", text: c.short_hash }));
    var content = h("div", { class: "content" }, head);
    if (c.parent_id && opts.replyLabel !== false) content.appendChild(h("div", { class: "m replying", text: "↳ reply" }));
    content.appendChild(bodyNode(c.body, !opts.full, opts.bodySize));

    var lp = c.link_preview;
    if (lp && lp.url) {
      var card = h("div", { class: "linkcard" });
      if (lp.image_url) card.appendChild(h("img", { src: lp.image_url, alt: "" }));
      card.appendChild(h("div", { class: "t" }, h("b", { text: lp.title || lp.url }),
        h("span", { class: "m", text: lp.site_name || shortUrl(lp.url) })));
      content.appendChild(card);
    }
    if (c.images && c.images.length) {
      var thumbs = h("div", { class: "thumbs" });
      c.images.slice(0, 3).forEach(function (image) { thumbs.appendChild(h("img", { src: image.url, alt: image.description || "" })); });
      content.appendChild(thumbs);
    }
    var actions = h("div", { class: "actions m" });
    var star = h("span", null, icon("star"), String(c.stars_count));
    var reply = h("span", null, icon("reply"), c.replies_count + (c.replies_count === 1 ? " reply" : " replies"));
    actions.appendChild(star);
    actions.appendChild(reply);
    content.appendChild(actions);
    return h("div", { class: "row" + (opts.focus ? " focus" : "") }, railcol(c, prev, opts.last), content);
  }

  function markerRow(text, laneColor, dashed) {
    return h("div", { class: "marker" },
      h("div", { class: "railcol" }, h("i", { class: "through", style: "background:" + laneColor })),
      h("div", { class: "lbl m" + (dashed ? " dashed" : ""), text: text }));
  }

  function rootRow(sentence) {
    return h("div", null,
      h("div", { class: "row" }, h("div", { class: "railcol", style: "height:70px" }, h("i", { class: "root" }))),
      h("div", { class: "m endline", text: sentence }));
  }

  function whoCard(user) {
    var color = laneOf(user.id);
    return h("div", { class: "who" },
      h("div", { class: "ring", style: "color:" + color + ";width:128px;height:128px;padding:7px" }, h("img", { src: user.avatar_url, alt: "" })),
      h("h3", { text: user.name || user.username }),
      h("div", { class: "m", style: "margin-top:6px" }, h("i", { class: "dot", style: "color:" + color }), "@" + user.username),
      user.bio ? h("p", { text: user.bio }) : null,
      typeof user.commits_count === "number" ? h("div", { class: "counts" },
        h("span", null, h("b", { text: String(user.commits_count) }), " commits"),
        h("span", null, h("b", { text: String(user.followers_count) }), " followers")) : null);
  }

  function keysBlock(list) {
    var k = h("div", { class: "keys" });
    list.forEach(function (pair) {
      k.appendChild(h("span", { class: "kbd", text: pair[0] }));
      k.appendChild(h("span", { text: pair[1] }));
    });
    return h("div", { class: "sect" }, k);
  }

  function stateBlock(line, say, go) {
    return h("div", { class: "state" },
      h("div", { class: "ring-empty" }),
      h("div", { class: "m", text: line }),
      say ? h("div", { class: "say", text: say }) : null,
      go ? h("div", { class: "go", text: go }) : null);
  }

  // Keeps a focused row about a third of the way down the scroller.
  function scrollTo(inner, row, scroller) {
    if (!inner || !row) return;
    var offset = Math.max(0, row.offsetTop - Math.round(scroller.clientHeight * 0.18));
    inner.style.transform = "translateY(" + -offset + "px)";
  }

  // ── Log ────────────────────────────────────────────────────────────────────────────────────────

  var logScreen = {
    name: "log", section: "log",
    commits: [], focus: 0, pending: null, loaded: false, error: null, fetchedAt: null, poll: null,

    render: function (root) {
      var self = this;
      var head = h("div", { class: "feed-head" }, h("h1", { text: "Log" }));
      if (this.pending && this.newCount) head.appendChild(h("div", { class: "pill", text: "↑ " + this.newCount + " new commit" + (this.newCount === 1 ? "" : "s") }));
      head.appendChild(h("span", { class: "m", text: people.length + " developer" + (people.length === 1 ? "" : "s") + (this.fetchedAt ? " · " + hhmm(this.fetchedAt) : "") }));
      var feed = h("main", { class: "feed" }, head);
      this.aside = h("aside", { class: "aside" });
      root.appendChild(feed);
      root.appendChild(this.aside);

      if (!people.length) {
        feed.appendChild(stateBlock("fatal: your current log does not have any commits yet",
          "There is nobody on this TV yet. Add a few developers to fill the log.", "Add people  OK"));
        return;
      }
      if (!this.loaded) {
        feed.appendChild(stateBlock(this.error ? "fatal: unable to access '" + SITE + "/': " + this.error : "$ git fetch",
          this.error ? "The TV can't reach dev-null.sh. Check its network connection; the log retries every minute." : "Fetching the log…",
          this.error ? "Retry now  OK" : null));
        this.renderAside();
        return;
      }
      if (!this.commits.length) {
        feed.appendChild(stateBlock("fatal: your current log does not have any commits yet",
          "Nobody on this TV has committed anything yet.", "Add people  OK"));
        this.renderAside();
        return;
      }

      this.scroller = h("div", { class: "scroller" });
      this.inner = h("div", { class: "scroller-inner" });
      this.rows = [];
      var prev = null;
      var markedVisit = false;
      this.commits.forEach(function (c, i) {
        if (prev && dayKey(prev.created_at) !== dayKey(c.created_at)) {
          self.inner.appendChild(markerRow(dayLabel(c.created_at), laneOf(prev.author.id)));
        }
        if (prev && previousVisit && !markedVisit && c.created_at < previousVisit && prev.created_at >= previousVisit) {
          self.inner.appendChild(markerRow("HEAD@{last visit}", laneOf(prev.author.id), true));
          markedVisit = true;
        }
        var row = commitRow(c, prev, { focus: i === self.focus, last: i === self.commits.length - 1 });
        self.rows.push(row);
        self.inner.appendChild(row);
        prev = c;
      });
      this.inner.appendChild(rootRow("That's the whole log for the " + people.length + " developers on this TV."));
      this.scroller.appendChild(this.inner);
      feed.appendChild(this.scroller);
      this.renderAside();
      setTimeout(function () { scrollTo(self.inner, self.rows[self.focus], self.scroller); }, 0);
    },

    renderAside: function () {
      if (!this.aside) return;
      var c = this.commits[this.focus];
      this.aside.textContent = "";
      var author = c ? (userCache[c.author.username] || c.author) : null;
      if (author) this.aside.appendChild(whoCard(author));
      var list = h("ul", { class: "people-list" });
      people.forEach(function (u) {
        var user = userCache[u];
        list.appendChild(h("li", null, h("i", { class: "dot", style: "color:" + (user ? laneOf(user.id) : "var(--rail)") }),
          h("span", { text: user ? (user.name || u) : u }), h("span", { class: "m", text: "@" + u })));
      });
      this.aside.appendChild(h("div", { class: "sect" }, h("h4", { text: "on this tv" }), list));
      this.aside.appendChild(keysBlock([["OK", "open commit"], ["◀", "menu"], ["CH ▲▼", "jump 5"], ["▶ PLAY", "ambient"]]));
    },

    setFocus: function (index) {
      index = Math.max(0, Math.min(this.commits.length - 1, index));
      if (index === this.focus || !this.rows) return;
      if (this.rows[this.focus]) this.rows[this.focus].className = "row";
      this.focus = index;
      this.rows[index].className = "row focus";
      scrollTo(this.inner, this.rows[index], this.scroller);
      this.renderAside();
    },

    refresh: function () {
      var self = this;
      if (!people.length) return Promise.resolve();
      people.forEach(function (u) { getUser(u).catch(function () {}); });
      return Promise.all(people.map(function (u) { return getCommits(u).catch(function (e) { return e; }); }))
        .then(function (lists) {
          var failures = lists.filter(function (l) { return l instanceof Error; });
          if (failures.length === lists.length) throw failures[0];
          var merged = [];
          lists.forEach(function (l) { if (!(l instanceof Error)) merged = merged.concat(l); });
          merged.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
          merged = merged.slice(0, 80);
          self.error = null;
          self.fetchedAt = new Date();
          if (!self.loaded || !self.commits.length) {
            self.commits = merged;
            self.focus = 0;
            self.loaded = true;
          } else {
            var known = {};
            self.commits.forEach(function (c) { known[c.id] = true; });
            var fresh = merged.filter(function (c) { return !known[c.id]; });
            // New commits wait behind the pill so the list never moves under the viewer.
            self.pending = fresh.length ? merged : null;
            self.newCount = fresh.length;
          }
        })
        .catch(function (e) { self.error = e.message || String(e); })
        .then(function () { if (screen === self) { main.textContent = ""; self.render(main); } });
    },

    applyPending: function () {
      if (!this.pending) return;
      this.commits = this.pending;
      this.pending = null;
      this.newCount = 0;
      this.focus = 0;
      main.textContent = "";
      this.render(main);
    },

    key: function (code) {
      if (!people.length || !this.commits.length) {
        if (code === KEY.ENTER) {
          if (!people.length || this.loaded) show(peopleScreen, true);
          else this.refresh();
          return true;
        }
        if (code === KEY.LEFT) { openNav(); return true; }
        return false;
      }
      switch (code) {
        case KEY.UP:
          if (this.focus === 0 && this.pending) this.applyPending();
          else this.setFocus(this.focus - 1);
          return true;
        case KEY.DOWN: this.setFocus(this.focus + 1); return true;
        case KEY.CH_UP: case KEY.PAGE_UP: this.setFocus(this.focus - 5); return true;
        case KEY.CH_DOWN: case KEY.PAGE_DOWN: this.setFocus(this.focus + 5); return true;
        case KEY.LEFT: openNav(); return true;
        case KEY.ENTER: show(commitScreen(this.commits[this.focus], this.commits, this.focus), true); return true;
        case KEY.PLAY: case KEY.PLAY_PAUSE: startAmbient(); return true;
      }
      return false;
    }
  };

  // ── Commit ─────────────────────────────────────────────────────────────────────────────────────

  function commitScreen(initial, list, listIndex) {
    return {
      name: "commit", section: "log",
      commit: initial, parent: null, targets: [], target: 0,

      render: function (root) {
        var self = this;
        var c = this.commit;
        var feed = h("main", { class: "feed" },
          h("div", { class: "feed-head" }, h("h1", null, "Commit", h("span", { class: "m", text: c.short_hash })), h("span", { class: "m", text: "BACK to log" })));
        this.scroller = h("div", { class: "scroller" });
        this.inner = h("div", { class: "scroller-inner" });
        if (this.parent) {
          var parentRow = commitRow(this.parent, null, { full: false });
          parentRow.style.opacity = "0.6";
          this.inner.appendChild(parentRow);
          this.inner.appendChild(h("div", { class: "m", style: "padding:6px 0 0 124px;font-size:24px", text: "↳ replying to @" + this.parent.author.username }));
        }
        var row = commitRow(c, this.parent, { full: true, last: true, bodySize: 38, replyLabel: false });
        row.querySelector(".content").style.borderBottom = "none";
        this.inner.appendChild(row);
        this.scroller.appendChild(this.inner);
        feed.appendChild(this.scroller);
        root.appendChild(feed);

        // Focus targets: the author, the link card, then each image.
        this.targets = [{ kind: "author", el: row.querySelector(".head") }];
        var card = row.querySelector(".linkcard");
        if (card) this.targets.push({ kind: "link", el: card });
        Array.prototype.forEach.call(row.querySelectorAll(".thumbs img"), function (img, i) { self.targets.push({ kind: "image", el: img, index: i }); });
        this.target = Math.min(this.target, this.targets.length - 1);
        this.paintTarget();

        var qr = h("div", { class: "qr" });
        var aside = h("aside", { class: "aside" },
          whoCard(userCache[c.author.username] || c.author),
          h("div", { class: "sect" }, h("h4", { text: "reply or star on your phone" }), qr,
            h("div", { class: "m", style: "font-size:22px;margin-top:12px", text: "dev-null.sh/@" + c.author.username + "/commits/…" + String(c.id).slice(-7) })),
          keysBlock([["◀ ▶", "author, link, images"], ["OK", "open"], ["CH ▲▼", "previous / next"]]));
        root.appendChild(aside);
        try {
          new QRCode(qr, { text: commitUrl(c), width: 220, height: 220, colorDark: "#111112", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
        } catch (e) { qr.className = "hidden"; }

        if (!this.fetched) {
          this.fetched = true;
          getCommit(c.id).then(function (fresh) {
            self.commit = fresh;
            if (!fresh.parent_id) return null;
            return getCommit(fresh.parent_id).then(function (p) { self.parent = p; }).catch(function () {});
          }).catch(function () {}).then(function () {
            if (screen === self) { main.textContent = ""; self.render(main); }
          });
        }
      },

      paintTarget: function () {
        var self = this;
        this.targets.forEach(function (t, i) {
          var on = i === self.target;
          if (t.kind === "author") t.el.style.color = on ? "var(--primary)" : "";
          else t.el.className = t.el.className.replace(/\s*focus/g, "") + (on ? " focus" : "");
        });
      },

      key: function (code) {
        switch (code) {
          case KEY.LEFT:
            if (this.target === 0) { openNav(); return true; }
            this.target -= 1; this.paintTarget(); return true;
          case KEY.RIGHT: this.target = Math.min(this.targets.length - 1, this.target + 1); this.paintTarget(); return true;
          case KEY.UP: case KEY.DOWN: {
            var scrolled = this.inner ? (parseInt((this.inner.style.transform || "").replace(/[^0-9-]/g, ""), 10) || 0) : 0;
            var next = Math.min(0, scrolled + (code === KEY.UP ? 240 : -240));
            if (this.inner) this.inner.style.transform = "translateY(" + next + "px)";
            return true;
          }
          case KEY.ENTER: {
            var t = this.targets[this.target];
            if (!t) return true;
            if (t.kind === "author") show(profileScreen(this.commit.author.username), true);
            else if (t.kind === "link") openUrl(this.commit.link_preview.url);
            else if (t.kind === "image") openViewer(this.commit, t.index);
            return true;
          }
          case KEY.CH_UP: case KEY.CH_DOWN: {
            if (!list) return true;
            var i = listIndex + (code === KEY.CH_UP ? -1 : 1);
            if (i < 0 || i >= list.length) return true;
            screen = commitScreen(list[i], list, i);
            if (logScreen.commits === list) logScreen.focus = i;
            main.textContent = "";
            screen.render(main);
            return true;
          }
        }
        return false;
      }
    };
  }

  // ── Profile ────────────────────────────────────────────────────────────────────────────────────

  function profileScreen(username) {
    return {
      name: "profile", section: "log",
      user: userCache[username] || null, tab: 0, lists: [null, null], focus: -1, error: null,

      render: function (root) {
        var self = this;
        var feed = h("main", { class: "feed" });
        root.appendChild(feed);
        this.scroller = h("div", { class: "scroller", style: "top:0" });
        this.inner = h("div", { class: "scroller-inner" });
        this.scroller.appendChild(this.inner);
        feed.appendChild(this.scroller);
        var u = this.user;

        if (!u) {
          feed.appendChild(stateBlock(this.error ? "fatal: '" + username + "' does not appear to be a developer" : "$ finger " + username,
            this.error ? "There is no public profile for @" + username + "." : "Loading the profile…"));
        } else {
          var color = laneOf(u.id);
          var meta = [u.company, u.location, u.website ? u.website.replace(/^https?:\/\//, "") : null].filter(Boolean).join(" · ");
          this.inner.appendChild(h("div", { class: "profile-head" },
            h("div", { class: "ring", style: "color:" + color }, h("img", { src: u.avatar_url, alt: "" })),
            h("div", { style: "min-width:0" },
              h("div", { class: "title", text: u.name || u.username }),
              h("div", { class: "m", style: "margin-top:8px" }, h("i", { class: "dot", style: "color:" + color }), "@" + u.username),
              u.bio ? h("div", { class: "bio", text: u.bio }) : null,
              meta ? h("div", { class: "m", style: "margin-top:10px;font-size:24px", text: meta }) : null)));
          this.inner.appendChild(h("div", { class: "counts", style: "padding:0 44px 26px;margin:0" },
            h("span", null, h("b", { text: String(u.commits_count) }), " commits"),
            h("span", null, h("b", { text: String(u.following_count) }), " following"),
            h("span", null, h("b", { text: String(u.followers_count) }), " followers")));
          this.inner.appendChild(h("div", { class: "graph" }, h("img", { src: SITE + "/@" + encodeURIComponent(u.username) + "/graph.svg?theme=dark", alt: "" })));
          this.tabsEl = h("div", { class: "tabs" + (this.focus === -1 ? " focus" : "") },
            h("span", { class: this.tab === 0 ? "on" : "", text: "Commits" }), h("span", { class: this.tab === 1 ? "on" : "", text: "Replies" }));
          this.inner.appendChild(this.tabsEl);

          var list = this.lists[this.tab];
          this.rows = [];
          if (!list) {
            this.inner.appendChild(h("div", { class: "m", style: "padding:30px 44px", text: "$ git log --author=" + u.username }));
          } else if (!list.length) {
            this.inner.appendChild(h("div", { class: "m", style: "padding:30px 44px", text: this.tab === 0 ? "fatal: no commits yet" : "fatal: no replies yet" }));
          } else {
            var prev = null;
            list.forEach(function (c, i) {
              var row = commitRow(c, prev, { focus: i === self.focus, last: i === list.length - 1 });
              self.rows.push(row);
              self.inner.appendChild(row);
              prev = c;
            });
          }
          setTimeout(function () {
            if (self.focus >= 0) scrollTo(self.inner, self.rows[self.focus], self.scroller);
          }, 0);
        }
        root.appendChild(h("aside", { class: "aside" }, keysBlock([["◀ ▶", "commits / replies"], ["▲ ▼", "move"], ["OK", "open commit"], ["BACK", "back"]])));

        if (!u && !this.loading) {
          this.loading = true;
          getUser(username).then(function (user) { self.user = user; })
            .catch(function (e) { self.error = e; })
            .then(function () { self.loadTab(); });
        } else if (u && !this.lists[this.tab] && !this.loadingTab) {
          this.loadTab();
        }
      },

      loadTab: function () {
        var self = this;
        var tab = this.tab;
        if (!this.user) { if (screen === self) { main.textContent = ""; self.render(main); } return; }
        this.loadingTab = true;
        getCommits(username, tab === 1).then(function (list) { self.lists[tab] = list; })
          .catch(function () { self.lists[tab] = []; })
          .then(function () {
            self.loadingTab = false;
            if (screen === self) { main.textContent = ""; self.render(main); }
          });
      },

      key: function (code) {
        var list = this.lists[this.tab] || [];
        switch (code) {
          case KEY.LEFT:
            if (this.focus === -1 && this.tab === 1) { this.tab = 0; this.rerender(); return true; }
            openNav(); return true;
          case KEY.RIGHT:
            if (this.focus === -1 && this.tab === 0) { this.tab = 1; this.rerender(); }
            return true;
          case KEY.UP:
            if (this.focus > -1) { this.focus -= 1; this.rerender(); }
            return true;
          case KEY.DOWN:
            if (this.focus < list.length - 1) { this.focus += 1; this.rerender(); }
            return true;
          case KEY.ENTER:
            if (this.focus >= 0 && list[this.focus]) show(commitScreen(list[this.focus], list, this.focus), true);
            return true;
        }
        return false;
      },

      rerender: function () { main.textContent = ""; this.render(main); }
    };
  }

  // ── People on this TV ──────────────────────────────────────────────────────────────────────────

  var peopleScreen = {
    name: "people", section: "people",
    focus: 0, confirm: -1, notice: null,

    render: function (root) {
      var self = this;
      var feed = h("main", { class: "feed" },
        h("div", { class: "feed-head" }, h("h1", { text: "People on this TV" }), h("span", { class: "m", text: people.length + " developer" + (people.length === 1 ? "" : "s") })));
      this.input = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "github-username" });
      this.field = h("div", { class: "field" + (this.focus === 0 ? " focus" : "") },
        h("span", { class: "m prompt", text: "$ git remote add" }), this.input, h("span", { class: "m hint", text: "OK add" }));
      feed.appendChild(this.field);
      if (this.notice) feed.appendChild(h("div", { class: "m notice", text: this.notice }));
      people.forEach(function (u, i) {
        var user = userCache[u];
        var focused = self.focus === i + 1;
        var confirming = self.confirm === i;
        feed.appendChild(h("div", { class: "person" + (focused ? " focus" : "") + (confirming ? " confirm" : "") },
          h("i", { class: "dot", style: "color:" + (user ? laneOf(user.id) : "var(--rail)") + ";width:20px;height:20px;margin:0" }),
          user ? avatar(user, 72) : h("div", { class: "avatar", style: "width:72px;height:72px" }),
          h("div", { class: "who-line" }, h("div", { style: "font-weight:600", text: user ? (user.name || u) : u }),
            h("div", { class: "m", text: "@" + u + (user ? " · " + user.commits_count + " commits" : "") })),
          h("span", { class: "m act", text: confirming ? "OK again to remove" : (focused ? "OK remove" : "") })));
        if (!user) getUser(u).then(function () { if (screen === self) self.rerender(); }).catch(function () {});
      });
      root.appendChild(feed);
      root.appendChild(h("aside", { class: "aside" },
        h("div", { class: "sect", style: "border-top:none;padding-top:0" }, h("h4", { text: "tip" }),
          h("div", { style: "font-size:28px;color:var(--muted)", text: "Use the developer's GitHub username, for example nunomaduro." })),
        keysBlock([["▲ ▼", "move"], ["OK", "type / remove"], ["◀", "menu"]])));
      this.input.addEventListener("keydown", function (e) {
        if (e.keyCode === KEY.ENTER || e.keyCode === KEY.IME_DONE) { e.preventDefault(); e.stopPropagation(); self.add(self.input.value); }
        else if (e.keyCode === KEY.IME_CANCEL || e.keyCode === KEY.BACK || e.keyCode === KEY.DOWN || e.keyCode === KEY.UP) {
          e.preventDefault(); e.stopPropagation(); self.input.blur();
          if (e.keyCode === KEY.DOWN && people.length) { self.focus = 1; self.rerender(); }
        }
      });
    },

    add: function (raw) {
      var self = this;
      var name = String(raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(github\.com|dev-null\.sh)\/@?/, "").split("/")[0];
      if (!name) return;
      if (people.some(function (p) { return p.toLowerCase() === name.toLowerCase(); })) {
        this.notice = "fatal: remote @" + name + " already exists";
        this.rerender();
        return;
      }
      this.notice = "$ git remote add " + name + " …";
      this.rerender();
      getUser(name).then(function (user) {
        people.push(user.username);
        save("people", people);
        self.notice = "added @" + user.username;
        logScreen.loaded = false;
        logScreen.commits = [];
        logScreen.refresh();
      }).catch(function (e) {
        self.notice = e.status === 404 ? "fatal: '" + name + "' does not appear to be a developer on /dev/null" : "fatal: " + e.message;
      }).then(function () { if (screen === self) self.rerender(); });
    },

    key: function (code) {
      switch (code) {
        case KEY.UP: this.confirm = -1; this.focus = Math.max(0, this.focus - 1); this.rerender(); return true;
        case KEY.DOWN: this.confirm = -1; this.focus = Math.min(people.length, this.focus + 1); this.rerender(); return true;
        case KEY.LEFT: openNav(); return true;
        case KEY.ENTER:
          if (this.focus === 0) { this.input.focus(); return true; }
          var i = this.focus - 1;
          if (this.confirm === i) {
            var removed = people.splice(i, 1)[0];
            save("people", people);
            this.notice = "removed @" + removed;
            this.confirm = -1;
            this.focus = Math.min(this.focus, people.length);
            logScreen.loaded = false;
            logScreen.commits = [];
            logScreen.refresh();
          } else {
            this.confirm = i;
          }
          this.rerender();
          return true;
      }
      return false;
    },

    rerender: function () { main.textContent = ""; this.render(main); }
  };

  // ── About ──────────────────────────────────────────────────────────────────────────────────────

  var aboutScreen = {
    name: "about", section: "about",
    render: function (root) {
      var feed = h("main", { class: "feed" }, h("div", { class: "feed-head" }, h("h1", { text: "About" }), h("span", { class: "m", text: "v1.2.0" })));
      var kv = h("div", { class: "kv" });
      [["source", "dev-null.sh public API, read-only"], ["people", people.length + " on this TV, stored on the TV"],
       ["refresh", "every 60 seconds"], ["sign-in", "null"], ["engine", navigator.userAgent]].forEach(function (pair) {
        kv.appendChild(h("span", { class: "m", text: pair[0] }));
        kv.appendChild(h("span", { class: pair[1] === "null" ? "m" : null, style: pair[0] === "engine" ? "font-size:22px;color:var(--muted)" : null, text: pair[1] }));
      });
      feed.appendChild(h("div", { class: "about" },
        h("p", { text: "/dev/null on TV reads public commits from dev-null.sh for the developers you add on this TV. Nothing is posted, starred or followed from here; replying and starring happen on your phone through the QR code on each commit." }),
        kv,
        h("p", { class: "m", style: "font-size:26px", text: "$ man devnull-tv → pairing this TV with your account is planned, not built." })));
      root.appendChild(feed);
      root.appendChild(h("aside", { class: "aside" }, keysBlock([["◀", "menu"], ["BACK", "back"]])));
    },
    key: function (code) {
      if (code === KEY.LEFT) { openNav(); return true; }
      return false;
    }
  };

  // ── Image viewer ───────────────────────────────────────────────────────────────────────────────

  function openViewer(commit, index) {
    viewer = { commit: commit, index: index };
    renderViewer();
  }

  function renderViewer() {
    viewerEl.textContent = "";
    if (!viewer) { viewerEl.className = "hidden"; return; }
    var c = viewer.commit;
    var image = c.images[viewer.index];
    viewerEl.className = "";
    viewerEl.appendChild(h("div", { class: "img" }, h("img", { src: image.url, alt: image.description || "" })));
    viewerEl.appendChild(h("div", { class: "bar" }, avatar(c.author, 64),
      h("div", { class: "text" }, h("div", { style: "font-weight:600;font-size:30px", text: c.author.name || c.author.username }),
        h("div", { class: "m", text: c.body })),
      h("span", { class: "m", style: "margin-left:24px;white-space:nowrap", text: (viewer.index + 1) + " / " + c.images.length + " · BACK close" })));
  }

  function viewerKey(code) {
    var count = viewer.commit.images.length;
    if (code === KEY.LEFT) viewer.index = (viewer.index - 1 + count) % count;
    else if (code === KEY.RIGHT) viewer.index = (viewer.index + 1) % count;
    else if (code === KEY.BACK || code === KEY.ENTER || code === KEY.ESC) viewer = null;
    renderViewer();
  }

  // ── Ambient ────────────────────────────────────────────────────────────────────────────────────

  function startAmbient() {
    var commits = logScreen.commits.slice(0, 20);
    if (!commits.length) return;
    ambient = { commits: commits, index: 0 };
    ambientEl.className = "";
    paintAmbient();
    showAmbientHint();
    startAmbientTimer();
  }

  function startAmbientTimer() {
    clearInterval(ambient.timer);
    ambient.timer = setInterval(function () { stepAmbient(1, true); }, AMBIENT_MS);
  }

  // delta 1 = older, -1 = newer. Automatic steps fade; manual ones (CH ▲▼) switch at once and restart the timer.
  function stepAmbient(delta, fade) {
    var count = ambient.commits.length;
    var go = function () {
      if (!ambient) return;
      ambient.index = (ambient.index + delta + count) % count;
      paintAmbient();
    };
    if (!fade) { go(); showAmbientHint(); startAmbientTimer(); return; }
    Array.prototype.forEach.call(ambientEl.querySelectorAll(".block, .media"), function (el) { el.className += " fade"; });
    setTimeout(go, 650);
  }

  function paintAmbient() {
    var c = ambient.commits[ambient.index];
    var color = laneOf(c.author.id);
    var image = c.images && c.images.length ? c.images[0] : null;
    ambientEl.textContent = "";
    ambientEl.appendChild(h("div", { class: "line", style: "background:linear-gradient(" + color + " 0, " + color + " 46%, var(--rail) 46%)" }));
    ambientEl.appendChild(h("div", { class: "knot", style: "color:" + color }));
    var block = h("div", { class: "block" + (image ? " with-image" : "") },
      h("div", { class: "who-row" }, avatar(c.author, 104),
        h("div", null, h("div", { style: "font-size:40px;font-weight:600", text: c.author.name || c.author.username }),
          h("div", { class: "m", style: "font-size:30px", text: "@" + c.author.username + " · " + ago(c.created_at) + " · " + c.short_hash }))),
      h("div", { class: "text", text: c.body }),
      h("div", { class: "m", style: "margin-top:40px;font-size:30px", text: "★ " + c.stars_count + "   ↩ " + c.replies_count + (c.replies_count === 1 ? " reply" : " replies") }));
    ambientEl.appendChild(block);
    if (image) ambientEl.appendChild(h("div", { class: "media" }, h("img", { src: image.url, alt: image.description || "" })));
    ambient.foot = h("div", { class: "m foot", text: (ambient.index + 1) + " / " + ambient.commits.length + " · CH ▲▼ browse · any other key returns to the log" });
    ambientEl.appendChild(ambient.foot);
    if (ambient.hintHidden) ambient.foot.className = "m foot faded";
  }

  // The hint shows when ambient starts and after each CH press, then fades so the screen stays calm.
  function showAmbientHint() {
    ambient.hintHidden = false;
    if (ambient.foot) ambient.foot.className = "m foot";
    clearTimeout(ambient.hintTimer);
    ambient.hintTimer = setTimeout(function () {
      if (!ambient) return;
      ambient.hintHidden = true;
      if (ambient.foot) ambient.foot.className = "m foot faded";
    }, AMBIENT_HINT_MS);
  }

  function stopAmbient() {
    if (!ambient) return;
    clearInterval(ambient.timer);
    clearTimeout(ambient.hintTimer);
    ambient = null;
    ambientEl.className = "hidden";
    ambientEl.textContent = "";
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (!ambient && !viewer && screen === logScreen && !nav.open) startAmbient();
    }, IDLE_MS);
  }

  // ── keys ───────────────────────────────────────────────────────────────────────────────────────

  document.addEventListener("keydown", function (e) {
    resetIdle();
    if (document.activeElement && document.activeElement.tagName === "INPUT") return; // the field handles its own keys
    var code = e.keyCode;
    var handled = true;
    if (ambient) {
      if (code === KEY.CH_UP || code === KEY.PAGE_UP) stepAmbient(-1, false);
      else if (code === KEY.CH_DOWN || code === KEY.PAGE_DOWN) stepAmbient(1, false);
      else stopAmbient();
    }
    else if (viewer) viewerKey(code);
    else if (nav.open) navKey(code);
    else if (code === KEY.BACK || code === KEY.ESC) back();
    else handled = screen.key(code);
    if (handled) e.preventDefault();
  });

  try {
    tizen.tvinputdevice.registerKeyBatch(["MediaPlay", "MediaPause", "MediaPlayPause", "ChannelUp", "ChannelDown"]);
  } catch (e) { /* not on a TV, or keys unavailable */ }

  // ── splash ─────────────────────────────────────────────────────────────────────────────────────

  // config.xml shows the splash until the app says it's ready (ready_when="custom"), so the first
  // thing on screen is a loaded log rather than an empty frame. The timeout keeps a slow or broken
  // network from leaving the splash up forever.
  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    try { if (window.screen && typeof window.screen.show === "function") window.screen.show(); } catch (e) { /* not on a TV */ }
  }
  setTimeout(reveal, 8000);

  // ── start ──────────────────────────────────────────────────────────────────────────────────────

  function tick() { document.getElementById("clock").textContent = hhmm(new Date()); }
  tick();
  setInterval(tick, 10000);

  show(logScreen);
  logScreen.refresh().then(reveal);
  setInterval(function () { logScreen.refresh(); save("lastVisit", new Date().toISOString()); }, POLL_MS);
  resetIdle();
})();
