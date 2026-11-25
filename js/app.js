/*
 * Warehouse Inventory: application code
 *
 * Everything runs inside one function so nothing leaks into the page. Data is read from the
 * global BASE (js/data/items-data.js) and saved in the browser (localStorage / IndexedDB).
 *
 * Sections (search for the banner titles, or the function names):
 *   Tabs, sidebar and master tabs ................ renderTabs, renderSide, renderMasters
 *   Saved data ................................... load, save
 *   Warehouse Item/Locations page ................ render
 *   Top navigation tabs .......................... renderTop
 *   EWO ......................................... renderEwo, renderEwosPage, openEwoEdit
 *   Delivery Locations ........................... renderMap
 *   Important Contacts ........................... renderContacts
 *   Login, roles and permissions ................. setSess, can, renderAuth, renderLogin
 *   Manage page .................................. renderManage, renderManifests, renderMaterial
 *   PDF templates ................................ renderTemplates
 *   Inspection sheets ............................ startInsp, buildIns, scanPage, analysePage,
 *                                                  inDrawOverlay, renderInsp
 *   Finished sheets ............................... renderFinished, sheetPdfBytes
 *   Activity log ................................. audit
 *   Summary ...................................... renderSummary
 *   Greens (top tab, "greens" permission) ........ the Greens Management box, moved in (renderGr)
 *
 * Globals from other files: BASE (loaded with the page); PDFJS_Z, PDFW_Z, JBIG2_Z, ZXING_Z
 * (js/vendor/, loaded by needVendor the first time a PDF or the camera scanner is used).
 */
(function () {
  "use strict";
  var BASE_TABS = [
    { id: 0, label: "B S", p: "CSGCWCW01.00B.00S", c: "#c4573a", g: 2 },
    { id: 1, label: "Warehouse 1 Bin Floor 1", p: "CSGCWCW01.001", c: "#3d8be0", g: 0 },
    { id: 2, label: "Warehouse 1 Bin Floor 2", p: "CSGCWCW01.002", c: "#1fb0b0", g: 0 },
    { id: 3, label: "Warehouse 1 Bin Floor 3", p: "CSGCWCW01.003", c: "#43b062", g: 0 },
    { id: 4, label: "Warehouse 1, 4 Section", p: "CSGCWCW01.004", c: "#e09a22", g: 0 },
    { id: 5, label: "Warehouse 1, 5 Section", p: "CSGCWCW01.005", c: "#9a6be0", g: 0 },
    { id: 6, label: "Warehouse 1, 6 Section", p: "CSGCWCW01.006", c: "#e0609a", g: 0 },
    { id: 100, label: "N73 Section", p: "CSGCWCW02.00N.007", c: "#5fb3a5", g: 1 },
  ];
  var TABS = BASE_TABS.slice();
  var PALETTE = [
    "#e0a030",
    "#4ea1c9",
    "#c9658a",
    "#7bb069",
    "#a07be0",
    "#d9783c",
    "#5fb3a5",
    "#c9b24e",
  ];
  var GROUPS = [
    { label: "Warehouse 1", c: "#6f8fd8", o: 1 },
    { label: "North Plant", c: "#8aa63c", o: 2 },
    { label: "Brick Shed", c: "#a8553f", o: 0 },
    { label: "Hot Strip", c: "#e2572b", o: 3 },
  ];
  /* BASE lives in a separate file (see index.html) */
  var KEY = "wh-lookup-v2",
    PAGE = 150;
  var st = {
    edits: {},
    deleted: {},
    added: [],
    sel: "t0",
    open: { g0: true },
    names: {},
    custom: [],
    nextId: 7,
    log: [],
    top: null,
    side: null,
    manage: false,
    users: [],
    audit: [],
    hidden: {},
    tpl: [],
    insp: [],
    ewos: [],
    contacts: [],
    manifests: [],
  };
  var items = [],
    shown = PAGE,
    editId = null;
  var $ = function (id) {
    return document.getElementById(id);
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function tname(i) {
    return st.names["t" + TABS[i].id] || TABS[i].label;
  }
  function gname(g) {
    return st.names["g" + g] || GROUPS[g].label;
  }
  function tabIdx(id) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) return i;
    return -1;
  }
  function selTabs() {
    var s = st.sel,
      n = +s.slice(1);
    if (s === "a")
      return TABS.map(function (t, i) {
        return i;
      });
    if (s.charAt(0) === "g")
      return TABS.map(function (t, i) {
        return t.g === n ? i : -1;
      }).filter(function (i) {
        return i >= 0;
      });
    var i = tabIdx(n);
    return i < 0 ? [] : [i];
  }
  function selName() {
    if (st.sel === "a") return "All Locations";
    var n = +st.sel.slice(1);
    if (st.sel.charAt(0) === "g") return gname(n);
    var i = tabIdx(n);
    return i < 0 ? "" : tname(i);
  }
  var SIDES = ["Log in", "Important Contacts", "Delivery Locations", "Option 4", "Common Problems/Solutions"];
  function inspKey() {
    var best = null;
    ["p2", "p3", "p4", "s3", "s4"].forEach(function (k) {
      if (!best && st.names[k] && /inspect/i.test(st.names[k])) best = k;
    });
    return best || "s3";
  }
  /* =====================================================================
     Tabs, sidebar and master tabs
     ===================================================================== */
  function sname(i) {
    return (
      st.names["s" + i] ||
      (i === 3 ? (inspKey() === "s3" ? "Inspection Sheet" : "Option 4") : SIDES[i])
    );
  }
  function renderTabs(m) {
    var box = $("tabs");
    if (box.children.length !== SIDES.length)
      box.innerHTML = SIDES.map(function (x, i) {
        return (
          '<button role="tab" data-side="' +
          i +
          '" style="--c:#f5b335" title="Double-click to rename"><i class="dot"></i><span class="lb"></span></button>'
        );
      }).join("");
    SIDES.forEach(function (x, i) {
      var b = box.children[i],
        lb = b.querySelector(".lb");
      if (lb.textContent !== sname(i)) lb.textContent = sname(i);
      b.setAttribute("aria-selected", String(st.side === i));
    });
  }
  function renderSide() {
    document.documentElement.style.setProperty("--tab", "#f5b335");
    $("topTitle").textContent = sname(st.side);
  }
  function renderMasters(m) {
    var sel = st.sel,
      allSel = sel === "a",
      gCur = -1;
    if (sel.charAt(0) === "g") gCur = +sel.slice(1);
    else if (sel.charAt(0) === "t") {
      var ti = tabIdx(+sel.slice(1));
      if (ti >= 0) gCur = TABS[ti].g;
    }
    var order = GROUPS.map(function (G, g) {
      return g;
    }).sort(function (a, b) {
      return GROUPS[a].o - GROUPS[b].o;
    });
    var grand = 0;
    m.counts.forEach(function (c) {
      grand += c;
    });
    var h =
      '<div class="mbtns"><button class="mbtn' +
      (allSel ? " on" : "") +
      '" data-sel="a" style="--oc:#2f7fd1" aria-pressed="' +
      allSel +
      '">All Locations<span class="c">' +
      grand.toLocaleString() +
      "</span></button>" +
      order
        .map(function (g) {
          var tot = 0;
          TABS.forEach(function (t, i) {
            if (t.g === g) tot += m.counts[i];
          });
          return (
            '<button class="mbtn' +
            (g === gCur ? " on" : "") +
            '" data-sel="g' +
            g +
            '" style="--oc:' +
            GROUPS[g].c +
            '" aria-pressed="' +
            (g === gCur) +
            '">' +
            esc(gname(g)) +
            '<span class="c">' +
            tot.toLocaleString() +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";
    if (allSel) {
      h +=
        '<div class="schips" aria-label="All sub-tabs"><button class="schip on" data-sel="a" style="--c:#2f7fd1">All sub-tabs</button>';
      order.forEach(function (g) {
        TABS.forEach(function (t, i) {
          if (t.g !== g) return;
          h +=
            '<button class="schip" data-sel="t' +
            t.id +
            '" style="--c:' +
            t.c +
            '"><i class="dot"></i>' +
            esc(tname(i)) +
            '<span class="c">' +
            m.counts[i].toLocaleString() +
            "</span></button>";
        });
      });
      h += "</div>";
    } else if (gCur >= 0 && GROUPS[gCur]) {
      h +=
        '<div class="schips" aria-label="Sub-tabs of ' +
        esc(gname(gCur)) +
        '"><button class="schip' +
        (sel === "g" + gCur ? " on" : "") +
        '" data-sel="g' +
        gCur +
        '" style="--c:' +
        GROUPS[gCur].c +
        '">All ' +
        esc(gname(gCur)) +
        "</button>";
      // Inside a master tab, drop its name from the sub-tab chips ("Warehouse 1 Bin Floor 1" -> "Bin Floor 1").
      var gl = gname(gCur).toLowerCase();
      TABS.forEach(function (t, i) {
        if (t.g !== gCur) return;
        var nm = tname(i),
          sh = nm.toLowerCase().indexOf(gl) === 0 ? nm.slice(gl.length).replace(/^[\s,.:–-]+/, "") : "";
        h +=
          '<button class="schip' +
          (sel === "t" + t.id ? " on" : "") +
          '" data-sel="t' +
          t.id +
          '" style="--c:' +
          t.c +
          '" title="' +
          esc(nm) +
          '"><i class="dot"></i>' +
          esc(sh || nm) +
          '<span class="c">' +
          m.counts[i].toLocaleString() +
          "</span></button>";
      });
      h += '<button class="schip add" data-add="' + gCur + '">+ Add sub-tab</button></div>';
    }
    $("mRow").innerHTML = h;
  }
  $("mRow").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.add !== undefined) {
      if (!can("tabs")) {
        deny("add or remove tabs");
        return;
      }
      openSub(+b.dataset.add);
      return;
    }
    var s = b.dataset.sel;
    if (!s) return;
    st.top = null;
    st.side = null;
    st.sel = s;
    st.lastSel = s;
    shown = PAGE;
    save();
    render();
  });
  function rebuildTabs() {
    TABS = BASE_TABS.concat(st.custom);
  }
  /* =====================================================================
     Saved data: load and save (browser storage)
     ===================================================================== */
  function load() {
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s) st = Object.assign(st, s);
    } catch (e) {}
    if (!st.open) st.open = { g0: true };
    if (!st.names) st.names = {};
    if (!st.custom) st.custom = [];
    if (!st.nextId) st.nextId = 7;
    if (!st.log) st.log = [];
    if (!st.ewos) st.ewos = [];
    if (!st.contacts) st.contacts = [];
    if (!st.manifests) st.manifests = [];
    if (!st.users) st.users = [];
    if (!st.audit) st.audit = [];
    if (!st.hidden) st.hidden = {};
    if (!st.profiles) st.profiles = {};
    if (!st.tpl) st.tpl = [];
    if (!st.insp) st.insp = [];
    fixEwos();
    st.top = null;
    st.side = null;
    st.manage = false;
    if (!st.mig3) {
      var nn = st.names;
      for (var k = 3; k >= 0; k--) {
        if (nn["s" + k] !== undefined) {
          nn["s" + (k + 1)] = nn["s" + k];
          delete nn["s" + k];
        }
      }
      st.mig3 = true;
      save();
    }
    if (!st.mig4) {
      var n4 = st.names;
      if (n4.p3 !== undefined) {
        n4.p5 = n4.p3;
        delete n4.p3;
      }
      if (n4.p2 !== undefined) {
        n4.s2 = n4.p2;
        delete n4.p2;
      } else if (n4.s2 !== undefined) {
        delete n4.s2;
      }
      st.mig4 = true;
      save();
    }
    st.custom = st.custom.filter(function (c) {
      var b = BASE_TABS.filter(function (x) {
        return x.p === c.p || x.label.toLowerCase() === String(c.label).toLowerCase();
      })[0];
      if (b && st.sel === "t" + c.id) st.sel = "t" + b.id;
      return !b;
    });
    rebuildTabs();
    if (s && s.sel === undefined && typeof s.tab === "number") st.sel = "t" + s.tab;
    var ok =
      st.sel === "a" ||
      (/^[tg]\d+$/.test(st.sel || "") &&
        (st.sel.charAt(0) === "t" ? tabIdx(+st.sel.slice(1)) >= 0 : !!GROUPS[+st.sel.slice(1)]));
    if (!ok) st.sel = "t0";
  }
  function save() {
    grDraftOut();
    if (typeof cloudSoon === "function") cloudSoon(); // sync the change when signed in
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      if (!window.__warned) {
        window.__warned = true;
        alert(
          "Browser storage is full, so the latest changes could not be saved. Use Back up, then remove some pictures from Delivery Locations."
        );
      }
    }
  }

  function tabOf(l) {
    var best = -1,
      bl = -1;
    for (var i = 0; i < TABS.length; i++) {
      var p = TABS[i].p;
      if ((l === p || l.indexOf(p + ".") === 0) && p.length > bl) {
        best = i;
        bl = p.length;
      }
    }
    return best;
  }
  function mk(id, n, d, l, q, u, notes, c) {
    n = String(n == null ? "" : n);
    c = String(c == null ? (window.CATID || {})[n] || "" : c); // Cat ID: saved one, else from the Excel
    d = String(d || "");
    l = String(l || "");
    notes = notes || "";
    return {
      id: id,
      n: n,
      d: d,
      l: l,
      q: q,
      u: u || "",
      notes: notes,
      c: c,
      t: tabOf(l),
      h: (n + " " + d + " " + l + " " + notes + " " + c).toLowerCase(),
    };
  }
  function rebuild() {
    items = [];
    BASE.forEach(function (r, i) {
      var id = "b" + i;
      if (st.deleted[id]) return;
      var e = st.edits[id];
      items.push(
        e ? mk(id, e.n, e.d, e.l, e.q, e.u, e.notes, e.c) : mk(id, r[0], r[1], r[2], r[3], r[4], "")
      );
    });
    st.added.forEach(function (a) {
      items.push(mk(a.id, a.n, a.d, a.l, a.q, a.u, a.notes, a.c));
    });
    items.sort(function (a, b) {
      return a.l < b.l ? -1 : a.l > b.l ? 1 : a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
    });
  }

  function matches() {
    var terms = $("q").value.toLowerCase().split(/\s+/).filter(Boolean);
    var counts = TABS.map(function () {
        return 0;
      }),
      list = [],
      sel = selTabs();
    items.forEach(function (i) {
      if (i.t < 0) return;
      for (var k = 0; k < terms.length; k++) if (i.h.indexOf(terms[k]) < 0) return;
      counts[i.t]++;
      if (sel.indexOf(i.t) >= 0) list.push(i);
    });
    return { counts: counts, list: list, searching: terms.length > 0 };
  }

  /* =====================================================================
     Warehouse Item/Locations page: item table, search, quantities, transfers
     ===================================================================== */
  function render() {
    if (!$("guest").hidden) renderGuest(); // item data can arrive after the guest page opens
    if (st.top === 6 && !can("greens")) st.top = null;
    var m = matches();
    renderTabs(m);
    renderMasters(m);
    var tp = st.top,
      onTop = tp != null,
      onSide = st.side != null,
      onMg = !!st.manage,
      onEwos = false,
      onInv = !onTop && !onSide && !onMg;
    $("panel").hidden = !onInv;
    $("mRow").hidden = !onInv;
    $("sumPanel").hidden = tp !== 5;
    // The Greens tab and Manage's Greens Management share one box, moved to whichever is showing.
    $("grPanel").hidden = tp !== 6;
    var grHome = tp === 6 ? $("grHome") : $("mgOpt6");
    if ($("grBox").parentNode !== grHome) grHome.appendChild($("grBox"));
    if (tp === 6) renderGr();
    var ck = onSide ? "s" + st.side : tp >= 2 && tp <= 4 ? "p" + tp : null,
      onInsp = !!ck && ck === inspKey() && (!onSide || st.side > 2);
    var onDv = tp === 4 && !onInsp;
    $("topPanel").hidden = !(((onSide && st.side > 2) || (tp >= 2 && tp <= 4)) && !onInsp && !onDv);
    $("pkPdf").hidden = !(tp === 2 && !onSide);
    $("topEmpty").hidden = !$("pkPdf").hidden;
    $("topNote").hidden = !$("pkPdf").hidden;
    $("inspPanel").hidden = !onInsp;
    $("dvPanel").hidden = !onDv;
    $("contactsPanel").hidden = !(onSide && st.side === 1);
    $("loginPanel").hidden = !(onSide && st.side === 0);
    $("managePanel").hidden = !onMg;
    $("mapPanel").hidden = !(onSide && st.side === 2);
    $("ewoPanel").hidden = tp !== 1;
    $("ewosPanel").hidden = !onEwos;
    document.body.classList.toggle("onsum", onSide || onMg);
    document.body.classList.toggle("onside", onSide || onMg);
    document.body.classList.toggle("ontop", onTop);
    document.body.classList.toggle("onmg", onMg); // Back up / Restore / Export CSV show only here
    renderTop();
    renderAuth();
    if (onSide) {
      renderSide();
      if (st.side === 0) renderLogin();
      else if (st.side === 1) renderContacts();
    }
    if (onMg) renderManage();
    else $("anBox").innerHTML = "";
    $("anBack").hidden = !anRet || (onMg && mgOpt === 5);
    if (tp >= 2 && tp <= 4) document.documentElement.style.setProperty("--tab", "#f5b335");
    if (onInsp) renderInsp();
    if (tp === 1) renderEwo();
    if (onDv) {
      renderDv();
      cloudSync();
    }
    if (onSide && st.side === 2) renderMap();
    if (tp === 5) renderSummary();
    if (onEwos) renderEwosPage();
    if (!onInv) return;
    var list = m.list,
      vis = list.slice(0, shown);
    $("rows").innerHTML = vis
      .map(function (i) {
        return (
          '<tr data-id="' +
          i.id +
          '"' +
          (picked[i.id] ? ' class="picked"' : "") +
          '><td class="sel"><input type="checkbox" data-pick' +
          (picked[i.id] ? " checked" : "") +
          ' aria-label="Select item"></td><td class="num">' +
          esc(i.n) +
          (i.c
            ? '<button type="button" class="cattri" data-cat aria-expanded="' +
              !!(st.catAll || catOne[i.id]) +
              '" aria-label="Cat ID for ' +
              esc(i.n) +
              '"></button>' +
              (st.catAll || catOne[i.id] ? '<small class="catid">Cat ID ' + esc(i.c) + "</small>" : "")
            : "") +
          '</td><td class="desc">' +
          esc(i.d) +
          (i.notes ? "<small>" + esc(i.notes) + "</small>" : "") +
          "</td>" +
          '<td class="loc">' +
          esc(i.l) +
          "</td>" +
          '<td><div class="qty"><button data-act="dec" aria-label="Remove one">−</button><b>' +
          esc(i.q) +
          '</b><button data-act="inc" aria-label="Add one">+</button><span>' +
          esc(i.u) +
          "</span></div></td>" +
          '<td class="act"><button data-act="edit">Edit</button></td></tr>'
        );
      })
      .join("");
    $("catAll").checked = !!st.catAll;
    var sel = selTabs(),
      isG = st.sel === "a" || st.sel.charAt(0) === "g";
    document.documentElement.style.setProperty(
      "--tab",
      isG ? (st.sel === "a" ? "#2f7fd1" : GROUPS[+st.sel.slice(1)].c) : TABS[sel[0]].c
    );
    $("title").textContent = selName();
    $("eyebrow").textContent = isG
      ? "Master tab"
      : TABS[sel[0]] && TABS[sel[0]].g >= 0
        ? gname(TABS[sel[0]].g)
        : "Location";
    $("statN").textContent = list.length.toLocaleString();
    shownIds = vis.map(function (i) {
      return i.id;
    });
    updPick();
    $("statL").textContent = m.searching ? "matching items" : "items";
    $("status").innerHTML =
      (list.length > vis.length ? "Showing the first " + vis.length + ". " : "") +
      (isG
        ? sel.length
          ? "Combined view of " + sel.length + " sub-tabs."
          : "No sub-tabs have been added yet."
        : "Locator prefix <code>" + esc(TABS[sel[0]].p) + "</code>");
    var e = $("empty");
    e.hidden = list.length > 0;
    e.textContent = m.searching
      ? "No items in this tab match your search. The numbers on the other tabs show where matches are."
      : sel.length
        ? "No items in this tab yet."
        : "Nothing here yet. Locations added to this master tab will appear here.";
    $("more").hidden = list.length <= vis.length;
    $("moreBtn").textContent =
      "Show " +
      Math.min(PAGE, list.length - vis.length) +
      " more (" +
      (list.length - vis.length).toLocaleString() +
      " left)";
  }

  var catOne = {}; // items whose Cat ID was opened with the triangle (this visit only)
  $("catAll").addEventListener("change", function () {
    st.catAll = this.checked;
    catOne = {};
    save();
    render();
  });
  function openDlg(item) {
    editId = item ? item.id : null;
    $("dlgTitle").textContent = item
      ? "Edit item"
      : st.sel === "e" || st.sel === "a" || st.top != null
        ? "Add item"
        : "Add item to " + selName();
    $("del").hidden = !item;
    var f = $("form").elements;
    f.n.value = item ? item.n : "";
    f.d.value = item ? item.d : "";
    f.l.value = item ? item.l : selTabs().length === 1 ? TABS[selTabs()[0]].p + "." : "CSGCWCW01.";
    f.q.value = item ? item.q : 1;
    f.u.value = item ? item.u : "EA";
    f.notes.value = item ? item.notes : "";
    f.c.value = item ? item.c : "";
    $("locPick").hidden = !!item;
    if (!item) {
      var t0 = selTabs().length === 1 ? selTabs()[0] : -1;
      locFill(t0 >= 0 ? TABS[t0].g : st.sel.charAt(0) === "g" ? +st.sel.slice(1) : -1, t0);
    }
    $("dlg").showModal();
    f.n.focus();
  }
  // Add item: pick the location from the master tabs and their sub-tabs; the sub-tab fills the Locator.
  function locFill(g, ti) {
    var f = $("form").elements,
      gs = GROUPS.map(function (G, i) {
        return i;
      })
        .filter(function (i) {
          return TABS.some(function (t) {
            return t.g === i;
          });
        })
        .sort(function (a, b) {
          return GROUPS[a].o - GROUPS[b].o;
        });
    if (gs.indexOf(g) < 0) g = gs[0];
    f.lg.innerHTML = gs
      .map(function (i) {
        return '<option value="' + i + '"' + (i === g ? " selected" : "") + ">" + esc(gname(i)) + "</option>";
      })
      .join("");
    var gl = gname(g).toLowerCase();
    f.lt.innerHTML =
      '<option value="">Choose a sub-tab</option>' +
      TABS.map(function (t, i) {
        if (t.g !== g) return "";
        var nm = tname(i),
          sh = nm.toLowerCase().indexOf(gl) === 0 ? nm.slice(gl.length).replace(/^[\s,.:–-]+/, "") : ""; // same short name as the sub-tab chips
        return '<option value="' + i + '"' + (i === ti ? " selected" : "") + ">" + esc(sh || nm) + "</option>";
      }).join("");
  }
  $("form").elements.lg.addEventListener("change", function () {
    locFill(+this.value, -1);
  });
  $("form").elements.lt.addEventListener("change", function () {
    if (this.value !== "") $("form").elements.l.value = TABS[+this.value].p + ".";
  });
  function setItem(id, data) {
    if (id.charAt(0) === "a") {
      var a = st.added.find(function (x) {
        return x.id === id;
      });
      Object.assign(a, data);
    } else st.edits[id] = data;
  }
  function fieldsOf(i) {
    return { n: i.n, d: i.d, l: i.l, q: i.q, u: i.u, notes: i.notes, c: i.c };
  }

  $("form").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var f = $("form").elements;
    var d = {
      n: f.n.value.trim(),
      d: f.d.value.trim(),
      l: f.l.value.trim(),
      q: Math.max(0, parseFloat(f.q.value) || 0),
      u: f.u.value.trim(),
      notes: f.notes.value.trim(),
      c: f.c.value.trim().replace(/^0+/, "") || undefined, // blank: use the Excel's Cat ID, if any
    };
    if (
      tabOf(d.l) < 0 &&
      !confirm(
        "This locator does not belong to any tab, so the item will not be listed. Save anyway?"
      )
    ) {
      ev.preventDefault();
      return;
    }
    if (editId) {
      var o = items.find(function (i) {
        return i.id === editId;
      });
      if (o) {
        var ni = { id: editId, n: d.n, d: d.d, u: d.u, l: d.l },
          oq = Number(o.q) || 0;
        if (o.l !== d.l) logE(ni, "move", oq, { from: o.l, to: d.l });
        var dq = d.q - oq;
        if (dq) logE(ni, dq > 0 ? "add" : "sub", Math.abs(dq));
      }
      setItem(editId, d);
    } else {
      d.id = "a" + Date.now().toString(36);
      st.added.push(d);
      logE(d, "add", d.q, { note: "New item" });
    }
    var t = tabOf(d.l);
    if (t >= 0 && selTabs().indexOf(t) < 0) {
      st.sel = "t" + TABS[t].id;
      if (TABS[t].g >= 0) st.open["g" + TABS[t].g] = true;
    }
    save();
    rebuild();
    render();
  });
  $("cancel").onclick = function () {
    $("dlg").close();
  };
  $("del").onclick = function () {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    var gone = items.find(function (i) {
      return i.id === editId;
    });
    if (gone) logE(gone, "sub", Number(gone.q) || 0, { note: "Item deleted" });
    if (editId.charAt(0) === "a")
      st.added = st.added.filter(function (a) {
        return a.id !== editId;
      });
    else st.deleted[editId] = 1;
    save();
    $("dlg").close();
    rebuild();
    render();
  };
  $("add").onclick = function () {
    if (!can("additem")) return deny("add items");
    if (!can("qty")) {
      deny("add or edit quantities");
      return;
    }
    openDlg(null);
  };
  $("q").addEventListener("input", function () {
    shown = PAGE;
    render();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $("q").focus();
    }
  });
  // Left menu: the 3-line box under the wordmark opens and closes the side list.
  function sideMenu(open) {
    document.querySelector(".side").classList.toggle("open", open);
    $("menuBtn").setAttribute("aria-expanded", String(open));
  }
  $("menuBtn").onclick = function () {
    sideMenu(this.getAttribute("aria-expanded") !== "true");
  };
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".side")) sideMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && $("menuBtn").getAttribute("aria-expanded") === "true") {
      sideMenu(false);
      $("menuBtn").focus();
    }
  });
  // Wordmark goes back to the items screen (same as the first section tab).
  $("homeBtn").onclick = function () {
    sideMenu(false);
    $("topnav").children[0].click();
  };
  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.dataset.side === undefined) return;
    sideMenu(false);
    st.side = +b.dataset.side;
    st.top = null;
    st.manage = false;
    ewoMenuOn = false;
    save();
    render();
  });
  $("tabs").addEventListener("dblclick", function (e) {
    var b = e.target.closest("button");
    if (!b || b.dataset.side === undefined) return;
    var i = +b.dataset.side,
      v = prompt("Rename this option:", sname(i));
    if (v && v.trim()) {
      st.names["s" + i] = v.trim().slice(0, 30);
      save();
      render();
    }
  });
  var subG = 0;

  function normP(s) {
    s = s.trim().toUpperCase();
    while (/\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
    return s;
  }
  function countP(p) {
    var n = 0;
    if (!p) return 0;
    items.forEach(function (i) {
      if (i.l === p || i.l.indexOf(p + ".") === 0) n++;
    });
    return n;
  }
  function openSub(g) {
    subG = g;
    $("subTitle").textContent = "Add sub-tab to " + gname(g);
    var c = {};
    items.forEach(function (i) {
      var s = i.l.split(".");
      c[s[0]] = (c[s[0]] || 0) + 1;
      if (s.length > 1) {
        var k = s[0] + "." + s[1];
        c[k] = (c[k] || 0) + 1;
      }
    });
    $("prefList").innerHTML = Object.keys(c)
      .sort()
      .map(function (k) {
        return '<option value="' + esc(k) + '" label="' + c[k].toLocaleString() + ' items">';
      })
      .join("");
    var f = $("subForm").elements;
    f.nm.value = "";
    f.p.value = "";
    $("subHint").textContent =
      "Pick a suggestion or type the start of a locator, such as CSGCWCW02.00N. Trailing .000 parts are ignored.";
    $("subDlg").showModal();
    f.nm.focus();
  }
  $("subForm").elements.p.addEventListener("input", function () {
    var p = normP(this.value);
    $("subHint").textContent = p
      ? countP(p).toLocaleString() + " items match " + p
      : "Pick a suggestion or type the start of a locator, such as CSGCWCW02.00N. Trailing .000 parts are ignored.";
  });
  $("subCancel").onclick = function () {
    $("subDlg").close();
  };
  $("subForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var f = $("subForm").elements,
      p = normP(f.p.value),
      name = f.nm.value.trim();
    if (!p || !name) {
      ev.preventDefault();
      return;
    }
    if (
      TABS.some(function (t) {
        return t.p === p;
      })
    ) {
      alert("A tab already uses this locator prefix.");
      ev.preventDefault();
      return;
    }
    if (
      countP(p) === 0 &&
      !confirm("No items use this locator prefix yet. Add the sub-tab anyway?")
    ) {
      ev.preventDefault();
      return;
    }
    var id = st.nextId++;
    st.custom.push({
      id: id,
      label: name,
      p: p,
      c: PALETTE[st.custom.length % PALETTE.length],
      g: subG,
    });
    audit("Tabs", "Added sub-tab “" + name + "” (" + p + ") to " + gname(subG));
    st.open["g" + subG] = true;
    st.sel = "t" + id;
    shown = PAGE;
    rebuildTabs();
    rebuild();
    save();
    render();
  });

  function nameScope() {
    var gs = [],
      ts = [];
    if (st.sel.charAt(0) === "g") {
      var g = +st.sel.slice(1);
      gs = [g];
      TABS.forEach(function (t, i) {
        if (t.g === g) ts.push(i);
      });
    } else {
      var i = tabIdx(+st.sel.slice(1));
      if (i >= 0) {
        ts = [i];
        if (TABS[i].g >= 0) gs = [TABS[i].g];
      }
    }
    return { gs: gs, ts: ts };
  }
  $("editNames").onclick = function () {
    if (st.sel === "e" || st.sel === "a" || st.top != null) {
      toast(
        "Select a master tab or sub-tab on the Warehouse Item/Locations page first, then choose Edit tab names."
      );
      return;
    }
    var sc = nameScope();
    $("namesNote").textContent =
      st.sel.charAt(0) === "g"
        ? "Editing this master tab and the sub-tabs under it."
        : "Editing this tab and the master tab it belongs to.";
    $("namesFields").innerHTML =
      sc.gs
        .map(function (g) {
          return (
            "<label>Master tab: " +
            esc(GROUPS[g].label) +
            '<input data-key="g' +
            g +
            '" value="' +
            esc(gname(g)) +
            '" maxlength="40" required></label>'
          );
        })
        .join("") +
      sc.ts
        .map(function (i) {
          var x = TABS[i];
          return (
            "<label>Tab: " +
            esc(x.label) +
            '<input data-key="t' +
            x.id +
            '" value="' +
            esc(tname(i)) +
            '" maxlength="40" required></label>' +
            (can("tabs") &&
            st.custom.some(function (c) {
              return c.id === x.id;
            })
              ? '<label class="rm"><input type="checkbox" data-rm="' +
                x.id +
                '"> Remove this sub-tab (its items stay in the data)</label>'
              : "")
          );
        })
        .join("");
    $("namesDlg").showModal();
  };
  $("namesForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var nm = Object.assign({}, st.names),
      rm = {},
      box = $("namesFields");
    box.querySelectorAll("input[data-rm]").forEach(function (c) {
      if (c.checked) rm[c.dataset.rm] = 1;
    });
    box.querySelectorAll("input[data-key]").forEach(function (inp) {
      var k = inp.dataset.key,
        v = inp.value.trim(),
        def;
      if (k.charAt(0) === "g") def = GROUPS[+k.slice(1)].label;
      else {
        var tb = TABS.filter(function (x) {
          return "t" + x.id === k;
        })[0];
        if (!tb) return;
        if (rm[tb.id]) {
          delete nm[k];
          return;
        }
        def = tb.label;
      }
      if (v && v !== def) nm[k] = v;
      else delete nm[k];
    });
    st.names = nm;
    if (Object.keys(rm).length) {
      st.custom.forEach(function (x) {
        if (rm[x.id]) audit("Tabs", "Removed sub-tab “" + x.label + "”");
      });
      st.custom = st.custom.filter(function (x) {
        return !rm[x.id];
      });
      rebuildTabs();
      rebuild();
      if (st.sel.charAt(0) === "t" && tabIdx(+st.sel.slice(1)) < 0) st.sel = "t0";
    }
    save();
    render();
  });
  $("namesCancel").onclick = function () {
    $("namesDlg").close();
  };
  $("namesReset").onclick = function () {
    if (!confirm("Reset the names shown here to the originals?")) return;
    $("namesFields")
      .querySelectorAll("input[data-key]")
      .forEach(function (inp) {
        delete st.names[inp.dataset.key];
      });
    save();
    $("namesDlg").close();
    render();
  };
  $("moreBtn").onclick = function () {
    shown += PAGE;
    render();
  };
  $("rows").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var id = b.closest("tr").dataset.id,
      it = items.find(function (i) {
        return i.id === id;
      });
    if (b.hasAttribute("data-cat")) {
      catOne[id] = !(st.catAll || catOne[id]);
      if (st.catAll && !catOne[id]) st.catAll = false; // hiding one while all show: switch to one at a time
      render();
      return;
    }
    if (!can("qty")) {
      deny("add or edit quantities");
      return;
    }
    if (b.dataset.act === "edit") {
      openDlg(it);
      return;
    }
    var d = fieldsOf(it),
      q = Number(d.q) || 0;
    d.q = Math.max(0, b.dataset.act === "inc" ? q + 1 : q - 1);
    var dl = d.q - q;
    if (dl) logE(it, dl > 0 ? "add" : "sub", Math.abs(dl));
    setItem(id, d);
    save();
    it.q = d.q;
    render();
  });

  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  var stamp = function () {
    return new Date().toISOString().slice(0, 10);
  };
  $("exportJson").onclick = function () {
    if (!isMgr()) {
      toast("Only the owner or an admin can back up.");
      return;
    }
    download(
      "inventory-backup-" + stamp() + ".json",
      JSON.stringify({
        edits: st.edits,
        deleted: st.deleted,
        added: st.added,
        names: st.names,
        custom: st.custom,
        nextId: st.nextId,
        log: st.log,
        ewos: st.ewos,
        delivery: dl,
        contacts: st.contacts,
        manifests: st.manifests,
        users: isMgr() ? st.users : [],
        audit: isMgr() ? st.audit : [],
        profiles: isMgr() ? st.profiles : {},
      }),
      "application/json"
    );
  };
  $("exportCsv").onclick = function () {
    if (!isMgr()) {
      toast("Only the owner or an admin can export.");
      return;
    }
    var rows = [["Item Number", "Description", "Locator", "Quantity", "Unit", "Notes"]].concat(
      matches().list.map(function (i) {
        return [i.n, i.d, i.l, i.q, i.u, i.notes];
      })
    );
    download(
      selName().replace(/[^\w]+/g, "_") + "-" + stamp() + ".csv",
      "\ufeff" +
        rows
          .map(function (r) {
            return r
              .map(function (c) {
                return '"' + String(c).replace(/"/g, '""') + '"';
              })
              .join(",");
          })
          .join("\r\n"),
      "text/csv"
    );
  };
  $("importBtn").onclick = function () {
    if (!isMgr()) {
      toast("Only the owner or an admin can restore a backup.");
      return;
    }
    $("file").click();
  };
  $("file").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (typeof d.edits !== "object" || !Array.isArray(d.added)) throw 0;
        if (!confirm("Replace your saved changes with this backup?")) return;
        st.edits = d.edits;
        st.deleted = d.deleted || {};
        st.added = d.added;
        st.names = d.names || {};
        st.custom = d.custom || [];
        st.nextId = d.nextId || 7;
        st.log = d.log || [];
        st.ewos = d.ewos || [];
        fixEwos();
        if (d.delivery && Array.isArray(d.delivery.areas)) {
          dl = d.delivery;
          saveDl();
        }
        if (Array.isArray(d.contacts)) st.contacts = d.contacts;
        if (Array.isArray(d.manifests)) st.manifests = d.manifests;
        if (Array.isArray(d.users) && isOwner()) st.users = d.users;
        if (Array.isArray(d.audit) && isOwner()) st.audit = d.audit;
        if (d.profiles && typeof d.profiles === "object" && isOwner()) st.profiles = d.profiles;
        rebuildTabs();
        save();
        rebuild();
        render();
      } catch (e) {
        alert("That file is not a valid inventory backup.");
      }
    };
    r.readAsText(f);
    this.value = "";
  });

  var picked = {},
    shownIds = [],
    xItems = [],
    xSet = {},
    toastT = null,
    xMode = false;
  function r4(n) {
    return Math.round(n * 10000) / 10000;
  }
  function toast(msg) {
    var e = $("toast");
    e.textContent = msg;
    e.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      e.hidden = true;
    }, 4500);
  }
  function removeItem(id) {
    if (id.charAt(0) === "a")
      st.added = st.added.filter(function (a) {
        return a.id !== id;
      });
    else st.deleted[id] = 1;
  }
  function padP(p) {
    var s = p.split(".");
    while (s.length < 7) s.push("000");
    return s.join(".");
  }
  function updPick() {
    var n = Object.keys(picked).length;
    $("panel").classList.toggle("xmode", xMode);
    $("xferCancel").hidden = !xMode;
    $("xferBtn").textContent = xMode && n ? "Transfer (" + n + ")" : "Transfer";
    $("pickAll").checked =
      shownIds.length > 0 &&
      shownIds.every(function (id) {
        return picked[id];
      });
  }
  $("rows").addEventListener("change", function (e) {
    var c = e.target.closest("input[data-pick]");
    if (!c) return;
    var tr = c.closest("tr"),
      id = tr.dataset.id;
    if (c.checked) picked[id] = 1;
    else delete picked[id];
    tr.classList.toggle("picked", c.checked);
    updPick();
  });
  $("pickAll").addEventListener("change", function () {
    var on = this.checked;
    shownIds.forEach(function (id) {
      if (on) picked[id] = 1;
      else delete picked[id];
    });
    render();
  });
  $("xferBtn").onclick = function (e) {
    e.stopPropagation();
    if (!can("qty")) {
      deny("add or edit quantities");
      return;
    }
    if (!xMode) {
      xMode = true;
      updPick();
      toast(
        "Tick the items you want to move, then click Transfer again. Select Cancel to back out."
      );
      return;
    }
    if (!Object.keys(picked).length) {
      toast("Tick the box next to the items you want to transfer.");
      return;
    }
    openXfer();
  };
  $("xferCancel").onclick = function () {
    xMode = false;
    picked = {};
    render();
  };
  var xG = null,
    xT = -1,
    xL = "",
    xCnt = {};
  function openXfer() {
    xItems = items.filter(function (i) {
      return picked[i.id];
    });
    if (!xItems.length) {
      picked = {};
      render();
      toast("The ticked items are no longer in the list.");
      return;
    }
    $("xItems").innerHTML = xItems
      .map(function (i) {
        var av = Number(i.q) || 0;
        return (
          '<div class="xi"><div class="xt"><b>' +
          esc(i.n) +
          "</b> " +
          esc(i.d) +
          '<div class="m mono">' +
          esc(i.l) +
          '</div></div><input type="number" data-id="' +
          i.id +
          '" min="0" max="' +
          av +
          '" step="any" value="' +
          av +
          '" aria-label="Quantity to transfer"><span class="av">of ' +
          fmtQ(av) +
          " " +
          esc(i.u) +
          "</span></div>"
        );
      })
      .join("");
    xG = null;
    xT = -1;
    xL = "";
    $("xMasters").innerHTML =
      '<option value="" selected disabled>Select a master tab…</option>' +
      GROUPS.map(function (G, g) {
        return g;
      })
        .sort(function (a, b) {
          return GROUPS[a].o - GROUPS[b].o;
        })
        .map(function (g) {
          var n = TABS.filter(function (t) {
            return t.g === g;
          }).length;
          return (
            '<option value="' +
            g +
            '">' +
            esc(gname(g)) +
            " (" +
            n +
            (n === 1 ? " sub-tab" : " sub-tabs") +
            ")</option>"
          );
        })
        .join("");
    $("xSubWrap").hidden = true;
    $("xLocWrap").hidden = true;
    $("xHint").textContent = "";
    $("xferDlg").showModal();
  }
  function xSubs(g) {
    xG = g;
    xT = -1;
    xL = "";
    var opts = TABS.map(function (t, i) {
      return t.g === g ? '<option value="' + i + '">' + esc(tname(i)) + "</option>" : "";
    }).join("");
    $("xSubs").innerHTML = opts
      ? '<option value="" selected disabled>Select a sub-tab…</option>' + opts
      : '<option value="" selected disabled>No sub-tabs yet. Add one from the sidebar.</option>';
    $("xSubs").disabled = !opts;
    $("xSubWrap").hidden = false;
    $("xLocWrap").hidden = true;
    $("xHint").textContent = "";
  }
  function xLocList(i) {
    xT = i;
    xCnt = {};
    items.forEach(function (it) {
      if (it.t === i) xCnt[it.l] = (xCnt[it.l] || 0) + 1;
    });
    var gen = padP(TABS[i].p),
      list = Object.keys(xCnt)
        .sort()
        .filter(function (l) {
          return l !== gen;
        });
    xL = gen;
    $("xLocs").innerHTML =
      '<option value="' +
      esc(gen) +
      '" selected>General location – ' +
      esc(gen) +
      "</option>" +
      list
        .map(function (l) {
          return (
            '<option value="' +
            esc(l) +
            '">' +
            esc(l) +
            "  (" +
            xCnt[l] +
            (xCnt[l] === 1 ? " item" : " items") +
            ")</option>"
          );
        })
        .join("");
    $("xLocWrap").hidden = false;
    xHintUpd();
  }
  function xHintUpd() {
    $("xHint").textContent = xL ? "Items will be placed at " + xL + "." : "";
  }
  $("xMasters").addEventListener("change", function () {
    xSubs(+this.value);
  });
  $("xSubs").addEventListener("change", function () {
    xLocList(+this.value);
  });
  $("xLocs").addEventListener("change", function () {
    xL = this.value;
    xHintUpd();
  });
  $("xCancel").onclick = function () {
    $("xferDlg").close();
  };
  function doTransfer(src, dest, qty) {
    var avail = Number(src.q) || 0;
    var target = items.find(function (i) {
      return i.id !== src.id && i.l === dest && i.n === src.n && i.u === src.u;
    });
    logE({ id: src.id, n: src.n, d: src.d, u: src.u, l: dest }, "move", qty, {
      from: src.l,
      to: dest,
    });
    function withQ(i, q) {
      var d = fieldsOf(i);
      d.q = r4(q);
      return d;
    }
    if (qty >= avail) {
      if (target) {
        setItem(target.id, withQ(target, (Number(target.q) || 0) + qty));
        removeItem(src.id);
      } else {
        var d = fieldsOf(src);
        d.l = dest;
        setItem(src.id, d);
      }
    } else {
      setItem(src.id, withQ(src, avail - qty));
      if (target) setItem(target.id, withQ(target, (Number(target.q) || 0) + qty));
      else
        st.added.push({
          id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          n: src.n,
          d: src.d,
          l: dest,
          q: r4(qty),
          u: src.u,
          notes: src.notes,
        });
    }
  }
  $("xferForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var dest = xL;
    if (xT < 0 || !dest) {
      alert("Choose a master tab, a sub-tab and a location to transfer to.");
      ev.preventDefault();
      return;
    }
    var jobs = [],
      bad = false;
    $("xItems")
      .querySelectorAll("input[data-id]")
      .forEach(function (inp) {
        var src = xItems.find(function (i) {
            return i.id === inp.dataset.id;
          }),
          q = parseFloat(inp.value),
          av = Number(src.q) || 0;
        if (!(q > 0) || q > av) {
          bad = true;
          return;
        }
        if (src.l !== dest) jobs.push({ id: src.id, q: q });
      });
    if (bad) {
      alert("Enter a quantity above 0 and no more than the amount available, for every item.");
      ev.preventDefault();
      return;
    }
    if (!jobs.length) {
      alert("The ticked items are already at that location.");
      ev.preventDefault();
      return;
    }
    var label = tname(xT) + (dest === padP(TABS[xT].p) ? "" : " (" + dest + ")");
    jobs.forEach(function (j) {
      var src = items.find(function (i) {
        return i.id === j.id;
      });
      if (src) {
        doTransfer(src, dest, j.q);
        rebuild();
      }
    });
    picked = {};
    xMode = false;
    save();
    render();
    toast("Transferred " + jobs.length + (jobs.length === 1 ? " item" : " items") + " to " + label);
  });

  var TOPS = ["Warehouse Item/Locations", "EWO", "Pick List", "Put Away", "Delivery", "Summary", "Greens"];
  function oname(i) {
    return st.names["p" + i] || TOPS[i];
  }
  /* =====================================================================
     Top navigation tabs
     ===================================================================== */
  function renderTop() {
    $("manageBtn").classList.toggle("on", !!st.manage);
    var nav = $("topnav");
    if (nav.children.length !== TOPS.length)
      nav.innerHTML = TOPS.map(function (x, i) {
        return '<button data-top="' + i + '" title="Double-click to rename"></button>';
      }).join("");
    TOPS.forEach(function (x, i) {
      var b = nav.children[i],
        on = i === 0 ? st.top == null && st.side == null && !st.manage : st.top === i;
      if (b.textContent !== oname(i)) b.textContent = oname(i);
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (st.top != null) $("topTitle").textContent = oname(st.top);
  }
  $("topnav").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var i = +b.dataset.top;
    st.side = null;
    st.manage = false;
    ewoMenuOn = false;
    if (i === 0 && st.sel === "e") st.sel = st.lastSel || "t0";
    st.top = i === 0 ? null : i;
    render();
  });
  $("topnav").addEventListener("dblclick", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var i = +b.dataset.top,
      v = prompt("Rename this option:", oname(i));
    if (v && v.trim()) {
      st.names["p" + i] = v.trim().slice(0, 30);
      save();
      render();
    }
  });
  /* ---------- Pick List: read a USS Pick Slip Report PDF ----------
     PDFs last for this visit only. Each one is read with pdf.js: the slip on the left,
     its lines on the right (item #, allocated, UOM, deliver-to, picked box, on hand). */
  var pkPdfs = [],
    pkOpen = -1;
  // Reads the pick lines: each 10-digit item # in the Item Number column starts a line; the
  // other values sit on the same text row. Source locator spans two rows ("…000." + "0FF.000…").
  // shortcut: column positions are fixed to the USS Pick Slip Report layout (792pt landscape); read them from the header row if the report changes.
  async function pkParse(doc) {
    var rows = [],
      meta = {};
    for (var p = 1; p <= doc.numPages; p++) {
      var pg = await doc.getPage(p),
        vp = pg.getViewport({ scale: 1 }),
        its = (await pg.getTextContent()).items
        .filter(function (t) {
          return t.str.trim();
        })
        .map(function (t) {
          return { s: t.str.trim(), x: t.transform[4], y: t.transform[5], w: t.width, h: t.height };
        });
      its.forEach(function (a, k) {
        var nx = its[k + 1];
        if (nx && a.s === "Pick Slip No:") meta.no = nx.s;
        if (nx && a.s === "Date Printed:") meta.date = nx.s;
        if (a.x < 110 || a.x > 130 || !/^\d{10}$/.test(a.s)) return;
        var near = function (x0, x1, below) {
            return its.filter(function (t) {
              return t.x >= x0 && t.x < x1 && a.y - t.y >= -3 && a.y - t.y <= below;
            });
          },
          cell = function (x0, x1) {
            return (near(x0, x1, 3)[0] || {}).s || "";
          },
          to = cell(465, 540),
          m = /^36K-([^-\s]+)/i.exec(to),
          c1 = vp.convertToViewportPoint(a.x - 6, a.y - 4),
          c2 = vp.convertToViewportPoint(a.x + a.w + 6, a.y + a.h + 3);
        rows.push({
          n: a.s,
          pg: p,
          // where the item # sits on its page, in % of the page, for the problem circle
          box: [
            (Math.min(c1[0], c2[0]) / vp.width) * 100,
            (Math.min(c1[1], c2[1]) / vp.height) * 100,
            (Math.abs(c2[0] - c1[0]) / vp.width) * 100,
            (Math.abs(c2[1] - c1[1]) / vp.height) * 100,
          ],
          alloc: cell(325, 372),
          uom: cell(395, 428),
          dest: m ? m[1] : to,
          to: to,
          oh: cell(725, 790),
          loc: near(0, 110, 12)
            .sort(function (u, v) {
              return v.y - u.y;
            })
            .map(function (t) {
              return t.s;
            })
            .join(""),
        });
      });
    }
    return { rows: rows, meta: meta };
  }
  // The one saved record Update qty changes: the slip's bin, or the only bin holding that item #.
  function pkTarget(r) {
    var all = items.filter(function (i) {
        return i.n === r.n;
      }),
      bin = all.filter(function (i) {
        return i.l === r.loc;
      });
    return bin.length === 1 ? bin[0] : !bin.length && all.length === 1 ? all[0] : null;
  }
  // On-hand quantity in this app: the slip's bin if it is listed, otherwise every bin with that item #.
  function pkNow(r) {
    var all = items.filter(function (i) {
        return i.n === r.n;
      }),
      bin = all.filter(function (i) {
        return i.l === r.loc;
      });
    if (!all.length) return null;
    return (bin.length ? bin : all).reduce(function (s, i) {
      return s + (+i.q || 0);
    }, 0);
  }
  async function pkLoad(p) {
    try {
      var lib = await loadPdfJs();
      p.doc = await lib.getDocument({
        data: new Uint8Array(await p.file.arrayBuffer()),
        useSystemFonts: true,
        isEvalSupported: false,
        verbosity: 0,
        wasmUrl: WASM_BASE,
      }).promise;
      var r = await pkParse(p.doc);
      p.rows = r.rows;
      p.meta = r.meta;
    } catch (x) {
      p.err = x.message || "This file could not be read.";
    }
    if (pkPdfs[pkOpen] === p) renderPk();
  }
  async function pkDraw(p) {
    var box = $("pkDoc");
    box.innerHTML = "";
    for (var i = 1; i <= p.doc.numPages && pkPdfs[pkOpen] === p; i++) {
      var page = await p.doc.getPage(i),
        vp = page.getViewport({ scale: ((box.clientWidth || 600) / page.getViewport({ scale: 1 }).width) * (devicePixelRatio || 1) }),
        cv = document.createElement("canvas");
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", "Page " + i + " of " + p.name);
      var wrap = document.createElement("div");
      wrap.className = "pkpage";
      wrap.dataset.pg = i;
      wrap.appendChild(cv);
      box.appendChild(wrap);
      pkPagerSync();
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    }
    if (pkPdfs[pkOpen] === p) pkMarks(p);
  }
  // The slip's pages slide sideways one at a time (swipe, arrow keys or the pager buttons).
  function pkPagerSync() {
    var box = $("pkDoc"),
      n = box.children.length,
      i = Math.min(n - 1, Math.round(box.scrollLeft / (box.clientWidth || 1))),
      cur = box.children[i];
    $("pkPager").hidden = n < 2;
    $("pkPageNo").textContent =
      (cur && cur.classList.contains("pkprobs") ? "Problems, page " : "Page ") + (i + 1) + " of " + n;
    $("pkPrev").disabled = i <= 0;
    $("pkNext").disabled = i >= n - 1;
  }
  function pkSlide(d) {
    var box = $("pkDoc");
    box.scrollBy({
      left: d * box.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
  $("pkDoc").addEventListener("scroll", pkPagerSync, { passive: true });
  $("pkPrev").onclick = function () {
    pkSlide(-1);
  };
  $("pkNext").onclick = function () {
    pkSlide(1);
  };
  // Problem rows: a black circle on the item # in the slip, and a Problems page after the last page.
  var pkStamp = -1; // row whose circle was just added, so only that one animates
  function pkMarks(p) {
    var box = $("pkDoc");
    box.querySelectorAll(".pkmark, .pkprobs").forEach(function (el) {
      el.remove();
    });
    var probs = (p.rows || []).filter(function (r, j) {
      r.j = j;
      return p.prob[j] != null;
    });
    probs.forEach(function (r) {
      var pg = box.querySelector('.pkpage[data-pg="' + r.pg + '"]');
      if (!pg) return;
      var c = document.createElement("span");
      c.className = "pkmark";
      if (r.j === pkStamp) {
        c.className += " new";
        box.scrollTo({
          left: [].indexOf.call(box.children, pg) * box.clientWidth,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }
      c.style.cssText =
        "left:" + r.box[0] + "%;top:" + r.box[1] + "%;width:" + r.box[2] + "%;height:" + r.box[3] + "%";
      pg.appendChild(c);
    });
    pkStamp = -1;
    pkPagerSync();
    if (!probs.length) return;
    var pp = document.createElement("section");
    pp.className = "pkpage pkprobs";
    pp.setAttribute("aria-label", "Problems");
    pp.innerHTML = pkProbsHtml(p);
    box.appendChild(pp);
    pkPagerSync();
  }
  function pkProbsHtml(p) {
    return (
      "<h4>Problems</h4><p>" +
      esc([p.meta && p.meta.no ? "Pick slip " + p.meta.no : p.name, p.meta && p.meta.date].filter(Boolean).join(", ")) +
      "</p><ol>" +
      p.rows
        .map(function (r, j) {
          if (p.prob[j] == null) return "";
          return (
            "<li><b>" +
            esc(r.n) +
            "</b> <span>" +
            esc([r.alloc + " " + r.uom, r.to].filter(Boolean).join(", ")) +
            "</span><p>" +
            esc(p.prob[j]) +
            "</p></li>"
          );
        })
        .join("") +
      "</ol>"
    );
  }
  // ro: true = a submitted pick list as text; "edit" = a manager fixing one (picked and problems only).
  function pkRowsHtml(p, ro) {
    var ed = ro === "edit";
    if (p.err) return '<p class="pknote">Couldn\'t read this PDF: ' + esc(p.err) + "</p>";
    if (!p.rows) return '<p class="pknote">Reading the pick list…</p>';
    if (!p.rows.length)
      return '<p class="pknote">No pick lines were found. This reader knows the USS Pick Slip Report layout; check that this PDF is one.</p>';
    return (
      '<table class="pktab"><thead><tr><th>Item #</th><th>Allocated</th><th>UOM</th><th>Deliver to</th>' +
      "<th>Picked</th><th>On hand (slip)</th><th>On hand now</th><th>Left after pick</th><th>Check</th></tr></thead><tbody>" +
      p.rows
        .map(function (r, j) {
          var now = "now" in r ? r.now : pkNow(r),
            off = now != null && pkNum(r.oh) !== now,
            tg = !ro && pkTarget(r),
            why = tg ? "" : now == null ? "This item # is not in the list" : "This item # is in more than one bin";
          if (ro === true)
            return (
              "<tr" + (p.prob[j] != null ? ' class="pkprob"' : "") + '><td data-l="Item #"><b>' +
              esc(r.n) +
              '</b></td><td data-l="Allocated">' +
              esc(r.alloc) +
              '</td><td data-l="UOM">' +
              esc(r.uom) +
              '</td><td data-l="Deliver to" title="' +
              esc(r.to) +
              '">' +
              esc(r.dest) +
              '</td><td data-l="Picked">' +
              esc(p.picked[j] || "–") +
              '</td><td data-l="On hand (slip)">' +
              esc(r.oh) +
              '</td><td data-l="On hand now"' +
              (off ? ' class="pkoff"' : "") +
              ">" +
              (now == null ? '<span class="m">Not in list</span>' : now + (off ? "<small>Differs</small>" : "")) +
              "</td>" +
              pkLeftTd(now, pkNum(p.picked[j])) +
              '<td data-l="Check">' +
              esc([p.upd[j] ? "Qty updated" : "", p.prob[j] != null ? "Problem" : ""].filter(Boolean).join(", ") || "–") +
              "</td></tr>"
            );
          return (
            "<tr" + (p.prob[j] != null ? ' class="pkprob"' : "") + '><td data-l="Item #"><b>' +
            esc(r.n) +
            '</b></td><td data-l="Allocated">' +
            esc(r.alloc) +
            '</td><td data-l="UOM">' +
            esc(r.uom) +
            '</td><td data-l="Deliver to" title="' +
            esc(r.to) +
            '">' +
            esc(r.dest) +
            '</td><td data-l="Picked"><input type="number" inputmode="numeric" min="0" data-pk="' +
            j +
            '" value="' +
            esc(p.picked[j] == null ? "" : p.picked[j]) +
            '" aria-label="Picked quantity for item ' +
            esc(r.n) +
            '"></td><td data-l="On hand (slip)">' +
            esc(r.oh) +
            '</td><td data-l="On hand now"' +
            (off ? ' class="pkoff"' : "") +
            ">" +
            (now == null ? '<span class="m">Not in list</span>' : now + (off ? "<small>Differs</small>" : "")) +
            "</td>" +
            pkLeftTd(now, pkNum(p.picked[j])) +
            '<td data-l="Check" class="pkchk">' +
            (ed
              ? '<span class="m">' + (p.upd[j] ? "Qty updated" : "") + "</span>"
              : "<label" +
            (why ? ' title="' + why + '"' : "") +
            '><input type="checkbox" data-upd="' +
            j +
            '"' +
            (p.upd[j] ? " checked" : "") +
            (why && !p.upd[j] ? " disabled" : "") +
            "> Update qty</label>") +
            "<label><input type=\"checkbox\" data-prob=\"" +
            j +
            '"' +
            (p.prob[j] != null ? " checked" : "") +
            "> Problem</label></td></tr>"
          );
        })
        .join("") +
      "</tbody></table>" +
      (p.sent
        ? '<p class="pknote">Submitted ' +
          esc(new Date(p.sent).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) +
          ". You'll find it under Pick List in your profile.</p>"
        : ro
        ? ""
        : '<div class="pksub">' +
          pkProgHtml(p) +
          '<button type="button" id="pkNewItem">Add item not on the list</button><button type="button" id="pkDiscard">Cancel pick list</button><button type="button" class="primary" id="pkSubmit">Submit pick list</button></div>')
    );
  }
  // What stays in stock once this line's Picked comes off (On hand now − Picked); below 0 is short.
  function pkLeftTd(now, got) {
    var left = now == null || got == null ? null : now - got;
    return (
      '<td data-l="Left after pick"' +
      (left < 0 ? ' class="pkoff"' : "") +
      ">" +
      (left == null ? "–" : left + (left < 0 ? "<small>Short</small>" : "")) +
      "</td>"
    );
  }
  // Cancel before submitting: drop the PDF and put back any quantity Update qty changed.
  function pkDiscard(p) {
    var n = Object.keys(p.upd).length;
    if (
      !confirm(
        "Cancel " +
          (p.meta && p.meta.no ? "pick slip " + p.meta.no : p.name) +
          "? Nothing is submitted" +
          (n ? (n === 1 ? ", and the quantity changed with Update qty goes back." : ", and the " + n + " quantities changed with Update qty go back.") : ".")
      )
    )
      return;
    Object.keys(p.upd).forEach(function (j) {
      var cur = items.find(function (i) {
        return i.id === p.upd[j].id;
      });
      if (cur) adjustQty(cur.id, p.upd[j].old - (Number(cur.q) || 0), "Cancelled pick slip " + ((p.meta && p.meta.no) || p.name));
    });
    if (n) save();
    pkPdfs.splice(pkPdfs.indexOf(p), 1);
    pkShow(-1);
    toast("Pick list cancelled.");
  }
  function pkProgHtml(p) {
    var n = p.rows.length,
      done = p.rows.filter(function (r, j) {
        return pkNum(p.picked[j]) != null;
      }).length,
      pr = Object.keys(p.prob).length;
    return (
      '<div class="pkprog" id="pkProg"><span><b>' +
      done +
      " of " +
      n +
      "</b> lines picked" +
      (pr ? ", " + pr + (pr === 1 ? " problem" : " problems") : "") +
      '</span><span class="pbar" aria-hidden="true"><i style="width:' +
      Math.round((done / (n || 1)) * 100) +
      '%"></i></span></div>'
    );
  }
  // A submitted pick list is one entry in the shared activity log (category "Pick lists"),
  // so it syncs to the cloud with everything else and shows under Picks and Put Away.
  function pkNum(v) {
    var x = parseFloat(String(v == null ? "" : v).replace(/,/g, ""));
    return isNaN(x) ? null : x;
  }
  // Before submitting: list lines where the slip's on hand and ours differ, and what Picked takes off.
  var pkOkFor = null;
  function pkSubmit(p) {
    if (!sess) return toast("Sign in first, so the pick list reaches the cloud.");
    var no = (p.meta && p.meta.no) || "",
      off = [],
      cant = [],
      bad = p.rows.filter(function (r, j) {
        var slip = pkNum(r.oh),
          now = pkNow(r),
          got = pkNum(p.picked[j]);
        if (got > 0) (pkTarget(r) ? off : cant).push(r.n + " (" + got + ")");
        return slip == null || now == null || slip !== now;
      }),
      li = function (l) {
        return "<li>" + l + "</li>";
      },
      h = "";
    if (bad.length)
      h +=
        '<p class="pkwarn"><b>On hand doesn\'t match on ' +
        bad.length +
        (bad.length === 1 ? " line." : " lines.") +
        "</b> The slip's On hand and our On hand now are different here:</p><ul class=\"pkmis\">" +
        bad
          .map(function (r) {
            var now = pkNow(r);
            return li(
              "<b>" + esc(r.n) + "</b> to " + esc(r.dest) + ": slip " + esc(r.oh) + ", now " + (now == null ? "not in list" : now)
            );
          })
          .join("") +
        "</ul><p>Go back and use Update qty on those lines, or submit anyway.</p>";
    if (off.length)
      h +=
        "<p>Picked amounts come off our saved quantities when you submit: " +
        esc(off.join(", ")) +
        ".</p>";
    if (cant.length)
      h +=
        "<p>These picked amounts can't come off, because the item isn't in the list or is in more than one bin: " +
        esc(cant.join(", ")) +
        ".</p>";
    if (off.length && !can("qty"))
      h += "<p>You can't change quantities, so picked amounts won't come off. Ask a manager for that permission.</p>";
    $("pkOkTitle").textContent = "Submit " + (no ? "pick slip " + no : p.name) + "?";
    $("pkOkBody").innerHTML = h + "<p class=\"m\">It's sent to the cloud and can't be changed after.</p>";
    $("pkOkGo").textContent = bad.length ? "Submit anyway" : "Submit";
    pkOkFor = p;
    $("pkOkDlg").showModal();
  }
  $("pkOkBack").onclick = function () {
    $("pkOkDlg").close();
  };
  $("pkOkGo").onclick = function () {
    $("pkOkDlg").close();
    if (pkOkFor) pkSend(pkOkFor);
  };
  function pkSend(p) {
    var no = (p.meta && p.meta.no) || "",
      probs = Object.keys(p.prob).length,
      nowAt = p.rows.map(pkNow),
      taken = {};
    // Picked comes off the saved qty (after any Update qty), logged against this slip.
    if (can("qty"))
      p.rows.forEach(function (r, j) {
        var got = pkNum(p.picked[j]),
          tg = got > 0 && pkTarget(r);
        if (!tg) return;
        adjustQty(tg.id, -got, "Picked on pick slip " + (no || p.name));
        taken[j] = got;
      });
    var ts = Date.now();
    if (!st.audit) st.audit = [];
    st.audit.push({
      ts: ts,
      by: curEmail(),
      cat: "Pick lists",
      text:
        (no ? "Pick slip " + no : p.name) +
        ": " +
        p.rows.length +
        (p.rows.length === 1 ? " line" : " lines") +
        (probs ? ", " + probs + (probs === 1 ? " problem" : " problems") : ""),
      k: nid("a"),
      pick: {
        no: no,
        date: (p.meta && p.meta.date) || "",
        name: p.name,
        rows: p.rows.map(function (r, j) {
          return { n: r.n, alloc: r.alloc, uom: r.uom, dest: r.dest, to: r.to, oh: r.oh, loc: r.loc, now: nowAt[j] };
        }),
        picked: p.picked,
        taken: taken,
        upd: Object.keys(p.upd).reduce(function (o, j) {
          o[j] = 1;
          return o;
        }, {}),
        prob: p.prob,
      },
    });
    save();
    p.sent = ts;
    // Show on-hand as it was before the pick, so Left after pick isn't counted twice.
    p.rows.forEach(function (r, j) {
      r.now = nowAt[j];
    });
    renderPk();
    var nt = Object.keys(taken).length;
    toast(nt ? "Pick list submitted. Picked amounts taken off " + nt + (nt === 1 ? " item." : " items.") : "Pick list submitted.");
  }
  // Edits are new activity entries pointing at the first submission (pick.of), because the
  // shared log is add-only. The newest entry for a pick list is the one shown.
  function pkLatest(k) {
    return (st.audit || [])
      .filter(function (x) {
        return x.pick && (x.k === k || x.pick.of === k);
      })
      .sort(function (a, b) {
        return b.ts - a.ts;
      })[0];
  }
  function pkWho(email) {
    var u = allPeople().find(function (x) {
      return x.email === email;
    });
    return (u && (u.name || u.email)) || email || "someone not signed in";
  }
  var pkSub = null; // { k: first submission's key, e: newest entry, p: list shown, editing }
  function pkViewSub(k) {
    var e = pkLatest(k);
    if (!e) return toast("That pick list isn't on this device yet.");
    var s = e.pick;
    pkSub = {
      k: k,
      e: e,
      editing: false,
      p: {
        name: s.name,
        rows: s.rows,
        picked: Object.assign({}, s.picked),
        upd: s.upd || {},
        prob: Object.assign({}, s.prob),
        meta: s,
      },
    };
    renderPkSub();
    if (!$("pkSubDlg").open) $("pkSubDlg").showModal();
  }
  function renderPkSub() {
    var e = pkSub.e,
      s = e.pick,
      first =
        (st.audit || []).find(function (x) {
          return x.k === pkSub.k;
        }) || e,
      p = pkSub.p,
      fmt = function (ts) {
        return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      };
    $("pkSubTitle").textContent = (pkSub.editing ? "Edit pick slip " : "Pick slip ") + (s.no || s.name);
    $("pkSubMeta").textContent = [
      "Submitted by " + pkWho(first.by) + ", " + fmt(first.ts),
      s.of ? "edited by " + pkWho(e.by) + ", " + fmt(e.ts) : "",
      s.date ? "printed " + s.date : "",
    ]
      .filter(Boolean)
      .join("; ");
    $("pkSubBody").innerHTML =
      pkRowsHtml(p, pkSub.editing ? "edit" : true) +
      (Object.keys(p.prob).length ? '<section class="pkprobs">' + pkProbsHtml(p) + "</section>" : "");
    $("pkSubEdit").hidden = pkSub.editing || !can("pkedit");
    $("pkSubSave").hidden = $("pkSubCancel").hidden = !pkSub.editing;
    $("pkSubClose").hidden = pkSub.editing;
  }
  $("pkSubClose").onclick = function () {
    $("pkSubDlg").close();
  };
  $("pkSubEdit").onclick = function () {
    if (!can("pkedit")) return;
    pkSub.editing = true;
    renderPkSub();
  };
  $("pkSubCancel").onclick = function () {
    pkViewSub(pkSub.k);
  };
  $("pkSubSave").onclick = function () {
    if (!can("pkedit") || !sess) return deny("edit submitted pick lists");
    var p = pkSub.p,
      s = pkSub.e.pick,
      probs = Object.keys(p.prob).length,
      no = s.no ? "pick slip " + s.no : s.name;
    if (!st.audit) st.audit = [];
    st.audit.push({
      ts: Date.now(),
      by: curEmail(),
      cat: "Pick lists",
      text:
        "Edited " +
        no +
        ": " +
        s.rows.length +
        (s.rows.length === 1 ? " line" : " lines") +
        (probs ? ", " + probs + (probs === 1 ? " problem" : " problems") : ""),
      k: nid("a"),
      pick: Object.assign({}, s, { picked: p.picked, prob: p.prob, of: pkSub.k }),
    });
    save();
    pkViewSub(pkSub.k);
    if (st.manage) renderManage();
    toast("Changes saved.");
  };
  $("pkSubBody").addEventListener("input", function (e) {
    if (!(pkSub && pkSub.editing && e.target.dataset.pk)) return;
    pkSub.p.picked[e.target.dataset.pk] = e.target.value;
    var r = pkSub.p.rows[e.target.dataset.pk],
      td = e.target.closest("tr").querySelector('[data-l="Left after pick"]');
    if (td) td.outerHTML = pkLeftTd("now" in r ? r.now : pkNow(r), pkNum(e.target.value));
  });
  $("pkSubBody").addEventListener("change", function (e) {
    var el = e.target;
    if (!pkSub || !pkSub.editing || !el.dataset.prob) return;
    var j = +el.dataset.prob,
      p = pkSub.p;
    if (!el.checked) {
      delete p.prob[j];
      return renderPkSub();
    }
    el.checked = false; // ticks once the note is saved
    pkProbFor = p;
    pkProbAfter = renderPkSub;
    pkProbRow = j;
    $("pkDlgTitle").textContent = "Problem with " + p.rows[j].n;
    $("pkForm").reset();
    $("pkDlg").showModal();
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-pkview]");
    if (b) pkViewSub(b.dataset.pkview);
  });
  function renderPk() {
    var p = pkPdfs[pkOpen];
    $("pkHome").hidden = !!p;
    $("pkView").hidden = !p;
    if (p) {
      var no = p.meta && p.meta.no;
      $("pkCrumb").textContent = $("pkName").textContent = no ? "Slip " + no : p.name;
      $("pkMeta").textContent = [
        p.name,
        p.meta && p.meta.date ? "printed " + p.meta.date : "",
        p.rows ? p.rows.length + (p.rows.length === 1 ? " line" : " lines") : "",
      ]
        .filter(Boolean)
        .join(", ");
      $("pkRows").innerHTML = pkRowsHtml(p, !!p.sent);
      if (p.doc && p.drawn !== p.doc) {
        p.drawn = p.doc;
        pkDraw(p);
      } else if (p.drawn) pkMarks(p);
      return;
    }
    $("pkList").innerHTML = pkPdfs.length
      ? pkPdfs
          .map(function (p, i) {
            return (
              "<li><b>" +
              esc(p.name) +
              '</b><span class="m">' +
              Math.max(1, Math.round(p.size / 1024)) +
              ' KB</span><button data-open="' +
              i +
              '">Open</button><button data-rm="' +
              i +
              '">Remove</button></li>'
            );
          })
          .join("")
      : ""; // the drop area above already says what to do
  }
  function pkShow(i) {
    pkOpen = i;
    if (pkPdfs[i]) pkPdfs[i].drawn = null; // the slip panel is rebuilt each time it opens
    renderPk();
    scrollTo(0, 0);
  }
  function pkAddFiles(files) {
    var pdfs = files.filter(function (f) {
      return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    });
    if (!pdfs.length) return toast("Pick a PDF file.");
    var first = pkPdfs.length;
    pdfs.forEach(function (f) {
      var p = { name: f.name, size: f.size, file: f, rows: null, picked: {}, upd: {}, prob: {} };
      pkPdfs.push(p);
      pkLoad(p);
    });
    pkShow(first);
  }
  $("pkAdd").onclick = function () {
    pickFiles("application/pdf,.pdf", false, pkAddFiles);
  };
  // Drag PDFs from the computer onto the drop area.
  $("pkDrop").addEventListener("dragover", function (e) {
    e.preventDefault();
    this.classList.add("over");
  });
  $("pkDrop").addEventListener("dragleave", function () {
    this.classList.remove("over");
  });
  $("pkDrop").addEventListener("drop", function (e) {
    e.preventDefault();
    this.classList.remove("over");
    pkAddFiles([].slice.call(e.dataTransfer.files));
  });
  $("pkList").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.open) return pkShow(+b.dataset.open);
    if (b.dataset.rm) {
      pkPdfs.splice(+b.dataset.rm, 1);
      renderPk();
    }
  });
  $("pkBack").onclick = function () {
    pkShow(-1);
  };
  $("pkRows").addEventListener("click", function (e) {
    if (e.target.closest("#pkSubmit") && pkPdfs[pkOpen]) pkSubmit(pkPdfs[pkOpen]);
    if (e.target.closest("#pkDiscard") && pkPdfs[pkOpen]) pkDiscard(pkPdfs[pkOpen]);
    // An item the slip has that the item list doesn't: create it at a location (same form and rules as Add item).
    if (e.target.closest("#pkNewItem")) $("add").onclick();
  });
  $("pkRows").addEventListener("input", function (e) {
    var p = pkPdfs[pkOpen];
    if (p && e.target.dataset.pk) {
      p.picked[e.target.dataset.pk] = e.target.value;
      if ($("pkProg")) $("pkProg").outerHTML = pkProgHtml(p);
      var r = p.rows[e.target.dataset.pk],
        td = e.target.closest("tr").querySelector('[data-l="Left after pick"]');
      if (td) td.outerHTML = pkLeftTd("now" in r ? r.now : pkNow(r), pkNum(e.target.value));
    }
  });
  var pkProbRow = -1,
    pkProbFor = null,
    pkProbAfter = renderPk;
  $("pkRows").addEventListener("change", function (e) {
    var p = pkPdfs[pkOpen],
      el = e.target,
      j;
    if (!p) return;
    if (el.dataset.upd) {
      j = +el.dataset.upd;
      var r = p.rows[j];
      if (!can("qty")) {
        el.checked = !el.checked;
        return deny("add or edit quantities");
      }
      // Ticking sets the saved qty to the slip's on hand; unticking puts the old qty back.
      if (el.checked) {
        var tg = pkTarget(r),
          want = parseFloat(String(r.oh).replace(/,/g, ""));
        if (!tg || isNaN(want)) {
          el.checked = false;
          return toast("This line's quantity can't be updated.");
        }
        p.upd[j] = { id: tg.id, old: Number(tg.q) || 0 };
        adjustQty(tg.id, want - p.upd[j].old, "Pick slip " + ((p.meta && p.meta.no) || p.name));
      } else if (p.upd[j]) {
        var cur = items.find(function (i) {
          return i.id === p.upd[j].id;
        });
        if (cur) adjustQty(cur.id, p.upd[j].old - (Number(cur.q) || 0), "Undo pick slip update");
        delete p.upd[j];
      }
      save();
      renderPk();
      var box = $("pkRows").querySelector('[data-upd="' + j + '"]');
      if (box) box.closest("tr").querySelector('[data-l="On hand now"]').classList.add("pkflash");
      toast(el.checked ? "Quantity updated to " + r.oh + "." : "Quantity put back.");
    }
    if (el.dataset.prob) {
      j = +el.dataset.prob;
      if (!el.checked) {
        delete p.prob[j];
        return renderPk();
      }
      el.checked = false; // ticks once the note is saved
      pkProbFor = p;
      pkProbAfter = renderPk;
      pkProbRow = j;
      $("pkDlgTitle").textContent = "Problem with " + p.rows[j].n;
      $("pkForm").reset();
      $("pkDlg").showModal();
    }
  });
  $("pkCancel").onclick = function () {
    $("pkDlg").close();
  };
  $("pkForm").addEventListener("submit", function (ev) {
    var p = pkProbFor,
      note = $("pkForm").elements.note.value.trim();
    if (ev.submitter && ev.submitter.value !== "save") return;
    if (!p || pkProbRow < 0 || !note) return;
    p.prob[pkProbRow] = note;
    if (pkProbAfter === renderPk) pkStamp = pkProbRow;
    pkProbAfter();
  });
  renderPk();
  var ewoScope = "all",
    ewoOpen = {},
    ewoMenuOn = false;
  function ewoTabsSel() {
    if (ewoScope === "all") return null;
    var n = +ewoScope.slice(1);
    if (ewoScope.charAt(0) === "g")
      return TABS.map(function (t, i) {
        return t.g === n ? i : -1;
      }).filter(function (i) {
        return i >= 0;
      });
    var i = tabIdx(n);
    return i < 0 ? [] : [i];
  }
  function ewoLabel() {
    if (ewoScope === "all") return "All locations";
    var n = +ewoScope.slice(1);
    if (ewoScope.charAt(0) === "g") return gname(n);
    var i = tabIdx(n);
    if (i < 0) return "All locations";
    return (TABS[i].g >= 0 ? gname(TABS[i].g) + " › " : "") + tname(i);
  }
  function buildEwoMenu() {
    var c = TABS.map(function () {
      return 0;
    });
    items.forEach(function (i) {
      if (i.t >= 0) c[i.t]++;
    });
    var h =
      '<button class="ddopt' +
      (ewoScope === "all" ? " cur" : "") +
      '" data-pick="all">All locations</button>';
    GROUPS.map(function (G, g) {
      return g;
    })
      .sort(function (a, b) {
        return GROUPS[a].o - GROUPS[b].o;
      })
      .forEach(function (g) {
        var kids = [],
          tot = 0;
        TABS.forEach(function (t, i) {
          if (t.g === g) {
            kids.push(i);
            tot += c[i];
          }
        });
        var open = !!ewoOpen[g];
        h +=
          '<button class="ddmaster" data-g="' +
          g +
          '" aria-expanded="' +
          open +
          '"><i class="chev"></i><span>' +
          esc(gname(g)) +
          '</span><span class="c">' +
          tot.toLocaleString() +
          "</span></button>";
        if (open) {
          h +=
            '<div class="ddsubs"><button class="ddopt' +
            (ewoScope === "g" + g ? " cur" : "") +
            '" data-pick="g' +
            g +
            '">All of ' +
            esc(gname(g)) +
            "</button>" +
            kids
              .map(function (i) {
                var t = TABS[i];
                return (
                  '<button class="ddopt' +
                  (ewoScope === "t" + t.id ? " cur" : "") +
                  '" data-pick="t' +
                  t.id +
                  '"><i class="dot" style="background:' +
                  t.c +
                  '"></i><span>' +
                  esc(tname(i)) +
                  '</span><span class="c">' +
                  c[i].toLocaleString() +
                  "</span></button>"
                );
              })
              .join("") +
            (kids.length ? "" : '<div class="xn">No sub-tabs yet.</div>') +
            "</div>";
        }
      });
    $("ewoMenu").innerHTML = h;
  }
  /* =====================================================================
     EWO (stock removal requests)
     ===================================================================== */
  function renderEwo() {
    document.documentElement.style.setProperty("--tab", "#3d8be0");
    $("ewoTitle").textContent = oname(1);
    renderEwoLog();
    $("ewoLabel").textContent = ewoLabel();
    $("ewoMenu").hidden = !ewoMenuOn;
    $("ewoBtn").setAttribute("aria-expanded", String(ewoMenuOn));
    if (ewoMenuOn) buildEwoMenu();
    var terms = $("ewoQ").value.toLowerCase().split(/\s+/).filter(Boolean),
      scope = ewoTabsSel();
    var emp = $("ewoEmpty"),
      wrap = $("ewoWrap");
    if (!terms.length && ewoScope === "all") {
      $("ewoRows").innerHTML = "";
      wrap.hidden = true;
      emp.hidden = false;
      emp.textContent =
        "Type in the search bar, or choose a location from the menu, to list items.";
      $("ewoN").textContent = "–";
      $("ewoNote").textContent =
        "Search all locations, or use the menu to pick a master tab and sub-tab.";
      ewoSel = null;
      updEwoSel();
      return;
    }
    var list = items.filter(function (i) {
      if (i.t < 0) return false;
      if (scope && scope.indexOf(i.t) < 0) return false;
      for (var k = 0; k < terms.length; k++) if (i.h.indexOf(terms[k]) < 0) return false;
      return true;
    });
    var vis = list.slice(0, 100);
    if (
      ewoSel &&
      !vis.some(function (i) {
        return i.id === ewoSel;
      })
    )
      ewoSel = null;
    $("ewoRows").innerHTML = vis
      .map(function (i) {
        var t = TABS[i.t];
        return (
          '<tr data-id="' +
          i.id +
          '"' +
          (ewoSel === i.id ? ' class="picked"' : "") +
          '><td class="num">' +
          esc(i.n) +
          "</td><td>" +
          esc(i.d) +
          '</td><td><span class="tag" style="--c:' +
          t.c +
          '"><i class="dot"></i>' +
          esc(tname(i.t)) +
          '</span></td><td class="loc">' +
          esc(i.l) +
          '</td><td class="num">' +
          fmtQ(Number(i.q) || 0) +
          " " +
          esc(i.u) +
          "</td></tr>"
        );
      })
      .join("");
    wrap.hidden = !vis.length;
    emp.hidden = !!vis.length;
    updEwoSel();
    emp.textContent = "No items match your search in " + ewoLabel().toLowerCase() + ".";
    $("ewoN").textContent = list.length.toLocaleString();
    $("ewoNote").textContent =
      "Showing " +
      ewoLabel() +
      (list.length > vis.length
        ? " – the first 100 matches. Narrow the search to see others."
        : ".");
  }
  $("ewoQ").addEventListener("input", renderEwo);
  $("ewoBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    ewoMenuOn = !ewoMenuOn;
    renderEwo();
  });
  $("ewoMenu").addEventListener("click", function (e) {
    e.stopPropagation();
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.g !== undefined) {
      var g = +b.dataset.g;
      ewoOpen[g] = !ewoOpen[g];
      buildEwoMenu();
      return;
    }
    if (b.dataset.pick) {
      ewoScope = b.dataset.pick;
      ewoMenuOn = false;
      renderEwo();
    }
  });
  document.addEventListener("click", function () {
    if (ewoMenuOn) {
      ewoMenuOn = false;
      $("ewoMenu").hidden = true;
      $("ewoBtn").setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ewoMenuOn) {
      ewoMenuOn = false;
      renderEwo();
    }
  });
  var ewoSel = null;
  function updEwoSel() {
    var it =
      ewoSel &&
      items.find(function (i) {
        return i.id === ewoSel;
      });
    $("ewoSelText").textContent = it
      ? "Selected: " + it.n
      : "Click an item in the list to select it.";
  }
  function fixEwos() {
    st.ewos.forEach(function (e, i) {
      if (!e.eid) e.eid = "e" + e.ts + "-" + i;
    });
  }
  function reqCell(e) {
    var l = [];
    if (e.ext) l.push("Ext. " + esc(e.ext));
    if (e.badge) l.push("Badge " + esc(e.badge));
    return (
      "<td>" +
      (e.req ? "<b>" + esc(e.req) + "</b>" : "–") +
      (l.length ? "<small>" + l.join(" · ") + "</small>" : "") +
      (e.mgr ? "<small>Manager: " + esc(e.mgr) + "</small>" : "") +
      "</td>"
    );
  }
  function ewoTableHtml(list, ro) {
    return (
      '<div class="tw"><table class="sumtbl"><thead><tr><th>Created</th><th>Item #</th><th>Description</th><th>From</th><th>Delivery Location</th><th>How much</th><th>Requester</th>' +
      (ro ? "" : "<th></th>") +
      "</tr></thead><tbody>" +
      list
        .map(function (e) {
          return (
            "<tr><td>" +
            new Date(e.ts).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }) +
            (e.edited ? "<small>edited</small>" : "") +
            '</td><td class="num">' +
            esc(e.n) +
            "</td><td>" +
            esc(e.d) +
            '</td><td class="loc">' +
            esc(e.loc) +
            "<small>" +
            esc(e.master) +
            " › " +
            esc(e.sub) +
            "</small></td><td>" +
            esc(e.to) +
            '</td><td class="num">' +
            fmtQ(e.q) +
            " " +
            esc(e.u) +
            "</td>" +
            reqCell(e) +
            (ro ? "" : '<td class="act"><button data-edit="' + e.eid + '">Edit</button></td>') +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }
  function renderEwoLog() {
    var box = $("ewoLog");
    if (!st.ewos.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML =
      '<div class="sumsec">EWOs created</div>' + ewoTableHtml(st.ewos.slice().reverse());
  }
  function renderEwosPage() {
    document.documentElement.style.setProperty("--tab", "#d92d20");
    $("ewosN").textContent = st.ewos.length.toLocaleString();
    $("ewosBody").innerHTML = st.ewos.length
      ? ewoTableHtml(st.ewos.slice().reverse())
      : '<div class="empty">No EWOs yet. Create one from the EWO section by selecting an item and choosing Create EWO.</div>';
  }
  $("ewoLog").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-edit]");
    if (b) openEwoEdit(b.dataset.edit);
  });
  $("ewosBody").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-edit]");
    if (b) openEwoEdit(b.dataset.edit);
  });
  $("ewoRows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr");
    if (!tr) return;
    ewoSel = ewoSel === tr.dataset.id ? null : tr.dataset.id;
    [].forEach.call($("ewoRows").children, function (r) {
      r.classList.toggle("picked", r.dataset.id === ewoSel);
    });
    updEwoSel();
  });
  function adjustQty(id, delta, note) {
    var cur = items.find(function (i) {
      return i.id === id;
    });
    if (!cur) return;
    var d = fieldsOf(cur),
      old = Number(d.q) || 0,
      nq = Math.max(0, r4(old + delta)),
      ch = r4(nq - old);
    if (!ch) return;
    d.q = nq;
    setItem(id, d);
    logE(cur, ch > 0 ? "add" : "sub", Math.abs(ch), { note: note });
    rebuild();
  }
  var ewoEditId = null;
  $("ewoCreate").onclick = function () {
    if (!can("qty")) {
      deny("add or edit quantities");
      return;
    }
    var it =
      ewoSel &&
      items.find(function (i) {
        return i.id === ewoSel;
      });
    if (!it) {
      toast("Click an item in the list to select it first, then choose Create EWO.");
      return;
    }
    var tb = TABS[it.t],
      f = $("ewoForm").elements,
      av = Number(it.q) || 0;
    ewoEditId = null;
    $("ewoDlgTitle").textContent = "Create EWO";
    $("ewoSubmit").textContent = "Create EWO";
    $("ewoDel").hidden = true;
    $("ewoItem").innerHTML = "<b>" + esc(it.n) + "</b> " + esc(it.d);
    f.loc.value = it.l;
    f.mst.value = tb.g >= 0 ? gname(tb.g) : "–";
    f.sub.value = tname(it.t);
    f.to.value = "";
    f.q.value = av > 0 ? 1 : 0;
    f.q.max = av;
    f.rn.value = "";
    f.ext.value = "";
    f.badge.value = "";
    f.am.value = "";
    $("ewoAvail").textContent = fmtQ(av) + " " + it.u + " available at this location.";
    $("ewoDlg").showModal();
    f.to.focus();
  };
  function openEwoEdit(eid) {
    if (!can("qty")) {
      deny("add or edit quantities");
      return;
    }
    var e = st.ewos.find(function (x) {
      return x.eid === eid;
    });
    if (!e) return;
    var cur = items.find(function (i) {
        return i.id === e.id;
      }),
      f = $("ewoForm").elements;
    ewoEditId = eid;
    $("ewoDlgTitle").textContent = "Edit EWO";
    $("ewoSubmit").textContent = "Save changes";
    $("ewoDel").hidden = false;
    $("ewoItem").innerHTML = "<b>" + esc(e.n) + "</b> " + esc(e.d);
    f.loc.value = e.loc;
    f.mst.value = e.master;
    f.sub.value = e.sub;
    f.to.value = e.to;
    f.q.value = e.q;
    f.rn.value = e.req || "";
    f.ext.value = e.ext || "";
    f.badge.value = e.badge || "";
    f.am.value = e.mgr || "";
    if (cur) {
      var av = (Number(cur.q) || 0) + (Number(e.q) || 0);
      f.q.max = av;
      $("ewoAvail").textContent =
        fmtQ(av) + " " + e.u + " can be assigned (stock on hand plus this EWO's amount).";
    } else {
      f.q.removeAttribute("max");
      $("ewoAvail").textContent = "This item is no longer listed at that location.";
    }
    $("ewoDlg").showModal();
    f.to.focus();
  }
  $("ewoCancel").onclick = function () {
    $("ewoDlg").close();
  };
  $("ewoDel").onclick = function () {
    var ge = st.ewos.find(function (x) {
      return x.eid === ewoEditId;
    });
    if (
      !ge ||
      !confirm(
        "Delete this EWO? The " +
          fmtQ(ge.q) +
          " " +
          ge.u +
          " will be returned to inventory. This cannot be undone."
      )
    )
      return;
    audit(
      "EWOs",
      "Deleted EWO for " + ge.n + " (" + fmtQ(ge.q) + " " + ge.u + " returned to inventory)"
    );
    adjustQty(ge.id, Number(ge.q) || 0, "EWO deleted");
    st.ewos = st.ewos.filter(function (x) {
      return x.eid !== ewoEditId;
    });
    save();
    $("ewoDlg").close();
    render();
    toast("EWO deleted.");
  };
  $("ewoForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var f = $("ewoForm").elements,
      q = parseFloat(f.q.value),
      to = f.to.value.trim();
    if (!to) {
      alert("Enter the delivery location.");
      ev.preventDefault();
      return;
    }
    var who = {
      req: f.rn.value.trim(),
      ext: f.ext.value.trim(),
      badge: f.badge.value.trim(),
      mgr: f.am.value.trim(),
    };
    if (!who.req) {
      alert("Enter the requester name.");
      ev.preventDefault();
      return;
    }
    if (ewoEditId) {
      var e = st.ewos.find(function (x) {
        return x.eid === ewoEditId;
      });
      if (!e) {
        alert("That EWO no longer exists.");
        ev.preventDefault();
        return;
      }
      var cur = items.find(function (i) {
          return i.id === e.id;
        }),
        mx = cur ? (Number(cur.q) || 0) + (Number(e.q) || 0) : Infinity;
      if (!(q > 0) || q > mx) {
        alert("Enter an amount above 0 and no more than " + fmtQ(mx) + ".");
        ev.preventDefault();
        return;
      }
      var diff = q - (Number(e.q) || 0);
      if (cur && diff) adjustQty(e.id, -diff, "EWO edit");
      audit(
        "EWOs",
        "Edited EWO for " +
          e.n +
          ": " +
          fmtQ(e.q) +
          " → " +
          fmtQ(q) +
          " " +
          e.u +
          ", delivery to " +
          to
      );
      e.to = to;
      e.q = q;
      Object.assign(e, who);
      e.edited = Date.now();
      save();
      render();
      toast("EWO updated.");
      return;
    }
    var it = items.find(function (i) {
      return i.id === ewoSel;
    });
    if (!it) {
      alert("That item is no longer in the list.");
      ev.preventDefault();
      return;
    }
    var av = Number(it.q) || 0;
    if (!(q > 0) || q > av) {
      alert("Enter an amount above 0 and no more than " + fmtQ(av) + ".");
      ev.preventDefault();
      return;
    }
    var ts = Date.now();
    st.ewos.push({
      eid: "e" + ts + "-" + st.ewos.length,
      ts: ts,
      id: it.id,
      n: it.n,
      d: it.d,
      u: it.u,
      loc: it.l,
      master: f.mst.value,
      sub: f.sub.value,
      to: to,
      q: q,
      req: who.req,
      ext: who.ext,
      badge: who.badge,
      mgr: who.mgr,
      by: curEmail(),
    });
    audit(
      "EWOs",
      "Created EWO: " +
        fmtQ(q) +
        " " +
        it.u +
        " of " +
        it.n +
        " for delivery to " +
        to +
        " (requester " +
        who.req +
        ")"
    );
    adjustQty(it.id, -q, "EWO");
    save();
    ewoSel = null;
    render();
    toast(
      "EWO created. " +
        fmtQ(q) +
        " " +
        it.u +
        " of " +
        it.n +
        " removed from inventory for delivery to " +
        to +
        "."
    );
  });
  var DLKEY = "wh-lookup-delivery",
    PMAX = 10,
    dl = { areas: [] },
    dlOpen = null,
    spotEd = null,
    viewRef = null,
    dlTarget = null,
    // Linked photo folder: one subfolder per button. Photos are read live, never stored in the browser.
    dlf = { cache: {}, at: {}, err: "" };
  function nid(p) {
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function stockPic(seed) {
    var s = seed * 9301 + 49297;
    function r() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    var pal = [
      ["#1d3557", "#f4a261"],
      ["#3a0ca3", "#f72585"],
      ["#0f4c5c", "#e36414"],
      ["#264653", "#e9c46a"],
      ["#432818", "#ffb703"],
      ["#14213d", "#fca311"],
      ["#2b2d42", "#ef8354"],
    ][seed % 7];
    var g =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 260'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='" +
      pal[0] +
      "'/><stop offset='1' stop-color='" +
      pal[1] +
      "'/></linearGradient></defs><rect width='400' height='260' fill='url(#g)'/>";
    g +=
      "<circle cx='" +
      Math.round(60 + r() * 280) +
      "' cy='" +
      Math.round(60 + r() * 40) +
      "' r='" +
      Math.round(26 + r() * 16) +
      "' fill='#fff' opacity='.28'/>";
    var x = -10,
      i;
    for (i = 0; i < 9; i++) {
      var w = Math.round(34 + r() * 46),
        h = Math.round(50 + r() * 90);
      g +=
        "<rect x='" +
        x +
        "' y='" +
        (205 - h) +
        "' width='" +
        w +
        "' height='" +
        h +
        "' fill='#0b1220' opacity='" +
        (0.55 + r() * 0.3).toFixed(2) +
        "'/>";
      x += w + Math.round(r() * 8);
    }
    var cx = Math.round(70 + r() * 260);
    g +=
      "<rect x='" +
      cx +
      "' y='55' width='12' height='150' fill='#0b1220'/><circle cx='" +
      (cx + 6) +
      "' cy='46' r='14' fill='#fff' opacity='.35'/><circle cx='" +
      (cx + 20) +
      "' cy='30' r='18' fill='#fff' opacity='.22'/>";
    g +=
      "<rect y='205' width='400' height='55' fill='#0b1220'/><rect y='205' width='400' height='4' fill='#fff' opacity='.18'/></svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(g);
  }
  var DLCOL = [
    ["Blue", "#2f6fe0"],
    ["Red", "#d92d20"],
    ["Grey", "#6b7280"],
    ["Orange", "#ea7a1a"],
    ["Green", "#2d9a5b"],
    ["Purple", "#8b5cf6"],
  ];
  var DLSFX = [
    "Entrance Gate",
    "Loading Dock A",
    "Loading Dock B",
    "Maintenance Shop",
    "Storage Yard",
  ];
  function starterArea(name, color, ai) {
    return {
      id: nid("a"),
      name: name,
      color: color,
      locs: DLSFX.map(function (sx, li) {
        return { id: nid("l"), name: name + " – " + sx, notes: "", pics: [stockPic(ai * 5 + li)] };
      }),
    };
  }
  function seedDl() {
    dl = {
      mig2: true,
      areas: [
        starterArea("Cold Mill", "#2f6fe0", 0),
        starterArea("Hot Strip", "#d92d20", 1),
        starterArea("BOF/Caster", "#6b7280", 2),
        starterArea("Blast Furnace", "#ea7a1a", 3),
        { id: nid("a"), name: "Out Of Plant", color: "#2d9a5b", locs: [] },
      ],
      mig3: true,
    };
  }
  function migrateDl() {
    if (!dl.mig2) {
      var col = { "cold mill": "#2f6fe0", "hot strip": "#d92d20", "bof/caster": "#6b7280" };
      dl.areas.forEach(function (a) {
        var c = col[a.name.trim().toLowerCase()];
        if (c) a.color = c;
      });
      if (
        !dl.areas.some(function (a) {
          return a.name.trim().toLowerCase() === "blast furnace";
        })
      )
        dl.areas.push(starterArea("Blast Furnace", "#ea7a1a", 3));
      dl.mig2 = true;
      saveDl();
    }
    if (!dl.mig3) {
      if (
        !dl.areas.some(function (a) {
          return a.name.trim().toLowerCase() === "out of plant";
        })
      )
        dl.areas.push({ id: nid("a"), name: "Out Of Plant", color: "#2d9a5b", locs: [] });
      dl.mig3 = true;
      saveDl();
    }
  }
  function loadDl() {
    try {
      var s = JSON.parse(localStorage.getItem(DLKEY) || "null");
      if (s && Array.isArray(s.areas)) dl = s;
    } catch (e) {}
    if (!dl.areas.length && !localStorage.getItem(DLKEY)) {
      seedDl();
      saveDl();
    }
    migrateDl();
  }
  function saveDl() {
    try {
      localStorage.setItem(DLKEY, JSON.stringify(dl));
    } catch (e) {
      alert(
        "Browser storage is full, so this change could not be saved. Remove some pictures or use Back up."
      );
    }
  }
  function findArea(id) {
    return dl.areas.find(function (a) {
      return a.id === id;
    });
  }
  function findLoc(a, id) {
    var pool = a ? a.locs.concat(dlf.cache[a.id] || []) : [];
    return pool.find(function (l) {
      return l.id === id;
    });
  }
  function dlCard(a, l, showArea) {
    var pic = l.pics[0] || stockPic(3),
      n = l.pics.length;
    return (
      '<div class="dlcard" data-a="' +
      a.id +
      '" data-l="' +
      l.id +
      '"><img src="' +
      esc(pic) +
      '" alt="' +
      esc(l.name) +
      '"><div class="dlcap"><b>' +
      esc(l.name) +
      "</b><small>" +
      (showArea ? esc(a.name) + " · " : "") +
      n +
      (n === 1 ? " photo" : " photos") +
      (l.folder ? " · from folder" : "") +
      "</small></div>" +
      (l.folder && !can("dlphotos")
        ? ""
        : '<div class="dlcb"><button data-photo>+ Photo</button></div>') +
      "</div>"
    );
  }
  /* =====================================================================
     Delivery Locations page
     ===================================================================== */
  function renderMap() {
    document.documentElement.style.setProperty("--tab", "#2f7fd1");
    var n = 0;
    dl.areas.forEach(function (a) {
      n += a.locs.length + (dlf.cache[a.id] || []).length;
    });
    $("mapN").textContent = n;
    $("dlBtns").innerHTML =
      dl.areas
        .map(function (a) {
          return (
            '<button class="dlbtn' +
            (a.id === dlOpen ? " on" : "") +
            '" data-area="' +
            a.id +
            '" style="--oc:' +
            (a.color || "#6b7280") +
            '" aria-expanded="' +
            (a.id === dlOpen) +
            '">' +
            esc(a.name) +
            "</button>"
          );
        })
        .join("") + '<button class="dlbtn dlnew" id="dlAddArea">+ Add button</button>';
    dlfRender();
    var q = $("dlQ").value.trim().toLowerCase(),
      res = $("dlResults");
    if (q) {
      var hits = [];
      dl.areas.forEach(function (a) {
        (dlf.cache[a.id] || []).concat(a.locs).forEach(function (l) {
          if ((l.name + " " + l.notes + " " + a.name).toLowerCase().indexOf(q) >= 0)
            hits.push(dlCard(a, l, true));
        });
      });
      res.innerHTML =
        '<div class="sumsec" style="padding:0 0 10px">' +
        hits.length +
        (hits.length === 1 ? " location" : " locations") +
        " found</div>" +
        (hits.length
          ? '<div class="dlgrid">' + hits.join("") + "</div>"
          : '<div class="empty" style="padding:18px 0">No delivery locations match your search.</div>');
      res.hidden = false;
    } else res.hidden = true;
    var a = findArea(dlOpen),
      menu = $("dlMenu");
    if (!a) {
      menu.hidden = true;
      return;
    }
    var old = $("dlStrip"),
      sl = old ? old.scrollLeft : 0,
      fl = dlf.cache[a.id] || [],
      all = fl.concat(a.locs),
      fnote = !cloudOn()
        ? ""
        : !dlf.at[a.id]
          ? '<p class="dlfnote">Loading cloud photos…</p>'
          : !fl.length
            ? '<p class="dlfnote">No cloud photos for “' +
              esc(a.name) +
              "” yet." +
              (can("dlphotos") ? " Use Upload photos above to add some." : "") +
              "</p>"
            : '<p class="dlfnote">Showing ' +
              fl.length +
              (fl.length === 1 ? " photo location" : " photo locations") +
              " from the cloud, plus locations added here by hand.</p>";
    menu.innerHTML =
      '<div class="dlmh"><h3>' +
      esc(a.name) +
      '</h3><span class="m">' +
      all.length +
      (all.length === 1 ? " location" : " locations") +
      '</span><span class="sp"></span><button data-act="addloc">+ Add location</button><button data-act="rename">Rename</button><button data-act="delarea" class="danger">Delete</button></div>' +
      fnote +
      (all.length
        ? '<div class="dlwrap"><button class="dlarrow l" data-dir="-1" aria-label="Scroll left">‹</button><div class="dlstrip" id="dlStrip">' +
          all
            .map(function (l) {
              return dlCard(a, l, false);
            })
            .join("") +
          '</div><button class="dlarrow r" data-dir="1" aria-label="Scroll right">›</button></div>'
        : '<div class="empty">No locations yet. Select + Add location.</div>');
    menu.hidden = false;
    var ns = $("dlStrip");
    if (ns) ns.scrollLeft = sl;
  }
  $("dlQ").addEventListener("input", renderMap);
  $("mapPanel").addEventListener("click", function (e) {
    var b = e.target.closest("button"),
      card = e.target.closest(".dlcard");
    if (b && b.dataset.area) {
      dlOpen = dlOpen === b.dataset.area ? null : b.dataset.area;
      renderMap();
      if (dlOpen) dlfScan(findArea(dlOpen));
      return;
    }
    if (b && b.id === "dlAddArea") {
      openArea(null);
      return;
    }
    if (b && b.dataset.dir) {
      var st2 = $("dlStrip");
      if (st2) st2.scrollBy({ left: b.dataset.dir * 300, behavior: "smooth" });
      return;
    }
    if (b && b.dataset.act) {
      var a = findArea(dlOpen);
      if (!a) return;
      if (b.dataset.act === "addloc") openLoc(a.id, null);
      else if (b.dataset.act === "rename") openArea(a.id);
      else if (
        b.dataset.act === "delarea" &&
        confirm(
          "Delete the “" + a.name + "” button and all " + a.locs.length + " of its locations?"
        )
      ) {
        dl.areas = dl.areas.filter(function (x) {
          return x.id !== a.id;
        });
        dlOpen = null;
        saveDl();
        renderMap();
        toast("Button deleted.");
      }
      return;
    }
    if (b && b.hasAttribute("data-photo") && card) {
      dlTarget = { a: card.dataset.a, l: card.dataset.l };
      $("dlPhotoIn").click();
      return;
    }
    if (card) viewLoc(card.dataset.a, card.dataset.l);
  });
  $("dlMenu").addEventListener(
    "wheel",
    function (e) {
      var s = e.target.closest(".dlstrip");
      if (!s) return;
      var max = s.scrollWidth - s.clientWidth,
        d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 0 : e.deltaY;
      if (max > 0 && d && ((d > 0 && s.scrollLeft < max - 1) || (d < 0 && s.scrollLeft > 0))) {
        s.scrollLeft += d;
        e.preventDefault();
      }
    },
    { passive: false }
  );

  /* ---------- Delivery Locations: photos in cloud storage (one folder per button) ----------
     Bucket "delivery-photos": "<Button>/<photo>" is one location named after the file;
     "<Button>/<Sub folder>/<photos>" is one location holding all of that folder's photos.
     Photos are shown through signed links that last an hour. Owner/admins upload. */
  var DLF_IMG = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
  function dlfKey(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // Folder names can't contain / \ : * ? " < > |, so "BOF/Caster" becomes "BOF-Caster".
  // Cloud storage only takes plain letters and a few symbols ("Invalid key" otherwise):
  // "Bob’s Café – Dock #4" becomes "Bob's Cafe - Dock 4".
  function dlfFolderName(s) {
    return String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ#]/g, "")
      .replace(/[‘’`]/g, "'")
      .replace(/[^\w!.'() &$@=;+,-]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }
  async function dlfScan(a, force) {
    if (!a || !cloudOn()) return;
    if (!force && dlf.at[a.id] && Date.now() - dlf.at[a.id] < 45 * 60000) return;
    var base = dlfFolderName(a.name),
      locs = [];
    try {
      var items = await sbList("delivery-photos", base + "/");
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.id) {
          var dir = base + "/" + it.name,
            sub = await sbList("delivery-photos", dir + "/"),
            ps = sub
              .filter(function (f) {
                return f.id && DLF_IMG.test(f.name);
              })
              .map(function (f) {
                return dir + "/" + f.name;
              }),
            note = sub.some(function (f) {
              return f.name === "notes.txt";
            })
              ? await (await sbDownload("delivery-photos", dir + "/notes.txt")).text()
              : "";
          if (ps.length || note) locs.push({ name: it.name, paths: ps, dir: dir, notes: note });
        } else if (DLF_IMG.test(it.name)) locs.push({ name: it.name.replace(/\.[^.]+$/, ""), paths: [base + "/" + it.name] });
      }
      var all = [].concat.apply(
          [],
          locs.map(function (l) {
            return l.paths;
          })
        ),
        url = all.length ? await sbSign("delivery-photos", all) : {};
      locs.sort(function (x, y) {
        return x.name.localeCompare(y.name, undefined, { numeric: true });
      });
      dlf.cache[a.id] = locs.map(function (l) {
        var paths = l.paths.filter(function (p) {
          return url[p];
        });
        return {
          id: "f:" + l.name,
          name: l.name,
          notes: l.notes || "",
          pics: paths.map(function (p) {
            return url[p];
          }),
          paths: paths,
          dir: l.dir || null,
          folder: true,
        };
      });
      dlf.at[a.id] = Date.now();
      dlf.err = "";
    } catch (x) {
      dlf.err = x instanceof TypeError ? "offline" : x.message;
    }
    if (!$("mapPanel").hidden) renderMap();
  }
  // Saves an edited cloud location as "<Button>/<Name>/" (photos + notes.txt); renames move the files.
  // ed = { paths: kept cloud paths, pics: their links followed by new pictures (data URLs) }.
  async function dlfSave(a, l, name, notes, ed) {
    var B = "delivery-photos",
      dir = dlfFolderName(a.name) + "/" + dlfFolderName(name),
      drop = l.paths.filter(function (p) {
        return ed.paths.indexOf(p) < 0;
      });
    if (l.dir && l.dir !== dir) drop.push(l.dir + "/notes.txt");
    if (!notes) drop.push(dir + "/notes.txt");
    toast("Saving to the cloud…");
    try {
      if (drop.length) await sbFetch("/storage/v1/object/" + B, { method: "DELETE", body: { prefixes: drop } });
      for (var i = 0; i < ed.paths.length; i++) {
        var to = dir + "/" + ed.paths[i].split("/").pop();
        if (ed.paths[i] !== to)
          await sbFetch("/storage/v1/object/move", {
            method: "POST",
            body: { bucketId: B, sourceKey: ed.paths[i], destinationKey: to },
          });
      }
      var news = ed.pics.slice(ed.paths.length);
      for (i = 0; i < news.length; i++)
        await sbUpload(B, dir + "/photo-" + Date.now() + "-" + i + ".jpg", await (await fetch(news[i])).blob());
      if (notes) await sbUpload(B, dir + "/notes.txt", new Blob([notes], { type: "text/plain" }));
      toast("Saved “" + dir.split("/").pop() + "”.");
    } catch (x) {
      toast("Couldn't save to the cloud: " + x.message);
    }
    await dlfScan(a, true);
  }
  function dlfRender() {
    var box = $("dlFolder");
    if (!cloudOn()) {
      box.innerHTML = '<span class="m">Sign in to see the delivery photos stored in the cloud. Photos added by hand still show.</span>';
      return;
    }
    box.innerHTML =
      '<span class="dlfname"><b>Cloud photos</b></span><span class="m">' +
      (dlf.err === "offline"
        ? "Offline: photos show again when you're back online."
        : dlf.err
          ? "Couldn't load photos: " + esc(dlf.err)
          : "Each button shows the photos in its own cloud folder.") +
      '</span><button data-dlf="refresh">Refresh</button>' +
      (can("dlphotos") ? '<button data-dlf="files">Upload photos</button><button data-dlf="dir">Upload a folder</button>' : "");
  }
  // Which button a picked folder belongs to: the folder itself, or its parent (delivery-locations).
  function dlfAreaFor(parts) {
    var byKey = function (n) {
      return dl.areas.filter(function (x) {
        return dlfKey(x.name) === dlfKey(n);
      })[0];
    };
    if (byKey(parts[0])) return { a: byKey(parts[0]), rest: parts.slice(1) };
    if (parts.length > 2 && byKey(parts[1])) return { a: byKey(parts[1]), rest: parts.slice(2) };
    var open = findArea(dlOpen);
    return open ? { a: open, rest: parts.slice(1) } : null;
  }
  $("dlFolder").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var act = b.dataset.dlf,
      open = findArea(dlOpen);
    if (act === "refresh") {
      dlf.at = {};
      if (open) dlfScan(open, true);
      else renderMap();
      return;
    }
    if (!can("dlphotos")) return;
    if (act === "files") {
      if (!open) {
        toast("Open a button first, then upload its photos.");
        return;
      }
      pickFiles("image/*", false, async function (files) {
        var jobs = files
          .filter(function (f) {
            return DLF_IMG.test(f.name);
          })
          .map(function (f) {
            return { path: dlfFolderName(open.name) + "/" + dlfFolderName(f.name), file: f };
          });
        if (!jobs.length) return toast("No photos were picked.");
        await sbUploadAll("delivery-photos", jobs, "photo");
        dlfScan(open, true);
      });
    } else if (act === "dir") {
      pickFiles("", true, async function (files) {
        var jobs = [],
          skipped = 0;
        files.forEach(function (f) {
          if (!DLF_IMG.test(f.name)) return;
          var hit = dlfAreaFor(f.webkitRelativePath.split("/"));
          if (!hit) return skipped++;
          var r = hit.rest; // [photo] or [sub folder, ..., photo]: keep one sub folder level
          jobs.push({
            path: dlfFolderName(hit.a.name) + "/" + (r.length > 1 ? dlfFolderName(r[0]) + "/" : "") + dlfFolderName(f.name),
            file: f,
          });
        });
        if (!jobs.length)
          return toast(skipped ? "None of those folders match a button name." : "No photos were found in that folder.");
        await sbUploadAll("delivery-photos", jobs, "photo");
        dlf.at = {};
        if (findArea(dlOpen)) dlfScan(findArea(dlOpen), true);
      });
    }
  });

  function openArea(id) {
    var a = id && findArea(id);
    spotEd = { area: id || null };
    $("areaTitle").textContent = a ? "Edit button" : "Add button";
    $("areaForm").elements.nm.value = a ? a.name : "";
    var cur = (a && a.color) || "#6b7280";
    $("areaColors").innerHTML = DLCOL.map(function (c) {
      return (
        '<label class="sw" style="--sw:' +
        c[1] +
        '" title="' +
        c[0] +
        '"><input type="radio" name="ac" value="' +
        c[1] +
        '"' +
        (c[1] === cur ? " checked" : "") +
        ' aria-label="' +
        c[0] +
        '"><i></i></label>'
      );
    }).join("");
    $("areaDlg").showModal();
    $("areaForm").elements.nm.focus();
  }
  $("areaCancel").onclick = function () {
    $("areaDlg").close();
  };
  $("areaForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var name = $("areaForm").elements.nm.value.trim();
    if (!name) {
      ev.preventDefault();
      return;
    }
    var a = spotEd.area && findArea(spotEd.area);
    var pick = $("areaForm").querySelector("input[name=ac]:checked"),
      col = pick ? pick.value : "#6b7280";
    if (a) {
      a.name = name;
      a.color = col;
    } else {
      var na = { id: nid("a"), name: name, color: col, locs: [] };
      dl.areas.push(na);
      dlOpen = na.id;
    }
    saveDl();
    renderMap();
  });

  function openLoc(aId, lId) {
    var a = findArea(aId),
      l = lId ? findLoc(a, lId) : null,
      f = $("spotForm").elements;
    spotEd = { a: aId, l: lId || null, pics: l ? l.pics.slice() : [], paths: l && l.folder ? l.paths.slice() : null };
    $("spotTitle").textContent = l ? "Edit location" : "Add location to " + a.name;
    f.nm.value = l ? l.name : "";
    f.notes.value = l ? l.notes : "";
    $("spotFile").value = "";
    $("spotDel").hidden = !l;
    drawThumbs();
    $("spotDlg").showModal();
    f.nm.focus();
  }
  function drawThumbs() {
    $("spotThumbs").innerHTML = spotEd.pics
      .map(function (u, i) {
        return (
          '<div class="th"><img src="' +
          esc(u) +
          '" alt="Picture ' +
          (i + 1) +
          '"><button type="button" data-rm="' +
          i +
          '" aria-label="Remove picture">×</button></div>'
        );
      })
      .join("");
  }
  function shrink(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var sc = Math.min(1, 720 / Math.max(img.width, img.height)),
          c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/jpeg", 0.65));
      };
      img.onerror = function () {
        cb(null);
      };
      img.src = r.result;
    };
    r.onerror = function () {
      cb(null);
    };
    r.readAsDataURL(file);
  }
  $("spotFile").addEventListener("change", function () {
    var files = [].slice.call(this.files),
      room = spotEd.paths ? 99 : PMAX - spotEd.pics.length; // PMAX only limits pictures kept on this device
    if (files.length > room) {
      toast("Up to " + PMAX + " pictures per location.");
      files = files.slice(0, room);
    }
    files.forEach(function (f) {
      shrink(f, function (u) {
        if (u) {
          spotEd.pics.push(u);
          drawThumbs();
        }
      });
    });
    this.value = "";
  });
  $("spotThumbs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-rm]");
    if (b) {
      spotEd.pics.splice(+b.dataset.rm, 1);
      if (spotEd.paths) spotEd.paths.splice(+b.dataset.rm, 1); // no-op for new pictures (past the end)
      drawThumbs();
    }
  });
  $("spotCancel").onclick = function () {
    $("spotDlg").close();
  };
  $("spotDel").onclick = function () {
    if (!confirm("Delete this location, with its pictures and notes?")) return;
    var a = findArea(spotEd.a),
      cl = spotEd.paths && findLoc(a, spotEd.l);
    if (cl) {
      $("spotDlg").close();
      sbFetch("/storage/v1/object/delivery-photos", {
        method: "DELETE",
        body: { prefixes: cl.paths.concat(cl.dir ? [cl.dir + "/notes.txt"] : []) },
      }).then(
        function () {
          toast("Location deleted.");
          dlfScan(a, true);
        },
        function (x) {
          toast("Couldn't delete from the cloud: " + x.message);
        }
      );
      return;
    }
    if (a)
      a.locs = a.locs.filter(function (x) {
        return x.id !== spotEd.l;
      });
    saveDl();
    $("spotDlg").close();
    renderMap();
    toast("Location deleted.");
  };
  $("spotForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var f = $("spotForm").elements,
      name = f.nm.value.trim();
    if (!name) {
      ev.preventDefault();
      return;
    }
    var a = findArea(spotEd.a),
      l = spotEd.l ? findLoc(a, spotEd.l) : null;
    if (l && l.folder) {
      dlfSave(a, l, name, f.notes.value.trim(), spotEd);
      return;
    }
    if (l) {
      l.name = name;
      l.notes = f.notes.value.trim();
      l.pics = spotEd.pics;
    } else if (a)
      a.locs.push({ id: nid("l"), name: name, notes: f.notes.value.trim(), pics: spotEd.pics });
    saveDl();
    renderMap();
    toast("Saved “" + name + "”.");
  });

  function viewLoc(aId, lId) {
    var a = findArea(aId),
      l = findLoc(a, lId);
    if (!l) return;
    viewRef = { a: aId, l: lId };
    // Cloud photos: only people with "Edit Delivery Locations photos" can change them (storage rules).
    $("viewAdd").hidden = $("viewEdit").hidden = !!l.folder && !can("dlphotos");
    $("viewBody").innerHTML =
      '<div class="vlabel" style="margin:0 0 4px">' +
      esc(a.name) +
      "</div><h2>" +
      esc(l.name) +
      "</h2>" +
      (l.pics.length
        ? '<div class="vpics">' +
          l.pics
            .map(function (u, i) {
              return (
                '<img src="' +
                esc(u) +
                '" alt="Picture ' +
                (i + 1) +
                " of " +
                esc(l.name) +
                '" data-big="' +
                i +
                '">'
              );
            })
            .join("") +
          "</div>"
        : '<p class="vnone">No pictures added.</p>') +
      '<div class="vlabel">Notes</div><p class="vnotes">' +
      (l.notes ? esc(l.notes) : "No notes.") +
      "</p>";
    if (!$("viewDlg").open) $("viewDlg").showModal();
  }
  $("viewBody").addEventListener("click", function (e) {
    var im = e.target.closest("img[data-big]");
    if (!im) return;
    $("imgBig").src = im.src;
    $("imgDlg").showModal();
  });
  $("imgDlg").addEventListener("click", function () {
    this.close();
  });
  $("viewClose").onclick = function () {
    $("viewDlg").close();
  };
  $("viewEdit").onclick = function () {
    $("viewDlg").close();
    openLoc(viewRef.a, viewRef.l);
  };
  $("viewAdd").onclick = function () {
    dlTarget = { a: viewRef.a, l: viewRef.l };
    $("dlPhotoIn").click();
  };
  $("dlPhotoIn").addEventListener("change", function () {
    var tg = dlTarget,
      a = tg && findArea(tg.a),
      l = tg && findLoc(a, tg.l),
      files = [].slice.call(this.files);
    this.value = "";
    if (!l || !files.length) return;
    var room = l.folder ? 99 : PMAX - l.pics.length,
      news = [];
    if (files.length > room) {
      toast("Up to " + PMAX + " pictures per location.");
      files = files.slice(0, room);
    }
    var left = files.length;
    if (!left) return;
    files.forEach(function (f) {
      shrink(f, function (u) {
        if (u) (l.folder ? news : l.pics).push(u);
        if (--left > 0) return;
        if (l.folder)
          return dlfSave(a, l, l.name, l.notes, { paths: l.paths, pics: l.pics.concat(news) }).then(function () {
            if ($("viewDlg").open && findLoc(a, tg.l)) viewLoc(tg.a, tg.l);
          });
        saveDl();
        renderMap();
        if ($("viewDlg").open) viewLoc(tg.a, tg.l);
        toast("Picture added.");
      });
    });
  });

  var ctEdit = null;
  /* =====================================================================
     Important Contacts page
     ===================================================================== */
  function renderContacts() {
    document.documentElement.style.setProperty("--tab", "#f5b335");
    $("ctTitle").textContent = sname(1);
    var list = st.contacts.slice().sort(function (a, b) {
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
    $("ctN").textContent = list.length;
    $("ctWrap").hidden = !list.length;
    $("ctEmpty").hidden = !!list.length;
    $("ctRows").innerHTML = list
      .map(function (c) {
        return (
          '<tr><td class="cname">' +
          esc(c.name) +
          "</td><td>" +
          (esc(c.dept) || "–") +
          '</td><td class="ph">' +
          (esc(c.phone) || "–") +
          '</td><td class="ph">' +
          (esc(c.ext) || "–") +
          '</td><td class="ph">' +
          (esc(c.fax) || "–") +
          '</td><td class="act"><button data-edit="' +
          c.id +
          '">Edit</button></td></tr>'
        );
      })
      .join("");
  }
  function openContact(id) {
    if (!can("contacts")) {
      deny("add or edit contacts");
      return;
    }
    var c = id
        ? st.contacts.find(function (x) {
            return x.id === id;
          })
        : null,
      f = $("ctForm").elements;
    ctEdit = id || null;
    $("ctDlgTitle").textContent = c ? "Edit contact" : "Add contact";
    f.nm.value = c ? c.name : "";
    f.dept.value = c ? c.dept : "";
    f.ph.value = c ? c.phone : "";
    f.ext.value = c ? c.ext || "" : "";
    f.fax.value = c ? c.fax : "";
    $("ctDel").hidden = !c;
    $("ctDlg").showModal();
    f.nm.focus();
  }
  $("ctAdd").onclick = function () {
    openContact(null);
  };
  $("ctRows").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-edit]");
    if (b) openContact(b.dataset.edit);
  });
  $("ctCancel").onclick = function () {
    $("ctDlg").close();
  };
  $("ctDel").onclick = function () {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    var dc = st.contacts.find(function (x) {
      return x.id === ctEdit;
    });
    audit("Contacts", "Deleted contact " + (dc ? dc.name : ""));
    st.contacts = st.contacts.filter(function (x) {
      return x.id !== ctEdit;
    });
    save();
    $("ctDlg").close();
    renderContacts();
    toast("Contact deleted.");
  };
  $("ctForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var f = $("ctForm").elements,
      name = f.nm.value.trim();
    if (!name) {
      ev.preventDefault();
      return;
    }
    var d = {
      name: name,
      dept: f.dept.value.trim(),
      phone: f.ph.value.trim(),
      ext: f.ext.value.trim(),
      fax: f.fax.value.trim(),
    };
    var c = ctEdit
      ? st.contacts.find(function (x) {
          return x.id === ctEdit;
        })
      : null;
    if (c) Object.assign(c, d);
    else {
      d.id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      st.contacts.push(d);
    }
    audit("Contacts", (c ? "Edited" : "Added") + " contact " + name);
    save();
    renderContacts();
    toast("Saved “" + name + "”.");
  });
  var PERMS = [
    ["qty", "Add or edit quantities"],
    ["tabs", "Add or remove master/sub tabs"],
    ["summary", "Create summaries"],
    ["contacts", "Add or edit important contacts"],
    ["greens", "Use Greens Management"],
    ["additem", "Add new items", 1],
    ["pkedit", "Edit submitted pick lists", 1],
    ["dlphotos", "Edit Delivery Locations photos", 1],
    ["grapprove", "Approve Greens transfers", 1],
    ["grdel", "Delete Greens count sheets and transfers", 1],
    ["inspall", "View everyone's inspection sheets", 1],
  ];
  var ROLE_LABEL = { owner: "Owner", admin: "Admin", user: "User" };
  /* =====================================================================
     Login, roles and permissions
     ===================================================================== */
  var sess = null,
    mgTab = "users",
    userEd = null,
    mgOpt = -1, // -1: no option open, every Manage button showing
    MGOPTS = [
      "Add/Edit user",
      "View Delivery Manifests",
      "Templates",
      "Picks and Put Away",
      "Inspection Sheets",
      "Analytics",
      "Greens Management",
    ],
    // Left-to-right order of the Manage buttons (indexes into MGOPTS; mgOpt stays the index).
    MGORDER = [0, 1, 2, 3, 4, 6, 5],
    // Short descriptions shown under each Manage option.
    MGTIPS = [
      "Add people, change their access, and choose what each person is allowed to do.",
      "See every delivery (EWO) created on a chosen day, grouped by the person who made it.",
      "Upload PDF forms to keep as guides and use as inspection sheet templates.",
      "Submitted pick lists, plus who added, removed or moved stock on a chosen day, with a 7-day view per person.",
      "Finished inspection sheets, plus the inspection PDFs stored in the cloud.",
      "The top 10 departments that order on pick lists, and the top 10 items they order, this month and last month.",
      "See what each location holds, count greens, and transfer them between locations.",
    ],
    MGICONS = [
      '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
      '<rect x="2" y="7" width="13" height="9" rx="1"/><path d="M15 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
      '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
      '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 12l2 2 4-4"/>',
      '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
      '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19c3-4 6-7 10-9"/>',
    ];
  // Signed-in person (cloud account). Kept on the device so people stay signed in.
  try {
    sess = JSON.parse(localStorage.getItem("wh-session") || "null");
  } catch (e) {}
  function setSess(s) {
    sess = s;
    try {
      if (s) localStorage.setItem("wh-session", JSON.stringify(s));
      else localStorage.removeItem("wh-session");
    } catch (e) {}
  }
  // The person's cloud profile; falls back to the session copy until profiles have loaded.
  function curRec() {
    if (!sess) return null;
    return (
      st.users.find(function (u) {
        return u.email === sess.email;
      }) || { id: sess.uid, email: sess.email, name: sess.name, role: sess.role, perms: sess.perms }
    );
  }
  function myRole() {
    var r = curRec();
    return r ? r.role : null;
  }
  function isOwner() {
    return myRole() === "owner";
  }
  function isMgr() {
    var r = myRole();
    return r === "owner" || r === "admin";
  }
  function permsOf(u) {
    var p = {};
    PERMS.forEach(function (k) {
      p[k[0]] = u.role === "owner" || (k[2] && u.role === "admin") ? true : u.perms ? !!u.perms[k[0]] : u.role === "admin";
    });
    return p;
  }
  function can(k) {
    var r = curRec();
    return !!r && permsOf(r)[k];
  }
  function canManage(u) {
    var me = myRole();
    return me === "owner" ? u.role !== "owner" : me === "admin" && u.role === "user";
  }
  function deny(what) {
    toast(
      sess
        ? "You do not have permission to " + what + ". Ask an administrator."
        : "Sign in with an account that has permission to " + what + "."
    );
  }
  function renderAuth() {
    var r = curRec();
    if (r && (sess.role !== r.role || JSON.stringify(sess.perms) !== JSON.stringify(r.perms))) {
      sess.role = r.role;
      sess.perms = r.perms;
      setSess(sess);
    }
    $("whoami").textContent = "";
    var cl = document.body.classList;
    cl.toggle("noqty", !can("qty"));
    cl.toggle("notabs", !can("tabs"));
    cl.toggle("nosum", !can("summary"));
    cl.toggle("noct", !can("contacts"));
    cl.toggle("nogreens", !can("greens"));
    cl.toggle("nomgr", !isMgr()); // hides Back up, Restore, Export CSV
    cl.toggle("noadd", !can("additem")); // hides Add item
    applyDark();
    updateProfileBtn();
  }
  /* ---------- Dark mode: a per-person setting stored on their profile (st.profiles[email].dark) ---------- */
  function applyDark() {
    var on = !!(sess && profOf(sess.email).dark);
    document.documentElement.classList.toggle("dark", on);
    $("darkSwitch").setAttribute("aria-checked", String(on));
  }
  $("darkSwitch").addEventListener("click", function () {
    if (!sess) return;
    var root = document.documentElement;
    st.profiles[sess.email] = Object.assign({}, profOf(sess.email), {
      dark: !profOf(sess.email).dark,
    });
    save();
    cloudSavePrefs();
    root.classList.add("dm-fade");
    this.classList.add("moved");
    applyDark();
    setTimeout(function () {
      root.classList.remove("dm-fade");
    }, 450);
  });
  $("darkSwitch").addEventListener("animationend", function () {
    this.classList.remove("moved");
  });
  /* ---------- Profiles: nickname, bio and photo for every signed-in user ---------- */
  function profOf(email) {
    return (st.profiles && st.profiles[email]) || {};
  }
  // An open Greens count (new count, Edit counts or transfer) is kept on the person's profile as grDraft,
  // so it can be finished on another device. This device's unsent change wins; otherwise the cloud's does.
  function grDraftOut() {
    if (!sess || !st.profiles) return;
    var d = st.grCount || null;
    if (JSON.stringify(d) === JSON.stringify(profOf(sess.email).grDraft || null)) return;
    st.profiles[sess.email] = Object.assign({}, profOf(sess.email), { grDraft: d });
    try {
      localStorage.setItem("wh-prefs-dirty", "1");
    } catch (x) {}
  }
  function grDraftIn() {
    if (!sess || localStorage.getItem("wh-prefs-dirty")) return false;
    var d = profOf(sess.email).grDraft || null;
    if (JSON.stringify(d) === JSON.stringify(st.grCount || null)) return false;
    st.grCount = d;
    grMsg = "";
    return true;
  }
  function initialsOf(name) {
    var p = String(name || "?")
      .replace(/@.*$/, "")
      .split(/[\s._-]+/)
      .filter(Boolean);
    return (
      (p[0] || "?").charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")
    ).toUpperCase();
  }
  function avatarHtml(email, name, size) {
    var pr = profOf(email);
    return (
      '<span class="avatar' +
      (size ? " " + size : "") +
      '">' +
      (pr.pic ? '<img alt="" src="' + pr.pic + '">' : esc(initialsOf(name))) +
      "</span>"
    );
  }
  function updateProfileBtn() {
    var b = $("profileBtn");
    if (!sess) {
      b.hidden = true;
      b.innerHTML = "";
      return;
    }
    var pr = profOf(sess.email),
      label = pr.nick || String(sess.name || sess.email).split(/\s+/)[0];
    b.hidden = false;
    b.innerHTML = avatarHtml(sess.email, sess.name) + '<span class="pl">' + esc(label) + "</span>";
    b.title = "Your profile · " + sess.email + " (" + ROLE_LABEL[sess.role] + ")";
  }
  var pfPic = "";
  function pfShowPic() {
    $("pfPic").innerHTML =
      '<span class="avatar lg">' +
      (pfPic ? '<img alt="" src="' + pfPic + '">' : esc(initialsOf(sess ? sess.name : "?"))) +
      "</span>";
    $("pfRemove").disabled = !pfPic;
  }
  function openProfile() {
    if (!sess) {
      toast("Sign in to edit your profile.");
      return;
    }
    var pr = profOf(sess.email),
      f = $("profForm");
    pfPic = pr.pic || "";
    // Owners and admins set their own full name; a manager sets everyone else's (the cloud enforces this).
    f.elements.fullname.value = sess.name && sess.name !== sess.email ? sess.name : "";
    f.elements.fullname.disabled = !isMgr();
    $("pfNameNote").textContent = isMgr() ? "" : "(a manager can change it)";
    f.elements.nick.value = pr.nick || "";
    f.elements.bio.value = pr.bio || "";
    $("pfWho").innerHTML =
      "<b>" + esc(sess.name || sess.email) + "</b><span>" + esc(sess.email) + " · " + ROLE_LABEL[sess.role] + "</span>";
    $("pfMsg").textContent = "";
    $("pfCount").textContent = f.elements.bio.value.length + " / 500";
    pfShowPic();
    pfWorkSel = null;
    renderPfWork();
    $("profileBtn").classList.add("on");
    $("profDlg").showModal();
  }
  $("profileBtn").onclick = openProfile;

  /* ---------- Your profile: the person's own EWOs, pick lists, put aways and delivery trips ---------- */
  var pfWorkSel = null;
  function pfMine(i) {
    var me = sess && sess.email;
    if (i === 1)
      return st.ewos.filter(function (e) {
        return e.by === me;
      });
    if (i === 4)
      return st.manifests.filter(function (m) {
        return m.by === me;
      });
    if (i === 2)
      return (st.audit || []).filter(function (e) {
        return e.pick && !e.pick.of && e.by === me;
      });
    if (i === 5) return grSheets(me);
    if (i === 6)
      return (st.audit || []).filter(function (e) {
        return e.ms && e.by === me;
      });
    if (i === 7)
      return inspAll().filter(function (r) {
        return r.by === me || can("inspall");
      });
    return null; // Put Away isn't built yet, so nobody has records there.
  }
  function pfName(i) {
    return i === 5 ? "Green Count" : i === 6 ? "Master sheets" : i === 7 ? "Inspections" : oname(i);
  }
  function renderPfWork() {
    $("pfActs").innerHTML = [1, 2, 3, 4, 5, 6, 7]
      .map(function (i) {
        var l = pfMine(i);
        return (
          '<button type="button" role="tab" data-pfw="' +
          i +
          '" aria-selected="' +
          (pfWorkSel === i) +
          '">' +
          esc(pfName(i)) +
          '<span class="c">' +
          (l ? l.length : "–") +
          "</span></button>"
        );
      })
      .join("");
    var box = $("pfWork");
    box.hidden = !pfWorkSel;
    if (!pfWorkSel) return;
    var name = esc(pfName(pfWorkSel)),
      l = (pfMine(pfWorkSel) || []).slice().reverse();
    if (pfWorkSel === 3) {
      box.innerHTML = '<div class="empty">' + name + " isn't set up yet, so there's nothing to show.</div>";
    } else if (pfWorkSel === 5) {
      box.innerHTML = grSheetsHtml(l, true);
    } else if (!l.length) {
      box.innerHTML = '<div class="empty">You have no ' + name + " records yet.</div>";
    } else if (pfWorkSel === 7) {
      box.innerHTML =
        '<div class="tw"><table class="sumtbl grsheets"><thead><tr><th>Sheet</th><th>Date</th><th>Finished</th><th></th></tr></thead><tbody>' +
        l
          .map(function (r) {
            return (
              '<tr><td class="cname">' + esc(r.tplName) + (r.equipment ? "<small>Equip. " + esc(r.equipment) + "</small>" : "") +
              (r.by !== curEmail() ? "<small>By " + esc(whoName(r.by) || r.by) + "</small>" : "") +
              "</td><td>" + esc(r.date || "–") + "</td><td>" + dvWhen(r.ts) +
              '</td><td class="act"><button type="button" data-inspv="' + esc(r.id) + '">View</button><button type="button" data-inspv="' + esc(r.id) +
              '" data-inspdl="1">Download</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
    } else if (pfWorkSel === 6) {
      box.innerHTML =
        '<div class="tw"><table class="sumtbl grsheets"><thead><tr><th>Master sheet</th><th>QR codes</th><th></th></tr></thead><tbody>' +
        l
          .map(function (e) {
            return (
              '<tr><td class="cname">' + dvWhen(e.ts) + '</td><td class="ph">' + e.ms.codes.length +
              '</td><td class="act"><button type="button" data-msview="' + esc(e.k) + '">View</button><button type="button" data-msview="' + esc(e.k) +
              '" data-msprint="1">Print</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
    } else if (pfWorkSel === 1) {
      box.innerHTML = ewoTableHtml(l, true);
    } else if (pfWorkSel === 2) {
      box.innerHTML =
        '<div class="tw"><table class="sumtbl"><thead><tr><th>Pick slip</th><th>Lines</th><th>Submitted</th><th></th></tr></thead><tbody>' +
        l
          .map(function (e) {
            var s = e.pick;
            return (
              '<tr><td class="cname">' +
              esc(s.no || s.name) +
              (s.date ? "<small>printed " + esc(s.date) + "</small>" : "") +
              '</td><td class="ph">' +
              s.rows.length +
              (Object.keys(s.prob || {}).length ? " · " + Object.keys(s.prob).length + (Object.keys(s.prob).length === 1 ? " problem" : " problems") : "") +
              "</td><td>" +
              dvWhen(e.ts) +
              '</td><td class="act"><button type="button" data-pkview="' +
              esc(e.k) +
              '">View</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
    } else {
      box.innerHTML =
        '<div class="tw"><table class="sumtbl"><thead><tr><th>Trip</th><th>Status</th><th>Receipts</th><th>Started</th><th></th></tr></thead><tbody>' +
        l
          .map(function (m) {
            return (
              '<tr><td class="cname">' +
              dvTripName(m) +
              "<small>" +
              esc(m.no) +
              "</small></td><td>" +
              dvChip(m) +
              '</td><td class="ph">' +
              m.lines.length +
              " · " +
              dvBoxes(m.lines) +
              " boxes</td><td>" +
              dvWhen(m.ts) +
              '</td><td class="act"><button type="button" data-pfopen="' +
              m.id +
              '">Open</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
    }
  }
  $("pfActs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-pfw]");
    if (!b) return;
    var i = +b.dataset.pfw;
    pfWorkSel = pfWorkSel === i ? null : i;
    renderPfWork();
  });
  // "Open" on a trip jumps to it in the Delivery tab.
  $("pfWork").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-pfopen]");
    if (!b) return;
    $("profDlg").close();
    dvId = b.dataset.pfopen;
    dvView = "trip";
    dvFlash = "";
    dvSel = null;
    st.manage = false;
    st.side = null;
    st.top = 4;
    render();
  });
  $("profDlg").addEventListener("close", function () {
    $("profileBtn").classList.remove("on");
  });
  $("pfCancel").onclick = function () {
    $("profDlg").close();
  };
  $("pfUpload").onclick = function () {
    $("pfFile").click();
  };
  $("pfRemove").onclick = function () {
    pfPic = "";
    pfShowPic();
  };
  $("profForm").elements.bio.addEventListener("input", function () {
    $("pfCount").textContent = this.value.length + " / 500";
  });
  $("pfFile").addEventListener("change", async function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    try {
      var bm = await createImageBitmap(file),
        side = Math.min(bm.width, bm.height),
        c = document.createElement("canvas");
      c.width = c.height = 256;
      var cx = c.getContext("2d");
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, 256, 256);
      cx.drawImage(bm, (bm.width - side) / 2, (bm.height - side) / 2, side, side, 0, 0, 256, 256);
      pfPic = c.toDataURL("image/jpeg", 0.85);
      $("pfMsg").textContent = "";
      pfShowPic();
    } catch (e) {
      $("pfMsg").textContent = "That file could not be read as a picture. Try a JPG or PNG.";
    }
  });
  $("profForm").addEventListener("submit", function () {
    if (!sess) return;
    var f = this.elements;
    // Keep other profile settings (like dark mode) that this form doesn't edit.
    st.profiles[sess.email] = Object.assign({}, profOf(sess.email), {
      nick: f.nick.value.trim(),
      bio: f.bio.value.trim(),
      pic: pfPic,
    });
    var nm = f.fullname.value.trim(),
      setName = function () {
        sess.name = nm;
        setSess(sess);
        var u = st.users.find(function (x) {
          return x.id === sess.uid;
        });
        if (u) u.name = nm;
        save();
        updateProfileBtn();
        renderLogin();
      };
    if (isMgr() && nm && nm !== sess.name) {
      if (cloudOn())
        cloudPatchProfile(sess.uid, { name: nm }).then(setName, function () {
          toast("Couldn't save your name to the cloud. Check your signal and try again.");
        });
      else setName();
    }
    save();
    cloudSavePrefs();
    updateProfileBtn();
    renderLogin();
    toast("Profile saved.");
  });

  function renderLogin() {
    document.documentElement.style.setProperty("--tab", "#f5b335");
    var b = $("lgBody"),
      r = curRec();
    $("lgH").textContent = sess && r ? "Your account" : "Log in";
    $("lgP").textContent = sess && r ? "You're signed in on this device." : "Sign in with your email and password.";
    if (sess && r) {
      b.innerHTML =
        '<div class="lgacct"><div class="lgid"><div class="lgprof">' +
        avatarHtml(sess.email, sess.name, "lg") +
        '<div><div class="lgname">' +
        esc(sess.name) +
        "</div>" +
        (profOf(sess.email).nick
          ? '<div class="lgnick">“' + esc(profOf(sess.email).nick) + "”</div>"
          : "") +
        '<div class="lgmail">' +
        esc(sess.email) +
        '</div><div class="lgrole">' +
        ROLE_LABEL[r.role] +
        "</div></div></div>" +
        (profOf(sess.email).bio
          ? '<div class="lgbio">' + esc(profOf(sess.email).bio) + "</div>"
          : "") +
        '</div><div class="lgcan"><h3>What you can do</h3><ul>' +
        PERMS.map(function (k) {
          var y = can(k[0]);
          return (
            '<li class="' + (y ? "yes" : "no") + '">' +
            (y ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>') +
            "<span>" +
            esc(k[1]) +
            (y ? "" : "<small>Ask a manager if you need this.</small>") +
            "</span></li>"
          );
        }).join("") +
        '</ul></div><div class="lgbtns">' +
        '<button id="lgProfile">Edit profile</button>' +
        (isMgr() ? '<button id="lgManage" class="lgmg">Open Manage</button>' : "") +
        '<span class="sp"></span><button id="lgOut">Sign out</button></div></div>';
      return;
    }
    b.innerHTML =
      '<form class="lgcard" id="lgForm"><label>Email<input name="em" type="email" required autocomplete="username"></label><label>Password<input name="pw" type="password" required autocomplete="current-password"></label><p class="lgerr" id="lgErr" role="alert"></p><button class="primary lgsubmit">Sign in</button></form>';
  }
  // Landing: shown on load to anyone not signed in, until they sign in or choose to browse.
  // Guests get their own page (items and locations only) instead of the app.
  function cover() {
    var up = !$("landing").hidden || !$("guest").hidden;
    document.querySelector(".app").inert = up;
    document.querySelector(".gcw").inert = up;
    document.body.classList.toggle("onland", up);
  }
  function landing(on) {
    if (!on && $("ldDlg").open) $("ldDlg").close();
    $("landing").hidden = !on;
    cover();
  }
  function guestPage(on) {
    try {
      if (on) sessionStorage.setItem("wh-guest", "1");
      else sessionStorage.removeItem("wh-guest");
    } catch (e) {}
    $("guest").hidden = !on;
    cover();
    if (on) renderGuest();
  }
  var GMAX = 100;
  function gloc(i) {
    if (i.t < 0) return "";
    var t = tname(i.t),
      g = gname(TABS[i.t].g);
    return t.indexOf(g) === 0 ? t : g + ", " + t;
  }
  function renderGuest() {
    var raw = $("gq").value.trim(),
      terms = raw.toLowerCase().split(/\s+/).filter(Boolean),
      list = [],
      n = 0;
    items.forEach(function (i) {
      var h = (i.n + " " + i.d + " " + i.l).toLowerCase(); // not i.h: that includes private notes
      for (var k = 0; k < terms.length; k++) if (h.indexOf(terms[k]) < 0) return;
      n++;
      if (list.length < GMAX) list.push(i);
    });
    $("gN").textContent = n.toLocaleString() + (n === 1 ? " item" : " items");
    $("gRows").innerHTML = list
      .map(function (i) {
        return (
          '<tr><td class="gnum">' + esc(i.n) + "</td><td>" + esc(i.d) + "</td><td>" + esc(gloc(i)) +
          '</td><td class="glc">' + esc(i.l) + "</td></tr>"
        );
      })
      .join("");
    $("gMore").textContent = !n
      ? terms.length
        ? "No items match “" + raw + "”. Try fewer words, or just the item number."
        : "No items to show yet."
      : n > GMAX
        ? "Showing the first " + GMAX + " of " + n.toLocaleString() + ". Add words to narrow the search."
        : "";
  }
  $("gq").addEventListener("input", renderGuest);
  function ldLogin() {
    $("ldDlg").showModal();
    $("ldForm").elements.em.focus();
  }
  $("landing").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ldguest], [data-ldlogin], #ldX");
    if (!b) return;
    if (b.id === "ldX") $("ldDlg").close();
    else if (b.hasAttribute("data-ldlogin")) ldLogin();
    else {
      landing(false);
      guestPage(true);
      $("gq").focus();
    }
  });
  $("gSign").onclick = function () {
    guestPage(false);
    landing(true);
    ldLogin();
  };
  if (!sess) {
    var wasGuest = false;
    try {
      wasGuest = !!sessionStorage.getItem("wh-guest");
    } catch (e) {}
    if (wasGuest) guestPage(true);
    else landing(true);
  }
  // Same sign-in for the Log in panel and the landing form.
  async function signInSubmit(e) {
    e.preventDefault();
    var f = e.target.elements,
      err = e.target.querySelector(".lgerr"),
      btn = e.target.querySelector("button");
    err.textContent = "Signing in…";
    btn.disabled = true;
    try {
      await cloudSignIn(f.em.value.trim().toLowerCase(), f.pw.value);
    } catch (x) {
      btn.disabled = false;
      err.textContent =
        x.code === "invalid_credentials"
          ? "Incorrect email or password."
          : navigator.onLine === false || x instanceof TypeError
            ? "No internet connection. Signing in needs a connection the first time."
            : "Couldn't sign in: " + x.message;
      f.pw.value = "";
      f.pw.focus();
      return;
    }
    btn.disabled = false;
    err.textContent = "";
    // Offer to save the log-in in the browser's password manager (Chrome, Edge, Android). Safari offers on its own from the form.
    if (window.PasswordCredential)
      try {
        navigator.credentials.store(new PasswordCredential({ id: f.em.value.trim().toLowerCase(), password: f.pw.value })).catch(function () {});
      } catch (x) {}
    f.pw.value = "";
    landing(false);
    render();
    toast("Signed in as " + sess.email + ".");
  }
  $("lgBody").addEventListener("submit", signInSubmit);
  $("ldForm").addEventListener("submit", signInSubmit);
  $("lgBody").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.id === "lgOut") {
      cloudSignOut();
      render();
      toast("Signed out.");
    } else if (b.id === "lgProfile") openProfile();
    else if (b.id === "lgManage") $("manageBtn").click();
  });
  $("manageBtn").onclick = function () {
    st.manage = true;
    st.top = null;
    st.side = null;
    ewoMenuOn = false;
    render();
  };
  $("mgGo").onclick = function () {
    st.manage = false;
    st.side = 0;
    render();
  };

  function roleOptions() {
    return isOwner()
      ? [
          ["user", "User"],
          ["admin", "Admin"],
        ]
      : [["user", "User"]];
  }
  function sortedUsers() {
    return st.users.slice().sort(function (a, b) {
      return (a.name || a.email).toLowerCase() < (b.name || b.email).toLowerCase() ? -1 : 1;
    });
  }
  /* =====================================================================
     Manage page: users, permissions, delivery manifests, material transactions
     ===================================================================== */
  // Live line on each Manage tile: [big number, words, needs attention].
  function mgStatus(i) {
    var today = dayOf(Date.now()),
      n;
    if (i === 0) {
      n = st.users.filter(function (u) {
        return u.role !== "user";
      }).length;
      return [st.users.length, (st.users.length === 1 ? "person, " : "people, ") + n + " can manage"];
    }
    if (i === 1) {
      n = (st.manifests || []).filter(function (m) {
        return m.status === "submitted" && dayOf(m.subTs) === today;
      }).length;
      return [n, n === 1 ? "trip submitted today" : "trips submitted today"];
    }
    if (i === 2) return [st.tpl.length, "saved on this device"];
    if (i === 3) {
      n = st.audit.filter(function (e) {
        return isSubm(e) && dayOf(e.ts) === today;
      }).length;
      return [n, "submitted today"];
    }
    if (i === 4) {
      var td = inspAll().filter(function (r) {
          return visibleP(r.by) && dayOf(r.ts) === today;
        }),
        no = td.filter(function (r) {
          return r.counts && r.counts.no;
        }).length;
      return no ? [no, (no === 1 ? "sheet" : "sheets") + " with a No today", true] : [td.length, "finished today"];
    }
    if (i === 6) {
      var ns = grSheets().length;
      return [ns, ns === 1 ? "count sheet" : "count sheets"];
    }
    if (i === 5) {
      var np = anStats(anRange(0)).slips.length;
      return [np, (np === 1 ? "pick list" : "pick lists") + " this month"];
    }
    return ["", "Coming soon"];
  }
  /* ---------- Analytics: who orders what, from submitted pick lists ----------
     Full-screen on desktop. A department is the pick slip's "Deliver to" (36K-xxxx gives xxxx).
     Departments are ranked by pick slip lines ordered; their items by quantity picked (or allocated).
     Sidebar and top-bar links open the matching page of the app. */
  var anTab = 0, // AN_TABS index
    anFold = false, // ring/bar row folded away
    anRet = false, // left Analytics through one of its links: show "Back to Analytics"
    anSideOff = false, // sidebar hidden (menu button)
    anTxt = {}, // text behind each Copy button
    AN_TABS = ["This month", "Previous month", "Last 3 months", "This year", "All time", "Activity", "Problems"],
    AN_NAV = [
      ["Main", [["items", "Items", MGICONS[5]], ["top:2", "Pick list", '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'], ["top:3", "Put away", MGICONS[3]], ["top:4", "Delivery", MGICONS[1]], ["top:6", "Greens", MGICONS[6]]]],
      ["Admin", [["opt:0", "Users", MGICONS[0]], ["side:2", "Delivery locations", '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'], ["opt:1", "Manifests", MGICONS[1]], ["opt:2", "Templates", MGICONS[2]], ["opt:4", "Inspection sheets", MGICONS[4]]]],
    ];
  function anIc(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  function anRange(i) {
    var d = new Date(),
      y = d.getFullYear(),
      mo = d.getMonth();
    return [
      [new Date(y, mo, 1), new Date(y, mo + 1, 1)],
      [new Date(y, mo - 1, 1), new Date(y, mo, 1)],
      [new Date(y, mo - 2, 1), new Date(y, mo + 1, 1)],
      [new Date(y, 0, 1), new Date(y + 1, 0, 1)],
      [null, new Date(y, mo + 1, 1)],
    ][Math.min(i, 4)];
  }
  // Every submitted pick list, newest first: its newest version, dated by the first submission (edits point back with pick.of).
  function anSlips() {
    var first = {},
      last = {};
    (st.audit || []).forEach(function (x) {
      if (!x.pick) return;
      var k = x.pick.of || x.k;
      if (!first[k] || x.ts < first[k].ts) first[k] = x;
      if (!last[k] || x.ts > last[k].ts) last[k] = x;
    });
    return Object.keys(first)
      .map(function (k) {
        return { k: k, ts: first[k].ts, by: first[k].by, p: last[k].pick };
      })
      .sort(function (a, b) {
        return b.ts - a.ts;
      });
  }
  function anTop(o) {
    return Object.keys(o)
      .map(function (k) {
        return [k, o[k]];
      })
      .sort(function (a, b) {
        return b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
      })
      .slice(0, 10);
  }
  function anStats(r) {
    var all = anSlips(),
      old = all.length ? new Date(all[all.length - 1].ts) : new Date(),
      from = +(r[0] || new Date(old.getFullYear(), old.getMonth(), 1)),
      to = +r[1],
      slips = all.filter(function (s) {
        return s.ts >= from && s.ts < to;
      }),
      dep = {},
      by = {},
      rows = [],
      a = { from: from, to: to, slips: slips, filled: 0, alloced: 0, qty: 0, probs: 0 };
    slips.forEach(function (s) {
      by[s.by || ""] = (by[s.by || ""] || 0) + 1;
      (s.p.rows || []).forEach(function (r, j) {
        var d = String(r.dest || "").trim(),
          got = pkNum((s.p.picked || {})[j]),
          al = pkNum(r.alloc);
        if (s.p.prob && s.p.prob[j] != null) a.probs++;
        if (al != null) {
          a.alloced++;
          if (got != null && got >= al) a.filled++;
        }
        if (got > 0) a.qty += got;
        rows.push({ d: d, n: r.n, q: got > 0 ? got : al || 0, ts: s.ts });
        if (d) dep[d] = (dep[d] || 0) + 1;
      });
    });
    a.lines = rows.length;
    a.deps = anTop(dep);
    var inTop = {},
      it = {};
    a.deps.forEach(function (t) {
      inTop[t[0]] = 1;
    });
    rows.forEach(function (x) {
      if (inTop[x.d]) it[x.n] = (it[x.n] || 0) + x.q;
    });
    a.items = anTop(it);
    a.picker = anTop(by)[0];
    // Lines per day for a month, per month for longer periods.
    a.daily = to - from <= 32 * 864e5;
    a.bars = [];
    for (var b = new Date(from); +b < to; ) {
      var e = a.daily ? new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1) : new Date(b.getFullYear(), b.getMonth() + 1, 1);
      a.bars.push({
        t: b,
        n: rows.filter(function (x) {
          return x.ts >= +b && x.ts < +e;
        }).length,
      });
      b = e;
    }
    return a;
  }
  function anItemDesc(n) {
    var it = items.find(function (x) {
      return x.n === n;
    });
    return it ? it.d.split("|")[1] || it.d : "";
  }
  function anPeriod(a) {
    var f = new Date(a.from),
      l = new Date(a.to - 1),
      mo = function (d, y) {
        return d.toLocaleString([], y ? { month: "long", year: "numeric" } : { month: "short" });
      };
    if (anTab === 3) return String(f.getFullYear());
    if (anTab < 2) return mo(f, 1);
    return mo(f) + " " + (f.getFullYear() !== l.getFullYear() ? f.getFullYear() + " " : "") + "to " + mo(l, 1);
  }
  // Ring chart: one hue, darkest = biggest, 2px gaps; or a single arc for a share (pct 0-1).
  // tips: hover text per slice; for a share ring, [filled part, the rest].
  function anRing(list, hue, big, label, tips, pct) {
    var C = 2 * Math.PI * 48,
      sum = list.reduce(function (s, t) {
        return s + t[1];
      }, 0),
      at = 0,
      arcs =
        pct != null
          ? '<circle r="48" cx="60" cy="60" stroke="' + hue + '" stroke-dasharray="' + (pct * C).toFixed(2) + " " + C.toFixed(2) + '"' + (tips[0] ? ' data-tip="' + esc(tips[0]) + '"' : "") + "/>"
          : list
              .map(function (t, i) {
                var len = (t[1] / sum) * C,
                  gap = list.length > 1 ? Math.min(2, len / 2) : 0,
                  c =
                    '<circle r="48" cx="60" cy="60" stroke="' +
                    hue +
                    '" stroke-opacity="' +
                    (1 - i * 0.07).toFixed(2) +
                    '" stroke-dasharray="' +
                    (len - gap).toFixed(2) +
                    " " +
                    C.toFixed(2) +
                    '" stroke-dashoffset="' +
                    (-at).toFixed(2) +
                    '" data-tip="' +
                    esc(tips[i]) +
                    '"/>';
                at += len;
                return c;
              })
              .join("");
    return (
      '<div class="anring"><svg viewBox="0 0 120 120" role="img" aria-label="' +
      esc(big + " " + label) +
      '"><circle r="48" cx="60" cy="60" class="antrack"' +
      (pct != null && tips[1] ? ' data-tip="' + esc(tips[1]) + '"' : "") +
      '/><g transform="rotate(-90 60 60)">' +
      arcs +
      '</g></svg><div class="ancen"><b>' +
      big +
      "</b><span>" +
      esc(label) +
      "</span></div></div>"
    );
  }
  function anList(list, hue, names, sub, empty) {
    return list.length
      ? '<ol class="anleg">' +
          list
            .map(function (t, i) {
              return (
                '<li><i style="background:' +
                hue +
                ";opacity:" +
                (1 - i * 0.07).toFixed(2) +
                '"></i><span>' +
                esc(names[i]) +
                (sub[i] ? "<small>" + esc(sub[i]) + "</small>" : "") +
                "</span><b>" +
                t[1].toLocaleString() +
                "</b></li>"
              );
            })
            .join("") +
          "</ol>"
      : '<p class="anempty">' + empty + "</p>";
  }
  function anCopy(key, text, label) {
    anTxt[key] = text;
    return (
      '<div class="ancopy"><input readonly value="' +
      esc(text.split("\n")[0]) +
      '" aria-label="' +
      esc(label) +
      '"><button type="button" data-ancopy="' +
      key +
      '">Copy</button></div>'
    );
  }
  function anSummary(a, per) {
    var deps = a.deps.map(function (t) {
        return "Dept " + t[0] + " (" + t[1] + ")";
      }),
      its = a.items.map(function (t) {
        return t[0] + " (" + t[1].toLocaleString() + ")";
      });
    return (
      "Storeroom analytics, " +
      per +
      "\n" +
      a.slips.length +
      " pick lists, " +
      a.lines +
      " lines" +
      (deps.length ? "\nTop 10 departments: " + deps.join(", ") : "") +
      (its.length ? "\nTop 10 items they order: " + its.join(", ") : "")
    );
  }
  function anTsv(a) {
    var out = ["Rank\tDepartment\tLines ordered\tItem #\tDescription\tQuantity"];
    for (var i = 0; i < Math.max(a.deps.length, a.items.length); i++) {
      var d = a.deps[i] || ["", ""],
        t = a.items[i] || ["", ""];
      out.push([i + 1, d[0] && "Dept " + d[0], d[1], t[0], anItemDesc(t[0]), t[1]].join("\t"));
    }
    return out.join("\n");
  }
  function anRow(k, v) {
    return '<div class="anrow"><dt>' + k + "</dt><dd>" + v + "</dd></div>";
  }
  function anFeed(probs) {
    var slips = anSlips(),
      rows = [];
    slips.forEach(function (s) {
      if (!probs) return rows.push(s);
      (s.p.rows || []).forEach(function (r, j) {
        if (s.p.prob && s.p.prob[j] != null) rows.push({ s: s, r: r, note: s.p.prob[j] });
      });
    });
    rows = rows.slice(0, 40);
    var when = function (ts) {
      return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    };
    return (
      '<section class="ancard anfeed"><header class="anbar"><h4>' +
      (probs ? "Lines flagged as a problem" : "Recent pick lists") +
      "</h4><small>Newest first" +
      (rows.length === 40 ? ", latest 40" : "") +
      "</small></header>" +
      (rows.length
        ? '<div class="tw"><table class="sumtbl"><thead><tr>' +
          (probs ? "<th>Pick slip</th><th>Item #</th><th>Dept</th><th>Problem</th><th>Submitted</th>" : "<th>Pick slip</th><th>Submitted by</th><th>Submitted</th><th>Lines</th><th>Departments</th>") +
          "<th></th></tr></thead><tbody>" +
          rows
            .map(function (x) {
              var s = probs ? x.s : x,
                deps = {};
              (s.p.rows || []).forEach(function (r) {
                if (r.dest) deps[r.dest] = 1;
              });
              return (
                "<tr><td><b>" +
                esc(s.p.no || s.p.name || "–") +
                "</b></td>" +
                (probs
                  ? "<td>" + esc(x.r.n) + "</td><td>" + (esc(x.r.dest) || "–") + "</td><td>" + (esc(x.note) || "Flagged") + "</td><td>" + when(s.ts) + "</td>"
                  : '<td><span class="anwho">' + avatarHtml(s.by, whoName(s.by)) + esc(whoName(s.by)) + "</span></td><td>" + when(s.ts) + "</td><td>" + (s.p.rows || []).length + "</td><td>" + (esc(Object.keys(deps).join(", ")) || "–") + "</td>") +
                '<td class="act"><button type="button" data-anslip="' +
                esc(s.k) +
                '">Open</button></td></tr>'
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="anempty">' + (probs ? "No pick slip lines have been flagged as a problem." : "No pick lists have been submitted yet.") + "</p>") +
      "</section>"
    );
  }
  function renderAn() {
    var me = curEmail(),
      feed = anTab > 4,
      a = anStats(anRange(anTab)),
      per = anPeriod(a),
      open = a.to > Date.now(),
      top = a.deps[0],
      itop = a.items[0],
      busy = a.bars.reduce(function (m, b) {
        return b.n > (m ? m.n : 0) ? b : m;
      }, null),
      ct =
        top &&
        st.contacts.find(function (c) {
          return dlfKey(c.dept || "").indexOf(dlfKey(top[0])) >= 0;
        }),
      sum = anSummary(a, per),
      deptNames = a.deps.map(function (t) {
        return "Dept " + t[0];
      }),
      share = function (t, list) {
        var all = list.reduce(function (n, x) {
          return n + x[1];
        }, 0);
        return Math.round((t[1] / all) * 100) + "% of the top 10";
      },
      depTips = a.deps.map(function (t) {
        return "Dept " + t[0] + ": " + t[1] + (t[1] === 1 ? " line" : " lines") + " ordered, " + share(t, a.deps);
      }),
      itemTips = a.items.map(function (t) {
        var d = anItemDesc(t[0]);
        return t[0] + (d ? ", " + (d.length > 48 ? d.slice(0, 47) + "…" : d) : "") + ": " + t[1].toLocaleString() + " ordered, " + share(t, a.items);
      }),
      fillTips = a.alloced
        ? ["Filled in full: " + a.filled + " of " + a.alloced + " lines", "Not filled in full: " + (a.alloced - a.filled) + " of " + a.alloced + " lines"]
        : [];
    anTxt = {};
    $("anTip").hidden = true;
    $("anBox").innerHTML =
      '<div class="an' +
      (anSideOff ? " noside" : "") +
      '"><aside class="anside" aria-label="Analytics menu"><button type="button" class="anme" data-ango="me" aria-label="Open your profile">' +
      avatarHtml(me, whoName(me), "lg") +
      "<b>" +
      esc(whoName(me)) +
      anIc('<path d="m6 9 6 6 6-6"/>') +
      "</b></button>" +
      AN_NAV.map(function (g) {
        return (
          '<p class="anlab">' +
          g[0] +
          '</p><nav class="annavs" aria-label="' +
          g[0] +
          '">' +
          g[1]
            .map(function (n) {
              return n[0] === "items"
                ? '<span class="annav" aria-current="page">' + anIc(n[2]) + n[1] + "</span>"
                : '<button type="button" class="annav" data-ango="' + n[0] + '">' + anIc(n[2]) + n[1] + "</button>";
            })
            .join("") +
          "</nav>"
        );
      }).join("") +
      '</aside><div class="anmain"><div class="antop"><button type="button" class="anicon" data-anside aria-label="' +
      (anSideOff ? "Show the menu" : "Hide the menu") +
      '" aria-pressed="' +
      !anSideOff +
      '">' +
      anIc('<path d="M4 6h16M4 12h16M4 18h10"/>') +
      '</button><label class="ansearch">' +
      anIc('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>') +
      '<input type="search" id="anQ" placeholder="Search for an item #, description or locator" aria-label="Search items" autocomplete="off"></label>' +
      '<button type="button" class="anicon on" data-ango="opt:0" aria-label="Add or edit users" title="Add or edit users">' +
      anIc('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6"/>') +
      '</button><button type="button" class="anicon" data-ango="opt:3" aria-label="Picks and put away by day" title="Picks and put away by day">' +
      anIc('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>') +
      '</button><button type="button" class="anicon" data-ango="exit" aria-label="All Manage options" title="All Manage options">' +
      anIc('<path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z"/>') +
      '</button></div><header class="anhead"><div class="antitle"><button type="button" class="anback" data-ango="exit">' +
      anIc('<path d="M15 18l-6-6 6-6"/>') +
      'Back to Manage</button><h3>Who orders what</h3><p>' +
      anIc('<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>') +
      "Granite City Works, Storeroom · " +
      (feed ? "All pick lists" : esc(per)) +
      ' · <button type="button" class="anlink" data-ango="opt:3">View pick lists</button></p></div><div class="anacts">' +
      (feed ? "" : '<span class="anstate' + (open ? " open" : "") + '"><i></i>' + (open ? "Open" : "Closed") + "</span>") +
      '<button type="button" class="anround" data-anact="csv" aria-label="Download as a spreadsheet (CSV)" title="Download as a spreadsheet (CSV)">' +
      anIc('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>') +
      '</button><button type="button" class="anround" data-ancopy="sum" aria-label="Copy the summary" title="Copy the summary">' +
      anIc('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>') +
      '</button><button type="button" class="anround" data-anact="sync" aria-label="Check the cloud for new pick lists" title="Check the cloud for new pick lists">' +
      anIc('<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>') +
      '</button></div><div class="antabs" role="tablist" aria-label="Period">' +
      AN_TABS.map(function (t, i) {
        return '<button type="button" role="tab" data-an="' + i + '" aria-selected="' + (i === anTab) + '">' + t + "</button>";
      }).join("") +
      '</div></header><div class="anbody" role="tabpanel">' +
      (feed
        ? anFeed(anTab === 6)
        : '<div class="anstats"><div class="anleft">' +
          (anFold
            ? ""
            : '<div class="anrings">' +
              anRing(a.deps, "var(--acc1)", a.deps.length, a.deps.length === 1 ? "department" : "departments", depTips) +
              anRing(a.items, "var(--acc2)", a.items.length, a.items.length === 1 ? "item" : "items", itemTips) +
              anRing([], "var(--ink)", a.alloced ? Math.round((a.filled / a.alloced) * 100) + "%" : "–", "filled in full", fillTips, a.alloced ? a.filled / a.alloced : 0) +
              '<p class="anpill"><b>Totals</b> · ' +
              a.slips.length +
              (a.slips.length === 1 ? " pick list" : " pick lists") +
              " · " +
              a.lines +
              (a.lines === 1 ? " line" : " lines") +
              "</p></div>") +
          '<div class="anfold"><button type="button" data-anfold aria-expanded="' +
          !anFold +
          '" aria-label="' +
          (anFold ? "Show the summary" : "Hide the summary") +
          '">' +
          anIc(anFold ? '<path d="m6 9 6 6 6-6"/>' : '<path d="m18 15-6-6-6 6"/>') +
          '</button></div>' +
          '<div class="anpair"><section class="ancard"><h4>Top 10 departments</h4>' +
          anList(
            a.deps,
            "var(--acc1)",
            deptNames,
            a.deps.map(function (t) {
              return t[1] === 1 ? "line ordered" : "lines ordered";
            }),
            "No pick lists were submitted in " + esc(per) + "."
          ) +
          '</section><section class="ancard"><h4>Top 10 items they order</h4>' +
          anList(
            a.items,
            "var(--acc2)",
            a.items.map(function (t) {
              return t[0];
            }),
            a.items.map(function (t) {
              return anItemDesc(t[0]);
            }),
            "No items were picked for these departments in " + esc(per) + "."
          ) +
          '</section></div>' +
          '</div><aside class="anright">' +
          (anFold
            ? ""
            : '<section class="ancard"><header class="anbar"><h4>At a glance</h4><button type="button" data-ango="opt:3">' +
          anIc('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>') +
          'View pick lists</button></header><dl class="anrows">' +
          anRow("Period", esc(per)) +
          anRow("Pick lists", a.slips.length + " submitted") +
          anRow("Lines", a.lines + (a.probs ? " (" + a.probs + " flagged as a problem)" : "")) +
          anRow("Busiest department", top ? "Dept " + esc(top[0]) + " · " + top[1] + (top[1] === 1 ? " line" : " lines") : "–") +
          anRow("Most ordered item", itop ? esc(itop[0]) + " · " + itop[1].toLocaleString() + "<small>" + esc(anItemDesc(itop[0])) + "</small>" : "–") +
          anRow(
            a.daily ? "Busiest day" : "Busiest month",
            busy ? esc(a.daily ? busy.t.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : busy.t.toLocaleString([], { month: "long", year: "numeric" })) + " · " + busy.n + (busy.n === 1 ? " line" : " lines") : "–"
          ) +
          anRow("Filled in full", a.alloced ? a.filled + " of " + a.alloced + " lines (" + Math.round((a.filled / a.alloced) * 100) + "%)" : "–") +
          anRow(
            "Top picker",
            a.picker ? '<span class="anwho">' + avatarHtml(a.picker[0], whoName(a.picker[0])) + esc(whoName(a.picker[0])) + "</span> · " + a.picker[1] + (a.picker[1] === 1 ? " pick list" : " pick lists") : "–"
          ) +
          anRow("Total picked", "<b>" + a.qty.toLocaleString() + "</b>") +
          '</dl></section>') +
          '<a class="anshare" href="mailto:?subject=' +
          encodeURIComponent("Storeroom analytics, " + per) +
          "&body=" +
          encodeURIComponent(sum) +
          '">' +
          anIc('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>') +
          'Email this report</a><a class="anshare" href="sms:?&body=' +
          encodeURIComponent(sum) +
          '">' +
          anIc('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>') +
          'Text this report</a><button type="button" class="anshare" data-anact="csv">' +
          anIc('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>') +
          "Download spreadsheet</button>" +
          '<section class="anside2"><h4>' +
          anIc('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>') +
          "Link to this site</h4><p>Share the storeroom site. Analytics opens from Manage.</p>" +
          anCopy("link", location.origin + location.pathname, "Link to this site") +
          '</section><section class="anside2"><h4>' +
          anIc('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>') +
          "Paste into a spreadsheet</h4><p>Copies both top 10 lists as columns you can paste into Excel.</p>" +
          anCopy("tsv", anTsv(a), "Both top 10 lists, ready to paste") +
          '</section><section class="anside2"><h4>' +
          anIc('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>') +
          "Busiest department contact</h4><p>" +
          (top
            ? ct
              ? esc(ct.name) + " in Important Contacts, for Dept " + esc(top[0]) + "."
              : "No one in Important Contacts lists Dept " + esc(top[0]) + " yet."
            : "Shows once a department has ordered.") +
          "</p>" +
          (ct && (ct.phone || ct.ext) ? anCopy("ct", [ct.phone, ct.ext && "ext " + ct.ext].filter(Boolean).join(" "), "Phone for " + ct.name) : "") +
          "</section></aside></div>") +
      "</div></div></div>";
    anTxt.sum = sum;
  }
  function anExit() {
    mgOpt = -1;
    renderManage();
  }
  $("anBox").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.an) {
      anTab = +b.dataset.an;
      renderAn();
      $("anBox").querySelector(".anbody").classList.add("anin");
      $("anBox").querySelector('[data-an="' + anTab + '"]').focus();
    } else if (b.hasAttribute("data-anfold")) {
      anFold = !anFold;
      renderAn();
      $("anBox").querySelector("[data-anfold]").focus();
    } else if (b.hasAttribute("data-anside")) {
      anSideOff = !anSideOff;
      renderAn();
      $("anBox").querySelector("[data-anside]").focus();
    } else if (b.dataset.ancopy) {
      var t = anTxt[b.dataset.ancopy] || "";
      navigator.clipboard.writeText(t).then(
        function () {
          toast("Copied.");
        },
        function () {
          toast("Couldn't copy. Select the text and copy it instead.");
        }
      );
    } else if (b.dataset.anslip) pkViewSub(b.dataset.anslip);
    else if (b.dataset.anact === "sync") {
      toast("Checking the cloud for new pick lists…");
      Promise.resolve(cloudSync(true)).then(renderAn, renderAn);
    } else if (b.dataset.anact === "csv") {
      var a = anStats(anRange(anTab)),
        csv = anTsv(a)
          .split("\n")
          .map(function (l) {
            return l
              .split("\t")
              .map(function (c) {
                return '"' + String(c).replace(/"/g, '""') + '"';
              })
              .join(",");
          })
          .join("\r\n"),
        lnk = document.createElement("a");
      lnk.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      lnk.download = "Storeroom analytics " + anPeriod(a) + ".csv";
      lnk.click();
      setTimeout(function () {
        URL.revokeObjectURL(lnk.href);
      }, 1000);
    } else if (b.dataset.ango) {
      var g = b.dataset.ango.split(":");
      if (g[0] === "me") return openProfile();
      anExit();
      if (g[0] !== "exit") {
        anRet = true;
        var tg = document.querySelector("[data-" + g[0] + '="' + g[1] + '"]');
        if (tg) tg.click();
      }
    }
  });
  $("anBack").onclick = function () {
    anRet = false;
    st.manage = true;
    st.top = null;
    st.side = null;
    mgOpt = 5;
    if (document.querySelector("dialog[open]")) document.querySelector("dialog[open]").close();
    render();
  };
  // Hover a ring slice: what it stands for.
  $("anBox").addEventListener("mousemove", function (e) {
    var t = e.target.closest && e.target.closest("circle[data-tip]"),
      tip = $("anTip");
    if (!t) {
      tip.hidden = true;
      return;
    }
    tip.textContent = t.getAttribute("data-tip");
    tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)) + "px";
    tip.style.top = (e.clientY + 18 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 18) + "px";
  });
  $("anBox").addEventListener("mouseleave", function () {
    $("anTip").hidden = true;
  });
  // Search hands off to the item list.
  $("anBox").addEventListener("keydown", function (e) {
    if (e.target.id !== "anQ" || e.key !== "Enter") return;
    var v = e.target.value;
    anExit();
    anRet = true;
    document.querySelector('[data-top="0"]').click();
    $("q").value = v;
    $("q").dispatchEvent(new Event("input", { bubbles: true }));
    $("q").focus();
  });
  // Esc closes full-screen Analytics (not while a pop-up is open).
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mgOpt === 5 && !$("managePanel").hidden && !document.querySelector("dialog[open]") && innerWidth > 900) anExit();
  });
  function renderManage() {
    document.documentElement.style.setProperty("--tab", "#d92d20");
    $("anBack").hidden = !anRet || mgOpt === 5;
    var ok = isMgr();
    $("mgGate").hidden = ok;
    $("mgBody").hidden = !ok;
    $("mgN").textContent = ok ? st.users.length : "–";
    $("mgN").nextElementSibling.textContent = ok && st.users.length === 1 ? "user" : "users";
    if (!ok) return;
    var nav = $("mgNav");
    if (!nav.querySelector("[data-opt]"))
      nav.innerHTML =
        '<button class="mgback" data-back><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Back</button>' +
        MGORDER.map(function (i) {
        return (
          '<button data-opt="' +
          i +
          '"><span class="mgic"><svg viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
          MGICONS[i] +
          '</svg></span><span class="mgl"></span><span class="mgtip">' +
          esc(MGTIPS[i]) +
          '</span><span class="mgst"><b></b><small></small></span></button>'
        );
      }).join("");
    MGOPTS.forEach(function (x, i) {
      var b = nav.querySelector('[data-opt="' + i + '"]');
      var lb = b.querySelector(".mgl");
      if (lb.textContent !== x) lb.textContent = x;
      b.classList.toggle("on", i === mgOpt);
      $("mgOpt" + i).hidden = i !== mgOpt;
      var s = mgStatus(i);
      b.querySelector(".mgst b").textContent = s[0];
      b.querySelector(".mgst small").textContent = s[1];
      b.classList.toggle("warn", !!s[2]);
    });
    nav.classList.toggle("picked", mgOpt >= 0);
    $("mgBody").querySelector(".mgbar").hidden = mgOpt < 0;
    $("mgHidCount").textContent = "(" + hiddenList().length + ")";
    $("mgShowHidden").checked = mgShowHid;
    $("mgDayWrap").hidden = !(mgOpt === 1 || mgOpt === 3);
    if (!$("mgDay").value) $("mgDay").value = dayOf(Date.now());
    if (mgOpt === 1) {
      renderManifests();
      cloudSync();
    }
    if (mgOpt === 2) {
      renderTemplates();
      if (!tpCloud && !tpCloudErr) tpCloudScan();
    }
    if (mgOpt === 3) renderMaterial();
    // Analytics is drawn once per visit (tabs and Refresh redraw it), so cloud syncs don't reset it.
    if (mgOpt !== 5) $("anBox").innerHTML = "";
    else if (!$("anBox").firstChild) renderAn();
    if (mgOpt === 6) renderGr();
    if (mgOpt === 4) {
      renderFinished();
      fdRender();
      if (fdState === "ok") fdScan();
    }
    if (mgOpt !== 0) return;
    renderCloudCard();
    [].forEach.call($("mgTabs").children, function (b) {
      b.classList.toggle("on", b.dataset.mg === mgTab);
    });
    $("mgUsersView").hidden = mgTab !== "users";
    $("mgPermsView").hidden = mgTab !== "perms";
    var rs = $("mgForm").elements.role,
      ro = roleOptions();
    if (rs.options.length !== ro.length)
      rs.innerHTML = ro
        .map(function (r) {
          return '<option value="' + r[0] + '">' + r[1] + "</option>";
        })
        .join("");
    if (!$("mgNewPerms").children.length)
      $("mgNewPerms").innerHTML = PERMS.map(function (k) {
        return (
          '<label class="pk"><input type="checkbox" name="np" value="' +
          k[0] +
          '"> ' +
          esc(k[1]) +
          "</label>"
        );
      }).join("");
    var list = sortedUsers().filter(function (u) {
      return visibleP(u.email);
    });
    $("mgRows").innerHTML =
      list
        .map(function (u) {
          var acts =
            (canManage(u)
              ? '<button data-edit="' +
                u.id +
                '">Edit</button><button data-rm="' +
                u.id +
                '">Remove</button>'
              : "") + hideBtn(u.email);
          return (
            '<tr class="' +
            (isHid(u.email) ? "hid" : "") +
            '"><td class="cname">' +
            esc(u.name || "–") +
            "</td><td>" +
            esc(u.email) +
            '</td><td><span class="pill role-' +
            u.role +
            '">' +
            ROLE_LABEL[u.role] +
            "</span></td><td>" +
            new Date(u.created || 0).toLocaleDateString([], {
              month: "short",
              day: "numeric",
              year: "numeric",
            }) +
            '</td><td class="act">' +
            acts +
            "</td></tr>"
          );
        })
        .join("");
    $("mgPerms").innerHTML =
      "<thead><tr><th>Person</th>" +
      PERMS.map(function (k) {
        return '<th class="pc">' + esc(k[1]) + "</th>";
      }).join("") +
      "</tr></thead><tbody>" +
      list
        .map(function (u) {
          var p = permsOf(u),
            can2 = canManage(u);
          return (
            '<tr class="' +
            (isHid(u.email) ? "hid" : "") +
            '"><td class="cname">' +
            esc(u.name || u.email) +
            "<small>" +
            esc(u.email) +
            " · " +
            ROLE_LABEL[u.role] +
            "</small>" +
            hideBtn(u.email) +
            "</td>" +
            PERMS.map(function (k) {
              return (
                '<td class="pc"><input type="checkbox" data-u="' +
                u.id +
                '" data-p="' +
                k[0] +
                '"' +
                (p[k[0]] ? " checked" : "") +
                (can2 ? "" : " disabled") +
                ' aria-label="' +
                esc(k[1]) +
                " for " +
                esc(u.name || u.email) +
                '"></td>'
              );
            }).join("") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody>";
  }
  $("mgShowHidden").addEventListener("change", function () {
    mgShowHid = this.checked;
    renderManage();
  });
  $("mgDay").addEventListener("change", function () {
    renderManage();
  });
  $("mgBody").addEventListener("click", function (e) {
    var h = e.target.closest("button[data-hide]");
    if (h) {
      e.preventDefault();
      e.stopPropagation();
      toggleHide(h.dataset.hide);
      return;
    }
    var rg = e.target.closest("button[data-range],button[data-last7]");
    if (rg) {
      e.preventDefault();
      e.stopPropagation();
      var box = rg.closest(".mgrange"),
        em = box.dataset.email;
      if (rg.hasAttribute("data-last7")) delete mgRange[em];
      else {
        var f = box.querySelector("[data-rf]").value,
          to = box.querySelector("[data-rt]").value;
        if (!f || !to) {
          toast("Pick both dates first.");
          return;
        }
        mgRange[em] = { from: f, to: to };
      }
      rg.closest(".mgdbody").innerHTML = matBodyHtml(em);
    }
  });
  // Picking an option: the other buttons fade out, the picked one glides to the left and its page opens.
  // Back reverses it. The glide keeps the button where it was on screen while the layout changes,
  // then lets it move to its new spot (transform only).
  var mgBusy = false;
  function mgGlide(b, change) {
    var r0 = b.getBoundingClientRect();
    change();
    var r1 = b.getBoundingClientRect();
    b.style.transition = "none";
    b.style.transform = "translate(" + (r0.left - r1.left) + "px," + (r0.top - r1.top) + "px)";
    b.offsetWidth; // apply the start position before animating
    b.style.transition = b.style.transform = "";
  }
  $("mgNav").addEventListener("click", function (e) {
    var b = e.target.closest("button"),
      nav = $("mgNav"),
      calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!b || mgBusy) return;
    if (b.hasAttribute("data-back")) {
      var cur = nav.querySelector("button.on");
      mgBusy = true;
      nav.classList.add("returning");
      mgGlide(cur, function () {
        mgOpt = -1;
        renderManage();
      });
      setTimeout(function () {
        nav.classList.remove("returning");
        mgBusy = false;
        cur.focus();
      }, calm ? 0 : 300);
      return;
    }
    var next = +b.dataset.opt;
    if (next === mgOpt) return;
    mgBusy = true;
    b.classList.add("going");
    nav.classList.add("leaving");
    setTimeout(function () {
      nav.classList.remove("leaving");
      b.classList.remove("going");
      $("mgBody").dataset.dir = "fwd";
      mgGlide(b, function () {
        mgOpt = next;
        renderManage();
      });
      mgBusy = false;
    }, calm ? 0 : 150);
  });

  var mgShowHid = false,
    mgRange = {};
  function hiddenList() {
    return (st.hidden && st.hidden[curEmail()]) || [];
  }
  function isHid(em) {
    return hiddenList().indexOf(em) >= 0;
  }
  function visibleP(em) {
    return mgShowHid || !isHid(em);
  }
  function toggleHide(em) {
    var me = curEmail();
    if (!me) return;
    var l = hiddenList().slice(),
      i = l.indexOf(em);
    if (i >= 0) l.splice(i, 1);
    else l.push(em);
    st.hidden[me] = l;
    save();
    renderManage();
  }
  function hideBtn(em) {
    return (
      '<button class="mini" data-hide="' +
      esc(em) +
      '">' +
      (isHid(em) ? "Unhide" : "Hide") +
      "</button>"
    );
  }
  function mgDayVal() {
    return $("mgDay").value || dayOf(Date.now());
  }
  function fmtDay(s) {
    return new Date(s + "T12:00:00").toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  function allPeopleOld() {
    return [].concat(
      sortedUsers().map(function (u) {
        return { email: u.email, name: u.name || u.email, role: u.role };
      })
    );
  }
  function allPeople() {
    return allPeopleOld().filter(function (p) {
      return visibleP(p.email);
    });
  }
  function personHead(p, count, unit) {
    return (
      '<summary class="' +
      (isHid(p.email) ? "hid" : "") +
      '"><span class="who"><b>' +
      esc(p.name) +
      "</b><small>" +
      esc(p.email || "") +
      (p.role ? " · " + ROLE_LABEL[p.role] : "") +
      '</small></span><span class="cnt">' +
      count +
      " " +
      unit +
      "</span>" +
      (p.email ? hideBtn(p.email) : "") +
      "</summary>"
    );
  }
  function renderManifests() {
    var day = mgDayVal(),
      by = {};
    st.ewos
      .slice()
      .reverse()
      .forEach(function (e) {
        if (dayOf(e.ts) === day) (by[e.by || ""] = by[e.by || ""] || []).push(e);
      });
    // Delivery trips submitted from the Delivery tab on this day.
    var trips = (st.manifests || [])
        .filter(function (m) {
          return m.status === "submitted" && dayOf(m.subTs) === day;
        })
        .reverse(),
      h =
        '<div class="sumsec" style="padding:0 0 8px">Delivery trips</div>' +
        (trips.length
          ? trips
              .map(function (m) {
                return (
                  '<details class="mgdet"><summary><span class="who"><b>' +
                  dvTripName(m) +
                  " · " +
                  esc(whoName(m.by)) +
                  "</b><small>" +
                  esc(m.no) +
                  " · loaded " +
                  (m.loadedTs ? dvTime(m.loadedTs) : "–") +
                  " · submitted " +
                  dvTime(m.subTs) +
                  '</small></span><span class="cnt">' +
                  m.lines.length +
                  " receipts · " +
                  dvBoxes(m.lines) +
                  ' boxes</span></summary><div class="mgdbody">' +
                  dvTripTable(m) +
                  "</div></details>"
                );
              })
              .join("")
          : '<div class="empty" style="padding:14px 0 20px">No delivery trips were submitted on ' +
            esc(fmtDay(day)) +
            ".</div>") +
        '<div class="sumsec" style="padding:14px 0 8px">EWOs</div>' +
        '<p class="mgnote" style="padding:0 0 12px">People who created a delivery (EWO) on <b>' +
        esc(fmtDay(day)) +
        "</b>. Select a name to open their manifest. Use the Day box above to look at another day.</p>",
      shown = 0;
    allPeople().forEach(function (p) {
      var l = by[p.email];
      if (!l) return;
      shown++;
      h +=
        '<details class="mgdet">' +
        personHead(p, l.length, l.length === 1 ? "delivery" : "deliveries") +
        '<div class="mgdbody">' +
        ewoTableHtml(l, true) +
        "</div></details>";
    });
    if (by[""]) {
      var o = by[""];
      shown++;
      h +=
        '<details class="mgdet">' +
        personHead(
          { name: "Earlier deliveries", email: "" },
          o.length,
          o.length === 1 ? "delivery" : "deliveries"
        ) +
        '<div class="mgdbody">' +
        ewoTableHtml(o, true) +
        "</div></details>";
    }
    if (!shown)
      h +=
        '<div class="empty" style="padding:22px 0">No deliveries were created on ' +
        esc(fmtDay(day)) +
        ".</div>";
    $("mgManifests").innerHTML = h;
  }
  var AUD_CATS = [
    "Pick lists",
    "Quantity changes",
    "Transfers",
    "EWOs",
    "Contacts",
    "Tabs",
    "Summaries",
    "Templates",
    "Inspections",
    "User management",
  ];
  function matBodyHtml(email) {
    var today = dayOf(Date.now()),
      r = mgRange[email] || { from: dayOf(Date.now() - 6 * 864e5), to: today };
    if (r.from > r.to) {
      var x = r.from;
      r.from = r.to;
      r.to = x;
    }
    var list = st.audit
      .filter(function (e) {
        var d = dayOf(e.ts);
        return isSubm(e) && (e.by || "") === email && d >= r.from && d <= r.to;
      })
      .reverse();
    var cats = SUB_CATS.map(function (c) {
      var l = list.filter(function (e) {
        return e.cat === c;
      });
      if (!l.length) return "";
      return (
        '<details class="mgcat" open><summary>' +
        esc(c) +
        '<span class="cnt">' +
        l.length +
        '</span></summary><ul class="mglist">' +
        l
          .slice(0, 200)
          .map(function (e) {
            return (
              "<li><time>" +
              new Date(e.ts).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }) +
              "</time><span>" +
              esc(e.text) +
              (e.pick && pkLatest(e.k) !== e ? ' <span class="m">(edited)</span>' : "") +
              "</span>" +
              (e.pick ? '<button type="button" data-pkview="' + esc(e.k) + '">View</button>' : "") +
              "</li>"
            );
          })
          .join("") +
        "</ul></details>"
      );
    }).join("");
    return (
      '<div class="mgrange" data-email="' +
      esc(email) +
      '"><label>From<input type="date" data-rf value="' +
      r.from +
      '"></label><label>To<input type="date" data-rt value="' +
      r.to +
      '"></label><button data-range>Show</button><button data-last7>Last 7 days</button><span class="m">' +
      list.length +
      (list.length === 1 ? " submission" : " submissions") +
      ", " +
      esc(fmtDay(r.from)) +
      " to " +
      esc(fmtDay(r.to)) +
      "</span></div>" +
      (cats ||
        '<div class="empty" style="padding:14px 0">No pick lists or put aways in this date range.</div>')
    );
  }

  // Picks and Put Away lists submissions only (first submissions; edits show inside them).
  var SUB_CATS = ["Pick lists", "Put aways"];
  function isSubm(e) {
    return SUB_CATS.indexOf(e.cat) >= 0 && !(e.pick && e.pick.of);
  }
  function renderMaterial() {
    var day = mgDayVal(),
      cnt = {};
    st.audit.forEach(function (e) {
      if (isSubm(e) && dayOf(e.ts) === day) cnt[e.by || ""] = (cnt[e.by || ""] || 0) + 1;
    });
    var h =
        '<p class="mgnote" style="padding:0 0 12px">People who submitted a pick list or put away on <b>' +
        esc(fmtDay(day)) +
        "</b>. Select a name to see their last 7 days, and use the dates to look at a different range. Use the Day box above to list another day.</p>",
      shown = 0;
    allPeople().forEach(function (p) {
      var n = cnt[p.email];
      if (!n) return;
      shown++;
      h +=
        '<details class="mgdet">' +
        personHead(p, n, n === 1 ? "submission that day" : "submissions that day") +
        '<div class="mgdbody">' +
        matBodyHtml(p.email) +
        "</div></details>";
    });
    if (cnt[""]) {
      shown++;
      h +=
        '<details class="mgdet">' +
        personHead({ name: "Not signed in", email: "" }, cnt[""], "submissions that day") +
        '<div class="mgdbody">' +
        matBodyHtml("") +
        "</div></details>";
    }
    if (!shown)
      h +=
        '<div class="empty" style="padding:22px 0">Nobody submitted a pick list or put away on ' +
        esc(fmtDay(day)) +
        ".</div>";
    $("mgMaterial").innerHTML = h;
  }
  $("mgTabs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    mgTab = b.dataset.mg;
    renderManage();
  });
  $("mgPerms").addEventListener("change", function (e) {
    var c = e.target.closest("input[data-p]");
    if (!c) return;
    var u = st.users.find(function (x) {
      return x.id === c.dataset.u;
    });
    if (!u || !canManage(u)) {
      c.checked = !c.checked;
      return;
    }
    var p = permsOf(u);
    p[c.dataset.p] = c.checked;
    u.perms = p;
    cloudPatchProfile(u.id, { perms: p }).catch(function () {
      toast("That change didn't reach the cloud. Check the connection and try again.");
      cloudPullProfiles();
    });
    audit(
      "User management",
      (c.checked ? "Gave “" : "Removed “") +
        PERMS.filter(function (k) {
          return k[0] === c.dataset.p;
        })[0][1] +
        (c.checked ? "” to " : "” from ") +
        (u.name || u.email)
    );
    save();
    toast(
      (c.checked ? "Gave " : "Removed ") +
        (c.checked ? "" : "") +
        "“" +
        PERMS.filter(function (k) {
          return k[0] === c.dataset.p;
        })[0][1] +
        "”" +
        (c.checked ? " to " : " from ") +
        (u.name || u.email) +
        "."
    );
  });
  $("mgForm").addEventListener("change", function (e) {
    if (e.target.name !== "role") return;
    var on = e.target.value === "admin";
    [].forEach.call($("mgNewPerms").querySelectorAll("input"), function (c) {
      c.checked = on;
    });
  });
  $("mgRows").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var id = b.dataset.edit || b.dataset.rm,
      u = st.users.find(function (x) {
        return x.id === id;
      });
    if (!u || !canManage(u)) return;
    if (b.dataset.rm) {
      if (!confirm("Remove " + (u.name || u.email) + "? They will no longer be able to sign in."))
        return;
      cloudAdmin({ action: "delete", id: u.id })
        .then(function () {
          audit("User management", "Removed user " + (u.name || u.email));
          st.users = st.users.filter(function (x) {
            return x.id !== u.id;
          });
          save();
          renderManage();
          toast("User removed.");
        })
        .catch(function (x) {
          toast(x.message);
        });
    } else openUser(u);
  });
  function openUser(u) {
    userEd = u.id;
    var f = $("userForm").elements,
      ro = roleOptions();
    f.nm.value = u.name || "";
    f.em.value = u.email;
    f.pw.value = "";
    $("uMsg").textContent = "";
    f.role.innerHTML = ro
      .map(function (r) {
        return '<option value="' + r[0] + '">' + r[1] + "</option>";
      })
      .join("");
    f.role.value = u.role;
    f.role.disabled = !isOwner();
    $("userDlg").showModal();
    f.nm.focus();
  }
  $("uCancel").onclick = function () {
    $("userDlg").close();
  };
  $("userForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = this.elements,
      u = st.users.find(function (x) {
        return x.id === userEd;
      }),
      msg = $("uMsg");
    if (!u || !canManage(u)) {
      $("userDlg").close();
      return;
    }
    var em = f.em.value.trim().toLowerCase(),
      pw = f.pw.value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      msg.textContent = "Enter a valid email address.";
      return;
    }
    if (pw && pw.length < 8) {
      msg.textContent = "The new password must be at least 8 characters.";
      return;
    }
    var role = isOwner() ? (f.role.value === "admin" ? "admin" : "user") : u.role;
    msg.textContent = "Saving…";
    try {
      await cloudAdmin({ action: "update", id: u.id, name: f.nm.value.trim(), email: em, password: pw || undefined, role: role });
    } catch (x) {
      msg.textContent = x.message;
      return;
    }
    u.name = f.nm.value.trim();
    u.email = em;
    u.role = role;
    audit("User management", "Edited user " + (u.name || u.email));
    save();
    $("userDlg").close();
    renderManage();
    toast("Saved changes for " + (u.name || u.email) + ".");
  });
  $("mgForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!isMgr()) return;
    var f = this.elements,
      msg = $("mgMsg"),
      em = f.em.value.trim().toLowerCase(),
      pw = f.pw.value;
    msg.className = "mgmsg";
    var role = f.role.value === "admin" && isOwner() ? "admin" : "user";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      msg.textContent = "Enter a valid email address.";
      return;
    }
    if (pw.length < 8) {
      msg.textContent = "The password must be at least 8 characters.";
      return;
    }
    if (pw !== f.pw2.value) {
      msg.textContent = "The two passwords do not match.";
      return;
    }
    var perms = {};
    PERMS.forEach(function (k) {
      perms[k[0]] = false;
    });
    [].forEach.call(this.querySelectorAll("input[name=np]"), function (c) {
      if (c.checked) perms[c.value] = true;
    });
    msg.textContent = "Adding…";
    try {
      await cloudAdmin({ action: "create", email: em, password: pw, name: f.nm.value.trim(), role: role, perms: perms });
    } catch (x) {
      msg.textContent = x.message;
      return;
    }
    await cloudPullProfiles().catch(function () {});
    // shortcut: admin-users only stores the permissions it knows (not "greens"), so set them all here; add "greens" to its PERMS on its next deploy.
    var nu = st.users.find(function (u) {
      return u.email === em.toLowerCase();
    });
    if (nu) await cloudPatchProfile(nu.id, { perms: perms }).then(function () {
      nu.perms = perms;
    }).catch(function () {});
    audit("User management", "Added " + ROLE_LABEL[role] + " " + em);
    save();
    this.reset();
    msg.className = "mgmsg ok";
    msg.textContent = "Added " + em + " as " + ROLE_LABEL[role] + ".";
    renderManage();
  });

  var tpDB = null,
    tpEdit = null,
    pdfUrl = null,
    pdfName = "";
  function tpOpen() {
    return new Promise(function (res, rej) {
      if (tpDB) return res(tpDB);
      var r = indexedDB.open("wh-lookup-files", 3);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("pdfs")) d.createObjectStore("pdfs", { keyPath: "id" });
        if (!d.objectStoreNames.contains("sheets"))
          d.createObjectStore("sheets", { keyPath: "id" });
        if (!d.objectStoreNames.contains("handles"))
          d.createObjectStore("handles", { keyPath: "id" });
      };
      r.onsuccess = function () {
        tpDB = r.result;
        res(tpDB);
      };
      r.onerror = function () {
        rej(r.error);
      };
    });
  }
  function tpTx(mode, fn, store) {
    return tpOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var sn = store || "pdfs",
          tx = db.transaction(sn, mode),
          os = tx.objectStore(sn),
          req = fn(os);
        tx.oncomplete = function () {
          res(req && req.result);
        };
        tx.onerror = tx.onabort = function () {
          rej(tx.error);
        };
      });
    });
  }
  async function tpBlob(id) {
    var r = await tpTx("readonly", function (os) {
      return os.get(id);
    });
    return r && r.blob;
  }
  function whoName(em) {
    var u = st.users.find(function (x) {
      return x.email === em;
    });
    return u ? u.name || u.email : sess && em === sess.email ? sess.name || em : em || "";
  }
  function fmtSize(n) {
    return n >= 1048576
      ? (n / 1048576).toFixed(1) + " MB"
      : Math.max(1, Math.round(n / 1024)) + " KB";
  }
  /* =====================================================================
     Manage: PDF templates library
     ===================================================================== */
  // Cloud templates: PDFs in the "Templates" folder of the inspection-pdfs bucket (read on first open, or Refresh).
  var TP_DIR = "Templates/",
    tpCloud = null,
    tpCloudErr = "";
  async function tpCloudScan() {
    if (!cloudOn()) return renderTemplates();
    try {
      tpCloud = (await sbList("inspection-pdfs", TP_DIR)).filter(function (f) {
        return f.id && /\.pdf$/i.test(f.name);
      });
      tpCloudErr = "";
    } catch (x) {
      tpCloudErr = x instanceof TypeError ? "offline" : x.message;
    }
    renderTemplates();
    if (inMenuOn) renderInsp();
  }
  // Per-device settings for a cloud template (page turn, typed question text), kept in st.tplSet by
  // name. The first time, they start from a template of the same name saved on this device.
  function tpCloudRef(cf) {
    var name = cf.name.replace(/\.pdf$/i, "");
    if (!st.tplSet) st.tplSet = {};
    var t = st.tplSet[name];
    if (!t) {
      var loc =
        st.tpl.find(function (x) {
          return x.name === name;
        }) || {};
      t = st.tplSet[name] = { rot: loc.rot, qtext: loc.qtext, note: loc.note || "" };
    }
    t.id = "c:" + name;
    t.name = name;
    t.file = cf.name;
    return t;
  }
  function tpCloudHtml() {
    var h = '<h3 class="fdsec">In the cloud</h3>';
    if (!cloudOn()) return h + '<p class="fdnote">Sign in to see the templates stored in the cloud.</p>';
    h +=
      '<div class="tpbar"><span class="m">' +
      (tpCloudErr === "offline"
        ? "Offline: cloud templates show again when you're back online."
        : tpCloudErr
          ? "Couldn't load the cloud templates: " + esc(tpCloudErr)
          : !tpCloud
            ? "Loading…"
            : tpCloud.length + (tpCloud.length === 1 ? " template" : " templates") + " in the cloud Templates folder.") +
      '</span><span class="sp"></span><button data-tcr>Refresh</button></div>';
    if (!tpCloud || !tpCloud.length) return h;
    return (
      h +
      '<div class="tw" style="margin-top:14px;border:1px solid var(--line);border-radius:10px"><table class="sumtbl"><thead><tr><th>Template (PDF)</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>' +
      tpCloud
        .map(function (f, i) {
          var md = f.metadata || {},
            mod = Date.parse(md.lastModified || f.updated_at || f.created_at);
          return (
            '<tr><td class="cname">' +
            esc(f.name.replace(/\.pdf$/i, "")) +
            '</td><td class="ph">' +
            fmtSize(md.size || 0) +
            "</td><td>" +
            (mod ? new Date(mod).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "–") +
            '</td><td class="act"><button data-tcv="' +
            i +
            '">View</button><button data-tcd="' +
            i +
            '">Download</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }
  function renderTemplates() {
    var box = $("tpList"),
      cloud = tpCloudHtml() + '<h3 class="fdsec">Saved on this device only</h3>';
    if (!st.tpl.length) {
      box.innerHTML =
        cloud +
        '<div class="empty" style="padding:26px 0">No templates uploaded yet. Upload a PDF to keep it here as a guide.</div>';
      return;
    }
    box.innerHTML =
      cloud +
      '<div class="tw" style="margin-top:14px;border:1px solid var(--line);border-radius:10px"><table class="sumtbl"><thead><tr><th>Template (PDF)</th><th>Guide for</th><th>Size</th><th>Uploaded</th><th></th></tr></thead><tbody>' +
      st.tpl
        .slice()
        .reverse()
        .map(function (f) {
          return (
            '<tr><td class="cname">' +
            esc(f.name) +
            "</td><td>" +
            (esc(f.note) || "–") +
            '</td><td class="ph">' +
            fmtSize(f.size) +
            "</td><td>" +
            new Date(f.ts).toLocaleDateString([], {
              month: "short",
              day: "numeric",
              year: "numeric",
            }) +
            "<small>" +
            esc(whoName(f.by)) +
            '</small></td><td class="act"><button data-v="' +
            f.id +
            '">View</button><button data-d="' +
            f.id +
            '">Download</button><button data-e="' +
            f.id +
            '">Edit</button><button data-r="' +
            f.id +
            '">Remove</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>";
  }
  // Uploads go to the cloud Templates folder, so every signed-in device can use them.
  async function tpAdd(files) {
    if (!cloudOn() || !isMgr()) return toast("Sign in as a manager to upload templates to the cloud.");
    var jobs = [];
    files.forEach(function (f) {
      if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) return toast("“" + f.name + "” is not a PDF.");
      if (f.size > 30 * 1024 * 1024) return toast("“" + f.name + "” is larger than 30 MB.");
      var same = (tpCloud || []).some(function (c) {
        return c.name === f.name;
      });
      if (same && !confirm("“" + f.name + "” is already in the cloud. Replace it?")) return;
      jobs.push({ path: TP_DIR + f.name, file: f });
    });
    if (!jobs.length) return;
    var ok = await sbUploadAll("inspection-pdfs", jobs, "template");
    if (ok) {
      audit("Templates", "Uploaded " + ok + (ok === 1 ? " template" : " templates") + " to the cloud");
      save();
    }
    tpCloudScan();
  }
  // Greens Management: View Count Sheets lists transfers waiting and saved counts; a location shows its greens by size.
  var grView = null; // "sheets", a location name, or null
  function grPick(b) {
    [].forEach.call($("grBtns").querySelectorAll(".mbtn"), function (x) {
      x.classList.toggle("on", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    grView = b.id === "grSheetsBtn" ? "sheets" : b.id === "grCodesBtn" ? "codes" : b.textContent;
    grUse = null;
    renderGr();
  }
  $("grBtns").onclick = function (e) {
    var b = e.target.closest(".mbtn");
    $("grTip").hidden = true;
    if (b) grPick(b);
  };
  // Pointing at a location (mouse only) shows its greens in a small card under the button.
  [].forEach.call($("grBtns").querySelectorAll(".mbtn:not(#grSheetsBtn):not(#grCodesBtn)"), function (b) {
    b.onmouseenter = function () {
      if (!matchMedia("(hover: hover)").matches) return;
      var t = $("grTip"),
        r = b.getBoundingClientRect();
      t.innerHTML = "<h4>" + esc(b.textContent) + "</h4>" + grStockHtml(b.textContent);
      t.hidden = false;
      t.style.left = Math.max(8, Math.min(r.left, innerWidth - t.offsetWidth - 8)) + "px";
      t.style.top = r.bottom + 8 + "px";
    };
    b.onmouseleave = function () {
      $("grTip").hidden = true;
    };
  });

  // Size label for a greens item from its description: [group, size, sort key].
  var GR_JK = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  function grSize(n) {
    var it = items.find(function (x) {
        return x.n === n;
      }),
      p = it ? it.d.toUpperCase().split("|") : [],
      s = p[2] || "",
      m = s.match(/(\d+)\D*WAIST\D*(\d+)/),
      z = s.match(/(\d?X-)?LARGE|MEDIUM|SMALL/);
    if (/PANTS/.test(p[1]) && m) return ["Pants", m[1] + " x " + m[2], m[1] * 100 + +m[2]];
    if (/JACKET/.test(p[1]) && z) {
      var k = z[0] === "SMALL" ? "S" : z[0] === "MEDIUM" ? "M" : z[0].replace("X-LARGE", "XL").replace("LARGE", "L"),
        t = /TALL/.test(s) ? " Tall" : /LONG/.test(s) ? " Long" : "";
      return ["Jackets", k + t, GR_JK.indexOf(k) + (t ? 0.5 : 0)];
    }
    return ["Other", n, 0];
  }
  // What's at a location now: its newest count sheet, plus transfers approved after it.
  function grStock(site) {
    var last = null,
      q = {};
    grSheets().forEach(function (e) {
      if (e.gr.site === site && (!last || e.ts > last.ts)) last = e;
    });
    if (last)
      Object.keys(last.gr.counts).forEach(function (n) {
        q[n] = last.gr.counts[n];
      });
    grXfers()
      .sort(function (a, b) {
        return a.e.ts - b.e.ts;
      })
      .forEach(function (x) {
        var g = x.e.gt,
          sg = g.from === site ? -1 : g.to === site ? 1 : 0;
        if (g.done && sg && (!last || x.e.ts > last.ts))
          g.order.forEach(function (n) {
            q[n] = Math.max(0, (q[n] || 0) + sg * g.counts[n]); // runs out at 0, never negative
          });
      });
    return { q: q, last: last };
  }
  // Use count sheet for updated Qty: grUse = { k } while picking (k "") or previewing sheet k for the location shown.
  // Confirming saves a new count sheet for the location: its current quantities, with every item on the chosen sheet replaced.
  var grUse = null;
  function grUseRows(site, e) {
    var cur = grStock(site).q;
    return e.gr.order.map(function (n) {
      return { n: n, now: cur[n] || 0, nw: e.gr.counts[n] || 0 };
    });
  }
  function grUseHtml(site) {
    var e =
      grUse.k &&
      grSheets().find(function (x) {
        return x.k === grUse.k;
      });
    if (!e) {
      var l = grSheets().sort(function (a, b) {
        return b.ts - a.ts; // newest first
      });
      return (
        '<div class="gruse"><h4>Use a count sheet for ' + esc(site) + "</h4><p>Pick the count sheet to take quantities from. You'll see every change before anything is saved.</p>" +
        (l.length
          ? '<div class="tw"><table class="sumtbl grsheets"><thead><tr><th>Count sheet</th><th>Counted by</th><th>Items</th><th>Saved</th><th></th></tr></thead><tbody>' +
            l
              .map(function (x) {
                return (
                  '<tr><td class="cname">' + esc(x.gr.site) + "</td><td>" + esc(whoName(x.by)) + '</td><td class="ph">' + x.gr.order.length +
                  (x.gr.order.length === 1 ? " item" : " items") + "</td><td>" + dvWhen(x.ts) +
                  '</td><td class="act"><button type="button" data-grusepick="' + esc(x.k) + '">Preview</button></td></tr>'
                );
              })
              .join("") +
            "</tbody></table></div>"
          : '<div class="empty">No count sheets yet. Select Create Greens Count to make one.</div>') +
        '<div class="grubtns"><button type="button" data-grusex>Cancel</button></div></div>'
      );
    }
    var rows = grUseRows(site, e),
      ch = rows.filter(function (r) {
        return r.now !== r.nw;
      }).length;
    return (
      '<div class="gruse"><h4>Changes to ' + esc(site) + "</h4><p>From the " + esc(e.gr.site) + " count sheet saved " + dvWhen(e.ts) + " by " + esc(whoName(e.by)) + ". " +
      (ch ? ch + (ch === 1 ? " quantity changes." : " quantities change.") + " Items not on this sheet keep their quantity." : "Every quantity already matches this count sheet.") +
      '</p><div class="tw"><table class="sumtbl grsheets"><thead><tr><th>Item #</th><th>Now</th><th>New</th><th>Change</th></tr></thead><tbody>' +
      rows
        .map(function (r) {
          var z = grSize(r.n),
            d = r.nw - r.now;
          return (
            '<tr><td class="cname"><b>' + esc(r.n) + "</b>" + (z[0] === "Other" ? "" : ' <span class="grsz">' + z[0] + " " + esc(z[1]) + "</span>") +
            '</td><td data-l="Now">' + r.now + '</td><td data-l="New">' + r.nw + '</td><td data-l="Change" class="' + (d > 0 ? "pos" : d < 0 ? "neg" : "") + '">' +
            (d > 0 ? "+" + d : d < 0 ? "−" + -d : "No change") + "</td></tr>"
          );
        })
        .join("") +
      '</tbody></table></div><div class="grubtns"><button type="button" data-grusepick="">Pick another sheet</button><button type="button" data-grusex>Cancel</button><button type="button" class="primary" data-grusego' +
      (ch ? "" : " disabled") + ">Update quantities</button></div></div>"
    );
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-gruse], button[data-grusepick], button[data-grusex], button[data-grusego]");
    if (!b) return;
    if (b.hasAttribute("data-gruse")) grUse = { k: "" };
    else if (b.hasAttribute("data-grusepick")) grUse = { k: b.dataset.grusepick };
    else if (b.hasAttribute("data-grusex")) grUse = null;
    else {
      var e = grSheets().find(function (x) {
        return grUse && x.k === grUse.k;
      });
      if (!e) return;
      var cur = grStock(grView).q,
        counts = {},
        rows = grUseRows(grView, e);
      Object.keys(cur).forEach(function (n) {
        counts[n] = cur[n];
      });
      rows.forEach(function (r) {
        counts[r.n] = r.nw;
      });
      var order = Object.keys(counts).filter(function (n) {
          return counts[n] > 0;
        }),
        keep = {},
        ch = rows.filter(function (r) {
          return r.now !== r.nw;
        }).length;
      order.forEach(function (n) {
        keep[n] = counts[n];
      });
      audit("Greens", "Updated Greens quantities at " + grView + " from the " + e.gr.site + " count sheet (" + dvWhen(e.ts) + "): " + ch + (ch === 1 ? " change" : " changes"));
      st.audit[st.audit.length - 1].gr = { site: grView, counts: keep, order: order };
      grUse = null;
      save();
      toast("Quantities updated for " + grView + ".");
    }
    renderGr();
  });
  // Edit counts: the location's current count opens in the count screen; Save counts saves it as a new count sheet.
  document.addEventListener("click", function (e) {
    if (!e.target.closest("button[data-gredit]")) return;
    var q = grStock(grView).q,
      order = Object.keys(q).filter(function (n) {
        return q[n] > 0;
      }),
      counts = {};
    order.forEach(function (n) {
      counts[n] = q[n];
    });
    st.grCount = { site: grView, edit: true, ts: Date.now(), counts: counts, order: order };
    grMsg = "Change any count, scan to add an item, then select <b>Save counts</b>.";
    save();
    renderGr();
  });
  $("grCount").addEventListener("change", function (e) {
    var c = st.grCount,
      row = e.target.closest(".grqin") && e.target.closest("[data-code]");
    if (!c || !row) return;
    c.counts[row.dataset.code] = Math.max(0, Math.floor(+e.target.value || 0));
    save();
    renderGr();
  });
  // Most popular sizes at a location: the 4 with the most pieces moved in or out by approved transfers,
  // as a pie (everything else folds into "Other sizes") beside a ranked list that doubles as its legend.
  function grPopHtml(site) {
    var mv = {},
      all = 0;
    grXfers().forEach(function (x) {
      var g = x.e.gt;
      if (g.done && (g.from === site || g.to === site))
        g.order.forEach(function (n) {
          mv[n] = (mv[n] || 0) + g.counts[n];
          all += g.counts[n];
        });
    });
    var top = Object.keys(mv)
      .sort(function (a, b) {
        return mv[b] - mv[a];
      })
      .slice(0, 4);
    if (!top.length) return '<div class="sumsec">Most popular sizes</div><p class="grnone">No transfers in or out of here yet.</p>';
    var sl = top.map(function (n, i) {
        var z = grSize(n);
        return { name: (z[0] === "Other" ? "" : z[0] + " ") + z[1], v: mv[n], c: i + 1 };
      }),
      rest = all - sl.reduce(function (s, x) {
        return s + x.v;
      }, 0),
      a0 = 0,
      pct = function (v) {
        return Math.round((v / all) * 100) + "%";
      };
    if (rest > 0) sl.push({ name: "Other sizes", v: rest, c: 0 });
    var paths = sl
      .map(function (x) {
        var a1 = a0 + (x.v / all) * 2 * Math.PI,
          p = function (a) {
            return (50 + 48 * Math.sin(a)).toFixed(2) + " " + (50 - 48 * Math.cos(a)).toFixed(2);
          },
          d = sl.length === 1 ? "M50 2a48 48 0 1 1 0 96a48 48 0 1 1 0-96z" : "M50 50L" + p(a0) + "A48 48 0 " + (a1 - a0 > Math.PI ? 1 : 0) + " 1 " + p(a1) + "z";
        a0 = a1;
        return '<path class="grpie' + x.c + '" d="' + d + '"><title>' + esc(x.name) + ": " + x.v + " moved, " + pct(x.v) + "</title></path>";
      })
      .join("");
    return (
      '<div class="sumsec">Most popular sizes</div><div class="grpopw"><svg class="grpiesvg" viewBox="0 0 100 100" role="img" aria-label="Pie chart of pieces moved in and out of ' +
      esc(site) +
      ' by size">' +
      paths +
      '</svg><ol class="grpop">' +
      sl
        .map(function (x) {
          return (
            '<li class="' +
            (x.c ? "" : "groth") +
            '"><i class="grpie' +
            x.c +
            '"></i><span>' +
            esc(x.name) +
            "</span><b>" +
            x.v +
            " moved</b><em>" +
            pct(x.v) +
            "</em></li>"
          );
        })
        .join("") +
      "</ol></div>"
    );
  }
  // Every Pants and Jackets item # on the GCW.GREENS form.
  function grAllSizes() {
    var out = [];
    GR_MAP.forEach(function (t) {
      t[3].split(" ").forEach(function (end) {
        var n = t[0] + end;
        if (grSize(n)[0] !== "Other" && out.indexOf(n) < 0) out.push(n);
      });
    });
    return out;
  }
  function grStockHtml(site) {
    var s = grStock(site),
      gs = {},
      q = {};
    grAllSizes().forEach(function (n) {
      q[n] = 0; // every size shows, at 0 until a count says otherwise
    });
    Object.keys(s.q).forEach(function (n) {
      q[n] = s.q[n];
    });
    Object.keys(q).forEach(function (n) {
      var z = grSize(n);
      (gs[z[0]] = gs[z[0]] || []).push([z[1], q[n], z[2]]);
    });
    var names = ["Pants", "Jackets", "Other"].filter(function (g) {
      return gs[g];
    });
    if (!names.length)
      return '<p class="grnone">' + (s.last ? "Nothing here at the last count." : "No count here yet. Select Create Greens Count to make one.") + "</p>";
    return (
      '<div class="grstock">' +
      names
        .map(function (g) {
          return (
            "<div><h5>" +
            g +
            "</h5><ul>" +
            gs[g]
              .sort(function (a, b) {
                return a[2] - b[2] || (a[0] < b[0] ? -1 : 1);
              })
              .map(function (r) {
                return "<li><span>" + esc(r[0]) + "</span><b>" + r[1] + "</b></li>";
              })
              .join("") +
            "</ul></div>"
          );
        })
        .join("") +
      "</div>" +
      '<p class="grnone">' + (s.last ? "Last count " + dvWhen(s.last.ts) : "No count here yet, so every size shows 0.") + "</p>"
    );
  }

  /* ---------- Greens Management: Transfer ----------
     Pick From and To, scan what moves, then Transfer now or Transfer later. Transfers live in the
     activity log as entries with .gt. The log is add-only, so approving or editing a saved transfer
     adds a new entry pointing at the first one (gt.of); the newest entry for a transfer is the one that counts. */
  function grXfers() {
    var by = {},
      gone = grGone();
    (st.audit || []).forEach(function (e) {
      if (!e.gt) return;
      var k = e.gt.of || e.k;
      if (gone[k]) return;
      if (!by[k] || e.ts > by[k].ts) by[k] = e;
    });
    return Object.keys(by).map(function (k) {
      return { k: k, e: by[k] };
    });
  }
  // One tinted card per list in View Count Sheets, so Transferable and Count sheets read apart.
  function grSec(t, title, n, desc, body) {
    return '<section class="grsec grsec-' + t + '"><h3>' + title + ' <span class="grn">' + n + "</span></h3><p>" + desc + "</p>" + body + "</section>";
  }
  function grXHtml() {
    var l = grXfers()
      .filter(function (x) {
        return !x.e.gt.done;
      })
      .sort(function (a, b) {
        return b.e.ts - a.e.ts;
      });
    if (!l.length) return '<div class="empty">No transfers waiting. Select Transfer, then Transfer later, to save one here.</div>';
    return (
      '<div class="tw"><table class="sumtbl grsheets"><thead><tr><th>Transfer</th><th>Items</th><th>Saved by</th><th>Saved</th><th></th></tr></thead><tbody>' +
      l
        .map(function (x) {
          var g = x.e.gt,
            tot = g.order.reduce(function (s2, n) {
              return s2 + g.counts[n];
            }, 0);
          return (
            '<tr><td class="cname">' +
            esc(g.from) +
            " to " +
            esc(g.to) +
            '</td><td class="ph">' +
            g.order.length +
            (g.order.length === 1 ? " item, " : " items, ") +
            tot +
            " total</td><td>" +
            esc(whoName(x.e.by)) +
            "</td><td>" +
            dvWhen(x.e.ts) +
            '</td><td class="act">' +
            (can("grapprove") ? '<button type="button" data-grxopen="' + esc(x.k) + '">Review</button>' : "") +
            (can("grdel") ? '<button type="button" class="danger" data-grdel="' + esc(x.k) + '">Delete</button>' : "") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }
  function grXSave(c, now) {
    var order = c.order.filter(function (n) {
      return c.counts[n] > 0;
    });
    if (!order.length) return toast("Scan at least one barcode first.");
    var counts = {},
      tot = 0;
    order.forEach(function (n) {
      counts[n] = c.counts[n];
      tot += c.counts[n];
    });
    var what = tot + (tot === 1 ? " item" : " items") + " from " + c.site + " to " + c.to;
    if (now && c.of && !confirm("Approve the transfer of " + what + "?")) return;
    audit("Greens", (now ? "Transferred " : "Transfer saved for later: ") + what);
    st.audit[st.audit.length - 1].gt = { from: c.site, to: c.to, counts: counts, order: order, done: now, of: c.of || null };
    st.grCount = null;
    grMsg = "";
    grPick($("grSheetsBtn"));
    save();
    toast(now ? "Transferred " + what + "." : "Saved under View Count Sheets, Transferable.");
  }
  $("grXBtn").onclick = function () {
    var o =
      '<option value="">Pick a location</option>' +
      [].map
        .call($("grSites").children, function (b) {
          return "<option>" + esc(b.dataset.site) + "</option>";
        })
        .join("");
    $("grXFrom").innerHTML = $("grXTo").innerHTML = o;
    $("grXErr").hidden = true;
    $("grXDlg").showModal();
  };
  $("grXFrom").onchange = $("grXTo").onchange = function () {
    $("grXErr").hidden = true;
  };
  $("grXX").onclick = function () {
    $("grXDlg").close();
  };
  $("grXGo").onclick = function () {
    var f = $("grXFrom").value,
      t = $("grXTo").value,
      err = !f || !t ? "Pick both locations." : f === t ? "Pick two different locations." : "";
    $("grXErr").textContent = err;
    $("grXErr").hidden = !err;
    if (err) return;
    $("grXDlg").close();
    st.grCount = { site: f, to: t, ts: Date.now(), counts: {}, order: [] };
    grMsg = "";
    save();
    renderGr();
    camOpen(grAdd, true);
  };
  // Review a saved transfer: its items come back into scan mode to add or remove, then Approve transfer.
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-grxopen]");
    if (!b) return;
    if (!can("grapprove")) return deny("approve Greens transfers");
    var x = grXfers().find(function (y) {
      return y.k === b.dataset.grxopen;
    });
    if (!x || x.e.gt.done) return toast("That transfer was already approved.");
    var g = x.e.gt;
    st.grCount = { site: g.from, to: g.to, of: x.k, ts: Date.now(), counts: Object.assign({}, g.counts), order: g.order.slice() };
    grMsg = "Add or remove any items, then select <b>Approve transfer</b>.";
    save();
    renderGr();
  });

  /* ---------- Greens Management: Create Greens Count ----------
     Pick a site, scan each item's barcode (one scan = 1), then Done saves it as a count sheet.
     View Count Sheets and the profile's Green Count tab fill GCW.GREENS from it on demand.
     st.grCount: { site, ts, counts: { code: n }, order: [code], to?, of? }, kept until Done or Cancel
     (also on the person's profile as grDraft, so another device can pick it up).
     A transfer sets to (and of when reviewing a saved one); see Transfer above. */
  var grMsg = "";
  // Barcodes and Sizes: every item on GCW.GREENS with its size and a Code 128 barcode of its item #.
  // Code 128 bar/space widths for values 0-105; digits-only item #s (even length) use code set C, others set B.
  var C128 = (
    "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
    "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
    "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
    "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
    "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
    "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
    "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232"
  ).split(" ");
  function c128Svg(t) {
    var c = /^(\d\d)+$/.test(t),
      v = [c ? 105 : 104],
      i;
    for (i = 0; i < t.length; i += c ? 2 : 1) v.push(c ? +t.substr(i, 2) : t.charCodeAt(i) - 32);
    var sum = v[0];
    for (i = 1; i < v.length; i++) sum += i * v[i];
    v.push(sum % 103);
    var w = v.map(function (x) {
        return C128[x];
      }).join("") + "2331112", // + stop
      x = 10, // quiet zone
      bars = "";
    for (i = 0; i < w.length; i++) {
      if (i % 2 === 0) bars += '<rect x="' + x + '" width="' + w[i] + '" height="50"/>';
      x += +w[i];
    }
    return '<svg viewBox="0 0 ' + (x + 10) + ' 50" preserveAspectRatio="none" aria-hidden="true">' + bars + "</svg>";
  }
  function grCodesHtml() {
    var gs = {};
    GR_MAP.forEach(function (t) {
      t[3].split(" ").forEach(function (end) {
        var n = t[0] + end,
          z = grSize(n),
          l = (gs[z[0]] = gs[z[0]] || []);
        if (!l.some(function (r) { return r.n === n; })) l.push({ n: n, z: z });
      });
    });
    return ["Pants", "Jackets", "Other"]
      .filter(function (g) {
        return gs[g];
      })
      .map(function (g, i) {
        var l = gs[g].sort(function (a, b) {
          return a.z[2] - b.z[2] || (a.n < b.n ? -1 : 1);
        });
        return grSec(
          ["x", "c", "d"][i],
          g,
          l.length + (g === "Other" ? (l.length === 1 ? " item" : " items") : " sizes"),
          i ? "" : "Scan a barcode from the screen, or read the item # under it.",
          '<div class="grcodes">' +
            l
              .map(function (r) {
                var it = g === "Other" && items.find(function (x) { return x.n === r.n; }),
                  lb = g === "Other" ? (it ? it.d.split("|")[1] || it.d : "Not in the item list") : r.z[1];
                return '<figure class="grcode"><figcaption><b>' + esc(lb) + "</b><span>" + esc(r.n) + "</span></figcaption>" + c128Svg(r.n) + "</figure>";
              })
              .join("") +
            "</div>"
        );
      })
      .join("");
  }
  function renderGr() {
    var c = st.grCount,
      pan = !c && grView;
    $("grCount").hidden = !c;
    $("grSoon").hidden = !!c || !!grView;
    // #grSheets holds the panel for the picked button: transfers and count sheets, or a location's greens.
    $("grSheets").hidden = !pan;
    if (pan)
      $("grSheets").innerHTML =
        grView === "codes"
          ? grCodesHtml()
          : grView === "sheets"
          ? grSec("x", "Transferable", grXfers().filter(function (x) { return !x.e.gt.done; }).length + " waiting", "Transfers saved for later. Review one to approve it.", grXHtml()) +
            grSec("c", "Count sheets", grSheets().length + " saved", "Finished counts for each location.", grSheetsHtml(grSheets().reverse(), false)) +
            grDelHtml()
          : '<div class="grhead"><h3>' +
            esc(grView) +
            '</h3><div class="grhbtns"><button type="button" class="gredit" data-gredit>Edit counts</button><button type="button" class="gredit" data-gruse>Use count sheet for updated Qty</button></div></div>' +
            (grUse ? grUseHtml(grView) : grStockHtml(grView) + grPopHtml(grView));
    $("grNew").hidden = $("grXBtn").hidden = !!c;
    if (!c) return;
    var tot = c.order.reduce(function (s, k) {
        return s + c.counts[k];
      }, 0),
      q = function (a) {
        return $("grCount").querySelector('[data-gr="' + a + '"]');
      };
    $("grCountH").textContent = c.to ? "Transfer from " + c.site + " to " + c.to : (c.edit ? "Edit counts: " : "Greens count: ") + c.site;
    $("grCountN").textContent = c.order.length + (c.order.length === 1 ? " item, " : " items, ") + tot + (c.to ? " total" : " counted");
    q("cancel").textContent = c.of ? "Close without saving" : c.to ? "Cancel transfer" : c.edit ? "Cancel edit" : "Cancel count";
    q("later").hidden = !c.to;
    q("done").textContent = c.of ? "Approve transfer" : c.to ? "Transfer now" : c.edit ? "Save counts" : "Done";
    $("grFlash").innerHTML = grMsg;
    $("grFlash").hidden = !grMsg;
    $("grList").innerHTML = c.order.length
      ? '<table class="pktab grtab"><thead><tr><th>Item #</th><th>Count</th><th></th></tr></thead><tbody>' +
        c.order
          .slice()
          .reverse()
          .map(function (k) {
            var z = grSize(k);
            return (
              '<tr data-code="' +
              esc(k) +
              '"><td data-l="Item #"><b>' +
              esc(k) +
              "</b>" +
              (z[0] === "Other" ? "" : ' <span class="grsz">' + z[0] + " " + esc(z[1]) + "</span>") +
              '</td><td data-l="Count"><span class="qty"><button type="button" data-grq="-1" aria-label="One less">−</button><input class="grqin" type="number" min="0" inputmode="numeric" value="' +
              c.counts[k] +
              '" aria-label="Count for ' +
              esc(k) +
              '" /><button type="button" data-grq="1" aria-label="One more">+</button></span></td><td><button type="button" data-grrm>Remove</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table>"
      : '<p class="pknote">Nothing counted yet. Select Scan barcode, or type an item # above.</p>';
  }
  function grAdd(raw) {
    var c = st.grCount,
      code = String(raw || "").trim();
    if (!c || !code) return "";
    if (!(code in c.counts)) {
      c.counts[code] = 0;
      c.order.push(code);
    }
    c.counts[code]++;
    grMsg = (c.to ? "Added <b>" : "Counted <b>") + esc(code) + "</b> (now " + c.counts[code] + ").";
    dvBeep();
    save();
    renderGr();
    return grMsg;
  }
  $("grNew").onclick = function () {
    $("grDlg").showModal();
  };
  $("grDlgX").onclick = function () {
    $("grDlg").close();
  };
  $("grSites").onclick = function (e) {
    var b = e.target.closest("[data-site]");
    if (!b) return;
    $("grDlg").close();
    st.grCount = { site: b.dataset.site, ts: Date.now(), counts: {}, order: [] };
    grMsg = "";
    save();
    renderGr();
    camOpen(grAdd, true);
  };
  $("grScan").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    grAdd(this.value);
    $("grScan").value = "";
  });
  $("grCount").addEventListener("click", function (e) {
    var c = st.grCount,
      b = e.target.closest("button");
    if (!c || !b) return;
    var row = b.closest("[data-code]"),
      k = row && row.dataset.code,
      act = b.dataset.gr;
    if (act === "add") {
      grAdd($("grScan").value);
      $("grScan").value = "";
    } else if (act === "cam") camOpen(grAdd, true);
    else if (act === "cancel") {
      if (!c.of && c.order.length && !confirm("Cancel the " + (c.to ? "transfer" : c.site + " count") + "? The " + c.order.length + " scanned items are thrown away."))
        return;
      st.grCount = null;
      grMsg = "";
      save();
      renderGr();
    } else if (act === "done") c.to ? grXSave(c, true) : grDone(c);
    else if (act === "later") grXSave(c, false);
    else if (k && b.dataset.grq) {
      c.counts[k] = Math.max(0, c.counts[k] + +b.dataset.grq);
      save();
      renderGr();
    } else if (k && "grrm" in b.dataset) {
      delete c.counts[k];
      c.order = c.order.filter(function (x) {
        return x !== k;
      });
      save();
      renderGr();
    }
  });
  // GCW.GREENS Quantity cells, measured on the upright scan at 3 px per pt:
  // [item # prefix, Quantity column center x, row lines top to bottom, item # endings in row order].
  // shortcut: fits this one scan of the form; re-measure if the template is rescanned or reordered.
  var GR_MAP = [
    ["1001313", 612, [290,343,396,449,502,555,608,661,712,766,820,874,928,982,1036,1090,1144,1198,1253,1307,1360,1414,1468,1521,1576,1630,1683,1737,1791,1846,1901,1955,2009,2064,2120,2176],
      "194 412 436 163 196 414 438 166 215 202 416 439 169 217 206 421 440 171 219 207 422 441 172 223 208 423 443 174 225 406 209 424 444 176 228"],
    ["1001313", 1167, [293,345,398,451,504,557,611,664,715,769,823,877,931,985,1039,1093,1147,1202,1256,1310,1364,1418,1472,1526,1580,1634,1688,1741,1796,1851,1905,1959,2014,2068,2123],
      "216 425 445 178 230 408 220 426 121 180 236 221 427 126 181 238 224 428 127 183 227 429 128 430 129 185 232 431 130 132 187 234 433 435"],
    ["1001661", 1709, [295,348,401,454,507,560,614,667,718,772], "450 448 446 452 454 456 458 460 462"],
    ["1001661", 1709, [880,934,988,1043,1097,1151,1205,1260,1314,1368], "451 449 447 453 455 457 459 461 463"],
  ];
  function grOnForm(n) {
    return GR_MAP.some(function (t) {
      return n.indexOf(t[0]) === 0 && t[3].split(" ").indexOf(n.slice(t[0].length)) >= 0;
    });
  }
  // Saved count sheets live in the activity log (st.audit entries with .gr), which syncs to every device.
  function grSheets(me) {
    var gone = grGone();
    return (st.audit || []).filter(function (e) {
      return e.gr && !gone[e.k] && (!me || e.by === me);
    });
  }
  // Deleted count sheets and transfers stay in the shared log; list them (view only), newest first.
  function grDelHtml() {
    var rows = (st.audit || [])
      .filter(function (d) {
        return d.grdel;
      })
      .reverse()
      .map(function (d) {
        var sh = (st.audit || []).find(function (e) {
            return e.gr && e.k === d.grdel;
          }),
          x = null;
        if (!sh)
          (st.audit || []).forEach(function (e) {
            if (e.gt && (e.gt.of || e.k) === d.grdel && (!x || e.ts > x.ts)) x = e;
          });
        var g = sh ? sh.gr : x ? x.gt : null;
        if (!g) return "";
        var tot = g.order.reduce(function (s2, n) {
          return s2 + (g.counts[n] || 0);
        }, 0);
        return (
          '<tr><td class="cname">' + (sh ? "Count sheet: " + esc(g.site) : "Transfer: " + esc(g.from) + " to " + esc(g.to)) +
          '</td><td class="ph">' + g.order.length + (g.order.length === 1 ? " item, " : " items, ") + tot + " total</td><td>" +
          esc(whoName(d.by)) + "</td><td>" + dvWhen(d.ts) + '</td><td class="act">' +
          (sh ? '<button type="button" data-grview="' + esc(sh.k) + '">View</button>' : "") +
          "</td></tr>"
        );
      })
      .filter(Boolean);
    if (!rows.length) return "";
    return grSec(
      "del",
      "Deleted",
      rows.length + " deleted",
      "Count sheets and transfers that were deleted. They're kept here for the record and no longer count toward stock.",
      '<div class="tw"><table class="sumtbl grsheets"><thead><tr><th>What</th><th>Items</th><th>Deleted by</th><th>Deleted</th><th></th></tr></thead><tbody>' +
        rows.join("") +
        "</tbody></table></div>"
    );
  }
  // Deleting a count sheet or transfer adds an entry naming it (.grdel), because the shared log is add-only.
  function grGone() {
    var g = {};
    (st.audit || []).forEach(function (e) {
      if (e.grdel) g[e.grdel] = 1;
    });
    return g;
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-grdel]");
    if (!b) return;
    if (!can("grdel")) return deny("delete Greens count sheets and transfers");
    var k = b.dataset.grdel,
      sh = grSheets().find(function (e) {
        return e.k === k;
      }),
      x = !sh &&
        grXfers().find(function (y) {
          return y.k === k;
        }),
      what = sh
        ? "the " + sh.gr.site + " count sheet from " + dvWhen(sh.ts)
        : x
        ? "the transfer from " + x.e.gt.from + " to " + x.e.gt.to + " saved " + dvWhen(x.e.ts)
        : "";
    if (!what) return toast("That was already deleted.");
    if (!confirm("Delete " + what + "? This can't be undone.")) return;
    audit("Greens", "Deleted " + what);
    st.audit[st.audit.length - 1].grdel = k;
    save();
    renderGr();
    toast("Deleted " + what + ".");
  });
  // Done: save the count as a count sheet and show it under View Count Sheets.
  function grDone(c) {
    var order = c.order.filter(function (n) {
      return c.counts[n] > 0;
    });
    if (!order.length && !c.edit) return toast("Scan at least one barcode first.");
    var counts = {},
      tot = 0,
      miss = order.filter(function (n) {
        return !grOnForm(n);
      });
    order.forEach(function (n) {
      counts[n] = c.counts[n];
      tot += c.counts[n];
    });
    audit(
      "Greens",
      (c.edit ? "Edited Greens counts at " : "Greens count at ") + c.site + ": " + order.length + (order.length === 1 ? " item, " : " items, ") + tot + " counted" +
        (miss.length ? ", " + miss.length + " not on GCW.GREENS" : "")
    );
    st.audit[st.audit.length - 1].gr = { site: c.site, counts: counts, order: order };
    st.grCount = null;
    grMsg = "";
    // An edit is saved as a new count sheet, so it becomes the location's current count.
    grPick(
      c.edit
        ? [].find.call($("grBtns").querySelectorAll(".mbtn"), function (b) {
            return b.textContent === c.site;
          }) || $("grSheetsBtn")
        : $("grSheetsBtn")
    );
    save();
    if (c.edit) toast("Counts saved for " + c.site + ".");
    else if (miss.length)
      alert(
        "Count sheet saved under View Count Sheets. These item #s aren't on GCW.GREENS, so their counts won't show on the sheet:\n\n" +
          miss
            .map(function (n) {
              return n + ": " + counts[n];
            })
            .join("\n")
      );
    else toast("Count sheet saved under View Count Sheets.");
  }
  function grSheetsHtml(l, mine) {
    if (!l.length)
      return '<div class="empty">' + (mine ? "You haven't made a Green Count yet." : "No count sheets yet. Select Create Greens Count to make one.") + "</div>";
    return (
      '<div class="tw"><table class="sumtbl grsheets"><thead><tr><th>Location</th>' +
      (mine ? "" : "<th>Counted by</th>") +
      "<th>Items</th><th>Saved</th><th></th></tr></thead><tbody>" +
      l
        .map(function (e) {
          var g = e.gr,
            tot = g.order.reduce(function (s2, n) {
              return s2 + g.counts[n];
            }, 0);
          return (
            '<tr><td class="cname">' +
            esc(g.site) +
            "</td>" +
            (mine ? "" : "<td>" + esc(whoName(e.by)) + "</td>") +
            '<td class="ph">' +
            g.order.length +
            (g.order.length === 1 ? " item, " : " items, ") +
            tot +
            " counted</td><td>" +
            dvWhen(e.ts) +
            '</td><td class="act"><button type="button" data-grview="' +
            esc(e.k) +
            '">View</button><button type="button" data-grview="' +
            esc(e.k) +
            '" data-grdl="1">Download</button>' +
            (mine || !can("grdel") ? "" : '<button type="button" class="danger" data-grdel="' + esc(e.k) + '">Delete</button>') +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }
  // View/Download: open GCW.GREENS and write each count in its item's Quantity cell.
  // Finds an uploaded template (Manage → Templates) by name and renders page 1 on a white canvas,
  // turned by `turn` degrees. Returns null when it isn't uploaded.
  async function tplRender(re, nm, turn) {
    if (cloudOn() && !tpCloud) await tpCloudScan();
    var isT = function (t) {
        return re.test(String(t.name).trim());
      },
      ref = (tpCloud || []).map(tpCloudRef).find(isT) || st.tpl.find(isT);
    if (!ref) return null;
    var blob = ref.file ? await sbDownload("inspection-pdfs", TP_DIR + ref.file) : await tpBlob(ref.id);
    if (!blob) throw new Error("The " + nm + " file could not be found. Upload it again under Manage → Templates.");
    var lib = await loadPdfJs(),
      doc = await lib.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false,
        verbosity: 0,
        wasmUrl: WASM_BASE,
      }).promise,
      S = 2,
      pg = await doc.getPage(1),
      rot = (pg.rotate + turn) % 360,
      v1 = pg.getViewport({ scale: 1, rotation: rot }),
      vp = pg.getViewport({ scale: S, rotation: rot }),
      cv = document.createElement("canvas");
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    var cx = cv.getContext("2d");
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, cv.width, cv.height);
    // "print" renders without requestAnimationFrame, so it finishes in a background tab too.
    await pg.render({ canvasContext: cx, viewport: vp, intent: "print" }).promise;
    return { cv: cv, S: S, pw: Math.round(v1.width * 100) / 100, ph: Math.round(v1.height * 100) / 100 };
  }
  async function grOpen(key, dl) {
    var e = (st.audit || []).find(function (x) {
      return x.k === key && x.gr; // deleted ones too, from the Deleted list
    });
    if (!e) return toast("That count sheet could not be found.");
    var g = e.gr;
    toast("Filling in GCW.GREENS…");
    try {
      // The scan is stored upside down; turn it upright.
      var t = await tplRender(/^gcw\.?\s*greens$/i, "GCW.GREENS", 180);
      if (!t) return toast("Upload the GCW.GREENS template under Manage → Templates first.");
      var cv = t.cv,
        S = t.S,
        k = S / 3,
        cx = cv.getContext("2d");
      cx.font = "bold " + Math.round(13 * S) + "px Helvetica, Arial, sans-serif";
      cx.fillStyle = "#1d3fbf";
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      GR_MAP.forEach(function (t) {
        t[3].split(" ").forEach(function (end, i) {
          var n = t[0] + end;
          if (g.counts[n] > 0) cx.fillText(String(g.counts[n]), t[1] * k, ((t[2][i] + t[2][i + 1]) / 2) * k);
        });
      });
      var jb = await new Promise(function (res) {
        cv.toBlob(res, "image/jpeg", 0.9);
      });
      tpShow(
        imgPdfBytes([
          {
            w: cv.width,
            h: cv.height,
            pw: t.pw,
            ph: t.ph,
            jpg: new Uint8Array(await jb.arrayBuffer()),
          },
        ]),
        "GCW.GREENS-" + g.site.replace(/[^\w]+/g, "_") + "-" + dayOf(e.ts),
        dl
      );
    } catch (x) {
      toast(x.message || "GCW.GREENS could not be filled in.");
    }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-grview]");
    if (b) grOpen(b.dataset.grview, !!b.dataset.grdl);
  });
  $("tpUpload").onclick = function () {
    $("tpFile").click();
  };
  $("tpFile").addEventListener("change", function () {
    var fs = [].slice.call(this.files);
    this.value = "";
    tpAdd(fs);
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    $("tpDrop").addEventListener(ev, function (e) {
      e.preventDefault();
      this.classList.add("over");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    $("tpDrop").addEventListener(ev, function (e) {
      e.preventDefault();
      this.classList.remove("over");
    });
  });
  $("tpDrop").addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) tpAdd([].slice.call(e.dataTransfer.files));
  });
  $("tpDrop").addEventListener("click", function () {
    $("tpFile").click();
  });
  function pdfClean() {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      pdfUrl = null;
    }
    $("pdfFrame").removeAttribute("src");
  }
  $("tpList").addEventListener("click", async function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-tcr")) {
      tpCloud = null;
      renderTemplates();
      return tpCloudScan();
    }
    var cf = tpCloud && tpCloud[+(b.dataset.tcv || b.dataset.tcd)];
    if (cf && (b.dataset.tcv || b.dataset.tcd)) {
      try {
        tpShow(await sbDownload("inspection-pdfs", TP_DIR + cf.name), cf.name.replace(/\.pdf$/i, ""), !!b.dataset.tcd);
      } catch (x) {
        toast("“" + cf.name + "” could not be opened: " + x.message);
      }
      return;
    }
    var id = b.dataset.v || b.dataset.d || b.dataset.e || b.dataset.r,
      f = st.tpl.find(function (x) {
        return x.id === id;
      });
    if (!f) return;
    if (b.dataset.e) {
      tpEdit = id;
      var fm = $("tplForm").elements;
      fm.nm.value = f.name;
      fm.note.value = f.note || "";
      $("tplDlg").showModal();
      fm.nm.focus();
      return;
    }
    if (b.dataset.r) {
      if (!confirm("Remove “" + f.name + "”? The PDF will be deleted from this browser.")) return;
      try {
        await tpTx("readwrite", function (os) {
          return os.delete(id);
        });
      } catch (x) {}
      st.tpl = st.tpl.filter(function (x) {
        return x.id !== id;
      });
      audit("Templates", "Removed the PDF “" + f.name + "”");
      save();
      renderTemplates();
      toast("Template removed.");
      return;
    }
    var blob;
    try {
      blob = await tpBlob(id);
    } catch (x) {}
    if (!blob) {
      toast("The file data for “" + f.name + "” could not be found. Please upload it again.");
      return;
    }
    tpShow(blob, f.name, !!b.dataset.d);
  });
  // Opens a template PDF in the viewer, or downloads it.
  function tpShow(blob, name, dl) {
    var url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    if (dl) {
      var a = document.createElement("a");
      a.href = url;
      a.download = name + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
      return;
    }
    pdfClean();
    pdfUrl = url;
    pdfName = name;
    $("pdfTitle").textContent = name;
    $("pdfFrame").src = url;
    $("pdfDlg").showModal();
  }
  $("pdfClose").onclick = function () {
    $("pdfDlg").close();
  };
  $("pdfDlg").addEventListener("close", pdfClean);
  $("pdfNew").onclick = function () {
    if (pdfUrl) window.open(pdfUrl, "_blank");
  };
  // Print the PDF shown; phones can't print a framed PDF, so they open it in a tab to print from there.
  $("pdfPrint").onclick = function () {
    if (!pdfUrl) return;
    try {
      if ("ontouchstart" in window) throw 0;
      $("pdfFrame").contentWindow.focus();
      $("pdfFrame").contentWindow.print();
    } catch (x) {
      window.open(pdfUrl, "_blank");
    }
  };
  $("pdfDl").onclick = function () {
    if (!pdfUrl) return;
    var a = document.createElement("a");
    a.href = pdfUrl;
    a.download = pdfName + ".pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  $("tplCancel").onclick = function () {
    $("tplDlg").close();
  };
  $("tplForm").addEventListener("submit", function (ev) {
    if (ev.submitter && ev.submitter.value !== "save") return;
    var fm = $("tplForm").elements,
      f = st.tpl.find(function (x) {
        return x.id === tpEdit;
      }),
      nm = fm.nm.value.trim();
    if (!f || !nm) {
      ev.preventDefault();
      return;
    }
    f.name = nm;
    f.note = fm.note.value.trim();
    save();
    renderTemplates();
    toast("Template updated.");
  });

  /* ---------- Inspection sheets ---------- */
  /* PDFJS_Z and PDFW_Z live in js/vendor/pdfjs-embedded.js, JBIG2_Z in jbig2-wasm.js, ZXING_Z in
     zxing-embedded.js. They are about 1 MB together, so each loads the first time it's needed
     (dist/inventory.html has them inline, so the globals already exist there). */
  var VER = ((document.currentScript && document.currentScript.src.match(/[?&]v=([^&]+)/)) || [])[1] || "",
    vendorP = {};
  function needVendor(file, glob, what) {
    if (window[glob]) return Promise.resolve();
    return (
      vendorP[file] ||
      (vendorP[file] = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = "js/vendor/" + file + (VER ? "?v=" + VER : "");
        s.onload = res;
        s.onerror = function () {
          delete vendorP[file];
          s.remove();
          rej(new Error("Couldn't load the " + what + ". Check your signal and try again."));
        };
        document.head.appendChild(s);
      }))
    );
  }
  var INSC = 2,
    ins = null,
    inMenuOn = false,
    pdfjsP = null,
    shUrls = [],
    shRec = null;
  async function gunzipB64(b64) {
    var bin = atob(b64),
      u = new Uint8Array(bin.length),
      i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return await new Response(
      new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))
    ).arrayBuffer();
  }
  var WASM_BASE = "https://pdfjs-wasm.invalid/",
    wasmShim = false;
  function installWasmShim() {
    if (wasmShim) return;
    wasmShim = true;
    var of = window.fetch;
    window.fetch = function (u, o) {
      var url = typeof u === "string" ? u : (u && u.url) || "";
      if (url.indexOf(WASM_BASE) === 0) {
        if (url.slice(WASM_BASE.length) === "jbig2.wasm")
          return gunzipB64(JBIG2_Z).then(function (b) {
            return new Response(b, {
              status: 200,
              headers: { "Content-Type": "application/wasm" },
            });
          });
        return Promise.resolve(new Response("", { status: 404 }));
      }
      return of.apply(this, arguments);
    };
  }
  // iPhone Safari can't `for await` over a ReadableStream, and pdf.js does (getTextContent), which
  // failed there with "undefined is not a function". (The worker's own loop is in a try with a fallback.)
  function rsIter() {
    if (typeof ReadableStream != "undefined" && !ReadableStream.prototype[Symbol.asyncIterator])
      ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
        var r = this.getReader();
        try {
          for (;;) {
            var x = await r.read();
            if (x.done) return;
            yield x.value;
          }
        } finally {
          r.releaseLock();
        }
      };
  }
  function loadPdfJs() {
    if (pdfjsP) return pdfjsP;
    pdfjsP = (async function () {
      installWasmShim();
      rsIter();
      await needVendor("pdfjs-embedded.js", "PDFJS_Z", "PDF reader");
      await needVendor("jbig2-wasm.js", "JBIG2_Z", "PDF reader");
      var lib = await gunzipB64(PDFJS_Z),
        wk = await gunzipB64(PDFW_Z);
      var m = await import(URL.createObjectURL(new Blob([lib], { type: "text/javascript" })));
      m.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
        new Blob([wk], { type: "text/javascript" })
      );
      return m;
    })();
    pdfjsP.catch(function () {
      pdfjsP = null;
    });
    return pdfjsP;
  }
  function mmul(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }
  function tokenize(items, vt, scale) {
    var out = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var str = it.str.replace(/\b(yes)\s*\/\s*(no)\s*\/\s*(n\s*\/\s*a|na)\b/gi, "$1 $2 NA");
      var m = mmul(vt, it.transform),
        x = m[4],
        y = m[5],
        h = Math.hypot(m[2], m[3]) || 10,
        w = (it.width || 0) * scale,
        len = str.length,
        re = /\S+/g,
        mt;
      while ((mt = re.exec(str)))
        out.push({
          s: mt[0],
          x: x + (w * mt.index) / len,
          y: y,
          w: Math.max(2, (w * mt[0].length) / len),
          h: h,
        });
    });
    return out;
  }
  function toLines(toks) {
    var t = toks.slice().sort(function (a, b) {
        return a.y - b.y || a.x - b.x;
      }),
      lines = [];
    t.forEach(function (k) {
      var L = lines[lines.length - 1];
      if (L && Math.abs(k.y - L.y) <= Math.max(2, k.h * 0.45)) {
        L.t.push(k);
        L.y = (L.y * (L.t.length - 1) + k.y) / L.t.length;
      } else lines.push({ y: k.y, t: [k] });
    });
    lines.forEach(function (L) {
      L.t.sort(function (a, b) {
        return a.x - b.x;
      });
      L.h = Math.max.apply(
        null,
        L.t.map(function (k) {
          return k.h;
        })
      );
    });
    return lines;
  }
  function optName(s) {
    var n = s.toLowerCase().replace(/[^a-z]/g, "");
    return n === "yes" ? "yes" : n === "no" ? "no" : n === "na" ? "na" : null;
  }
  function lineOpts(L) {
    var o = {};
    L.t.forEach(function (k) {
      var n = optName(k.s);
      if (n && !o[n]) o[n] = k;
    });
    return o.yes && o.no ? o : null;
  }
  function leftTokens(L, xLimit) {
    return L.t.filter(function (k) {
      return k.x + k.w <= xLimit && !optName(k.s);
    });
  }
  function joinTok(a) {
    return a
      .map(function (k) {
        return k.s;
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  var NUMRE = /^\(?(\d{1,3}|[A-Za-z])[\.\)]\s*\S/;
  var NOQ =
    /^(comments?\b|notes?\b|remarks?\b|deficienc|additional\b|signature|signed\b|supervisor|inspector|page\s*\d|total\b|print\b|operator'?s?\s*(name|signature|id|clock)|date\b)/i;
  var HEADRE = /^(?:[A-Za-z\/&'-]+\s+){0,3}(checks?|inspections?)\s*:?$/i;
  function aboveBelow(L, txt) {
    return txt;
  }
  /* ---------- scanned sheets: find the Yes / No / N/A rows from the picture itself ---------- */
  var KNOWN_ME = [
    "Are headlights working properly (if conditions warrant)?",
    "Is amber strobe light working properly?",
    "Is cab glass free of cracks or damage that obstructs operator's vision?",
    "Are seat belts in operable condition?",
    "Is fire extinguisher fully charged and operational with current inspection date and is fire suppression system pinned with current inspection tag (if installed)?",
    "Does parking brake work properly?",
    "Perform a 360-degree walk around prior to operation?",
    "Do the brake, signal, and tail lights work properly?",
    "Are tires/tracks in good operable condition?",
    "Are mirrors in place and in good condition?",
    "Are safety zone signs installed and legible? (This is not required for passenger vehicles or bobcats/scooters?",
    "Does hoist tailgate operate properly, if so equipped and necessary for task?",
    "Do doors open, close, and latch properly?",
    "Are inspection stickers (state of Illinois, Granite City) and license plates present and up-to-date?",
    "Are ladders, handrails, steps, or service platforms used to access the equipment in good condition?",
    "Is engine oil at operating level (check oil if no hazards exist)? If hazards exist, explain in comment section below.",
    "Do brakes operate properly?",
    "Does steering operate properly?",
    "Does accelerator/throttle control operate properly?",
    "Is bed indicator/PTO light functional?",
    "Does horn function properly?",
    "Does visual/audible back-up alarm and camera (If equipped) function properly?",
    "Do windshield wipers operate properly (if conditions warrant)?",
    "Are lifting devices, associated components and controls functioning properly?",
    "Do all gauges and instruments function properly?",
    "Are coupling devices operational and functioning properly (Where applicable)?",
  ];
  var KNOWN_FORK = [
    "Are headlights working properly (if conditions warrant)?",
    "Is amber strobe light working properly?",
    "Is cab glass free of cracks or damage that obstructs operator's vision?",
    "Are occupant restraints (seat belts/gates) in operable condition?",
    "Is fire extinguisher fully charged and operational with current inspection date?",
    "Is fire suppression system pinned and with current inspection?",
    "Is the overhead guard/roll over protection in good condition?",
    "Perform a 360-degree walk around prior to operation?",
    "Do the brake, signal, and tail lights work properly (if equipped)?",
    "Are tires and wheels in good operable condition? Are lug nuts loose or missing?",
    "Are mirrors in place and in good condition?",
    "Are safety zone signs installed and legible?",
    "Is propane tank secure (if equipped)?",
    "Do doors open, close, and latch properly (if equipped)?",
    "Is the lift chain, load back rest, and forks in good condition?",
    "Are ladders, handrails, steps, or service platforms used to access the equipment in good condition?",
    "Is the data plate available and legible?",
    "Is engine oil at operating level (check oil if no hazards exist)? If hazards exist, explain in section comment below.",
    "Does the dead man switch operate properly (if equipped), service brakes and parking brake operate properly?",
    "Does steering operate properly?",
    "Does accelerator/throttle control operate properly?",
    "Are all directional and control levers working properly?",
    "Does horn function properly?",
    "Does visual/audible back-up alarm and camera (if equipped) function properly?",
    "Do windshield wipers operate properly (if conditions warrant)?",
    "Are lifting devices, associated components and controls functioning properly?",
    "Do all gauges and instruments function properly?",
  ];
  function knownForm(n, maxI) {
    if (n === 26 && maxI === 15) return { q: KNOWN_ME, split: 15 };
    if (n === 27 && maxI === 17) return { q: KNOWN_FORK, split: 17 };
    return null;
  }
  function rotCanvas(cv, deg) {
    deg = ((deg % 360) + 360) % 360;
    if (!deg) return cv;
    var c = document.createElement("canvas"),
      sw = deg === 90 || deg === 270;
    c.width = sw ? cv.height : cv.width;
    c.height = sw ? cv.width : cv.height;
    var x = c.getContext("2d");
    x.translate(c.width / 2, c.height / 2);
    x.rotate((deg * Math.PI) / 180);
    x.drawImage(cv, -cv.width / 2, -cv.height / 2);
    return c;
  }
  function inkMask(cv, thr) {
    var W = cv.width,
      H = cv.height,
      d = cv.getContext("2d").getImageData(0, 0, W, H).data,
      m = new Uint8Array(W * H),
      i,
      j;
    for (i = 0, j = 0; i < m.length; i++, j += 4)
      m[i] = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11 < thr ? 1 : 0;
    return m;
  }
  function stripHLines(m, W, H) {
    var minRun = Math.round(W * 0.035),
      lines = [],
      y,
      x,
      s,
      k;
    for (y = 0; y < H; y++) {
      var row = y * W;
      x = 0;
      while (x < W) {
        if (!m[row + x]) {
          x++;
          continue;
        }
        s = x;
        while (x < W && m[row + x]) x++;
        if (x - s >= minRun) {
          lines.push({ x0: s, x1: x, y: y });
          for (k = s; k < x; k++) m[row + k] = 0;
        }
      }
    }
    return lines;
  }
  function stripVLines(m, W, H) {
    var minRun = Math.round(H * 0.03),
      x,
      y,
      s,
      k;
    for (x = 0; x < W; x++) {
      y = 0;
      while (y < H) {
        if (!m[y * W + x]) {
          y++;
          continue;
        }
        s = y;
        while (y < H && m[y * W + x]) y++;
        if (y - s >= minRun) for (k = s; k < y; k++) m[k * W + x] = 0;
      }
    }
  }
  function upScore(m, W, H) {
    var x0 = Math.round(W * 0.22),
      x1 = Math.round(W * 0.97),
      P = new Int32Array(H),
      y,
      x,
      tot = 0;
    for (y = 0; y < H; y++) {
      var c = 0,
        row = y * W;
      for (x = x0; x < x1; x++) c += m[row + x];
      P[y] = c;
    }
    y = 0;
    while (y < H) {
      if (P[y] < 3) {
        y++;
        continue;
      }
      var s = y,
        sum = 0,
        mom = 0;
      while (y < H && P[y] >= 3) {
        sum += P[y];
        mom += P[y] * (y - s);
        y++;
      }
      var h = y - s;
      if (h < 8 || h > 44 || sum < 40) continue;
      tot += (mom / sum / h - 0.5) * sum;
    }
    return tot;
  }
  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) {
      return x - y;
    });
    return b[b.length >> 1];
  }
  function detectRows(m0, W, H) {
    var m = new Uint8Array(m0),
      hl = stripHLines(m, W, H);
    stripVLines(m, W, H);
    var s = new Uint8Array(m),
      gap = Math.max(4, Math.round(W * 0.0045)),
      x,
      y,
      i;
    for (y = 0; y < H; y++) {
      var row = y * W,
        last = -1;
      for (x = 0; x < W; x++) {
        if (!m[row + x]) continue;
        if (last >= 0 && x - last > 1 && x - last - 1 <= gap)
          for (i = last + 1; i < x; i++) s[row + i] = 1;
        last = x;
      }
    }
    for (x = 0; x < W; x++) {
      var lastY = -1;
      for (y = 0; y < H; y++) {
        if (!s[y * W + x]) continue;
        if (lastY >= 0 && y - lastY > 1 && y - lastY - 1 <= 2)
          for (i = lastY + 1; i < y; i++) s[i * W + x] = 1;
        lastY = y;
      }
    }
    var lab = new Int32Array(W * H),
      comps = [],
      stack = [],
      id,
      p,
      q,
      dx,
      dy,
      py,
      px,
      nx,
      ny;
    for (i = 0; i < s.length; i++) {
      if (!s[i] || lab[i]) continue;
      id = comps.length + 1;
      var c = { x0: W, y0: H, x1: 0, y1: 0 };
      stack.push(i);
      lab[i] = id;
      while (stack.length) {
        p = stack.pop();
        py = (p / W) | 0;
        px = p - py * W;
        if (px < c.x0) c.x0 = px;
        if (px > c.x1) c.x1 = px;
        if (py < c.y0) c.y0 = py;
        if (py > c.y1) c.y1 = py;
        for (dy = -1; dy <= 1; dy++)
          for (dx = -1; dx <= 1; dx++) {
            nx = px + dx;
            ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            q = ny * W + nx;
            if (s[q] && !lab[q]) {
              lab[q] = id;
              stack.push(q);
            }
          }
      }
      comps.push(c);
    }
    var cand = [];
    comps.forEach(function (c) {
      var w = c.x1 - c.x0 + 1,
        h = c.y1 - c.y0 + 1;
      if (w >= 10 && w <= Math.round(W * 0.09) && h >= 8 && h <= Math.round(W * 0.034))
        cand.push({
          x0: c.x0,
          x1: c.x1,
          y0: c.y0,
          y1: c.y1,
          w: w,
          h: h,
          cx: (c.x0 + c.x1) / 2,
          cy: (c.y0 + c.y1) / 2,
        });
    });
    var bin = 3,
      hist = new Int32Array(Math.ceil(W / bin) + 2);
    cand.forEach(function (c) {
      hist[(c.cx / bin) | 0]++;
    });
    var sm = new Int32Array(hist.length);
    for (i = 1; i < hist.length - 1; i++) sm[i] = hist[i - 1] + hist[i] + hist[i + 1];
    var peaks = [];
    for (i = 2; i < sm.length - 2; i++)
      if (
        sm[i] >= 3 &&
        sm[i] >= sm[i - 1] &&
        sm[i] > sm[i + 1] &&
        sm[i] >= sm[i - 2] &&
        sm[i] >= sm[i + 2]
      )
        peaks.push({ x: i * bin + bin / 2, n: sm[i] });
    peaks.sort(function (a, b) {
      return b.n - a.n;
    });
    peaks = peaks.slice(0, 40).sort(function (a, b) {
      return a.x - b.x;
    });
    var best = null,
      a,
      b,
      c2;
    for (a = 0; a < peaks.length; a++)
      for (b = a + 1; b < peaks.length; b++)
        for (c2 = b + 1; c2 < peaks.length; c2++) {
          var g1 = peaks[b].x - peaks[a].x,
            g2 = peaks[c2].x - peaks[b].x;
          if (
            g1 < W * 0.04 ||
            g2 < W * 0.04 ||
            g1 > W * 0.2 ||
            g2 > W * 0.2 ||
            Math.max(g1, g2) / Math.min(g1, g2) > 1.6
          )
            continue;
          var sc = peaks[a].n + peaks[b].n + peaks[c2].n;
          if (!best || sc > best.sc) best = { sc: sc, xs: [peaks[a].x, peaks[b].x, peaks[c2].x] };
        }
    var res = { rows: [], hl: hl, m: m, lh: 0, cols: null };
    if (!best) return res;
    var tol = Math.max(12, (best.xs[1] - best.xs[0]) * 0.3),
      rows = [];
    cand.forEach(function (cd) {
      var k = -1;
      best.xs.forEach(function (xx, j) {
        if (Math.abs(cd.cx - xx) <= tol) k = j;
      });
      if (k < 0) return;
      var r = null;
      rows.forEach(function (rw) {
        if (Math.abs(rw.y - cd.cy) <= Math.max(8, cd.h * 0.55)) r = rw;
      });
      if (!r) {
        r = { y: cd.cy, b: [null, null, null] };
        rows.push(r);
      }
      if (!r.b[k] || cd.w * cd.h > r.b[k].w * r.b[k].h * 0.2) r.b[k] = cd;
      var ys = r.b.filter(Boolean).map(function (z) {
        return z.cy;
      });
      r.y =
        ys.reduce(function (s2, v) {
          return s2 + v;
        }, 0) / ys.length;
    });
    var singles = rows.filter(function (r) {
      return r.b.filter(Boolean).length === 1;
    });
    rows = rows
      .filter(function (r) {
        return r.b.filter(Boolean).length >= 2;
      })
      .sort(function (a, b) {
        return a.y - b.y;
      });
    /* a row whose words merged into their underline can show only one word: keep it when it sits exactly between two found rows */
    (function () {
      var g = [];
      rows.forEach(function (r, i) {
        if (i) g.push(r.y - rows[i - 1].y);
      });
      var p = median(g);
      if (!p || !singles.length) return;
      singles.forEach(function (sr) {
        for (var i = 0; i < rows.length - 1; i++) {
          var a1 = rows[i],
            b1 = rows[i + 1];
          if (
            sr.y > a1.y &&
            sr.y < b1.y &&
            b1.y - a1.y >= p * 1.6 &&
            b1.y - a1.y <= p * 2.4 &&
            Math.abs(sr.y - (a1.y + b1.y) / 2) <= p * 0.25
          ) {
            rows.splice(i + 1, 0, sr);
            break;
          }
        }
      });
    })();
    var ws = [[], [], []],
      hs = [];
    rows.forEach(function (r) {
      r.b.forEach(function (z, j) {
        if (z) {
          ws[j].push(z.w);
          hs.push(z.h);
        }
      });
    });
    var mw = ws.map(median),
      mh = median(hs);
    rows.forEach(function (r) {
      r.b.forEach(function (z, j) {
        if (!z) {
          r.b[j] = { w: mw[j] || mw[1], h: mh, cx: best.xs[j], cy: r.y, syn: true };
        }
      });
    });
    var lh0 = mh || 14;
    rows = rows.filter(function (r) {
      /* a real answer row has a blank gap right of the last column; running text there means it is a paragraph */
      var b2 = r.b[2],
        bx0 = Math.round(b2.cx + b2.w / 2 + lh0 * 1.2),
        bx1 = Math.min(W, bx0 + Math.round(lh0 * 3)),
        by0 = Math.max(0, Math.round(r.y - lh0 * 0.5)),
        by1 = Math.min(H, Math.round(r.y + lh0 * 0.5)),
        c = 0,
        t = 0,
        yy,
        xx;
      for (yy = by0; yy < by1; yy++)
        for (xx = bx0; xx < bx1; xx++) {
          t++;
          c += m[yy * W + xx];
        }
      return t > 0 && c / t < 0.03;
    });
    /* drop stray rows far from the main block (page footers, headers) */
    var pg = [];
    rows.forEach(function (r, i) {
      if (i) pg.push(r.y - rows[i - 1].y);
    });
    var pit = median(pg) || lh0 * 2;
    while (rows.length > 3 && rows[rows.length - 1].y - rows[rows.length - 2].y > pit * 5)
      rows.pop();
    while (rows.length > 3 && rows[1].y - rows[0].y > pit * 5) rows.shift();
    res.rows = rows;
    res.lh = mh;
    res.cols = best.xs;
    res.mw = mw;
    return res;
  }
  function bandBelow(m, W, H, x0, x1, y0, y1, lh) {
    /* trim a region to the first block of text lines (stops at a clear gap) */
    var P = [],
      y,
      x,
      started = false,
      blank = 0,
      end = y0;
    for (y = y0; y < Math.min(y1, H); y++) {
      var c = 0,
        row = y * W;
      for (x = x0; x < x1; x++) c += m[row + x];
      if (c > 1) {
        started = true;
        blank = 0;
        end = y;
      } else if (started) {
        blank++;
        if (blank >= Math.max(4, lh * 0.75)) break;
      }
    }
    return started ? end + 3 : y0;
  }
  function cropUrl(cv, x0, y0, w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    c.getContext("2d").drawImage(
      cv,
      Math.round(x0),
      Math.round(y0),
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height
    );
    return c.toDataURL("image/jpeg", 0.8);
  }
  function scanPage(cv, pi, rotPref, qtext) {
    var W,
      H,
      best = null,
      tries = rotPref != null ? [rotPref] : [0, 180];
    var cands = [];
    tries.forEach(function (deg) {
      var c = rotCanvas(cv, deg),
        m = inkMask(c, 170),
        w = c.width,
        h = c.height,
        us = upScore(m, w, h);
      cands.push({ deg: deg, cv: c, m: m, W: w, H: h, up: us });
    });
    var pick = cands[0];
    if (cands.length > 1) {
      pick = cands[cands[1].up > cands[0].up ? 1 : 0];
    }
    var det = detectRows(pick.m, pick.W, pick.H);
    if (det.rows.length < 3 && rotPref == null) {
      [90, 270, 180, 0].forEach(function (deg) {
        if (det.rows.length >= 3 || deg === pick.deg) return;
        var c = rotCanvas(cv, deg),
          m = inkMask(c, 170),
          d2 = detectRows(m, c.width, c.height);
        if (d2.rows.length > det.rows.length) {
          det = d2;
          pick = { deg: deg, cv: c, m: m, W: c.width, H: c.height };
        }
      });
    }
    W = pick.W;
    H = pick.H;
    var rows = det.rows,
      lh = det.lh || 14,
      out = {
        cv: pick.cv,
        deg: pick.deg,
        qs: [],
        heads: [],
        anchors: {},
        labels: { yes: "Yes", no: "No", na: "N/A" },
        known: false,
        scan: true,
      };
    if (rows.length < 3) return out;
    var m = det.m,
      xr =
        Math.max.apply(
          null,
          rows.map(function (r) {
            return r.b[2].x1 || r.b[2].cx + r.b[2].w / 2;
          })
        ) + Math.round(lh * 0.9);
    var gaps = rows.map(function (r, i) {
        return i < rows.length - 1 ? rows[i + 1].y - r.y : 0;
      }),
      maxI = 0;
    gaps.forEach(function (g, i) {
      if (g > gaps[maxI]) maxI = i;
    });
    var kf = knownForm(rows.length, maxI),
      known = !!kf;
    out.known = known;
    var ends = [];
    rows.forEach(function (r, i) {
      var y0 = Math.max(0, r.y - lh * 0.9),
        nextY = i < rows.length - 1 ? rows[i + 1].y - lh * 0.9 : r.y + lh * 3.2;
      var yEnd = bandBelow(
        m,
        W,
        H,
        xr,
        Math.round(W * 0.97),
        Math.round(r.y - lh * 0.8),
        Math.round(nextY),
        lh
      );
      yEnd = Math.max(yEnd, r.y + lh * 0.8);
      ends.push(yEnd);
      var ov = {},
        names = ["yes", "no", "na"];
      r.b.forEach(function (b, j) {
        ov[names[j]] = {
          cx: b.cx - lh * 0.12,
          cy: b.cy,
          rx: b.w / 2 + lh * 0.75,
          ry: b.h / 2 + lh * 0.55,
        };
      });
      var q = { text: null, page: pi, ov: ov, y: r.y, h: lh, known: known };
      q.crop = [xr, y0, Math.round(W * 0.97) - xr, Math.min(yEnd + 4, H) - y0];
      out.qs.push(q);
    });
    /* section headings: a clear gap above a row means a heading sits there */
    var pitch = median(
      gaps.filter(function (g) {
        return g > 0;
      })
    );
    rows.forEach(function (r, i) {
      var topLimit = i ? ends[i - 1] + 2 : Math.max(0, r.y - lh * 3.2),
        bandTop = Math.round(topLimit),
        bandBot = Math.round(r.y - lh * 0.9);
      if (bandBot - bandTop > lh * 0.9) {
        var x0 = Math.round(W * 0.03),
          x1 = Math.round(W * 0.97),
          yy,
          xx,
          first = -1,
          last = -1;
        for (yy = bandTop; yy < bandBot; yy++) {
          var c = 0;
          for (xx = x0; xx < x1; xx++) c += m[yy * W + xx];
          if (c > 2) {
            if (first < 0) first = yy;
            last = yy;
          }
        }
        if (first >= 0 && last - first >= lh * 0.6 && last - first <= lh * 2.2) {
          out.qs[i].headCrop = [x0, first - 3, x1 - x0, last - first + 7];
          out.qs[i].headY = first;
        }
      }
    });
    if (known) {
      out.qs.forEach(function (q, i) {
        q.text = kf.q[i];
      });
      out.qs.forEach(function (q, i) {
        q.sec = i <= kf.split ? "Visual Checks" : "Operational Checks";
      });
    } else if (qtext && qtext.length === out.qs.length) {
      out.qs.forEach(function (q, i) {
        q.text = qtext[i];
      });
    }
    /* name and date lines: the first pair of rules above the questions, a long one and a short one at the right */
    var topY = rows[0].y - lh * 2,
      byY = [];
    det.hl.forEach(function (h) {
      if (h.y >= topY || h.y < H * 0.08) return;
      var len = h.x1 - h.x0;
      if (len < W * 0.05 || len > W * 0.7) return;
      var g = null;
      byY.forEach(function (z) {
        if (Math.abs(z.y - h.y) <= 5) g = z;
      });
      if (!g) {
        g = { y: h.y, s: [] };
        byY.push(g);
      }
      var mg = null;
      g.s.forEach(function (sg) {
        if (h.x0 <= sg.x1 + 4 && h.x1 >= sg.x0 - 4) mg = sg;
      });
      if (mg) {
        mg.x0 = Math.min(mg.x0, h.x0);
        mg.x1 = Math.max(mg.x1, h.x1);
      } else g.s.push({ x0: h.x0, x1: h.x1 });
    });
    byY.sort(function (a, b) {
      return a.y - b.y;
    });
    var grp = byY
      .filter(function (g) {
        return g.s.length === 2;
      })
      .filter(function (g) {
        var s = g.s.slice().sort(function (a, b) {
          return a.x0 - b.x0;
        });
        return s[0].x1 - s[0].x0 > s[1].x1 - s[1].x0 && s[1].x0 > W * 0.5;
      })[0];
    if (grp) {
      var sg = grp.s.slice().sort(function (a, b) {
        return a.x0 - b.x0;
      });
      out.anchors.op = { x: sg[0].x0 + 8, y: grp.y - 3, h: lh * 1.1, maxX: sg[0].x1 - 4, page: pi };
      out.anchors.dt = { x: sg[1].x0 + 8, y: grp.y - 3, h: lh * 1.1, maxX: sg[1].x1 - 4, page: pi };
      var eg = byY.filter(function (g) {
        return g.y > grp.y + lh * 0.8 && g.y < grp.y + lh * 6;
      })[0];
      if (eg) {
        var es = eg.s.slice().sort(function (a, b) {
          return a.x0 - b.x0;
        })[0];
        out.anchors.eq = { x: es.x0 + 8, y: eg.y - 3, h: lh * 1.1, maxX: es.x1 - 4, page: pi };
      }
    }
    return out;
  }

  function analysePage(lines, pi, carry) {
    var info = lines.map(function (L) {
        var o = lineOpts(L);
        return o ? { o: o } : null;
      }),
      optIdx = [],
      res = { qs: [], heads: [], ends: [], labels: null, cols: null };
    info.forEach(function (x, i) {
      if (x) optIdx.push(i);
    });
    lines.forEach(function (L, i) {
      if (info[i]) return;
      var tx = joinTok(L.t);
      if (HEADRE.test(tx) && !NUMRE.test(tx))
        res.heads.push({ page: pi, y: L.y, text: tx.replace(/\s*:$/, "") });
      else if (NOQ.test(tx) && !/^operator/i.test(tx)) res.ends.push({ page: pi, y: L.y });
    });
    function lab(o) {
      res.labels = res.labels || { yes: "Yes", no: "No", na: "N/A" };
      ["yes", "no", "na"].forEach(function (k) {
        if (o[k]) res.labels[k] = o[k].s.replace(/[:.]+$/, "");
      });
    }
    function ovalOf(k) {
      return {
        cx: k.x + k.w / 2 - k.h * 0.25,
        cy: k.y - k.h * 0.3,
        rx: k.w / 2 + k.h * 0.95,
        ry: k.h * 0.9,
      };
    }
    if (!optIdx.length) {
      if (carry) bRows(lines, carry.cols, carry.minX, 0, lines.length, pi, res);
      return res;
    }
    var xs = info[optIdx[0]].o.yes.x,
      leftLines = [],
      orphan = 0;
    lines.forEach(function (L, i) {
      if (info[i]) return;
      var lt = leftTokens(L, xs - 6);
      if (!lt.length) return;
      var yTop = lines[optIdx[0]].y - L.h * 3,
        yBot = lines[optIdx[optIdx.length - 1]].y + L.h * 3;
      if (L.y < yTop || L.y > yBot) return;
      var tx = joinTok(lt);
      if (
        !NUMRE.test(tx) &&
        (HEADRE.test(tx) || NOQ.test(tx) || /^operator/i.test(tx) || tx.length < 4)
      )
        return;
      leftLines.push(i);
    });
    leftLines.forEach(function (i) {
      var near = optIdx.some(function (j) {
        return Math.abs(lines[j].y - lines[i].y) <= Math.max(lines[i].h, lines[j].h) * 1.45;
      });
      if (!near) orphan++;
    });
    var ratio = leftLines.length ? orphan / leftLines.length : 0;
    var perRow = (optIdx.length >= 3 && ratio < 0.45) || (optIdx.length === 2 && ratio < 0.25);
    if (perRow) {
      var used = {};
      optIdx.forEach(function (j, n) {
        var o = info[j].o,
          L0 = lines[j],
          xl = o.yes.x - 6,
          prevY = n ? lines[optIdx[n - 1]].y : -1e9,
          nextY = n < optIdx.length - 1 ? lines[optIdx[n + 1]].y : 1e9;
        var cands = [];
        lines.forEach(function (L, i) {
          if (info[i] || used[i] || L.y <= prevY || L.y >= nextY) return;
          var lt = leftTokens(L, xl);
          if (!lt.length) return;
          var tx = joinTok(lt);
          if ((HEADRE.test(tx) && !NUMRE.test(tx)) || NOQ.test(tx)) return;
          cands.push({ i: i, L: L, txt: tx });
        });
        var own = leftTokens(L0, xl),
          block = [];
        if (own.length) block.push({ L: L0, txt: joinTok(own) });
        else {
          var best = null;
          cands.forEach(function (c) {
            var d = Math.abs(c.L.y - L0.y);
            if (d <= L0.h * 1.6 && (!best || d < best.d)) best = { c: c, d: d };
          });
          if (!best) {
            cands.forEach(function (c) {
              var d = L0.y - c.L.y;
              if (d > 0 && d <= L0.h * 2.6 && (!best || d < best.d)) best = { c: c, d: d };
            });
          }
          if (best) {
            block.push({ L: best.c.L, txt: best.c.txt });
            used[best.c.i] = 1;
          }
        }
        if (block.length) {
          var seed = block[0],
            up = cands
              .filter(function (c) {
                return c.L.y < seed.L.y && !used[c.i];
              })
              .sort(function (a, b) {
                return b.L.y - a.L.y;
              }),
            first = seed;
          up.forEach(function (c) {
            if (NUMRE.test(first.txt)) return;
            if (first.L.y - c.L.y <= first.L.h * 1.6) {
              block.unshift({ L: c.L, txt: c.txt });
              used[c.i] = 1;
              first = block[0];
            }
          });
          var dn = cands
              .filter(function (c) {
                return c.L.y > seed.L.y && !used[c.i];
              })
              .sort(function (a, b) {
                return a.L.y - b.L.y;
              }),
            last = seed;
          dn.forEach(function (c) {
            if (NUMRE.test(c.txt)) return;
            if (c.L.y - last.L.y <= last.L.h * 1.6) {
              block.push({ L: c.L, txt: c.txt });
              used[c.i] = 1;
              last = block[block.length - 1];
            }
          });
        }
        var ov = {};
        ["yes", "no", "na"].forEach(function (k) {
          if (o[k]) ov[k] = ovalOf(o[k]);
        });
        lab(o);
        res.qs.push({
          text:
            block
              .map(function (b) {
                return b.txt;
              })
              .join(" ") || "Question " + (res.qs.length + 1),
          page: pi,
          ov: ov,
          y: L0.y,
          h: L0.h,
        });
      });
      return res;
    }
    /* column-style sheet: Yes / No / NA appear as column headings, questions sit in the rows below */
    optIdx.forEach(function (hx, n) {
      var o = info[hx].o,
        cols = {};
      lab(o);
      ["yes", "no", "na"].forEach(function (k) {
        if (o[k]) cols[k] = { cx: o[k].x + o[k].w / 2, w: o[k].w };
      });
      bRows(
        lines,
        cols,
        o.yes.x - 8,
        hx + 1,
        optIdx[n + 1] !== undefined ? optIdx[n + 1] : lines.length,
        pi,
        res
      );
      res.cols = cols;
      res.minX = o.yes.x - 8;
    });
    return res;
  }
  function bRows(lines, cols, minX, from, to, pi, res) {
    var cur = null,
      i,
      first = res.qs.length;
    for (i = from; i < to; i++) {
      var L = lines[i],
        lt = leftTokens(L, minX);
      if (!lt.length) continue;
      var txt = joinTok(lt);
      if (HEADRE.test(txt) && !NUMRE.test(txt)) {
        cur = null;
        continue;
      }
      if (NOQ.test(txt)) {
        cur = null;
        continue;
      }
      var numbered = NUMRE.test(txt);
      if (cur && !numbered && L.y - cur.last.y <= L.h * 1.55) {
        cur.text += " " + txt;
        cur.last = L;
        continue;
      }
      cur = { text: txt, page: pi, first: L, last: L, h: L.h };
      res.qs.push(cur);
    }
    for (i = first; i < res.qs.length; i++) {
      var q = res.qs[i],
        top = q.first.y - q.first.h * 0.85,
        bot = q.last.y + q.last.h * 0.3,
        cy = (top + bot) / 2,
        ov = {};
      Object.keys(cols).forEach(function (k) {
        var c = cols[k];
        ov[k] = {
          cx: c.cx,
          cy: cy,
          rx: Math.max(c.w * 0.9, q.h),
          ry: Math.max((bot - top) * 0.5, q.h * 0.9),
        };
      });
      q.ov = ov;
      q.y = cy;
      delete q.first;
      delete q.last;
    }
  }
  function blankTok(t, i) {
    return t && /^[_\.\-–—]{3,}$/.test(t.s);
  }
  function anchorFor(L, start, stopRe) {
    var j = start,
      t = L.t;
    while (
      j + 1 < t.length &&
      t[j + 1].x - (t[j].x + t[j].w) < L.h * 2.6 &&
      !blankTok(t[j + 1]) &&
      !stopRe.test(t[j + 1].s)
    )
      j++;
    var x0 = t[j].x + t[j].w + L.h * 0.45,
      maxX = null,
      k = j + 1;
    if (blankTok(t[k])) {
      x0 = t[k].x + 2;
      while (blankTok(t[k + 1])) k++;
      maxX = t[k].x + t[k].w;
    } else if (t[k]) maxX = t[k].x - L.h * 0.5;
    return { x: x0, y: L.y, h: L.h, maxX: maxX };
  }
  function findAnchors(lines, pi, W) {
    var res = {};
    lines.forEach(function (L) {
      L.t.forEach(function (k, ix) {
        if (
          !res.op &&
          /^operator/i.test(k.s) &&
          L.t.slice(ix, ix + 6).some(function (z) {
            return /^(name|clock|id)/i.test(z.s);
          })
        ) {
          var a = anchorFor(L, ix, /^date/i);
          a.page = pi;
          if (a.maxX == null) a.maxX = W - 24;
          res.op = a;
        }
        if (
          !res.eq &&
          /^equipment/i.test(k.s) &&
          L.t.slice(ix, ix + 4).some(function (z) {
            return /^(id|no|number|#)/i.test(z.s);
          })
        ) {
          var e = anchorFor(L, ix, /^(shift|odometer|hours|date)/i);
          e.page = pi;
          if (e.maxX == null) e.maxX = Math.min(W - 24, e.x + W * 0.25);
          res.eq = e;
        }
        if (!res.dt && /^date:?$/i.test(k.s)) {
          var d = anchorFor(L, ix, /^zzz$/);
          d.page = pi;
          if (d.maxX == null) d.maxX = W - 24;
          res.dt = d;
        }
      });
    });
    return res;
  }
  async function buildIns(lib, doc, rotPref, qtext) {
    var n = Math.min(doc.numPages, 12),
      pages = [],
      qs = [],
      heads = [],
      ends = [],
      labels = { yes: "Yes", no: "No", na: "N/A" },
      anchors = {},
      carry = null,
      ntok = 0,
      renderFail = 0,
      scanInfo = null,
      p;
    for (p = 1; p <= n; p++) {
      var page = await doc.getPage(p),
        vp = page.getViewport({ scale: INSC });
      var cv = document.createElement("canvas");
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      var cx = cv.getContext("2d");
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, cv.width, cv.height);
      try {
        await page.render({ canvasContext: cx, viewport: vp }).promise;
      } catch (e) {
        renderFail++;
        console.warn("render failed", e);
      }
      var ov = document.createElement("canvas");
      ov.width = cv.width;
      ov.height = cv.height;
      var tc = await page.getTextContent(),
        toks = tokenize(tc.items, vp.transform, INSC);
      ntok += toks.length;
      if (toks.length < 6) {
        var sp = scanPage(cv, p - 1, rotPref, qtext);
        if (sp.qs.length) {
          cv = sp.cv;
          ov.width = cv.width;
          ov.height = cv.height;
          sp.qs.forEach(function (q) {
            qs.push(q);
          });
          sp.heads.forEach(function (h) {
            heads.push(h);
          });
          if (!anchors.op && sp.anchors.op) anchors.op = sp.anchors.op;
          if (!anchors.dt && sp.anchors.dt) anchors.dt = sp.anchors.dt;
          if (!anchors.eq && sp.anchors.eq) anchors.eq = sp.anchors.eq;
          scanInfo = { deg: sp.deg, known: sp.known };
          pages.push({ base: cv, ov: ov, scan: true });
          continue;
        }
      }
      var lines = toLines(toks),
        res = analysePage(lines, p - 1, carry);
      if (res.cols) carry = { cols: res.cols, minX: res.minX };
      if (res.labels)
        ["yes", "no", "na"].forEach(function (k) {
          labels[k] = res.labels[k];
        });
      res.heads.forEach(function (h) {
        heads.push(h);
      });
      res.ends.forEach(function (e) {
        ends.push(e);
      });
      res.qs.forEach(function (q) {
        qs.push(q);
      });
      var an = findAnchors(lines, p - 1, cv.width);
      if (!anchors.op && an.op) anchors.op = an.op;
      if (!anchors.dt && an.dt) anchors.dt = an.dt;
      if (!anchors.eq && an.eq) anchors.eq = an.eq;
      pages.push({ base: cv, ov: ov });
    }
    function pos(o) {
      return o.page * 1e6 + o.y;
    }
    var start = null;
    heads.forEach(function (h) {
      if (start === null && /visual|operational/i.test(h.text)) start = pos(h);
    });
    if (start !== null) {
      var stop = Infinity;
      ends.forEach(function (e) {
        if (pos(e) > start && pos(e) < stop) stop = pos(e);
      });
      qs = qs.filter(function (q) {
        return pos(q) >= start && pos(q) < stop;
      });
      heads = heads.filter(function (h) {
        return pos(h) >= start && pos(h) < stop;
      });
    }
    heads.sort(function (a, b) {
      return pos(a) - pos(b);
    });
    qs.sort(function (a, b) {
      return pos(a) - pos(b);
    });
    qs.forEach(function (q) {
      var s = "";
      heads.forEach(function (h) {
        if (pos(h) <= pos(q) + 8) s = h.text;
      });
      q.sec = s || q.sec || "";
    });
    return {
      pages: pages,
      qs: qs,
      labels: labels,
      anchors: anchors,
      truncated: doc.numPages > n,
      ntok: ntok,
      renderFail: renderFail,
      scan: scanInfo,
    };
  }
  function inDrawOverlay(pi) {
    var P = ins.pages[pi],
      ctx = P.ov.getContext("2d");
    ctx.clearRect(0, 0, P.ov.width, P.ov.height);
    [
      ["op", $("inOp").value],
      ["dt", $("inDate").value],
      ["eq", $("inEq").value],
    ].forEach(function (a) {
      var an = ins.anchors[a[0]];
      if (!an || an.page !== pi || !a[1]) return;
      var fs = Math.max(9, an.h * 0.95);
      ctx.fillStyle = "#10286b";
      do {
        ctx.font = "600 " + fs + "px Helvetica,Arial,sans-serif";
        fs -= 0.5;
      } while (ctx.measureText(a[1]).width > an.maxX - an.x && fs > 8);
      ctx.fillText(a[1], an.x, an.y - an.h * 0.12);
    });
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(2.5, INSC * 1.7);
    ins.qs.forEach(function (q) {
      if (q.page !== pi || !q.ans || !q.ov[q.ans]) return;
      var o = q.ov[q.ans];
      ctx.beginPath();
      ctx.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  function inUpdate() {
    var n = ins.qs.length,
      done = ins.qs.filter(function (q) {
        return q.ans;
      }).length;
    $("inProg").textContent = done + " of " + n + " answered";
    $("inBar").style.width = (n ? (done / n) * 100 : 0) + "%";
    $("inFinish").disabled = done < n;
    [].forEach.call($("inQs").querySelectorAll("li.inq"), function (li) {
      var q = ins.qs[+li.dataset.qi];
      li.classList.toggle("done", !!q.ans);
      [].forEach.call(li.querySelectorAll("button[data-a]"), function (b) {
        b.classList.toggle("on", q.ans === b.dataset.a);
        b.setAttribute("aria-pressed", String(q.ans === b.dataset.a));
      });
    });
  }
  function renderInsp() {
    document.documentElement.style.setProperty("--tab", "#d92d20");
    var key = inspKey();
    $("inspTitle").textContent =
      key.charAt(0) === "s" ? sname(+key.slice(1)) : oname(+key.slice(1));
    $("inWork").hidden = !ins;
    $("inHome").hidden = !!ins;
    $("inMenu").hidden = !inMenuOn || !!ins;
    $("inspNote").textContent = ins
      ? "Answer every question, then select Finish."
      : sess
        ? "Start a new inspection sheet from the template library."
        : "Sign in to create an inspection sheet.";
    // Only the inspection forms are offered here (other templates, like GCW.GREENS, are for other tabs).
    var inspTpls = (tpCloud || []).filter(function (cf) {
      return /^gcw\.?\s*(truck|fork(lift)?)$/i.test(cf.name.replace(/\.pdf$/i, "").trim());
    });
    if (inMenuOn && !ins)
      $("inMenu").innerHTML =
        inspTpls.length
          ? inspTpls
              .map(function (cf) {
                var f = tpCloudRef(cf);
                return (
                  '<button class="ddopt" data-tpl="' +
                  esc(f.id) +
                  '"><span>' +
                  esc(f.name) +
                  "</span>" +
                  (f.note ? '<span class="c">' + esc(f.note) + "</span>" : "") +
                  "</button>"
                );
              })
              .join("")
          : '<div class="xn">' +
            (tpCloudErr === "offline"
              ? "Offline: templates load when you're back online."
              : tpCloudErr
                ? "Couldn't load the templates: " + esc(tpCloudErr)
                : !tpCloud
                  ? "Loading templates…"
                  : "GCW.TRUCK and GCW.FORK aren't uploaded yet. A manager can upload them under Manage → Templates.") +
            "</div>";
  }
  function opDefault() {
    return sess ? sess.name || sess.email : "";
  }
  async function startInsp(id) {
    if (!sess) {
      toast("Sign in first so your name can be filled in on the sheet.");
      return;
    }
    var f =
      id.indexOf("c:") === 0
        ? (tpCloud || []).map(tpCloudRef).find(function (x) {
            return x.id === id;
          })
        : st.tpl.find(function (x) {
            return x.id === id;
          });
    if (!f) return;
    $("inspNote").textContent = "Loading “" + f.name + "”…";
    try {
      var blob = f.file ? await sbDownload("inspection-pdfs", TP_DIR + f.file) : await tpBlob(id);
      if (!blob) {
        toast(
          "The file data for that template could not be found. Upload it again under Manage → Templates."
        );
        renderInsp();
        return;
      }
      var lib = await loadPdfJs();
      var doc = await lib.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        useSystemFonts: true,
        isEvalSupported: false,
        verbosity: 0,
        wasmUrl: WASM_BASE,
      }).promise;
      var b = await buildIns(lib, doc, f.rot, f.qtext);
      if (b.scan && b.scan.deg !== f.rot) {
        f.rot = b.scan.deg;
        save();
      }
      if (!b.qs.length) {
        var why =
          b.ntok < 8
            ? "This PDF has no readable text, so it may be a scanned image. Upload a text-based PDF (for example, saved from Word) instead."
            : "No Yes / No / NA answers could be found on this sheet. Make sure the words Yes, No and NA are typed text on the PDF.";
        renderInsp();
        $("inspNote").textContent = why;
        toast(why.slice(0, 90));
        return;
      }
      b.qs.forEach(function (q) {
        q.ans = null;
        var P = b.pages[q.page];
        if (q.crop && P && !q.text)
          q.img = cropUrl(P.base, q.crop[0], q.crop[1], q.crop[2], q.crop[3]);
        if (q.headCrop && P && !q.sec)
          q.headImg = cropUrl(P.base, q.headCrop[0], q.headCrop[1], q.headCrop[2], q.headCrop[3]);
      });
      ins = b;
      ins.tpl = f;
      ins.f = f;
      $("inName").textContent = f.name;
      $("inOp").value = opDefault();
      $("inDate").value = new Date().toLocaleDateString("en-US");
      $("inEq").value = "";
      $("inNotes").value = "";
      var box = $("inPdf");
      box.innerHTML = "";
      b.pages.forEach(function (P, i) {
        var w = document.createElement("div");
        w.className = "inpage";
        P.base.className = "b";
        P.ov.className = "o";
        w.appendChild(P.base);
        w.appendChild(P.ov);
        box.appendChild(w);
        P.wrap = w;
      });
      var lastSec = null;
      $("inQs").innerHTML = b.qs
        .map(function (q, i) {
          var sec = "";
          if (q.sec && q.sec !== lastSec) {
            sec = '<li class="insec">' + esc(q.sec) + "</li>";
            lastSec = q.sec;
          } else if (q.headImg) {
            sec =
              '<li class="insec img"><img class="qimg" alt="Section heading" src="' +
              q.headImg +
              '"></li>';
          }
          var qtxt = q.text
            ? "<span>" + esc(q.text.replace(/^\(?\d{1,3}[\.\)]\s*/, "")) + "</span>"
            : q.img
              ? '<img class="qimg" alt="Question ' + (i + 1) + '" src="' + q.img + '">'
              : "<span>Question " + (i + 1) + "</span>";
          return (
            sec +
            '<li class="inq" data-qi="' +
            i +
            '"><div class="qt"><span class="qn">' +
            (i + 1) +
            "</span>" +
            qtxt +
            '</div><div class="qa">' +
            ["yes", "no", "na"]
              .filter(function (k) {
                return q.ov[k];
              })
              .map(function (k) {
                return (
                  '<button data-a="' +
                  k +
                  '" aria-pressed="false">' +
                  esc(b.labels[k]) +
                  "</button>"
                );
              })
              .join("") +
            "</div></li>"
          );
        })
        .join("");
      var warn = [];
      if (!b.anchors.op) warn.push("operator name");
      if (!b.anchors.dt) warn.push("date");
      if (!b.anchors.eq) warn.push("equipment ID");
      $("inWarn").hidden = !warn.length;
      $("inWarn").textContent = warn.length
        ? "The " +
          warn.join(" and ") +
          " line could not be found on this sheet, so it will be saved with the record but not written on the PDF."
        : "";
      var needTxt = b.qs.some(function (q) {
        return !q.text;
      });
      $("inQtextBtn").hidden = !needTxt;
      $("inRotate").hidden = !b.scan;
      if (b.truncated) toast("Only the first 12 pages of this sheet are used.");
      else if (b.renderFail)
        toast("Part of this PDF could not be drawn, but the questions were still found.");
      b.pages.forEach(function (P, i) {
        inDrawOverlay(i);
      });
      inUpdate();
      renderInsp();
    } catch (e) {
      console.error(e);
      var msg = e && e.message ? e.message : String(e);
      ins = null;
      renderInsp();
      $("inspNote").textContent = "That sheet could not be opened: " + msg;
      toast("That sheet could not be opened: " + msg.slice(0, 70));
    }
  }
  $("inCreate").addEventListener("click", function (e) {
    e.stopPropagation();
    if (!sess) {
      toast("Sign in first so your name can be filled in on the sheet.");
      return;
    }
    inMenuOn = !inMenuOn;
    if (inMenuOn) tpCloudScan(); // fresh list from the cloud each time the menu opens
    renderInsp();
  });
  $("inMenu").addEventListener("click", function (e) {
    e.stopPropagation();
    var b = e.target.closest("button[data-tpl]");
    if (!b) return;
    inMenuOn = false;
    renderInsp();
    startInsp(b.dataset.tpl);
  });
  document.addEventListener("click", function () {
    if (inMenuOn) {
      inMenuOn = false;
      renderInsp();
    }
  });
  $("inQs").addEventListener("click", function (e) {
    var li = e.target.closest("li.inq");
    if (!li || !ins) return;
    var q = ins.qs[+li.dataset.qi],
      b = e.target.closest("button[data-a]");
    if (b) {
      q.ans = q.ans === b.dataset.a ? null : b.dataset.a;
      inDrawOverlay(q.page);
      inUpdate();
      return;
    }
    var P = ins.pages[q.page],
      box = $("inPdf"),
      k = P.base.clientWidth / P.base.width;
    box.scrollTo({ top: P.wrap.offsetTop + q.y * k - box.clientHeight / 3, behavior: "smooth" });
  });
  $("inRotate").onclick = function () {
    if (!ins || !ins.f) return;
    var f = ins.f;
    f.rot = ((f.rot || 0) + 90) % 360;
    save();
    ins = null;
    startInsp(f.id);
  };
  $("inQtextBtn").onclick = function () {
    if (!ins || !ins.f) return;
    var d = $("qtDlg"),
      f = ins.f;
    $("qtHelp").textContent =
      "One question per line, in order. This sheet has " + ins.qs.length + " questions.";
    $("qtForm").t.value = (f.qtext || []).join("\n");
    $("qtMsg").textContent = "";
    d.showModal();
  };
  $("qtCancel").onclick = function () {
    $("qtDlg").close();
  };
  $("qtForm").addEventListener("submit", function (e) {
    var lines = $("qtForm")
      .t.value.split("\n")
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
    if (lines.length !== ins.qs.length) {
      e.preventDefault();
      $("qtMsg").textContent =
        "Enter exactly " + ins.qs.length + " lines (you have " + lines.length + ").";
      return;
    }
    var f = ins.f;
    f.qtext = lines;
    save();
    ins = null;
    startInsp(f.id);
  });
  $("inOp").addEventListener("input", function () {
    if (ins)
      ins.pages.forEach(function (P, i) {
        inDrawOverlay(i);
      });
  });
  $("inEq").addEventListener("input", function () {
    if (ins)
      ins.pages.forEach(function (P, i) {
        inDrawOverlay(i);
      });
  });
  $("inDate").addEventListener("input", function () {
    if (ins)
      ins.pages.forEach(function (P, i) {
        inDrawOverlay(i);
      });
  });
  $("inCancel").onclick = function () {
    if (
      ins &&
      ins.qs.some(function (q) {
        return q.ans;
      }) &&
      !confirm("Discard this inspection sheet? Your answers will be lost.")
    )
      return;
    ins = null;
    renderInsp();
  };
  function canvasBlob(c) {
    return new Promise(function (res) {
      c.toBlob(res, "image/jpeg", 0.88);
    });
  }
  $("inFinish").onclick = async function () {
    if (
      !ins ||
      ins.qs.some(function (q) {
        return !q.ans;
      })
    )
      return;
    this.disabled = true;
    try {
      var blobs = [];
      for (var i = 0; i < ins.pages.length; i++) {
        var P = ins.pages[i],
          c = document.createElement("canvas");
        c.width = P.base.width;
        c.height = P.base.height;
        var cx = c.getContext("2d");
        cx.fillStyle = "#fff";
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(P.base, 0, 0);
        cx.drawImage(P.ov, 0, 0);
        blobs.push(await canvasBlob(c));
      }
      var notes = $("inNotes").value.trim();
      if (notes) {
        var P0 = ins.pages[0],
          NW = P0.base.width,
          NH = P0.base.height,
          fs = Math.round(INSC * 11),
          lh2 = Math.round(fs * 1.45),
          mx = Math.round(NW * 0.09),
          my = Math.round(NH * 0.08);
        var nc = null,
          nx = null,
          ny = 0,
          pageNo = 0;
        var hdr = [
          ins.tpl.name,
          "Operator: " +
            ($("inOp").value.trim() || "–") +
            "   ·   Equipment ID #: " +
            ($("inEq").value.trim() || "–") +
            "   ·   Date: " +
            ($("inDate").value.trim() || "–"),
        ];
        function newNotePage() {
          nc = document.createElement("canvas");
          nc.width = NW;
          nc.height = NH;
          nx = nc.getContext("2d");
          nx.fillStyle = "#fff";
          nx.fillRect(0, 0, NW, NH);
          nx.fillStyle = "#000";
          nx.textBaseline = "alphabetic";
          nx.font = "700 " + Math.round(fs * 1.5) + "px Helvetica,Arial,sans-serif";
          ny = my + fs * 1.5;
          nx.fillText(pageNo ? "Notes (continued)" : "Notes", mx, ny);
          nx.font = "400 " + Math.round(fs * 0.85) + "px Helvetica,Arial,sans-serif";
          ny += lh2;
          nx.fillStyle = "#444";
          hdr.forEach(function (h) {
            nx.fillText(h, mx, ny);
            ny += Math.round(lh2 * 0.85);
          });
          nx.strokeStyle = "#000";
          nx.lineWidth = Math.max(1, INSC);
          nx.beginPath();
          nx.moveTo(mx, ny - lh2 * 0.4);
          nx.lineTo(NW - mx, ny - lh2 * 0.4);
          nx.stroke();
          ny += lh2 * 0.6;
          nx.fillStyle = "#000";
          nx.font = "400 " + fs + "px Helvetica,Arial,sans-serif";
          pageNo++;
        }
        async function flushNote() {
          blobs.push(await canvasBlob(nc));
        }
        newNotePage();
        var paras = notes.split(/\n/);
        for (var pi2 = 0; pi2 < paras.length; pi2++) {
          var words = paras[pi2].split(/\s+/).filter(Boolean),
            line = "";
          if (!words.length) {
            ny += lh2;
            continue;
          }
          for (var wi = 0; wi <= words.length; wi++) {
            var test = wi < words.length ? (line ? line + " " + words[wi] : words[wi]) : null;
            if (test !== null && nx.measureText(test).width <= NW - 2 * mx) {
              line = test;
              continue;
            }
            if (ny > NH - my) {
              await flushNote();
              newNotePage();
            }
            nx.fillText(line, mx, ny);
            ny += lh2;
            line = wi < words.length ? words[wi] : "";
          }
        }
        await flushNote();
      }
      var id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        cnt = { yes: 0, no: 0, na: 0 };
      ins.qs.forEach(function (q) {
        cnt[q.ans]++;
      });
      await tpTx(
        "readwrite",
        function (os) {
          return os.put({ id: id, pages: blobs, scale: INSC });
        },
        "sheets"
      );
      st.insp.push({
        id: id,
        tplName: ins.tpl.name,
        operator: $("inOp").value.trim(),
        equipment: $("inEq").value.trim(),
        notes: notes,
        by: curEmail(),
        date: $("inDate").value.trim(),
        ts: Date.now(),
        counts: cnt,
        pages: blobs.length,
        scale: INSC,
        labels: ins.labels,
        answers: ins.qs.map(function (q) {
          return { q: q.text, a: q.ans };
        }),
      });
      audit(
        "Inspections",
        "Finished the inspection sheet “" +
          ins.tpl.name +
          "” (" +
          cnt.yes +
          " " +
          ins.labels.yes +
          ", " +
          cnt.no +
          " " +
          ins.labels.no +
          ", " +
          cnt.na +
          " " +
          ins.labels.na +
          ")"
      );
      st.audit[st.audit.length - 1].insp = inspCopy(st.insp[st.insp.length - 1]);
      save();
      ins = null;
      renderInsp();
      toast("Inspection sheet finished. Find it under Profile → Inspections and Manage → Inspection Sheets.");
      inspPush();
    } catch (e) {
      console.error(e);
      toast("The sheet could not be saved. Browser storage may be full.");
      this.disabled = false;
    }
  };

  /* ---------- finished sheets (Manage → Inspection Sheets) ---------- */
  /* =====================================================================
     Manage: finished inspection sheets, PDF export and viewer
     ===================================================================== */
  function renderFinished() {
    var box = $("mgFinished"),
      list = inspAll()
        .filter(function (r) {
          return visibleP(r.by);
        })
        .slice()
        .reverse();
    if (!list.length) {
      box.innerHTML =
        '<div class="empty" style="padding:26px 0">No finished inspection sheets yet. They appear here when someone selects Finish.</div>';
      return;
    }
    box.innerHTML =
      '<p class="mgnote" style="padding:0 0 12px">Every finished inspection sheet, newest first.</p><div class="tw" style="border:1px solid var(--line);border-radius:10px"><table class="sumtbl"><thead><tr><th>Sheet</th><th>Operator</th><th>Date</th><th>Finished</th><th>Answers</th><th></th></tr></thead><tbody>' +
      list
        .map(function (r) {
          var L = r.labels || { yes: "Yes", no: "No", na: "N/A" };
          return (
            '<tr><td class="cname">' +
            esc(r.tplName) +
            (r.equipment ? "<small>Equip. " + esc(r.equipment) + "</small>" : "") +
            (r.notes ? "<small>Has notes</small>" : "") +
            "</td><td>" +
            esc(r.operator || "–") +
            "<small>" +
            esc(whoName(r.by)) +
            "</small></td><td>" +
            esc(r.date || "–") +
            "</td><td>" +
            new Date(r.ts).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }) +
            '</td><td class="ph">' +
            r.counts.yes +
            " " +
            esc(L.yes) +
            " · <b" +
            (r.counts.no ? ' style="color:#d92d20"' : "") +
            ">" +
            r.counts.no +
            " " +
            esc(L.no) +
            "</b> · " +
            r.counts.na +
            " " +
            esc(L.na) +
            '</td><td class="act"><button data-sv="' +
            r.id +
            '">View</button><button data-sd="' +
            r.id +
            '">Download PDF</button><button data-sr="' +
            r.id +
            '">Remove</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>";
  }

  /* =====================================================================
     Manage: inspection PDFs in cloud storage (Inspection Sheets)
     Bucket "inspection-pdfs": PDFs at the top level or one sub folder deep. Everyone signed in
     sees them; owner/admins upload single PDFs or a whole folder.
     ===================================================================== */
  var fdState = "ok",
    fdFiles = [],
    fdErr = "";
  function fdShowing() {
    return !$("managePanel").hidden && !$("mgBody").hidden && !$("mgOpt4").hidden && document.visibilityState === "visible";
  }
  async function fdScan() {
    if (!cloudOn()) return fdRender();
    try {
      var list = [],
        top = await sbList("inspection-pdfs", "");
      for (var i = 0; i < top.length; i++) {
        var t = top[i];
        if (!t.id) {
          (await sbList("inspection-pdfs", t.name + "/")).forEach(function (f) {
            if (f.id && /\.pdf$/i.test(f.name)) list.push({ name: f.name, folder: t.name, path: t.name + "/" + f.name, f: f });
          });
        } else if (/\.pdf$/i.test(t.name)) list.push({ name: t.name, folder: "", path: t.name, f: t });
      }
      fdFiles = list
        .map(function (x) {
          var md = x.f.metadata || {};
          return { name: x.name, folder: x.folder, path: x.path, size: md.size || 0, mod: Date.parse(md.lastModified || x.f.updated_at || x.f.created_at) || 0 };
        })
        .sort(function (a, b) {
          return b.mod - a.mod || a.name.localeCompare(b.name);
        });
      fdErr = "";
    } catch (x) {
      fdErr = x instanceof TypeError ? "offline" : x.message;
    }
    fdRender();
  }
  function fdRender() {
    var box = $("mgFolder");
    if (!box) return;
    var h = '<h3 class="fdsec">Cloud PDFs</h3>';
    if (!cloudOn()) {
      box.innerHTML = h + '<p class="fdnote">Sign in to see the inspection PDFs stored in the cloud.</p>';
      return;
    }
    var bar =
      '<div class="tpbar"><span class="m">' +
      (fdErr === "offline"
        ? "Offline: the list shows again when you're back online."
        : fdErr
          ? "Couldn't load the PDFs: " + esc(fdErr)
          : fdFiles.length + (fdFiles.length === 1 ? " PDF" : " PDFs") + " in the cloud.") +
      '</span><span class="sp"></span><button data-fd="refresh">Refresh</button>' +
      (isMgr() ? '<button data-fd="files">Upload PDFs</button><button data-fd="dir">Upload a folder</button>' : "") +
      "</div>";
    if (!fdFiles.length) {
      box.innerHTML = h + bar + (fdErr ? "" : '<div class="empty" style="padding:22px 0">No PDFs yet.' + (isMgr() ? " Upload some above." : "") + "</div>");
      return;
    }
    var anySub = fdFiles.some(function (f) {
      return f.folder;
    });
    box.innerHTML =
      h +
      bar +
      '<div class="tw" style="margin-top:14px;border:1px solid var(--line);border-radius:10px"><table class="sumtbl"><thead><tr><th>PDF</th>' +
      (anySub ? "<th>Sub-folder</th>" : "") +
      "<th>Size</th><th>Modified</th><th></th></tr></thead><tbody>" +
      fdFiles
        .map(function (f, i) {
          return (
            '<tr><td class="cname">' +
            esc(f.name.replace(/\.pdf$/i, "")) +
            "</td>" +
            (anySub ? "<td>" + (esc(f.folder) || "–") + "</td>" : "") +
            '<td class="ph">' +
            fmtSize(f.size) +
            "</td><td>" +
            (f.mod
              ? new Date(f.mod).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
              : "–") +
            '</td><td class="act"><button data-fv="' +
            i +
            '">View</button><button data-fdl="' +
            i +
            '">Download</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>";
  }
  if ($("mgFolder"))
    $("mgFolder").addEventListener("click", async function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var act = b.dataset.fd;
      if (act === "refresh") return fdScan();
      if (act === "files" || act === "dir") {
        if (!isMgr()) return;
        return pickFiles(act === "files" ? "application/pdf,.pdf" : "", act === "dir", async function (files) {
          var jobs = files
            .filter(function (f) {
              return /\.pdf$/i.test(f.name);
            })
            .map(function (f) {
              var parts = (f.webkitRelativePath || f.name).split("/"),
                sub = parts.length > 2 ? parts[parts.length - 2].trim() + "/" : ""; // keep the nearest sub folder
              return { path: sub + f.name, file: f };
            });
          if (!jobs.length) return toast("No PDFs were found.");
          await sbUploadAll("inspection-pdfs", jobs, "PDF");
          fdScan();
        });
      }
      var f = fdFiles[+(b.dataset.fv || b.dataset.fdl)];
      if (!f) return;
      var blob;
      try {
        blob = await sbDownload("inspection-pdfs", f.path);
      } catch (x) {
        toast("“" + f.name + "” could not be opened: " + x.message);
        return;
      }
      var url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" })),
        base = f.name.replace(/\.pdf$/i, "");
      if (b.dataset.fdl) {
        var a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 4000);
        return;
      }
      pdfClean();
      pdfUrl = url;
      pdfName = base;
      $("pdfTitle").textContent = base;
      $("pdfFrame").src = url;
      $("pdfDlg").showModal();
    });

  function shClean() {
    shUrls.forEach(function (u) {
      URL.revokeObjectURL(u);
    });
    shUrls = [];
    $("sheetPages").innerHTML = "";
  }
  /* ---------- Finished inspection sheets in the cloud ----------
     A sheet's answers ride the activity log (st.audit entry with .insp), which syncs to every device;
     its page images go to storage at inspection-pdfs/sheets/<id>/<n>.jpg. Remove adds .inspdel.
     shortcut: removed sheets' images stay in storage, delete them there if space runs short. */
  var SH_DIR = "sheets/";
  function inspCopy(r) {
    var c = Object.assign({}, r);
    delete c.up;
    return c;
  }
  // Every finished sheet: this device's plus the ones shared from other devices, oldest first.
  function inspAll() {
    var gone = {},
      seen = {},
      out = [];
    (st.audit || []).forEach(function (e) {
      if (e.inspdel) gone[e.inspdel] = 1;
    });
    st.insp
      .concat(
        (st.audit || [])
          .filter(function (e) {
            return e.insp;
          })
          .map(function (e) {
            return e.insp;
          })
      )
      .forEach(function (r) {
        if (gone[r.id] || seen[r.id]) return;
        seen[r.id] = 1;
        out.push(r);
      });
    return out.sort(function (a, b) {
      return a.ts - b.ts;
    });
  }
  // A sheet's page images: from this browser, or downloaded from the cloud. null when missing.
  async function inspPages(rec) {
    var row = await tpTx(
      "readonly",
      function (os) {
        return os.get(rec.id);
      },
      "sheets"
    ).catch(function () {
      return null;
    });
    if (row) return row;
    if (!cloudOn() || !rec.pages) return null;
    try {
      var pages = [];
      for (var i = 0; i < rec.pages; i++) pages.push(await sbDownload("inspection-pdfs", SH_DIR + rec.id + "/" + i + ".jpg"));
      return { pages: pages, scale: rec.scale || INSC };
    } catch (x) {
      return null;
    }
  }
  // Uploads the pages of this user's sheets that aren't in the cloud yet, and shares sheets made
  // before syncing existed. Runs after each sync, so a sheet finished offline goes up later.
  var inspBusy = false;
  async function inspPush() {
    if (inspBusy || !cloudOn() || !sess) return;
    inspBusy = true;
    var changed = false,
      shared = {};
    (st.audit || []).forEach(function (e) {
      if (e.insp) shared[e.insp.id] = 1;
    });
    var upOk = true; // after one failed upload (offline, or not allowed yet), skip uploads until the next sync
    for (var k = 0; k < st.insp.length; k++) {
      var r = st.insp[k];
      if (r.by !== curEmail()) continue;
      if (!shared[r.id]) {
        audit("Inspections", "Shared the inspection sheet “" + r.tplName + "” to the cloud");
        st.audit[st.audit.length - 1].insp = inspCopy(r);
        changed = true;
      }
      if (r.up || !upOk) continue;
      try {
        var row = await tpTx(
          "readonly",
          function (os) {
            return os.get(r.id);
          },
          "sheets"
        );
        if (!row) continue;
        for (var i = 0; i < row.pages.length; i++) {
          try {
            // Add only (no x-upsert): staff may add sheet pages but not replace them.
            await sbFetch("/storage/v1/object/inspection-pdfs/" + sbPath(SH_DIR + r.id + "/" + i + ".jpg"), {
              method: "POST",
              headers: { "Content-Type": "image/jpeg" },
              body: row.pages[i],
            });
          } catch (x) {
            if (!(x.status === 409 || /exist|duplicate/i.test(x.message))) throw x; // already there from an earlier try
          }
        }
        r.up = 1;
        changed = true;
      } catch (x) {
        upOk = false;
      }
    }
    inspBusy = false;
    if (changed) save();
  }
  function inspFile(rec) {
    return (rec.tplName + " - " + (rec.operator || "operator") + " - " + (rec.date || "").replace(/[\/\\:]/g, "-")).replace(/[^\w\- .]/g, "");
  }
  // Profile → Inspections: View (PDF with Print) and Download.
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-inspv]");
    if (!b) return;
    var rec = inspAll().find(function (x) {
      return x.id === b.dataset.inspv;
    });
    if (!rec) return toast("That inspection sheet could not be found.");
    toast("Opening the inspection sheet…");
    var bytes = await sheetPdfBytes(rec);
    if (!bytes) return toast("This sheet's pages haven't reached the cloud yet. Open it on the device that made it, or try again later.");
    tpShow(bytes, inspFile(rec), !!b.dataset.inspdl);
  });
  async function sheetPdfBytes(rec) {
    var row = await inspPages(rec);
    if (!row) return null;
    var imgs = [];
    for (var i = 0; i < row.pages.length; i++) {
      var bm = await createImageBitmap(row.pages[i]),
        jpg = new Uint8Array(await row.pages[i].arrayBuffer()),
        sc = row.scale || 1;
      imgs.push({
        w: bm.width,
        h: bm.height,
        pw: Math.round((bm.width / sc) * 100) / 100,
        ph: Math.round((bm.height / sc) * 100) / 100,
        jpg: jpg,
      });
    }
    return imgPdfBytes(imgs);
  }
  // A PDF with one JPEG per page: imgs = [{ w, h (pixels), pw, ph (page size in pt), jpg: Uint8Array }].
  function imgPdfBytes(imgs) {
    var parts = [],
      len = 0,
      offs = [],
      enc = new TextEncoder();
    function add(x) {
      var b = typeof x === "string" ? enc.encode(x) : x;
      parts.push(b);
      len += b.length;
    }
    function obj(id, body) {
      offs[id] = len;
      add(id + " 0 obj\n" + body + "\nendobj\n");
    }
    add("%PDF-1.4\n");
    var kids = [];
    imgs.forEach(function (m, i) {
      kids.push(3 + i * 3 + " 0 R");
    });
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + imgs.length + " >>");
    imgs.forEach(function (m, i) {
      var pg = 3 + i * 3,
        ct = 4 + i * 3,
        im = 5 + i * 3,
        cs = "q " + m.pw + " 0 0 " + m.ph + " 0 0 cm /Im0 Do Q";
      obj(
        pg,
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
          m.pw +
          " " +
          m.ph +
          "] /Contents " +
          ct +
          " 0 R /Resources << /XObject << /Im0 " +
          im +
          " 0 R >> >> >>"
      );
      obj(ct, "<< /Length " + cs.length + " >>\nstream\n" + cs + "\nendstream");
      offs[im] = len;
      add(
        im +
          " 0 obj\n<< /Type /XObject /Subtype /Image /Width " +
          m.w +
          " /Height " +
          m.h +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
          m.jpg.length +
          " >>\nstream\n"
      );
      add(m.jpg);
      add("\nendstream\nendobj\n");
    });
    var total = 3 + imgs.length * 3,
      xr = len;
    add("xref\n0 " + total + "\n0000000000 65535 f \n");
    for (var k = 1; k < total; k++) add(("0000000000" + offs[k]).slice(-10) + " 00000 n \n");
    add("trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xr + "\n%%EOF");
    var out = new Uint8Array(len),
      pos = 0;
    parts.forEach(function (b) {
      out.set(b, pos);
      pos += b.length;
    });
    return out;
  }
  $("mgFinished").addEventListener("click", async function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var id = b.dataset.sv || b.dataset.sd || b.dataset.sr,
      rec = inspAll().find(function (x) {
        return x.id === id;
      });
    if (!rec) return;
    if (b.dataset.sr) {
      if (!confirm("Remove this finished sheet for " + (rec.operator || "this operator") + "? It will be removed for everyone.")) return;
      try {
        await tpTx(
          "readwrite",
          function (os) {
            return os.delete(id);
          },
          "sheets"
        );
      } catch (x) {}
      st.insp = st.insp.filter(function (x) {
        return x.id !== id;
      });
      audit("Inspections", "Removed the finished sheet “" + rec.tplName + "”");
      st.audit[st.audit.length - 1].inspdel = id; // synced, so it's gone on every device
      save();
      renderFinished();
      toast("Finished sheet removed.");
      return;
    }
    if (b.dataset.sd) {
      var bytes = await sheetPdfBytes(rec);
      if (!bytes) {
        toast("This sheet's pages haven't reached the cloud yet. Select View to see its answers.");
        return;
      }
      var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
        a = document.createElement("a");
      a.href = url;
      a.download =
        (
          rec.tplName +
          " - " +
          (rec.operator || "operator") +
          " - " +
          (rec.date || "").replace(/[\/\\:]/g, "-")
        ).replace(/[^\w\- .]/g, "") + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
      return;
    }
    // No page images yet (still on the device that made it): show the synced answers instead.
    var row = await inspPages(rec);
    shRec = row ? rec : null;
    shClean();
    $("sheetDl").hidden = !row;
    $("sheetTitle").textContent = rec.tplName;
    $("sheetMeta").textContent =
      "Operator: " +
      (rec.operator || "–") +
      (rec.equipment ? " · Equipment ID #: " + rec.equipment : "") +
      " · Date: " +
      (rec.date || "–") +
      " · Finished " +
      new Date(rec.ts).toLocaleString();
    if (!row) {
      var L = rec.labels || { yes: "Yes", no: "No", na: "N/A" };
      $("sheetPages").innerHTML =
        '<div class="shnopg"><p>The page images for this sheet haven\'t reached the cloud yet. They upload the next time ' +
        esc(whoName(rec.by) || "the person who made it") +
        " opens the app. Here are the answers.</p>" +
        '<table class="sumtbl"><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>' +
        (rec.answers || [])
          .map(function (x) {
            return "<tr><td>" + esc(x.q) + "</td><td" + (x.a === "no" ? ' style="color:#d92d20;font-weight:700"' : "") + ">" + esc(L[x.a] || x.a || "–") + "</td></tr>";
          })
          .join("") +
        "</tbody></table>" +
        (rec.notes ? "<p><b>Notes:</b> " + esc(rec.notes) + "</p>" : "") +
        "</div>";
      return $("sheetDlg").showModal();
    }
    row.pages.forEach(function (bl, i) {
      var u = URL.createObjectURL(bl);
      shUrls.push(u);
      var im = document.createElement("img");
      im.src = u;
      im.alt = "Page " + (i + 1) + " of " + rec.tplName;
      $("sheetPages").appendChild(im);
    });
    $("sheetDlg").showModal();
  });
  $("sheetClose").onclick = function () {
    $("sheetDlg").close();
  };
  $("sheetDlg").addEventListener("close", shClean);
  $("sheetDl").onclick = async function () {
    if (!shRec) return;
    var bytes = await sheetPdfBytes(shRec);
    if (!bytes) return;
    var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (shRec.tplName + " - " + (shRec.operator || "operator")).replace(/[^\w\- .]/g, "") + ".pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  };

  var sumDay = null;
  function dayOf(ts) {
    var d = new Date(ts);
    return (
      d.getFullYear() +
      "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + d.getDate()).slice(-2)
    );
  }
  function fmtQ(n) {
    return (Math.round(n * 100) / 100).toLocaleString();
  }
  function logE(it, a, q, x) {
    q = Math.round(q * 10000) / 10000;
    if (!(q > 0)) return;
    var e = { ts: Date.now(), id: it.id, n: it.n, d: it.d, u: it.u || "", l: it.l, a: a, q: q };
    if (x) for (var k in x) e[k] = x[k];
    e.by = curEmail();
    e.k = nid("q"); // stable id so the log can sync between devices
    st.log.push(e);
    if (!(e.note && e.note.indexOf("EWO") === 0)) {
      var what = e.n + " " + String(e.d).slice(0, 60);
      if (a === "move")
        audit(
          "Transfers",
          "Moved " + fmtQ(q) + " " + e.u + " of " + what + " from " + e.from + " to " + e.to
        );
      else
        audit(
          "Quantity changes",
          (a === "add" ? "Added " : "Subtracted ") +
            fmtQ(q) +
            " " +
            e.u +
            " – " +
            what +
            " (" +
            e.l +
            ")" +
            (e.note ? " – " + e.note : "")
        );
    }
  }
  function curEmail() {
    return (sess && sess.email) || "";
  }
  /* =====================================================================
     Activity log (audit)
     ===================================================================== */
  function audit(cat, text) {
    if (!st.audit) st.audit = [];
    st.audit.push({ ts: Date.now(), by: curEmail(), cat: cat, text: text, k: nid("a") });
    // Keep the newest 2000 entries, plus every saved record (sheets, counts, transfers, pick lists) and its removal.
    if (st.audit.length > 2000) {
      var cut = st.audit.length - 2000;
      st.audit = st.audit.filter(function (e, i) {
        return i >= cut || e.insp || e.inspdel || e.gr || e.gt || e.grdel || e.ms || e.pick;
      });
    }
  }
  // Summary: what each person did on the day, one tinted section per job (Pick lists, Put aways, Deliveries, Greens).
  // Each record: { by, ts, c: [cells] }; c[0] names it, the rest fill that section's columns.
  var SUM_SECS = [
    { k: "pk", t: "Pick lists", one: "pick list", many: "pick lists", cols: ["Pick list", "Lines", "Picked", "Problems"], none: "No pick lists were submitted on this day." },
    { k: "pa", t: "Put aways", one: "put away", many: "put aways", cols: ["Put away"], none: "No put aways on this day. Put Away isn't set up yet, so none are recorded." },
    { k: "dv", t: "Deliveries", one: "trip", many: "trips", cols: ["Trip", "Receipts", "Boxes", "Status"], none: "No delivery trips were started on this day." },
    { k: "gn", t: "Greens", one: "move", many: "moves", cols: ["What", "Items", "Total"], none: "No Greens counts or transfers on this day." },
  ];
  function summaryData(day) {
    var A = st.audit || [],
      gone = grGone(),
      on = function (e) {
        return dayOf(e.ts) === day;
      };
    return {
      pk: A.filter(function (e) {
        return on(e) && e.pick && !e.pick.of; // first submissions; edits are part of them
      }).map(function (e) {
        var x = e.pick,
          got = Object.keys(x.picked || {}).reduce(function (t, j) {
            return t + (pkNum(x.picked[j]) || 0);
          }, 0);
        return { by: e.by, ts: e.ts, c: [x.no ? "Pick slip " + x.no : x.name || "Pick list", x.rows.length, fmtQ(got), Object.keys(x.prob || {}).length] };
      }),
      pa: A.filter(function (e) {
        return on(e) && e.cat === "Put aways";
      }).map(function (e) {
        return { by: e.by, ts: e.ts, c: [e.text] };
      }),
      dv: (st.manifests || []).filter(on).map(function (m) {
        return {
          by: m.by,
          ts: m.ts,
          c: [dvTripName(m) + " (" + m.no + ")", m.lines.length, dvBoxes(m.lines), m.status === "submitted" ? "Delivered" : m.status === "delivering" ? "Delivering" : "Loading"],
        };
      }),
      gn: A.filter(function (e) {
        return on(e) && (e.gr || e.gt);
      }).map(function (e) {
        var g = e.gr || e.gt,
          tot = g.order.reduce(function (t, n) {
            return t + (g.counts[n] || 0);
          }, 0);
        return {
          by: e.by,
          ts: e.ts,
          c: [
            (e.gr ? "Count at " + g.site : (g.done ? "Transferred " : "Transfer saved: ") + g.from + " to " + g.to) +
              (gone[e.gr ? e.k : g.of || e.k] ? " (deleted)" : ""),
            g.order.length,
            tot,
          ],
        };
      }),
    };
  }
  function sumByWho(list) {
    var by = {};
    list.forEach(function (r) {
      (by[r.by || ""] = by[r.by || ""] || []).push(r);
    });
    return Object.keys(by)
      .sort(function (x, y) {
        return whoName(x).localeCompare(whoName(y));
      })
      .map(function (em) {
        return {
          em: em,
          l: by[em].sort(function (x, y) {
            return x.ts - y.ts;
          }),
        };
      });
  }
  /* =====================================================================
     Summary page: each person's pick lists, put aways, deliveries and Greens moves on a day
     ===================================================================== */
  function renderSummary() {
    var b = $("sumBody");
    if (!sumDay) {
      b.innerHTML =
        '<div class="empty">Choose a date, then select <b>Create daily summary</b>.</div>';
      return;
    }
    var s = summaryData(sumDay);
    var nice = new Date(sumDay + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    var h =
      '<div class="sumhead"><h3>' +
      esc(nice) +
      '</h3><div class="sumact"><button id="sumPrint">Print</button><button id="sumCsv">Export CSV</button></div></div>' +
      '<div class="sumstats">' +
      SUM_SECS.map(function (x) {
        return '<div class="card"><b>' + s[x.k].length + "</b><span>" + x.t + "</span></div>";
      }).join("") +
      "</div>";
    SUM_SECS.forEach(function (x) {
      var g = sumByWho(s[x.k]);
      h += grSec(
        "sum" + x.k,
        x.t,
        s[x.k].length + " " + (s[x.k].length === 1 ? x.one : x.many),
        g.length ? (g.length === 1 ? "1 person" : g.length + " people") + ", earliest first." : "",
        g.length
          ? g
              .map(function (w) {
                return (
                  '<h4 class="sumwho">' +
                  esc(whoName(w.em) || "Unknown") +
                  " <span>" +
                  w.l.length +
                  " " +
                  (w.l.length === 1 ? x.one : x.many) +
                  '</span></h4><div class="tw"><table class="sumtbl grsheets"><thead><tr>' +
                  x.cols
                    .map(function (c) {
                      return "<th>" + c + "</th>";
                    })
                    .join("") +
                  "<th>Time</th></tr></thead><tbody>" +
                  w.l
                    .map(function (r) {
                      return (
                        "<tr>" +
                        r.c
                          .map(function (v, i) {
                            return i ? '<td class="ph" data-l="' + esc(x.cols[i]) + '">' + esc(v) + "</td>" : '<td class="cname">' + esc(v) + "</td>";
                          })
                          .join("") +
                        "<td>" +
                        dvTime(r.ts) +
                        "</td></tr>"
                      );
                    })
                    .join("") +
                  "</tbody></table></div>"
                );
              })
              .join("")
          : '<div class="empty">' + x.none + "</div>"
      );
    });
    b.innerHTML = h;
  }
  function sumCsv() {
    var s = summaryData(sumDay),
      rows = [["Date", "Section", "Person", "Time", "What", "Details"]];
    SUM_SECS.forEach(function (x) {
      sumByWho(s[x.k]).forEach(function (w) {
        w.l.forEach(function (r) {
          rows.push([
            sumDay,
            x.t,
            whoName(w.em),
            dvTime(r.ts),
            r.c[0],
            r.c
              .slice(1)
              .map(function (v, i) {
                return x.cols[i + 1] + ": " + v;
              })
              .join("; "),
          ]);
        });
      });
    });
    download(
      "daily-summary-" + sumDay + ".csv",
      "\ufeff" +
        rows
          .map(function (r) {
            return r
              .map(function (c) {
                return '"' + String(c).replace(/"/g, '""') + '"';
              })
              .join(",");
          })
          .join("\r\n"),
      "text/csv"
    );
  }
  $("sumCreate").onclick = function () {
    if (!can("summary")) {
      deny("create summaries");
      return;
    }
    sumDay = $("sumDate").value || dayOf(Date.now());
    audit("Summaries", "Created the daily summary for " + sumDay);
    save();
    renderSummary();
  };
  $("sumBody").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.id === "sumPrint") window.print();
    else if (b.id === "sumCsv") sumCsv();
  });
  $("sumDate").value = dayOf(Date.now());

  /* =====================================================================
     Cloud (Supabase): sign-in, people, shared data, delivery trips, files
     - One cloud login (email + password) for the whole app, kept on the device.
     - Everything saves on the device first, then syncs, so it works with no signal.
     - A device's first sign-in downloads from the cloud and never overwrites it;
       the owner moves existing data up once with "Upload this device's data" (Manage).
     - Who may read or change what is enforced by Supabase (see supabase/setup.sql).
     - Talks to Supabase's web API with fetch (no extra library).
     ===================================================================== */
  // Publishable key: designed to be public in website code; the database rules protect the data.
  var SB_URL = "https://mkovvhsceckubkdxuemi.supabase.co",
    SB_KEY = "sb_publishable_5MhVb61wtbO1Dcq-SZ-9dA_2WWpGd27",
    cloudT = null,
    cloudBusy = false,
    cloudAgain = false,
    cloudLastPull = 0,
    cloudErr = "",
    cloudLastOk = 0;
  function authGet() {
    try {
      return JSON.parse(localStorage.getItem("wh-auth") || "null");
    } catch (x) {
      return null;
    }
  }
  function authKeep(a) {
    try {
      if (a) localStorage.setItem("wh-auth", JSON.stringify(a));
      else localStorage.removeItem("wh-auth");
    } catch (x) {}
  }
  // The previous version kept a separate cloud sign-in per app user; adopt it so nobody signs in twice.
  (function () {
    try {
      var k = Object.keys(localStorage).filter(function (x) {
        return x.indexOf("wh-cloud:") === 0;
      })[0];
      if (k && !authGet()) authKeep(JSON.parse(localStorage.getItem(k)));
      if (k) localStorage.removeItem(k);
    } catch (x) {}
  })();
  function cloudOn() {
    return !!authGet();
  }
  async function sbAuth(grant, body) {
    var r = await fetch(SB_URL + "/auth/v1/token?grant_type=" + grant, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      j = await r.json().catch(function () {
        return {};
      });
    if (!r.ok) {
      var e = new Error(j.error_description || j.msg || j.message || "Sign-in failed");
      e.code = j.error_code || j.error || r.status;
      throw e;
    }
    return {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      email: (j.user && j.user.email) || body.email || "",
      uid: j.user && j.user.id,
    };
  }
  // A valid access token, renewed shortly before it expires. A sign-in that can no longer be
  // renewed (account removed or signed out elsewhere) signs this device out.
  async function sbToken() {
    var a = authGet();
    if (!a) return null;
    if (Date.now() < a.expires_at - 60000) return a.access_token;
    try {
      var n = await sbAuth("refresh_token", { refresh_token: a.refresh_token });
      authKeep(n);
      return n.access_token;
    } catch (e) {
      if (!(e instanceof TypeError) && e.code !== 500 && navigator.onLine !== false) {
        cloudSignOut();
        toast("Please sign in again.");
        render();
      }
      throw e;
    }
  }
  async function sbFetch(path, opt) {
    var tok = await sbToken();
    if (!tok) throw new Error("Not signed in");
    opt = opt || {};
    var h = Object.assign({ apikey: SB_KEY, Authorization: "Bearer " + tok }, opt.headers || {}),
      body = opt.body;
    if (body !== undefined && !(body instanceof Blob)) {
      body = JSON.stringify(body);
      h["Content-Type"] = "application/json";
    }
    var r = await fetch(SB_URL + path, { method: opt.method || "GET", headers: h, body: body });
    if (!r.ok) {
      var t = await r.text().catch(function () {
          return "";
        }),
        msg = "";
      try {
        var j = JSON.parse(t);
        msg = j.error || j.message || j.msg || "";
      } catch (x) {}
      var e = new Error(msg || "Cloud error " + r.status);
      e.status = r.status;
      throw e;
    }
    if (opt.blob) return r.blob();
    return r.status === 204
      ? null
      : r.json().catch(function () {
          return null;
        });
  }
  function sbRest(path, opt) {
    return sbFetch("/rest/v1/" + path, opt);
  }
  // Add / edit / remove people (server function; checks the caller's role itself).
  function cloudAdmin(body) {
    return sbFetch("/functions/v1/admin-users", { method: "POST", body: body });
  }
  function cloudPatchProfile(id, change) {
    return sbRest("profiles?id=eq." + id, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: change });
  }

  /* ---------- Sign in / out ---------- */
  async function cloudSignIn(email, pw) {
    var a = await sbAuth("password", { email: email, password: pw });
    authKeep(a);
    var me = (await sbRest("profiles?select=*&id=eq." + a.uid))[0];
    if (!me) {
      authKeep(null);
      var e = new Error("This account isn't set up for the app yet. Ask the owner.");
      throw e;
    }
    setSess({ uid: a.uid, email: me.email, name: me.name || me.email, role: me.role, perms: me.perms });
    if (!snapGet()) snapAdopt(); // first sign-in here: download, don't overwrite the cloud
    await cloudSync(true);
  }
  function cloudSignOut() {
    var a = authGet();
    if (a && Date.now() < a.expires_at)
      fetch(SB_URL + "/auth/v1/logout", { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + a.access_token } }).catch(function () {});
    authKeep(null);
    setSess(null);
    st.manage = false;
  }

  /* ---------- People ---------- */
  async function cloudPullProfiles() {
    var rows = await sbRest("profiles?select=id,email,name,role,perms,prefs,created_at&order=name");
    var mine = sess && localStorage.getItem("wh-prefs-dirty") ? profOf(sess.email) : null;
    st.users = rows.map(function (r) {
      return { id: r.id, email: r.email, name: r.name, role: r.role, perms: r.perms, created: Date.parse(r.created_at) };
    });
    st.profiles = {};
    rows.forEach(function (r) {
      st.profiles[r.email] = r.prefs || {};
    });
    if (mine) st.profiles[sess.email] = mine; // unsent changes on this device win
    if (sess) {
      var me = rows.filter(function (r) {
        return r.id === sess.uid;
      })[0];
      if (!me) {
        cloudSignOut();
        toast("Your account was removed. Ask the owner if this is a mistake.");
        return;
      }
      setSess(Object.assign(sess, { email: me.email, name: me.name || me.email, role: me.role, perms: me.perms }));
    }
  }
  // Nickname, bio, photo and dark mode are saved on the person's profile.
  function cloudSavePrefs() {
    try {
      localStorage.setItem("wh-prefs-dirty", "1");
    } catch (x) {}
    cloudSoon();
  }

  /* ---------- Shared data: quantities, contacts, EWOs, quantity log, activity ----------
     Each record is a row in app_data (coll, key, val). The device remembers the last value it
     synced per record ("snapshot"); records that differ are sent, everything newer is fetched. */
  var COLLS = ["inventory", "contacts", "ewos", "qlog", "activity"],
    APPEND = { qlog: 1, activity: 1 };
  function logKey(e) {
    return e.k || (e.k = "k" + e.ts + "-" + (e.id || e.by || "") + "-" + (e.a || e.cat || "") + "-" + (e.q || ""));
  }
  function localData(c) {
    var o = {};
    if (c === "inventory") {
      Object.keys(st.edits).forEach(function (id) {
        o[id] = { edit: st.edits[id] };
      });
      Object.keys(st.deleted).forEach(function (id) {
        if (st.deleted[id]) o[id] = { del: 1 };
      });
      st.added.forEach(function (a) {
        o[a.id] = { add: a };
      });
    } else if (c === "contacts")
      st.contacts.forEach(function (x) {
        o[x.id] = x;
      });
    else if (c === "ewos")
      st.ewos.forEach(function (x) {
        o[x.eid] = x;
      });
    else
      (c === "qlog" ? st.log : st.audit).forEach(function (x) {
        o[logKey(x)] = x;
      });
    return o;
  }
  function applyData(c, key, val) {
    if (c === "inventory") {
      if (key.charAt(0) === "a") {
        st.added = st.added.filter(function (a) {
          return a.id !== key;
        });
        if (val && val.add) st.added.push(val.add);
      } else {
        delete st.edits[key];
        delete st.deleted[key];
        if (val && val.del) st.deleted[key] = 1;
        else if (val && val.edit) st.edits[key] = val.edit;
      }
    } else if (c === "contacts" || c === "ewos") {
      var idk = c === "contacts" ? "id" : "eid",
        arr = (c === "contacts" ? st.contacts : st.ewos).filter(function (x) {
          return x[idk] !== key;
        });
      if (val) arr.push(val);
      if (c === "ewos")
        st.ewos = arr.sort(function (x, y) {
          return x.ts - y.ts;
        });
      else st.contacts = arr;
    } else {
      var list = c === "qlog" ? st.log : st.audit;
      if (
        val &&
        !list.some(function (x) {
          return logKey(x) === key;
        })
      ) {
        list.push(val);
        list.sort(function (x, y) {
          return x.ts - y.ts;
        });
      }
    }
  }
  function snapKey() {
    return "wh-sync:" + ((authGet() || {}).uid || "");
  }
  function snapGet() {
    try {
      return JSON.parse(localStorage.getItem(snapKey()) || "null");
    } catch (x) {
      return null;
    }
  }
  function snapPut(s) {
    try {
      localStorage.setItem(snapKey(), JSON.stringify(s));
    } catch (x) {} // storage full: records are simply re-sent next time
  }
  // Treat what is on this device as already synced, so it is never sent over newer cloud data.
  function snapAdopt() {
    var s = { _at: "" };
    COLLS.forEach(function (c) {
      var d = localData(c);
      Object.keys(d).forEach(function (k) {
        s[c + "|" + k] = JSON.stringify(d[k]);
      });
    });
    snapPut(s);
    return s;
  }
  async function cloudPushData(snap) {
    for (var ci = 0; ci < COLLS.length; ci++) {
      var c = COLLS[ci],
        d = localData(c),
        rows = [];
      Object.keys(d).forEach(function (k) {
        var j = JSON.stringify(d[k]);
        if (snap[c + "|" + k] !== j) rows.push({ k: k, val: d[k], j: j });
      });
      if (!APPEND[c])
        Object.keys(snap).forEach(function (sk) {
          var k = sk.slice(c.length + 1);
          if (sk.indexOf(c + "|") === 0 && snap[sk] !== "null" && !(k in d)) rows.push({ k: k, val: null, j: "null" });
        });
      for (var i = 0; i < rows.length; i += 200) {
        var chunk = rows.slice(i, i + 200);
        try {
          await sbRest("app_data?on_conflict=coll,key", {
            method: "POST",
            headers: { Prefer: "resolution=" + (APPEND[c] ? "ignore" : "merge") + "-duplicates,return=minimal" },
            body: chunk.map(function (r) {
              return { coll: c, key: r.k, val: r.val };
            }),
          });
        } catch (e) {
          if (e.status !== 401 && e.status !== 403) throw e;
          // Not allowed for this account: undo those changes here so the device matches the cloud.
          chunk.forEach(function (r) {
            var prev = snap[c + "|" + r.k];
            applyData(c, r.k, prev ? JSON.parse(prev) : null);
            r.j = prev || "null";
          });
          cloudErr = "Some changes weren't allowed for your account and were undone.";
          rebuild();
        }
        chunk.forEach(function (r) {
          snap[c + "|" + r.k] = r.j;
        });
        snapPut(snap);
      }
    }
  }
  async function cloudPullData(snap) {
    var changed = false,
      at = snap._at || "1970-01-01T00:00:00Z",
      maxAt = at,
      loc = {};
    COLLS.forEach(function (c) {
      loc[c] = localData(c);
    });
    for (var off = 0; ; off += 1000) {
      // gte + offset: rows written in one batch share a timestamp, so none are skipped between pages.
      var rows = await sbRest(
        "app_data?select=coll,key,val,updated_at&updated_at=gte." + encodeURIComponent(at) + "&order=updated_at.asc,coll.asc,key.asc&limit=1000&offset=" + off
      );
      rows.forEach(function (r) {
        var sk = r.coll + "|" + r.key,
          cur = loc[r.coll] && loc[r.coll][r.key],
          curJ = cur === undefined ? "null" : JSON.stringify(cur),
          newJ = JSON.stringify(r.val);
        if (r.updated_at > maxAt) maxAt = r.updated_at;
        if (!APPEND[r.coll] && (snap[sk] || "null") !== curJ) return; // unsent local change wins
        if (curJ !== newJ) {
          applyData(r.coll, r.key, r.val);
          loc[r.coll][r.key] = r.val;
          changed = true;
        }
        snap[sk] = newJ;
      });
      if (rows.length < 1000) break;
    }
    snap._at = maxAt;
    snapPut(snap);
    return changed;
  }

  /* ---------- Delivery trips (public.manifests) ---------- */
  function cloudData(m) {
    var o = Object.assign({}, m);
    delete o.syncedUpd;
    return o;
  }
  function cloudDirty(m) {
    return m.by === curEmail() && (!m.syncedUpd || m.syncedUpd < m.upd);
  }
  function cloudDels() {
    try {
      return JSON.parse(localStorage.getItem("wh-cloud-del:" + curEmail()) || "[]");
    } catch (x) {
      return [];
    }
  }
  function cloudSetDels(a) {
    try {
      localStorage.setItem("wh-cloud-del:" + curEmail(), JSON.stringify(a));
    } catch (x) {}
  }
  function cloudForget(id) {
    cloudSetDels(cloudDels().concat([id]));
    cloudSoon();
  }
  function cloudPending() {
    var snap = snapGet() || {},
      n = st.manifests.filter(cloudDirty).length + cloudDels().length;
    COLLS.forEach(function (c) {
      var d = localData(c);
      Object.keys(d).forEach(function (k) {
        if (snap[c + "|" + k] !== JSON.stringify(d[k])) n++;
      });
    });
    return n;
  }
  async function cloudPushTrips() {
    var dels = cloudDels();
    for (var i = 0; i < dels.length; i++) await sbRest("manifests?id=eq." + encodeURIComponent(dels[i]), { method: "DELETE" });
    if (dels.length) cloudSetDels([]);
    var mine = st.manifests.filter(cloudDirty);
    for (var k = 0; k < mine.length; k++) {
      var m = mine[k],
        upd = m.upd;
      try {
        await sbRest("manifests?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: { id: m.id, data: cloudData(m), status: m.status, by_email: m.by },
        });
      } catch (e) {
        // 403: the cloud copy is someone else's or already submitted, so it can't change; stop retrying.
        if (e.status !== 403 && e.status !== 401) throw e;
      }
      m.syncedUpd = upd;
    }
  }
  async function cloudPullTrips() {
    var changed = false,
      since = new Date(Date.now() - 45 * 864e5).toISOString(),
      rows = await sbRest("manifests?select=id,data&updated_at=gte." + encodeURIComponent(since) + "&order=updated_at.asc"),
      seen = {},
      dels = cloudDels();
    (rows || []).forEach(function (r) {
      var d = r.data;
      if (!d || !d.id || dels.indexOf(d.id) >= 0) return; // deleted here; the cloud delete is still queued
      seen[d.id] = 1;
      var loc = dvFind(d.id);
      if (!loc) {
        d.syncedUpd = d.upd;
        st.manifests.push(d);
        changed = true;
      } else if (!cloudDirty(loc) && (d.upd || 0) > (loc.upd || 0)) {
        Object.keys(loc).forEach(function (k2) {
          delete loc[k2];
        });
        Object.assign(loc, d, { syncedUpd: d.upd });
        changed = true;
      }
    });
    // A synced trip that disappeared from the cloud was deleted on another device (or by its owner).
    var before = st.manifests.length;
    st.manifests = st.manifests.filter(function (m2) {
      return (
        seen[m2.id] ||
        !m2.syncedUpd ||
        cloudDirty(m2) ||
        m2.status === "submitted" ||
        Date.now() - m2.upd > 45 * 864e5 // older than what is fetched: keep
      ) && dels.indexOf(m2.id) < 0;
    });
    return changed || st.manifests.length !== before;
  }

  /* ---------- Sync loop ---------- */
  function cloudSoon() {
    clearTimeout(cloudT);
    cloudT = setTimeout(cloudSync, 700);
  }
  async function cloudSync(force) {
    if (!sess || !cloudOn() || navigator.onLine === false) return;
    if (cloudBusy) {
      cloudAgain = true;
      return;
    }
    cloudBusy = true;
    var changed = false;
    try {
      if (localStorage.getItem("wh-prefs-dirty") && sess.uid) {
        await cloudPatchProfile(sess.uid, { prefs: profOf(sess.email) });
        localStorage.removeItem("wh-prefs-dirty");
      }
      var snap = snapGet() || snapAdopt();
      cloudErr = "";
      await cloudPushData(snap);
      await cloudPushTrips();
      if (force || Date.now() - cloudLastPull > 15000) {
        await cloudPullProfiles();
        if (grDraftIn()) changed = true;
        if (await cloudPullData(snap)) changed = true;
        if (await cloudPullTrips()) changed = true;
        cloudLastPull = Date.now();
      }
      cloudLastOk = Date.now();
    } catch (e) {
      // A network failure (no signal) shows as "offline"; anything else as a sync problem.
      cloudErr = navigator.onLine === false || e instanceof TypeError ? "offline" : String((e && e.message) || e);
    } finally {
      cloudBusy = false;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(st)); // keep what was fetched (save() would queue another sync)
    } catch (x) {}
    if (changed) {
      rebuild();
      render();
    } else {
      if (!$("dvPanel").hidden) cloudStatusPaint();
      if (!$("managePanel").hidden && mgOpt === 0) renderManage();
    }
    if (!cloudErr) inspPush();
    if (cloudAgain) {
      cloudAgain = false;
      cloudSoon();
    }
  }
  function cloudStatusHtml() {
    if (!sess) return "";
    if (!cloudOn()) return '<div class="dvcloud off" id="dvCloud"><b>Not synced</b> · sign in again to share trips.</div>';
    var p = cloudPending(),
      t =
        cloudErr === "offline"
          ? "<b>Offline</b> · " + p + " change" + (p === 1 ? "" : "s") + " will sync when you're back online"
          : cloudErr
            ? "<b>Sync problem</b> · " + esc(cloudErr.slice(0, 90)) + (p ? " · " + p + " waiting" : "")
            : p
              ? "<b>Syncing…</b> " + p + " waiting"
              : "<b>Synced</b>" + (cloudLastOk ? " · " + dvTime(cloudLastOk) : "");
    return '<div class="dvcloud ' + (cloudErr ? "warn" : p ? "busy" : "ok") + '" id="dvCloud">' + t + "</div>";
  }
  function cloudStatusPaint() {
    var el = $("dvCloud");
    if (el) el.outerHTML = cloudStatusHtml();
  }
  window.addEventListener("online", function () {
    cloudErr = "";
    cloudSync(true);
  });
  window.addEventListener("focus", function () {
    cloudSync();
  });
  // While the app is open, check for other devices' changes every 30 seconds.
  setInterval(function () {
    if (document.visibilityState === "visible") cloudSync(true);
  }, 30000);

  /* ---------- Owner: move this device's existing data up to the cloud (once) ---------- */
  function cloudUploadCounts() {
    return {
      items: Object.keys(st.edits).length + Object.keys(st.deleted).length + st.added.length,
      contacts: st.contacts.length,
      ewos: st.ewos.length,
      logs: st.log.length + st.audit.length,
      trips: st.manifests.filter(function (m) {
        return m.by === curEmail();
      }).length,
    };
  }
  function renderCloudCard() {
    var box = $("mgCloud");
    if (!box) return;
    if (!isOwner() || !cloudOn() || localStorage.getItem("wh-uploaded:" + sess.uid)) {
      box.innerHTML = "";
      return;
    }
    var n = cloudUploadCounts();
    box.innerHTML =
      '<div class="mgcloud"><div><b>Move this device\'s data to the cloud</b><p>This device has ' +
      n.items +
      " item changes, " +
      n.contacts +
      " contacts, " +
      n.ewos +
      " EWOs, " +
      n.logs +
      " log entries and " +
      n.trips +
      " of your trips. Upload them once from the device that has your real data; other devices then download them. For photos and PDFs, use <b>Upload a folder</b> in Delivery Locations and in Inspection Sheets.</p></div>" +
      '<div class="mgcact"><button class="primary" data-cloudup="go">Upload this device\'s data</button><button data-cloudup="hide">Not this device</button></div></div>';
  }
  $("mgBody").addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-cloudup]");
    if (!b) return;
    if (b.dataset.cloudup === "hide") {
      localStorage.setItem("wh-uploaded:" + sess.uid, "skipped");
      renderCloudCard();
      return;
    }
    var n = cloudUploadCounts();
    if (
      !confirm(
        "Upload " + n.items + " item changes, " + n.contacts + " contacts, " + n.ewos + " EWOs, " + n.logs + " log entries and " + n.trips + " trips from this device to the cloud?\n\nWhere the cloud already has the same record, this device's version replaces it."
      )
    )
      return;
    b.disabled = true;
    b.textContent = "Uploading…";
    snapPut({ _at: (snapGet() || {})._at || "" }); // forget what was synced, so everything here is sent
    st.manifests.forEach(function (m) {
      if (m.by === curEmail()) delete m.syncedUpd;
    });
    await cloudSync(true);
    if (cloudErr && cloudErr !== "offline") {
      b.disabled = false;
      b.textContent = "Upload this device's data";
      toast("Upload didn't finish: " + cloudErr);
      return;
    }
    localStorage.setItem("wh-uploaded:" + sess.uid, String(Date.now()));
    renderCloudCard();
    toast(cloudErr === "offline" ? "Saved; it will upload when you're back online." : "This device's data is now in the cloud.");
  });

  /* ---------- File storage (delivery photos, inspection PDFs) ---------- */
  function sbPath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
  }
  async function sbList(bucket, prefix) {
    return (
      (await sbFetch("/storage/v1/object/list/" + bucket, {
        method: "POST",
        body: { prefix: prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } },
      })) || []
    ).filter(function (f) {
      return f.name !== ".emptyFolderPlaceholder";
    });
  }
  async function sbSign(bucket, paths) {
    var out = {},
      res = await sbFetch("/storage/v1/object/sign/" + bucket, { method: "POST", body: { expiresIn: 3600, paths: paths } });
    (res || []).forEach(function (s) {
      if (s.signedURL) out[s.path] = SB_URL + "/storage/v1" + s.signedURL;
    });
    return out;
  }
  function sbUpload(bucket, path, file) {
    return sbFetch("/storage/v1/object/" + bucket + "/" + sbPath(path), {
      method: "POST",
      headers: { "x-upsert": "true", "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
  }
  function sbDownload(bucket, path) {
    return sbFetch("/storage/v1/object/authenticated/" + bucket + "/" + sbPath(path), { blob: true });
  }
  // Uploads a list of {path, file}, showing progress; returns how many made it.
  async function sbUploadAll(bucket, jobs, what) {
    var ok = 0;
    for (var i = 0; i < jobs.length; i++) {
      toast("Uploading " + what + " " + (i + 1) + " of " + jobs.length + "…");
      try {
        await sbUpload(bucket, jobs[i].path, jobs[i].file);
        ok++;
      } catch (x) {
        toast("“" + jobs[i].file.name + "” didn't upload: " + x.message);
        await new Promise(function (r) {
          setTimeout(r, 1200);
        });
      }
    }
    toast(ok + " of " + jobs.length + " " + what + (jobs.length === 1 ? "" : "s") + " uploaded.");
    return ok;
  }
  // A hidden file picker; dir = pick a whole folder (with its subfolders).
  function pickFiles(accept, dir, cb) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.multiple = true;
    if (dir) inp.webkitdirectory = true;
    inp.onchange = function () {
      cb([].slice.call(inp.files));
    };
    inp.click();
  }

  /* =====================================================================
     Delivery tab: delivery trips (manifests)
     A trip moves through three modes:
       loading    – scan receipts onto the trip (same receipt again = one more box)
       delivering – receipts listed by department #; tap one, press Delivered to take it off
       submitted  – everything delivered and sent to Manage → View Delivery Manifests
     Deliveries are not taken out of current stock, so inventory never changes here.
     st.manifests: [{ id, no, trip, by, ts, upd, status, notes, curDept, curLoc,
                      lines:[{ id, rc, dept, loc, boxes, at, deliv, delivBy }],
                      loadedTs, subBy, subTs }]
     ===================================================================== */
  var dvView = "home",
    dvId = null,
    dvFlash = "",
    dvSel = null,
    dvAddNew = false, // delivering: the "Add new item to trip?" scan bar is open
    dvPic = 0, // which photo of the shown location (‹ › buttons)
    dvPicFor = null,
    dvScanned = false, // cloud Delivery Locations folders read once per visit
    camHold = "", // code being held in view; it counts after 0.75 s
    camHoldAt = 0,
    camHoldSeen = 0,
    camStream = null,
    camTimer = null,
    camLastCode = "",
    camLastAt = 0;
  var DV_OPTS = [
    { k: "new", t: "Create new manifest", s: "Start a new trip and scan each QR code as you load.", ic: '<path d="M12 5v14M5 12h14"/>' },
    { k: "edit", t: "Edit manifest", s: "Continue a trip that is loading or out for delivery.", ic: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>' },
    { k: "past", t: "View past manifests", s: "Look up or print trips that were submitted.", ic: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>' },
    { k: "submit", t: "Submit manifest", s: "Send a fully delivered trip to Manage.", ic: '<path d="M5 12l5 5L20 7"/>' },
    {
      k: "ms",
      t: "Create master sheet",
      s: "Scan QR codes onto one sheet you can view and print from your profile.",
      ic: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-3"/>',
    },
  ];
  var DV_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  function dvTripName(m) {
    return "Trip " + (DV_WORDS[m.trip] || m.trip);
  }
  function dvFind(id) {
    return st.manifests.find(function (m) {
      return m.id === id;
    });
  }
  // Only your own trips can be changed (the cloud's security rules enforce the same).
  function dvMine(m) {
    return !!sess && m.by === curEmail();
  }
  function dvOpenTrips() {
    return st.manifests.filter(function (m) {
      return m.status !== "submitted" && dvMine(m);
    });
  }
  function dvWhen(ts) {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function dvTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function dvBoxes(lines) {
    return lines.reduce(function (s, l) {
      return s + (+l.boxes || 0);
    }, 0);
  }
  function dvLeft(m) {
    return m.lines.filter(function (l) {
      return !l.deliv;
    });
  }
  function dvNewNo() {
    var d = new Date(),
      day = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2),
      n = st.manifests.filter(function (m) {
        return m.no.indexOf("M-" + day) === 0;
      }).length + 1;
    return "M-" + day + "-" + ("0" + n).slice(-2);
  }
  // Departments sorted as numbers where possible ("2" before "10"); blank last.
  function dvByDept(lines) {
    var g = {};
    lines.forEach(function (l) {
      var k = String(l.dept || "").trim();
      (g[k] = g[k] || []).push(l);
    });
    return Object.keys(g)
      .sort(function (a, b) {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      })
      .map(function (k) {
        return { dept: k, lines: g[k] };
      });
  }
  var DV_STATUS = { loading: "Loading", delivering: "Out for delivery", submitted: "Submitted" };
  function dvChip(m) {
    return '<span class="dvchip ' + m.status + '">' + DV_STATUS[m.status] + "</span>";
  }
  function dvPlacesHtml() {
    var places = [];
    dl.areas.forEach(function (a) {
      places.push(a.name);
      a.locs.forEach(function (l) {
        places.push(l.name);
      });
    });
    return (
      '<datalist id="dvPlaces">' +
      places
        .map(function (p) {
          return '<option value="' + esc(p) + '">';
        })
        .join("") +
      "</datalist>"
    );
  }
  function dvScanBar(ph, extra) {
    return (
      '<div class="dvscan"><label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8"/></svg><input id="dvScan" autocomplete="off" placeholder="' +
      ph +
      '" aria-label="' +
      ph +
      '"></label><button class="primary" data-dv="add">Enter</button><button data-dv="cam">Scan QR code</button>' +
      (extra || "") +
      "</div>" +
      (dvFlash ? '<p class="dvflash">' + dvFlash + "</p>" : "")
    );
  }
  function dvTripHead(m) {
    return (
      '<div class="dvhead"><h3 class="dvh">' +
      dvTripName(m) +
      "</h3>" +
      dvChip(m) +
      '<span class="dvmeta">' +
      esc(m.no) +
      " · " +
      esc(whoName(m.by)) +
      " · started " +
      dvWhen(m.ts) +
      (m.loadedTs ? " · loaded " + dvTime(m.loadedTs) : "") +
      (m.subTs ? " · submitted " + dvTime(m.subTs) : "") +
      "</span></div>"
    );
  }
  function dvList(list, empty) {
    if (!list.length)
      return '<div class="empty dvempty">' + empty + '<br><button class="primary" data-dv="new">Create new manifest</button></div>';
    return (
      '<div class="tw dvtw"><table class="sumtbl"><thead><tr><th>Trip</th><th>Status</th><th>Receipts</th><th>Last change</th><th></th></tr></thead><tbody>' +
      list
        .map(function (m) {
          var left = dvLeft(m).length,
            ready = m.status === "delivering" && !left,
            btn =
              m.status === "submitted"
                ? '<button data-dv-open="' + m.id + '">View</button>'
                : ready && dvView === "submit-list"
                  ? '<button class="primary" data-dv-sub="' + m.id + '">Submit</button>'
                  : '<button data-dv-open="' + m.id + '">Open</button>';
          return (
            '<tr><td class="cname">' +
            dvTripName(m) +
            "<small>" +
            esc(m.no) +
            " · " +
            esc(whoName(m.by)) +
            "</small></td><td>" +
            dvChip(m) +
            (m.status === "delivering" ? "<small>" + (m.lines.length - left) + " of " + m.lines.length + " delivered</small>" : "") +
            '</td><td class="ph">' +
            m.lines.length +
            " · " +
            dvBoxes(m.lines) +
            " boxes</td><td>" +
            dvWhen(m.subTs || m.upd) +
            '</td><td class="act">' +
            btn +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  // Redraws (e.g. a cloud sync every 30 s) keep what's half-typed in the scan box, and its focus.
  function renderDv() {
    var o = $("dvScan"),
      v = o ? o.value : "",
      f = !!o && document.activeElement === o;
    renderDvBody();
    var n = $("dvScan");
    if (n && v) {
      n.value = v;
      if (f) n.focus();
    }
  }
  function renderDvBody() {
    var box = $("dvBody");
    $("dvTitle").textContent = oname(4);
    $("dvN").textContent = sess ? dvOpenTrips().length : "–";
    if (!sess) {
      box.innerHTML =
        '<div class="empty dvempty">Sign in to create and run delivery trips.<br><button class="primary" data-dv="login">Go to Log in</button></div>';
      return;
    }
    var back = '<button class="dvback" data-dv="home">‹ All options</button>';
    if (dvView === "home") {
      box.innerHTML =
        cloudStatusHtml() +
        '<div class="dvopts">' +
        DV_OPTS.map(function (o) {
          return (
            '<button class="dvopt" data-dv="' +
            o.k +
            '"><span class="dvic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            o.ic +
            "</svg></span><b>" +
            o.t +
            "</b><small>" +
            o.s +
            "</small></button>"
          );
        }).join("") +
        "</div>";
      return;
    }
    if (dvView === "ms") {
      box.innerHTML = back + msHtml();
      var si = $("dvScan");
      if (si && !("ontouchstart" in window)) si.focus();
      if (!window.ZXing) loadZxing().then(renderDv, function () {});
      return;
    }
    if (dvView === "edit-list" || dvView === "submit-list" || dvView === "past") {
      var t =
          dvView === "past"
            ? ["Past manifests", "Every submitted trip, newest first."]
            : dvView === "submit-list"
              ? ["Submit a manifest", "Trips out for delivery. A trip can be submitted once every receipt is delivered."]
              : ["Edit a manifest", "Trips that are still loading or out for delivery."],
        list = st.manifests
          .filter(function (m) {
            if (dvView === "past") return m.status === "submitted";
            if (dvView === "submit-list") return m.status === "delivering" && dvMine(m);
            return m.status !== "submitted" && dvMine(m);
          })
          .reverse();
      box.innerHTML =
        back +
        '<h3 class="dvh">' +
        t[0] +
        '</h3><p class="dvp">' +
        t[1] +
        "</p>" +
        dvList(
          list,
          dvView === "past"
            ? "No trips have been submitted yet."
            : dvView === "submit-list"
              ? "No trips are out for delivery right now."
              : "There are no trips in progress."
        );
      return;
    }
    var m = dvFind(dvId);
    if (!m) {
      dvView = "home";
      return renderDv();
    }
    if (!dvScanned && cloudOn()) {
      dvScanned = true;
      Promise.all(dl.areas.map(function (a) {
        return dlfScan(a);
      })).then(function () {
        var ae = document.activeElement;
        if (!$("dvPanel").hidden && dvView === "trip" && !(ae && ae.tagName === "INPUT" && ae.value)) renderDv();
      });
    }
    var ro = !dvMine(m) || m.status === "submitted";
    if (m.status === "loading" && !ro) box.innerHTML = back + cloudStatusHtml() + dvLoadHtml(m);
    else if (m.status === "delivering" && !ro) box.innerHTML = back + cloudStatusHtml() + dvDeliverHtml(m);
    else box.innerHTML = back + cloudStatusHtml() + dvDoneHtml(m);
    var sc = $("dvScan");
    if (sc && !("ontouchstart" in window)) sc.focus();
  }

  /* ---------- Location photo (Load and Delivery modes) ----------
     Matches a receipt's location by name against Delivery Locations (saved spots and cloud folders). */
  function dvSpot(loc) {
    var k = dlfKey(loc || ""),
      all = [];
    if (!k) return null;
    dl.areas.forEach(function (a) {
      a.locs.concat(dlf.cache[a.id] || []).forEach(function (l) {
        all.push({ a: a, l: l, k: dlfKey(l.name) });
      });
    });
    return (
      all.find(function (x) {
        return x.k === k;
      }) ||
      all.find(function (x) {
        return x.k.length > 2 && (k.indexOf(x.k) >= 0 || x.k.indexOf(k) >= 0);
      }) ||
      all.find(function (x) {
        return dlfKey(x.a.name) === k && x.l.pics.length;
      }) ||
      null
    );
  }
  var DV_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="';
  function dvPhotoHtml(l) {
    if (!l) return "";
    if (l.id !== dvPicFor) {
      dvPicFor = l.id;
      dvPic = 0;
    }
    var sp = dvSpot(l.loc),
      pics = sp ? sp.l.pics : [],
      i = pics.length ? ((dvPic % pics.length) + pics.length) % pics.length : 0;
    return (
      '<section class="dvphoto" aria-label="Photo of the delivery location"><div class="dvpimg">' +
      (pics.length
        ? '<img src="' + esc(pics[i]) + '" alt="' + esc(sp.l.name) + (pics.length > 1 ? ", photo " + (i + 1) + " of " + pics.length : "") + '">'
        : "<p>" +
          (sp
            ? "No photos of " + esc(sp.l.name) + " yet. Add them in Delivery Locations."
            : l.loc
              ? "“" + esc(l.loc) + "” isn't in Delivery Locations yet."
              : "This receipt has no location.") +
          "</p>") +
      '</div><div class="dvpcap"><span><b>' +
      (esc(sp ? sp.l.name : l.loc) || "No location") +
      "</b><small>Receipt " +
      esc(l.rc) +
      (sp ? " · " + esc(sp.a.name) : "") +
      "</small></span>" +
      (pics.length > 1
        ? '<button data-dvpic="-1" aria-label="Previous photo">' + DV_CHEV + 'm15 18-6-6 6-6"/></svg></button><small>' +
          (i + 1) +
          " of " +
          pics.length +
          '</small><button data-dvpic="1" aria-label="Next photo">' + DV_CHEV + 'm9 18 6-6-6-6"/></svg></button>'
        : "") +
      "</div></section>"
    );
  }

  /* ---------- Load mode ---------- */
  function dvLoadHtml(m) {
    var cur =
      m.lines.find(function (l) {
        return l.id === dvSel;
      }) || m.lines[m.lines.length - 1];
    return (
      dvTripHead(m) +
      '<div class="dvfields"><label>Location (when a QR code has none)<input id="dvCurLoc" list="dvPlaces" maxlength="120" autocomplete="off" placeholder="Used only if the QR code has no location" value="' +
      esc(m.curLoc || "") +
      '"></label>' +
      dvPlacesHtml() +
      "</div>" +
      dvScanBar("Scan a QR code, or type a receipt number and press Enter") +
      (m.lines.length
        ? '<div class="dvsplit">' +
          dvPhotoHtml(cur) +
          '<div class="dvcards">' +
          m.lines
            .slice()
            .reverse()
            .map(function (l) {
              var on = l === cur;
              return (
                '<div class="dvcard dvlc' +
                (on ? " on" : "") +
                '" data-l="' +
                l.id +
                '"><span class="dvlab">Receipt #</span><button class="dvrc" data-dvpick="' +
                l.id +
                '" aria-pressed="' +
                on +
                '" aria-label="Show the location photo for receipt ' +
                esc(l.rc) +
                '">' +
                esc(l.rc) +
                DV_CHEV +
                'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="9" cy="10" r="2"/><path d="m21 15-4-4-8 8"/></svg></button><label class="dvlab dvll">Location<input data-f="loc" list="dvPlaces" maxlength="120" value="' +
                esc(l.loc) +
                '" placeholder="Location"></label><span class="dvbox qty"><button data-dvq="-1" aria-label="One less box">−</button><b>' +
                esc(l.boxes) +
                (+l.boxes === 1 ? " box" : " boxes") +
                '</b><button data-dvq="1" aria-label="One more box">+</button></span><button class="dvrm" data-dvrm aria-label="Remove receipt ' +
                esc(l.rc) +
                '">Remove</button></div>'
              );
            })
            .join("") +
          "</div></div>"
        : '<div class="empty dvempty">Nothing loaded yet. Scan the QR code on each receipt. The QR code fills in the receipt #, location and box count.</div>') +
      '<div class="dvfoot"><span class="dvtot">' +
      m.lines.length +
      (m.lines.length === 1 ? " receipt" : " receipts") +
      " · " +
      dvBoxes(m.lines) +
      ' boxes</span><span class="sp"></span><span class="dvsaved">Saved automatically</span><button class="danger" data-dv="del">Delete trip</button><button class="primary dvbig" data-dv="loaded">Done Loading</button></div>'
    );
  }

  /* ---------- Delivery mode ---------- */
  function dvDeliverHtml(m) {
    var left = dvLeft(m),
      done = m.lines.filter(function (l) {
        return l.deliv;
      }),
      pct = m.lines.length ? Math.round((done.length / m.lines.length) * 100) : 0,
      sel =
        dvSel &&
        left.find(function (l) {
          return l.id === dvSel;
        });
    if (!sel) dvSel = null;
    return (
      dvTripHead(m) +
      '<div class="dvprog"><span><b>' +
      done.length +
      " of " +
      m.lines.length +
      "</b> receipts delivered · " +
      dvBoxes(left) +
      ' boxes left</span><div class="pbar"><i style="width:' +
      pct +
      '%"></i></div></div>' +
      '<div class="dvsplit">' +
      dvPhotoHtml(sel || left[0]) +
      '<div class="dvmain">' +
      (dvAddNew
        ? dvScanBar("Scan or type the receipt # of the package to add", '<button data-dv="addnew-off">Cancel</button>')
        : '<p class="dvp"><button class="primary" data-dv="addnew">Add new item to trip?</button></p>' +
          (dvFlash ? '<p class="dvflash">' + dvFlash + "</p>" : "")) +
      (left.length
        ? dvByDept(left)
            .map(function (g) {
              return (
                '<section class="dvgrp"><h4><span>' +
                (g.dept ? "Dept " + esc(g.dept) : left.some(function (l) { return String(l.dept || "").trim(); }) ? "No department" : "Receipts") +
                "</span><small>" +
                g.lines.length +
                (g.lines.length === 1 ? " receipt · " : " receipts · ") +
                dvBoxes(g.lines) +
                ' boxes</small></h4><div class="dvcards">' +
                g.lines
                  .map(function (l) {
                    return (
                      '<button class="dvcard' +
                      (l.id === dvSel ? " on" : "") +
                      '" data-dvpick="' +
                      l.id +
                      '" aria-pressed="' +
                      (l.id === dvSel) +
                      '"><span class="dvlab">Receipt #</span><span class="dvrc">' +
                      esc(l.rc) +
                      '</span><span class="dvlab dvl2">Location</span><span class="dvloc">' +
                      (esc(l.loc) || "No location") +
                      '</span><span class="dvbox">' +
                      l.boxes +
                      (+l.boxes === 1 ? " box" : " boxes") +
                      "</span></button>"
                    );
                  })
                  .join("") +
                "</div></section>"
              );
            })
            .join("")
        : '<div class="dvalldone"><b>Everything is delivered.</b><span>Select Submit to send this trip to Manage.</span></div>') +
      (done.length
        ? '<details class="dvdone"><summary>Delivered (' +
          done.length +
          ")</summary>" +
          done
            .slice()
            .sort(function (a, b) {
              return b.deliv - a.deliv;
            })
            .map(function (l) {
              return (
                '<div class="dvdrow"><span><b>' +
                esc(l.rc) +
                "</b> · Dept " +
                (esc(l.dept) || "–") +
                " · " +
                (esc(l.loc) || "–") +
                " · " +
                l.boxes +
                (+l.boxes === 1 ? " box" : " boxes") +
                "</span><small>" +
                dvTime(l.deliv) +
                '</small><button data-dvundo="' +
                l.id +
                '">Undo</button></div>'
              );
            })
            .join("") +
          "</details>"
        : "") +
      "</div></div>" +
      '<div class="dvfoot dvsticky">' +
      (left.length
        ? sel
          ? '<span class="dvseltxt"><b>' +
            esc(sel.rc) +
            "</b> · " +
            (esc(sel.loc) || "No location") +
            " · " +
            sel.boxes +
            (+sel.boxes === 1 ? " box" : " boxes") +
            '</span><span class="sp"></span><button class="primary dvbig" data-dv="delivered">Delivered</button>'
          : '<span class="dvseltxt">Tap a receipt, then select Delivered.</span><span class="sp"></span><button class="primary dvbig" disabled>Delivered</button>'
        : '<span class="dvseltxt">All ' + m.lines.length + ' receipts delivered.</span><span class="sp"></span><button class="primary dvbig" data-dv="submit-this">Submit</button>') +
      "</div>"
    );
  }

  /* ---------- Submitted (read-only) ---------- */
  function dvDoneHtml(m) {
    return (
      dvTripHead(m) +
      (m.notes ? '<p class="dvp">' + esc(m.notes) + "</p>" : "") +
      dvTripTable(m) +
      '<div class="dvfoot"><span class="dvtot">' +
      m.lines.length +
      " receipts · " +
      dvBoxes(m.lines) +
      ' boxes</span><span class="sp"></span><button data-dv="print">Print</button></div>'
    );
  }
  // Receipts grouped by department #, with delivery times (also used in Manage).
  function dvTripTable(m) {
    return (
      '<div class="tw dvtw"><table class="sumtbl"><thead><tr><th>Dept #</th><th>Receipt #</th><th>Location</th><th>Boxes</th><th>Delivered</th></tr></thead><tbody>' +
      dvByDept(m.lines)
        .map(function (g) {
          return g.lines
            .map(function (l, i) {
              return (
                "<tr><td>" +
                (i ? "" : "<b>" + (esc(g.dept) || "–") + "</b>") +
                '</td><td class="num">' +
                esc(l.rc) +
                "</td><td>" +
                (esc(l.loc) || "–") +
                '</td><td class="ph">' +
                l.boxes +
                "</td><td>" +
                (l.deliv ? dvTime(l.deliv) + "<small>" + esc(whoName(l.delivBy)) + "</small>" : "–") +
                "</td></tr>"
              );
            })
            .join("");
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function dvSave(m) {
    m.upd = Date.now();
    save();
    cloudSoon();
  }
  function dvBeep() {
    try {
      // Browsers only allow a buzz after the person has tapped the page.
      if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(60);
      var ac = new (window.AudioContext || window.webkitAudioContext)(),
        o = ac.createOscillator(),
        g = ac.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.09);
      o.onended = function () {
        ac.close();
      };
    } catch (x) {}
  }
  /* Reads the text inside a delivery QR code: receipt #, location, box count (and dept # if present).
     Accepts JSON {"receipt":..,"location":..,"boxes":..}, labeled text ("Receipt: X\nLocation: Y\nBoxes: 3",
     "Receipt=X;Location=Y;Box count=3"), values in order ("X|Y|3", "X,Y,3", one per line),
     or just a receipt number. */
  var DV_KEYS = {
    rc: ["receipt", "receiptno", "receiptnum", "receiptnumber", "rc", "rec", "receiptid"],
    loc: ["location", "loc", "deliverto", "destination", "dest", "to", "dropoff"],
    boxes: ["boxes", "box", "boxcount", "boxcnt", "count", "qty", "quantity", "pieces", "pcs", "cartons"],
    dept: ["dept", "department", "deptno", "deptnum", "departmentno", "departmentnumber"],
  };
  function dvField(k) {
    k = String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
    for (var f in DV_KEYS) if (DV_KEYS[f].indexOf(k) >= 0) return f;
    return null;
  }
  function dvParse(raw) {
    var s = String(raw || "").trim(),
      r = { rc: "", loc: "", boxes: 0, dept: "" },
      set = function (f, v) {
        v = String(v == null ? "" : v).trim();
        if (!f || !v) return;
        if (f === "boxes") r.boxes = parseInt(v.replace(/[^\d]/g, ""), 10) || 0;
        else r[f] = v;
      };
    if (/^[\[{]/.test(s)) {
      try {
        var o = JSON.parse(s);
        if (Array.isArray(o)) o = { receipt: o[0], location: o[1], boxes: o[2] };
        Object.keys(o).forEach(function (k) {
          set(dvField(k), o[k]);
        });
        return r;
      } catch (x) {}
    }
    var parts = s.split(/\s*(?:\r?\n|\||\t|;|&)\s*/).filter(Boolean),
      labeled = parts.filter(function (p) {
        return /^[^:=]{1,24}[:=]/.test(p) && dvField(p.split(/[:=]/)[0]);
      });
    if (labeled.length) {
      labeled.forEach(function (p) {
        var i = p.search(/[:=]/);
        set(dvField(p.slice(0, i)), p.slice(i + 1));
      });
      // e.g. "R-1001\nLocation: Dock A\nBoxes: 3": the unlabeled first value is the receipt #
      if (!r.rc && labeled.indexOf(parts[0]) < 0) r.rc = parts[0];
      return r;
    }
    if (parts.length === 1 && s.indexOf(",") > 0) parts = s.split(/\s*,\s*/);
    if (parts.length >= 2) {
      set("rc", parts[0]);
      set("loc", parts[1]);
      set("boxes", parts[2]);
    } else r.rc = s;
    return r;
  }
  // A scanned/typed code: while loading it's added (QR box count, or again = one more box);
  // while delivering it adds a package that was missed at loading ("Add new item to trip?").
  function dvAddCode(raw) {
    var si = $("dvScan");
    if (si) si.value = ""; // entered, so the next redraw starts the box empty
    if (dvView === "ms") return msAdd(raw);
    var m = dvFind(dvId),
      p = dvParse(raw),
      code = p.rc;
    if (!m || !dvMine(m) || !String(raw || "").trim()) return;
    if (!code) {
      dvFlash = "That code has no receipt number in it.";
      renderDv();
      return;
    }
    var same = function (l) {
      return l.rc.toLowerCase() === code.toLowerCase();
    };
    if (m.status === "delivering") {
      if (m.lines.find(same)) {
        dvFlash = "<b>" + esc(code) + "</b> is already on this trip.";
        renderDv();
        return code;
      }
      dvAddNew = false;
      audit("Delivery", dvTripName(m) + " (" + m.no + "): added " + code + " after loading");
    } else if (m.status !== "loading") return;
    var line = m.lines.find(same);
    if (line && p.boxes) {
      // A QR code carries the full box count, so scanning it again doesn't add boxes.
      line.boxes = p.boxes;
      if (p.loc) line.loc = p.loc;
      if (p.dept) line.dept = p.dept;
      dvFlash = "<b>" + esc(code) + "</b> is already loaded (" + line.boxes + (line.boxes === 1 ? " box" : " boxes") + ").";
    } else if (line) {
      line.boxes = (+line.boxes || 0) + 1;
      dvFlash = "Added another box to <b>" + esc(code) + "</b> (now " + line.boxes + ").";
    } else {
      line = {
        id: nid("r"),
        rc: code,
        dept: p.dept || m.curDept || "",
        loc: p.loc || m.curLoc || "",
        boxes: p.boxes || 1,
        at: Date.now(),
        deliv: 0,
      };
      m.lines.push(line);
      dvFlash =
        (m.status === "delivering" ? "Added <b>" : "Loaded <b>") +
        esc(code) +
        "</b>" +
        (line.dept ? " · Dept " + esc(line.dept) : "") +
        (line.loc ? " · " + esc(line.loc) : "") +
        " · " +
        line.boxes +
        (line.boxes === 1 ? " box" : " boxes") +
        ".";
    }
    dvBeep();
    dvSave(m);
    renderDv();
    return code;
  }
  function dvDoneLoading(m) {
    if (!m.lines.length) {
      toast("Scan at least one receipt before you finish loading.");
      return;
    }
    var miss = m.lines.filter(function (l) {
      return !String(l.loc || "").trim();
    }).length;
    if (miss && !confirm(miss + " receipt(s) have no location. Start delivering anyway?")) return;
    m.status = "delivering";
    m.loadedTs = Date.now();
    audit("Delivery", dvTripName(m) + " (" + m.no + ") loaded: " + m.lines.length + " receipts, " + dvBoxes(m.lines) + " boxes");
    dvSave(m);
    dvSel = null;
    dvFlash = "";
    toast(dvTripName(m) + " is out for delivery.");
    renderDv();
  }
  function dvSubmit(m) {
    if (!m || !dvMine(m) || m.status !== "delivering") return;
    if (dvLeft(m).length) {
      toast("Mark every receipt delivered before submitting.");
      return;
    }
    if (!confirm("Submit " + dvTripName(m) + " (" + m.lines.length + " receipts, " + dvBoxes(m.lines) + " boxes)? It will be sent to Manage → View Delivery Manifests and locked.")) return;
    m.status = "submitted";
    m.subBy = curEmail();
    m.subTs = Date.now();
    audit("Delivery", "Submitted " + dvTripName(m) + " (" + m.no + "): " + m.lines.length + " receipts delivered");
    dvSave(m);
    dvId = m.id;
    dvView = "trip";
    dvFlash = "";
    toast(dvTripName(m) + " submitted to Manage.");
    renderDv();
  }
  /* GCW.DELIVER (Manage → Templates) grid, in points on the upright page. The scan is tilted
     about 0.21°, so text is drawn on a grid turned by `th` radians to sit inside the boxes. */
  var DV_TPL = { th: 0.0037, cols: [55.2, 117.5, 194.8, 257.2, 511.4, 644.4, 723.8], top: 115.6, rowH: 22.665, rows: 20 };
  // Print: fill GCW.DELIVER (20 receipts a page) in a new tab; without the template, print the plain list.
  // Print: fill GCW.DELIVER (20 receipts a page) and show it as a PDF to view, print or download;
  // without the template, print the plain list.
  async function dvPrint(m) {
    toast("Filling in GCW.DELIVER…");
    var t;
    try {
      t = await tplRender(/^gcw\.?\s*deliver(y)?$/i, "GCW.DELIVER", 270);
    } catch (x) {
      return toast(x.message || "GCW.DELIVER could not be filled in.");
    }
    if (!t) {
      var w = window.open("", "_blank");
      if (!w) return toast("Allow pop-ups to print the manifest.");
      toast("GCW.DELIVER isn't uploaded under Manage → Templates, so the plain manifest was printed.");
      return dvPrintPlain(m, w);
    }
    var T = DV_TPL,
      lines = [].concat.apply(
        [],
        dvByDept(m.lines).map(function (g) {
          return g.lines;
        })
      ),
      pages = [];
    for (var p = 0; p === 0 || p < lines.length; p += T.rows) {
      var cv = document.createElement("canvas");
      cv.width = t.cv.width;
      cv.height = t.cv.height;
      var cx = cv.getContext("2d");
      cx.drawImage(t.cv, 0, 0);
      cx.scale(t.S, t.S);
      cx.rotate(T.th);
      cx.fillStyle = "#1d3fbf";
      cx.textBaseline = "alphabetic";
      // Text at x (left, or centred when mid), shrunk to fit maxW; too long even at 8 px → two lines.
      // y is the baseline for 10 px text; bigger text sits a little lower so it stays centred in the row.
      var fit = function (s, maxW, size, min) {
          for (var z = size; z > min; z -= 0.5) {
            cx.font = "bold " + z + "px Helvetica, Arial, sans-serif";
            if (cx.measureText(s).width <= maxW) return z;
          }
          return 0;
        },
        put = function (s, x, y, maxW, size, mid) {
          s = String(s || "");
          if (!s) return;
          cx.textAlign = mid ? "center" : "left";
          var sp = s.lastIndexOf(" ", Math.ceil(s.length / 2) + 4),
            z = fit(s, maxW, size, 8);
          if (z || sp < 1) return cx.fillText(s, x, y + ((z || 8) - 10) * 0.36);
          var a = s.slice(0, sp),
            b = s.slice(sp + 1);
          fit(a.length > b.length ? a : b, maxW, 9.5, 5.5);
          cx.fillText(a, x, y - 6);
          cx.fillText(b, x, y + 4);
        };
      put(new Date(m.loadedTs || m.ts).toLocaleDateString(), 606, 56, 116, 12);
      put(whoName(m.by), 599, 86, 122, 12);
      lines.slice(p, p + T.rows).forEach(function (l, i) {
        var y = T.top + (i + 0.5) * T.rowH + 4,
          c = T.cols;
        put(l.loc, c[1] + 4, y, c[2] - c[1] - 8, 13);
        put(l.boxes, (c[2] + c[3]) / 2, y, c[3] - c[2] - 8, 10, true);
        put(l.rc + (l.dept ? "    Dept " + l.dept : ""), c[3] + 4, y, c[4] - c[3] - 8, 14);
      });
      var jb = await new Promise(function (res) {
        cv.toBlob(res, "image/jpeg", 0.9);
      });
      pages.push({ w: cv.width, h: cv.height, pw: t.pw, ph: t.ph, jpg: new Uint8Array(await jb.arrayBuffer()) });
    }
    tpShow(imgPdfBytes(pages), "GCW.DELIVER-" + m.no);
  }
  function dvPrintPlain(m, w) {
    w.document.open();
    w.document.write(
      "<!doctype html><meta charset='utf-8'><title>" +
        esc(m.no) +
        "</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:32px;color:#111}h1{margin:0 0 4px}p{margin:2px 0;color:#444}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ccc;padding:8px;text-align:left}th{background:#f2f2f2}small{display:block;color:#666}</style><h1>" +
        dvTripName(m) +
        " · " +
        esc(m.no) +
        "</h1><p>Driver: " +
        esc(whoName(m.by)) +
        "</p><p>Started " +
        dvWhen(m.ts) +
        (m.loadedTs ? " · loaded " + dvTime(m.loadedTs) : "") +
        (m.subTs ? " · submitted " + dvTime(m.subTs) : "") +
        "</p>" +
        dvTripTable(m).replace(/<div[^>]*>|<\/div>/g, "") +
        "<p style='margin-top:14px'><b>" +
        m.lines.length +
        " receipts · " +
        dvBoxes(m.lines) +
        " boxes</b></p><script>print()<\/script>"
    );
    w.document.close();
  }

  /* ---------- Master sheet: scanned QR codes redrawn on one printable sheet ----------
     The draft lives in st.msDraft (this device); Finish and submit saves it to the activity log
     (st.audit entry with .ms), which syncs, and it shows under Profile → Master sheets. */
  function msQr(t) {
    if (!window.ZXing) return '<div class="msload">Drawing QR code…</div>';
    try {
      var m = ZXing.QRCodeEncoder.encode(t, ZXing.QRCodeDecoderErrorCorrectionLevel.M).getMatrix(),
        n = m.getWidth(),
        d = "";
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m.get(x, y) === 1) d += "M" + (x + 4) + " " + (y + 4) + "h1v1h-1z";
      return (
        '<svg viewBox="0 0 ' + (n + 8) + " " + (n + 8) + '" shape-rendering="crispEdges" role="img" aria-label="QR code for ' + esc(t) +
        '"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>'
      );
    } catch (x) {
      return '<div class="msload">This code is too long for a QR code.</div>';
    }
  }
  // One QR code with its receipt #, location and box count underneath.
  function msCard(raw, i) {
    var p = dvParse(raw),
      sub = [p.loc, p.boxes ? p.boxes + (p.boxes === 1 ? " box" : " boxes") : ""].filter(Boolean).join(", ");
    return (
      '<figure class="msqr">' + msQr(raw) + "<figcaption><b>" + esc(p.rc || raw) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</figcaption>" +
      (i == null ? "" : '<button type="button" data-msrm="' + i + '" aria-label="Remove ' + esc(p.rc || raw) + '">Remove</button>') +
      "</figure>"
    );
  }
  function msHtml() {
    var d = st.msDraft || [];
    return (
      '<h3 class="dvh">Create master sheet</h3><p class="dvp">Scan each QR code to add it to the sheet. Select Finish and submit when you\'re done.</p>' +
      dvScanBar("Scan a QR code, or type one and press Enter") +
      (d.length
        ? '<div class="mssheet">' + d.map(msCard).join("") + "</div>"
        : '<div class="empty dvempty">The sheet is empty. Scan the first QR code to add it.</div>') +
      '<div class="msfoot"><span>' + d.length + (d.length === 1 ? " QR code" : " QR codes") +
      '</span><button type="button" class="primary" data-dv="msdone">Finish and submit</button></div>'
    );
  }
  function msAdd(raw) {
    var s = String(raw || "").trim(),
      d = st.msDraft || (st.msDraft = []);
    if (!s) return;
    var nm = esc(dvParse(s).rc || s);
    if (d.indexOf(s) >= 0) dvFlash = "<b>" + nm + "</b> is already on the sheet.";
    else {
      d.push(s);
      dvFlash = "Added <b>" + nm + "</b>.";
      dvBeep();
      save();
    }
    renderDv();
    return s;
  }
  function msDone() {
    var d = st.msDraft || [];
    if (!d.length) return toast("Scan at least one QR code first.");
    audit("Delivery", "Master sheet: " + d.length + (d.length === 1 ? " QR code" : " QR codes"));
    st.audit[st.audit.length - 1].ms = { codes: d.slice() };
    st.msDraft = [];
    dvView = "home";
    dvFlash = "";
    save();
    renderDv();
    toast("Master sheet saved. Find it under Profile → Master sheets.");
  }
  // View or print a saved master sheet in a new tab.
  async function msOpen(key, print) {
    var e = (st.audit || []).find(function (x) {
      return x.k === key && x.ms;
    });
    if (!e) return toast("That master sheet could not be found.");
    var w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to view the master sheet.");
    try {
      await loadZxing();
    } catch (x) {
      w.close();
      return toast("The QR code maker could not load. Check your signal and try again.");
    }
    var c = e.ms.codes;
    w.document.write(
      "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Master sheet " + dayOf(e.ts) +
        "</title><style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#111;background:#fff}h1{margin:0 0 4px;font-size:22px}p{margin:0;color:#444}" +
        ".bar{margin:16px 0}.bar button{min-height:44px;padding:0 20px;font:inherit;font-weight:700;border:2px solid #111;background:#111;color:#fff;cursor:pointer}" +
        ".mssheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-top:16px}.msqr{margin:0;padding:8px;text-align:center;border:1px solid #ccc;break-inside:avoid}" +
        ".msqr svg{display:block;width:100%;max-width:160px;margin:0 auto}.msqr b{display:block;font-size:15px}.msqr small{display:block;color:#555}" +
        "@media print{body{margin:0}.bar{display:none}.mssheet{grid-template-columns:repeat(4,1fr)}}</style><h1>Master sheet</h1><p>" +
        esc(whoName(e.by)) + ", " + dvWhen(e.ts) + ", " + c.length + (c.length === 1 ? " QR code" : " QR codes") +
        "</p><div class='bar'><button onclick='print()'>Print</button></div><div class='mssheet'>" +
        c.map(function (r) {
          return msCard(r);
        }).join("") +
        "</div>" + (print ? "<script>print()<\/script>" : "")
    );
    w.document.close();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-msview]");
    if (b) msOpen(b.dataset.msview, !!b.dataset.msprint);
  });

  $("dvBody").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var act = b.dataset.dv,
      m = dvFind(dvId);
    if (act === "login") {
      st.top = null;
      st.side = 0;
      render();
      return;
    }
    if (act === "cloud") {
      openProfile();
      return;
    }
    if (act === "home") {
      dvView = "home";
      dvFlash = "";
      dvSel = null;
      dvAddNew = false;
    } else if (act === "new") {
      var today = dayOf(Date.now()),
        mineToday = st.manifests.filter(function (x) {
          return x.by === curEmail() && dayOf(x.ts) === today;
        }).length,
        nm = {
          id: nid("m"),
          no: dvNewNo(),
          trip: mineToday + 1,
          by: curEmail(),
          ts: Date.now(),
          upd: Date.now(),
          status: "loading",
          notes: "",
          curDept: "",
          curLoc: "",
          lines: [],
        };
      st.manifests.push(nm);
      audit("Delivery", "Started " + dvTripName(nm) + " (" + nm.no + ")");
      save();
      dvId = nm.id;
      dvView = "trip";
      dvFlash = "";
      dvSel = null;
    } else if (act === "ms") {
      dvView = "ms";
      dvFlash = "";
    } else if (act === "msdone") {
      msDone();
      return;
    } else if (b.dataset.msrm && st.msDraft) {
      st.msDraft.splice(+b.dataset.msrm, 1);
      dvFlash = "";
      save();
    } else if (act === "edit") dvView = "edit-list";
    else if (act === "submit") dvView = "submit-list";
    else if (act === "past") dvView = "past";
    else if (b.dataset.dvOpen) {
      dvId = b.dataset.dvOpen;
      dvView = "trip";
      dvFlash = "";
      dvSel = null;
      dvAddNew = false;
    } else if (b.dataset.dvSub) {
      dvSubmit(dvFind(b.dataset.dvSub));
      return;
    } else if (act === "add") {
      var inp = $("dvScan");
      dvAddCode(inp && inp.value);
      return;
    } else if (act === "cam") {
      camOpen();
      return;
    } else if (act === "addnew" || act === "addnew-off") {
      dvAddNew = act === "addnew";
      dvFlash = "";
    } else if (act === "loaded" && m) {
      dvDoneLoading(m);
      return;
    } else if (act === "submit-this" && m) {
      dvSubmit(m);
      return;
    } else if (act === "print" && m) {
      dvPrint(m);
      return;
    } else if (b.dataset.dvpic) {
      dvPic += +b.dataset.dvpic;
    } else if (b.dataset.dvpick && m) {
      dvSel = dvSel === b.dataset.dvpick ? null : b.dataset.dvpick;
      dvFlash = "";
    } else if (act === "delivered" && m && dvMine(m)) {
      var l = m.lines.find(function (x) {
        return x.id === dvSel;
      });
      if (!l) return;
      var card = document.querySelector('.dvcard[data-dvpick="' + l.id + '"]');
      l.deliv = Date.now();
      l.delivBy = curEmail();
      dvSel = null;
      dvFlash = "";
      dvSave(m);
      // Let the card slide away before the list redraws.
      if (card) {
        card.classList.add("gone");
        setTimeout(renderDv, 260);
        return;
      }
    } else if (b.dataset.dvundo && m && dvMine(m) && m.status === "delivering") {
      var u = m.lines.find(function (x) {
        return x.id === b.dataset.dvundo;
      });
      if (u) u.deliv = 0;
      dvSave(m);
    } else if (act === "del" && m && dvMine(m) && m.status === "loading") {
      if (!confirm("Delete " + dvTripName(m) + " (" + m.no + ")? This cannot be undone.")) return;
      st.manifests = st.manifests.filter(function (x) {
        return x !== m;
      });
      audit("Delivery", "Deleted " + dvTripName(m) + " (" + m.no + ") while loading");
      save();
      // Always ask the cloud to delete it: its upload may still be on the way.
      cloudForget(m.id);
      dvView = "home";
      toast("Trip deleted.");
    } else if ((b.dataset.dvq || b.hasAttribute("data-dvrm")) && m && dvMine(m) && m.status === "loading") {
      var tr = b.closest("[data-l]"),
        idx = m.lines.findIndex(function (x) {
          return x.id === tr.dataset.l;
        });
      if (idx < 0) return;
      if (b.hasAttribute("data-dvrm")) m.lines.splice(idx, 1);
      else m.lines[idx].boxes = Math.max(1, (+m.lines[idx].boxes || 1) + +b.dataset.dvq);
      dvFlash = "";
      dvSave(m);
    } else return;
    renderDv();
  });
  $("dvBody").addEventListener("keydown", function (e) {
    if (e.target.id === "dvScan" && e.key === "Enter") {
      e.preventDefault();
      dvAddCode(e.target.value);
    }
  });
  // Typing in a field saves quietly without redrawing (so the cursor stays put).
  $("dvBody").addEventListener("input", function (e) {
    var m = dvFind(dvId),
      t = e.target;
    if (!m || !dvMine(m) || m.status !== "loading") return;
    if (t.id === "dvCurLoc") m.curLoc = t.value;
    else if (t.dataset.f) {
      var line = m.lines.find(function (x) {
        return x.id === t.closest("[data-l]").dataset.l;
      });
      if (!line) return;
      line[t.dataset.f] = t.value;
    } else return;
    dvSave(m);
  });

  /* ---------- Camera scanning: works in any browser ----------
     Uses the browser's built-in barcode reader when it has one (fast; Chrome on Android/Mac),
     otherwise the bundled ZXing reader (iPhone/iPad Safari, Windows, Firefox, ...).
     ZXING_Z (js/vendor/zxing-embedded.js) is only unpacked the first time the camera opens.
     The camera itself needs a secure page (https, or localhost while developing). */
  var zxingP = null,
    camBusy = false,
    camCanvas = null;
  function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (zxingP) return zxingP;
    zxingP = needVendor("zxing-embedded.js", "ZXING_Z", "barcode reader")
      .then(function () {
        return gunzipB64(ZXING_Z);
      })
      .then(function (buf) {
        return new Promise(function (res, rej) {
          var s = document.createElement("script");
          s.src = URL.createObjectURL(new Blob([buf], { type: "text/javascript" }));
          s.onload = function () {
            URL.revokeObjectURL(s.src);
            window.ZXing ? res(window.ZXing) : rej(new Error("ZXing did not load"));
          };
          s.onerror = rej;
          document.head.appendChild(s);
        });
      })
      .catch(function (e) {
        zxingP = null;
        throw e;
      });
    return zxingP;
  }
  // Returns an object with detect(source) -> Promise<string|null> for a video or canvas.
  // any: also read 1D barcodes (Greens counts); otherwise QR only (delivery labels).
  var CAM_1D = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf"];
  async function camReader(any) {
    if ("BarcodeDetector" in window) {
      try {
        var fm = await BarcodeDetector.getSupportedFormats();
        if (fm && fm.indexOf("qr_code") >= 0) {
          var det = new BarcodeDetector({
            formats: ["qr_code"].concat(
              any
                ? CAM_1D.filter(function (f) {
                    return fm.indexOf(f) >= 0;
                  })
                : []
            ),
          });
          return {
            kind: "built-in",
            detect: function (src) {
              return det.detect(src).then(function (r) {
                return r.length ? r[0].rawValue : null;
              });
            },
          };
        }
      } catch (x) {}
    }
    var Z = await loadZxing(),
      F = Z.BarcodeFormat,
      hints = new Map(),
      reader = new Z.MultiFormatReader();
    // Delivery labels are QR codes (receipt #, location, box count); reading only QR is faster and avoids misreads.
    hints.set(
      Z.DecodeHintType.POSSIBLE_FORMATS,
      any ? [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF] : [F.QR_CODE]
    );
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);
    camCanvas = camCanvas || document.createElement("canvas");
    return {
      kind: "zxing",
      detect: function (src) {
        // Read the middle square of the picture (where the green frame is), at a size ZXing handles quickly.
        var w = src.videoWidth || src.width,
          h = src.videoHeight || src.height;
        if (!w || !h) return Promise.resolve(null);
        var cw = Math.round(Math.min(w, h) * 0.9),
          ch = cw,
          sc = Math.min(1, 800 / cw);
        camCanvas.width = Math.round(cw * sc);
        camCanvas.height = Math.round(ch * sc);
        var cx = camCanvas.getContext("2d", { willReadFrequently: true });
        cx.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, camCanvas.width, camCanvas.height);
        try {
          var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(camCanvas)));
          return Promise.resolve(reader.decodeWithState(bmp).getText());
        } catch (x) {
          return Promise.resolve(null); // no barcode in this frame
        } finally {
          reader.reset();
        }
      },
    };
  }
  // add(code) handles each accepted scan and returns the message to show; any: read 1D barcodes too.
  var camHint = "";
  async function camOpen(add, any) {
    add =
      add ||
      function (c) {
        dvAddCode(c);
        return dvFlash;
      };
    camHint = any ? "Point the camera at a barcode." : "Point the camera at a QR code.";
    $("camDlg").querySelector("h2").textContent = any ? "Scan barcode" : "Scan QR code";
    $("camDlg").classList.toggle("wide", !!any); // barcodes: wide rectangle; QR codes: square box
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast(
        window.isSecureContext === false
          ? "The camera only works when the site is opened from its https:// address. Use a handheld scanner or type the number here."
          : "This browser can't use the camera. Use a handheld scanner or type the number."
      );
      return;
    }
    var rd;
    $("camLast").textContent = "Starting the camera…";
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (x) {
      toast(
        x && x.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera for this site in the browser's settings, then try again."
          : x && x.name === "NotFoundError"
            ? "No camera was found on this device."
            : "The camera could not be opened."
      );
      return;
    }
    var v = $("camVideo");
    v.srcObject = camStream;
    $("camDlg").showModal();
    await v.play().catch(function () {});
    try {
      rd = await camReader(any);
    } catch (x) {
      camStop();
      $("camDlg").close();
      toast("The barcode reader could not start. Use a handheld scanner or type the number.");
      return;
    }
    $("camLast").textContent = camHint;
    camTimer = setInterval(async function () {
      if (camBusy || v.readyState < 2) return;
      camBusy = true;
      try {
        var code = await rd.detect(v),
          now = Date.now();
        // A code counts only after it stays in view for 0.75 s (yellow dot shows the hold);
        // a short miss (< 0.4 s) between frames doesn't restart it.
        if (camHold && (!code || code !== camHold) && now - camHoldSeen > 400) {
          camHold = "";
          $("camDlg").classList.remove("hold");
          $("camLast").textContent = camHint;
        }
        if (code) {
          // The same label still in view counts once; it counts again only after it has
          // been out of view for a moment (e.g. the next box with the same receipt #).
          if (code === camLastCode && now - camLastAt < 1500) camLastAt = now;
          else if (code !== camHold) {
            camHold = code;
            camHoldAt = camHoldSeen = now;
            $("camDlg").classList.add("hold");
            $("camLast").textContent = "Hold still…";
          } else if ((camHoldSeen = now) - camHoldAt >= 750) {
            camHold = "";
            $("camDlg").classList.remove("hold");
            camLastCode = code;
            camLastAt = now;
            $("camLast").innerHTML = add(code) || "Scanned <b>" + esc(code) + "</b>.";
            var dg = $("camDlg");
            dg.classList.remove("hit");
            void dg.offsetWidth;
            dg.classList.add("hit");
          }
        }
      } catch (x) {}
      camBusy = false;
    }, 200);
  }
  function camStop() {
    clearInterval(camTimer);
    camTimer = null;
    camBusy = false;
    camHold = "";
    $("camDlg").classList.remove("hold");
    if (camStream)
      camStream.getTracks().forEach(function (t) {
        t.stop();
      });
    camStream = null;
    $("camVideo").srcObject = null;
  }
  $("camClose").onclick = function () {
    $("camDlg").close();
  };
  $("camDlg").addEventListener("close", camStop);

  loadDl();
  load();
  rebuild();
  // A session from before the cloud login has no cloud sign-in: ask to sign in again.
  if (sess && !cloudOn()) setSess(null);
  render();
  if (!sess && cloudOn()) {
    // Cloud sign-in kept from the earlier "Cloud sync" box: use it as the app login.
    sbRest("profiles?select=*&id=eq." + authGet().uid)
      .then(function (rows) {
        var me = rows && rows[0];
        if (!me) return authKeep(null);
        setSess({ uid: me.id, email: me.email, name: me.name || me.email, role: me.role, perms: me.perms });
        render();
        cloudSync(true);
      })
      .catch(function () {});
  } else cloudSync(true);
})();
