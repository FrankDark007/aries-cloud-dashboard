export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Aries — Operations Board</title>
  <style>
    :root {
      --ink: #17191f;
      --muted: #69707d;
      --faint: #9299a6;
      --paper: #f4f5f7;
      --surface: #ffffff;
      --line: #dfe2e7;
      --blue: #1967d2;
      --blue-soft: #e8f0fe;
      --green: #137b50;
      --green-soft: #e2f4eb;
      --amber: #a35b00;
      --amber-soft: #fff2d5;
      --red: #bd2d28;
      --red-soft: #fce8e6;
      --violet: #6f42c1;
      --shadow: 0 14px 36px rgba(24, 29, 38, .08);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--paper); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(25, 103, 210, .055) 1px, transparent 1px),
        linear-gradient(rgba(25, 103, 210, .045) 1px, transparent 1px),
        radial-gradient(circle at 86% 6%, rgba(25, 103, 210, .11), transparent 26rem),
        var(--paper);
      background-size: 48px 48px, 48px 48px, auto, auto;
      font: 15px/1.5 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    button, input { font: inherit; }
    button { min-height: 44px; }
    .skip-link {
      position: fixed;
      left: 16px;
      top: 12px;
      z-index: 20;
      padding: 10px 14px;
      color: white;
      background: var(--ink);
      border-radius: 9px;
      transform: translateY(-160%);
      transition: transform .18s ease;
    }
    .skip-link:focus { transform: translateY(0); }

    .shell { width: min(1480px, 100%); margin: 0 auto; padding: 28px 34px 64px; }
    .masthead {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 28px;
      align-items: end;
      overflow: hidden;
      padding: 28px 30px;
      color: white;
      background: #181b22;
      border-radius: 22px;
      box-shadow: var(--shadow);
    }
    .masthead::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 8px;
      background: linear-gradient(180deg, #6aa8ff, var(--blue));
    }
    .masthead::after {
      content: "";
      position: absolute;
      width: 360px;
      height: 360px;
      right: -160px;
      top: -240px;
      border: 1px solid rgba(255, 255, 255, .17);
      border-radius: 50%;
      box-shadow: 0 0 0 42px rgba(255, 255, 255, .025), 0 0 0 84px rgba(255, 255, 255, .018);
    }
    .brand, .mast-meta { position: relative; z-index: 1; }
    .brand-line { display: flex; align-items: center; gap: 13px; }
    .mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      color: #bcd6ff;
      background: rgba(255, 255, 255, .07);
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 12px;
      font-size: 25px;
    }
    h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.25rem); line-height: .95; letter-spacing: -.055em; }
    .eyebrow { margin: 0 0 8px; color: #9abff3; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    .subtitle { margin: 13px 0 0 55px; color: #b9bec9; font-size: 14px; }
    .mast-meta { display: grid; justify-items: end; gap: 7px; text-align: right; }
    .state-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 6px 11px;
      color: #c8f4df;
      background: rgba(28, 160, 103, .16);
      border: 1px solid rgba(91, 225, 163, .27);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .state-badge::before { content: ""; width: 8px; height: 8px; background: #59dc9d; border-radius: 50%; box-shadow: 0 0 0 4px rgba(89, 220, 157, .12); }
    .state-badge.stale { color: #ffd98e; background: rgba(163, 91, 0, .19); border-color: rgba(255, 202, 97, .28); }
    .state-badge.stale::before { background: #ffc85c; box-shadow: 0 0 0 4px rgba(255, 200, 92, .12); }
    .state-badge.offline { color: #ffc1bd; background: rgba(189, 45, 40, .18); border-color: rgba(255, 126, 118, .25); }
    .state-badge.offline::before { background: #ff7c73; box-shadow: 0 0 0 4px rgba(255, 124, 115, .12); }
    #published { color: #aeb4c0; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .view-switch {
      display: inline-flex;
      gap: 4px;
      margin: 18px 0 0;
      padding: 4px;
      background: rgba(255, 255, 255, .84);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 6px 18px rgba(24, 29, 38, .035);
    }
    .view-switch button {
      min-width: 104px;
      padding: 7px 16px;
      color: var(--muted);
      background: transparent;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 800;
    }
    .view-switch button[aria-pressed="true"] { color: white; background: var(--ink); box-shadow: 0 4px 12px rgba(24, 29, 38, .16); }

    .summary-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 18px 0 26px; }
    .metric {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px;
      background: rgba(255, 255, 255, .88);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 6px 18px rgba(24, 29, 38, .035);
    }
    .metric-label { color: var(--muted); font-size: 12px; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
    .metric-value { font: 700 25px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
    .section-head h2 { margin: 0; font-size: clamp(1.35rem, 2.2vw, 1.8rem); letter-spacing: -.03em; }
    .section-head p { margin: 4px 0 0; color: var(--muted); }
    .refresh-button, .card-action, .dialog-action {
      border: 1px solid #cfd3da;
      border-radius: 10px;
      background: white;
      color: var(--ink);
      cursor: pointer;
      font-weight: 720;
      transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
    }
    .refresh-button { padding: 9px 15px; }
    .refresh-button:hover, .card-action:hover, .dialog-action:hover { transform: translateY(-1px); border-color: #9fa8b5; box-shadow: 0 6px 14px rgba(24, 29, 38, .08); }
    button:focus-visible, input:focus-visible { outline: 3px solid rgba(25, 103, 210, .28); outline-offset: 2px; }

    .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 268px;
      overflow: hidden;
      padding: 20px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      animation: reveal .32s both;
    }
    .card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--blue); }
    .card[data-priority="urgent"]::before, .card[data-priority="1"]::before { background: var(--red); }
    .card[data-status="done"] { opacity: .64; }
    .card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 4px 8px; color: #4e5663; background: #f2f4f7; border: 1px solid #e0e4e9; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
    .chip.kind { color: #6841a5; background: #f2ecfb; border-color: #e2d5f5; }
    .item-id { color: var(--faint); font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .card h3 { margin: 16px 0 8px; font-size: 18px; line-height: 1.25; letter-spacing: -.02em; }
    .card .summary { display: -webkit-box; overflow: hidden; margin: 0; color: var(--muted); -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .details { display: grid; gap: 5px; margin: 16px 0; color: #596170; font-size: 12px; }
    .detail:empty { display: none; }
    .item-note { margin: 0 0 16px; padding: 10px 11px; color: #505764; background: #f7f8fa; border-left: 2px solid #aab2bf; border-radius: 0 8px 8px 0; font-size: 12px; font-style: italic; }
    .item-note:empty { display: none; }
    .actions { display: flex; gap: 8px; margin-top: auto; padding-top: 5px; }
    .card-action { flex: 1; padding: 8px 12px; }
    .card-action.primary { color: white; background: var(--ink); border-color: var(--ink); }
    .card-action:disabled { opacity: .5; cursor: wait; transform: none; }
    .actions { flex-wrap: wrap; gap: 6px; }
    .card-action.assign-select { flex: 1 1 40%; padding: 8px 10px; background: white; cursor: pointer; }
    .card-action.source-link { flex: 1 1 40%; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    .card-action.source-link[hidden] { display: none; }
    .card-action.danger { flex: 0 0 auto; color: #a1231f; border-color: #e6c3c1; }
    .card-action.danger:hover { background: #fdf2f1; }
    .worklist { display: flex; flex-direction: column; gap: 6px; }
    .worklist-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start;
      padding: 11px 14px; background: white; border: 1px solid #e4e7ec; border-radius: 11px; }
    .worklist-row[data-done="true"] { opacity: .5; }
    .worklist-row[data-done="true"] .worklist-text { text-decoration: line-through; }
    .worklist-mark { font-weight: 800; color: var(--muted); }
    .worklist-text { min-width: 0; overflow-wrap: anywhere; }
    .worklist-meta { display: flex; gap: 8px; white-space: nowrap; color: var(--muted); font-size: 12px; font-weight: 700; }
    #worklist-filter { min-width: 180px; }
    .empty {
      grid-column: 1 / -1;
      padding: 54px 24px;
      color: var(--muted);
      background: rgba(255, 255, 255, .68);
      border: 1px dashed #bdc3cd;
      border-radius: var(--radius);
      text-align: center;
    }
    .empty strong { display: block; margin-bottom: 5px; color: var(--ink); font-size: 18px; }

    [hidden] { display: none !important; }
    .todo-toolbar { display: flex; gap: 8px; }
    .todo-list { display: grid; gap: 10px; }
    .todo-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
      align-items: start;
      padding: 17px 18px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 22px rgba(24, 29, 38, .045);
    }
    .todo-row[data-done="true"] .todo-copy { opacity: .55; text-decoration: line-through; }
    .todo-row[data-archived="true"] { border-style: dashed; }
    .todo-toggle { width: 44px; min-width: 44px; padding: 0; color: var(--green); background: var(--green-soft); border: 1px solid #b9dfcc; border-radius: 10px; cursor: pointer; font-size: 20px; font-weight: 900; }
    .todo-row[data-done="false"] .todo-toggle { color: var(--faint); background: #f7f8fa; border-color: #d9dde3; }
    .todo-copy h3 { margin: 0; font-size: 16px; line-height: 1.35; }
    .todo-copy p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .todo-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
    .todo-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 7px; }
    .todo-actions button { min-height: 38px; padding: 7px 10px; color: var(--ink); background: white; border: 1px solid #d4d8de; border-radius: 9px; cursor: pointer; font-size: 12px; font-weight: 750; }
    .sync-line { min-height: 22px; margin: 9px 0 0; color: var(--muted); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .toast { position: fixed; left: 50%; bottom: 26px; z-index: 30; max-width: min(560px, calc(100vw - 32px)); padding: 12px 16px; color: white; background: var(--ink); border-radius: 11px; box-shadow: 0 14px 36px rgba(0, 0, 0, .26); opacity: 0; transform: translate(-50%, 14px); pointer-events: none; transition: opacity .2s ease, transform .2s ease; }
    .toast.show { opacity: 1; transform: translate(-50%, 0); }
    .toast.error { background: #7c211e; }

    dialog { width: min(520px, calc(100% - 32px)); padding: 0; border: 0; border-radius: 18px; box-shadow: 0 24px 80px rgba(15, 18, 24, .32); }
    dialog::backdrop { background: rgba(15, 18, 24, .54); backdrop-filter: blur(3px); }
    .dialog-body { padding: 24px; }
    .dialog-body h2 { margin: 0 0 6px; }
    .dialog-body p { margin: 0 0 17px; color: var(--muted); }
    .dialog-body label { display: block; margin-bottom: 6px; font-weight: 720; }
    .dialog-body input { width: 100%; min-height: 48px; padding: 11px 12px; border: 1px solid #bbc1ca; border-radius: 10px; }
    .dialog-actions { display: flex; justify-content: end; gap: 9px; margin-top: 18px; }
    .dialog-action { padding: 9px 16px; }
    .dialog-action.primary { color: white; background: var(--blue); border-color: var(--blue); }
    footer { margin-top: 30px; color: var(--faint); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }

    @keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 980px) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 680px) {
      .shell { padding: 16px 14px 48px; }
      .masthead { grid-template-columns: 1fr; padding: 24px 21px; }
      .mast-meta { justify-items: start; text-align: left; }
      .subtitle { margin-left: 0; }
      .summary-strip { grid-template-columns: 1fr; gap: 8px; }
      .metric { padding: 12px 15px; }
      .board { grid-template-columns: 1fr; }
      .section-head { align-items: start; }
      .card { min-height: 0; }
      .todo-row { grid-template-columns: auto minmax(0, 1fr); }
      .todo-actions { grid-column: 2; justify-content: start; }
      .todo-toolbar { flex-wrap: wrap; justify-content: end; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to board</a>
  <div class="shell">
    <header class="masthead">
      <div class="brand">
        <p class="eyebrow">Flood Doctor · Team Surface</p>
        <div class="brand-line"><span class="mark" aria-hidden="true">♈</span><h1>Aries</h1></div>
        <p class="subtitle">Operations board · live team assignments</p>
      </div>
      <div class="mast-meta">
        <span id="state-badge" class="state-badge stale">Loading</span>
        <span id="published">Waiting for first snapshot</span>
      </div>
    </header>

    <nav class="view-switch" aria-label="Aries view">
      <button id="show-board" type="button" aria-pressed="true">Board</button>
      <button id="show-todos" type="button" aria-pressed="false">To-Do</button>
      <button id="show-worklist" type="button" aria-pressed="false">Full list</button>
    </nav>

    <main id="main">
      <section id="board-summary" class="summary-strip" aria-label="Board summary">
        <div class="metric"><span class="metric-label">Open items</span><strong id="open-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Urgent</span><strong id="urgent-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Assigned</span><strong id="assigned-count" class="metric-value">—</strong></div>
      </section>

      <section id="board-view" aria-labelledby="board-title">
        <div class="section-head">
          <div><h2 id="board-title">Team attention</h2><p>Curated operational items from Aries.</p></div>
          <button id="refresh" class="refresh-button" type="button">Refresh</button>
        </div>
        <div id="board" class="board" aria-busy="true"></div>
      </section>

      <section id="worklist-view" aria-labelledby="worklist-title" hidden>
        <div class="section-head">
          <div><h2 id="worklist-title">Full list</h2><p id="worklist-count">Aries' complete working list, read-only. Personal items are never published.</p></div>
          <div class="todo-toolbar"><input id="worklist-filter" class="refresh-button" type="search" placeholder="Filter…" autocomplete="off" aria-label="Filter the full list"><button id="refresh-worklist" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="worklist" class="worklist" aria-busy="true"></div>
      </section>

      <section id="todo-view" aria-labelledby="todo-title" hidden>
        <div class="section-head">
          <div><h2 id="todo-title">Aries To-Do</h2><p>D1-backed team tasks stay available when Aries is offline.</p><p id="todo-sync-status" class="sync-line" aria-live="polite"></p></div>
          <div class="todo-toolbar"><button id="add-todo" class="refresh-button" type="button">Add task</button><button id="refresh-todos" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="todo-list" class="todo-list" aria-busy="true"></div>
      </section>
    </main>

    <footer>Cloud-backed read surface · actions queue safely when the Aries workstation is offline</footer>
  </div>

  <template id="card-template">
    <article class="card">
      <div class="card-top"><div class="chips"><span class="chip kind"></span><span class="chip priority"></span></div><span class="item-id"></span></div>
      <h3></h3>
      <p class="summary"></p>
      <div class="details"><span class="detail assignee"></span><span class="detail due"></span><span class="detail updated"></span></div>
      <p class="item-note"></p>
      <div class="actions">
        <button class="card-action primary" data-action="done" type="button">Done</button>
        <button class="card-action" data-action="note" type="button">Note</button>
        <select class="card-action assign-select" data-action="assign" aria-label="Assign to"></select>
        <button class="card-action" data-action="snooze" type="button">Snooze</button>
        <a class="card-action source-link" data-action="source" target="_blank" rel="noreferrer noopener">Open email</a>
        <button class="card-action danger" data-action="delete" type="button">Delete</button>
      </div>
    </article>
  </template>

  <dialog id="note-dialog">
    <form id="note-form" class="dialog-body" method="dialog">
      <h2>Add a note</h2>
      <p id="note-target"></p>
      <label for="note-text">Team note</label>
      <input id="note-text" name="note" maxlength="2000" required autocomplete="off">
      <div class="dialog-actions"><button class="dialog-action" value="cancel" type="button" id="note-cancel">Cancel</button><button class="dialog-action primary" value="submit" type="submit">Queue note</button></div>
    </form>
  </dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
    const board = document.querySelector('#board');
    const template = document.querySelector('#card-template');
    const stateBadge = document.querySelector('#state-badge');
    const published = document.querySelector('#published');
    const toast = document.querySelector('#toast');
    const noteDialog = document.querySelector('#note-dialog');
    const noteForm = document.querySelector('#note-form');
    const noteText = document.querySelector('#note-text');
    const boardView = document.querySelector('#board-view');
    const boardSummary = document.querySelector('#board-summary');
    const todoView = document.querySelector('#todo-view');
    const todoList = document.querySelector('#todo-list');
    const todoSyncStatus = document.querySelector('#todo-sync-status');
    const showBoardButton = document.querySelector('#show-board');
    const showTodosButton = document.querySelector('#show-todos');
    const showWorklistButton = document.querySelector('#show-worklist');
    const worklistView = document.querySelector('#worklist-view');
    const worklist = document.querySelector('#worklist');
    const worklistFilter = document.querySelector('#worklist-filter');
    const worklistCount = document.querySelector('#worklist-count');
    let worklistItems = [];
    let noteItem = null;
    let toastTimer = null;
    let activeView = 'board';

    function showToast(message, isError) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.toggle('error', Boolean(isError));
      toast.classList.add('show');
      toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 4200);
    }

    function formatTime(value) {
      if (!value) return 'No snapshot published';
      const date = new Date(value);
      return Number.isNaN(date.valueOf()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }

    function setFreshness(payload) {
      const stale = payload.stale || { is_stale: true };
      stateBadge.className = 'state-badge' + (stale.is_stale ? ' stale' : '');
      stateBadge.textContent = stale.is_stale ? 'Last known' : 'Current';
      published.textContent = payload.published_at ? 'Published ' + formatTime(payload.published_at) : 'Waiting for first snapshot';
    }

    function isUrgent(item) {
      return item.priority === 1 || String(item.priority || '').toLowerCase() === 'urgent';
    }

    function render(items) {
      board.replaceChildren();
      const open = items.filter(function (item) { return item.status !== 'done'; });
      document.querySelector('#open-count').textContent = String(open.length);
      document.querySelector('#urgent-count').textContent = String(open.filter(isUrgent).length);
      document.querySelector('#assigned-count').textContent = String(open.filter(function (item) { return Boolean(item.assignee); }).length);

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        const title = document.createElement('strong');
        title.textContent = 'Nothing needs team attention.';
        const detail = document.createElement('span');
        detail.textContent = 'Aries will publish the next operational item here.';
        empty.append(title, detail);
        board.append(empty);
      }

      items.forEach(function (item, index) {
        const fragment = template.content.cloneNode(true);
        const card = fragment.querySelector('.card');
        card.dataset.priority = String(item.priority || 'normal').toLowerCase();
        card.dataset.status = String(item.status || 'open').toLowerCase();
        card.style.animationDelay = Math.min(index * 45, 360) + 'ms';
        fragment.querySelector('.kind').textContent = item.kind || 'operations';
        fragment.querySelector('.priority').textContent = item.priority ? 'P' + item.priority : 'standard';
        fragment.querySelector('.item-id').textContent = '#' + item.id;
        fragment.querySelector('h3').textContent = item.title;
        fragment.querySelector('.summary').textContent = item.summary || '';
        fragment.querySelector('.assignee').textContent = item.assignee ? 'Assigned to ' + item.assignee : '';
        fragment.querySelector('.due').textContent = item.due ? 'Due ' + item.due : '';
        fragment.querySelector('.updated').textContent = item.updated ? 'Updated ' + formatTime(item.updated) : '';
        fragment.querySelector('.item-note').textContent = item.note || '';
        // Done removes the card immediately. It used to sit there unchanged until the next
        // 30s publish, which read as "the button does nothing" and got clicked repeatedly.
        fragment.querySelector('[data-action="done"]').addEventListener('click', function (event) {
          const target = event.currentTarget;
          const owner = target.closest('.card');
          submitAction(target, { operation: 'done', id: item.id }, function () {
            if (owner) { owner.dataset.status = 'done'; owner.style.opacity = '.35'; owner.style.pointerEvents = 'none'; }
          });
        });

        const assignSelect = fragment.querySelector('[data-action="assign"]');
        assignSelect.append(new Option('Unassigned', ''));
        ASSIGNEES.forEach(function (person) {
          assignSelect.append(new Option(person.charAt(0).toUpperCase() + person.slice(1), person));
        });
        assignSelect.value = (item.assignee || '').toLowerCase();
        assignSelect.addEventListener('change', function (event) {
          submitAction(event.currentTarget, { operation: 'assign', id: item.id, value: event.currentTarget.value });
        });

        fragment.querySelector('[data-action="snooze"]').addEventListener('click', function (event) {
          const answer = window.prompt('Snooze until which date? (YYYY-MM-DD)', defaultSnoozeDate());
          if (!answer) return;
          submitAction(event.currentTarget, { operation: 'snooze', id: item.id, value: answer.trim() });
        });

        const sourceLink = fragment.querySelector('[data-action="source"]');
        if (item.source_url) { sourceLink.href = item.source_url; sourceLink.hidden = false; }
        else { sourceLink.hidden = true; }

        fragment.querySelector('[data-action="delete"]').addEventListener('click', function (event) {
          if (!window.confirm('Delete #' + item.id + ' permanently? ' + item.title)) return;
          const target = event.currentTarget;
          const owner = target.closest('.card');
          submitAction(target, { operation: 'delete', id: item.id }, function () { if (owner) owner.remove(); });
        });
        fragment.querySelector('[data-action="note"]').addEventListener('click', function () {
          noteItem = item;
          document.querySelector('#note-target').textContent = '#' + item.id + ' · ' + item.title;
          noteText.value = '';
          noteDialog.showModal();
          noteText.focus();
        });
        board.append(fragment);
      });
      board.setAttribute('aria-busy', 'false');
    }

    function newEventId() {
      return 'ui-' + crypto.randomUUID();
    }

    function newTaskId() {
      const bytes = new Uint8Array(7);
      crypto.getRandomValues(bytes);
      return 'task-' + Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
    }

    async function submitTodoAction(itemId, operation, payload) {
      const response = await fetch('/api/todo/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          event_id: newEventId(),
          item_id: itemId,
          operation: operation,
          payload: payload,
          client_ts: new Date().toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'To-Do action was not saved');
      todoSyncStatus.textContent = 'Saved in D1 sequence ' + result.operation.sequence + ' · available to Aries sync';
      await loadTodos();
    }

    function renderTodos(items) {
      todoList.replaceChildren();
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        const title = document.createElement('strong');
        title.textContent = 'No active team tasks.';
        const detail = document.createElement('span');
        detail.textContent = 'Add one here or let Aries publish the next catalogue.';
        empty.append(title, detail);
        todoList.append(empty);
      }

      items.forEach(function (item) {
        const row = document.createElement('article');
        row.className = 'todo-row';
        row.dataset.done = String(Boolean(item.done));
        row.dataset.archived = String(Boolean(item.archived));

        const toggle = document.createElement('button');
        toggle.className = 'todo-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', (item.done ? 'Reopen ' : 'Complete ') + item.text);
        toggle.setAttribute('aria-pressed', String(Boolean(item.done)));
        toggle.textContent = item.done ? '✓' : '○';
        toggle.addEventListener('click', function () {
          toggle.disabled = true;
          submitTodoAction(item.id, 'toggle', { done: !item.done }).catch(function (error) {
            showToast(error.message || 'Unable to update task', true);
            toggle.disabled = false;
          });
        });

        const copy = document.createElement('div');
        copy.className = 'todo-copy';
        const title = document.createElement('h3');
        title.textContent = item.text;
        const details = document.createElement('p');
        details.textContent = item.details || '';
        const meta = document.createElement('div');
        meta.className = 'todo-meta';
        [
          item.assignee ? 'Assigned · ' + item.assignee : '',
          item.client ? 'Client · ' + item.client : '',
          item.due ? 'Due · ' + item.due : '',
          item.snoozedUntil ? 'Snoozed · ' + formatTime(item.snoozedUntil) : '',
          item.archived ? 'Archived' : '',
        ].filter(Boolean).forEach(function (label) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = label;
          meta.append(chip);
        });
        copy.append(title, details, meta);

        const actions = document.createElement('div');
        actions.className = 'todo-actions';
        const assign = document.createElement('button');
        assign.type = 'button';
        assign.textContent = 'Assign';
        assign.addEventListener('click', function () {
          const assignee = window.prompt('Assign this task to:', item.assignee || '');
          if (assignee === null) return;
          submitTodoAction(item.id, 'assign', { assignee: assignee.trim() }).catch(function (error) { showToast(error.message, true); });
        });
        const snooze = document.createElement('button');
        snooze.type = 'button';
        snooze.textContent = 'Snooze';
        snooze.addEventListener('click', function () {
          const until = window.prompt('Snooze until (date or ISO timestamp):', item.snoozedUntil || item.due || '');
          if (!until) return;
          submitTodoAction(item.id, 'snooze', { until: until.trim() }).catch(function (error) { showToast(error.message, true); });
        });
        actions.append(assign, snooze);
        row.append(toggle, copy, actions);
        todoList.append(row);
      });
      todoList.setAttribute('aria-busy', 'false');
    }

    async function loadTodos() {
      todoList.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/todos', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('To-Do request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        todoSyncStatus.textContent = payload.sequence
          ? 'D1 sequence ' + payload.sequence + ' · ' + (payload.stale && payload.stale.is_stale ? 'last-known Aries catalogue' : 'current Aries catalogue')
          : 'D1 catalogue ready';
        renderTodos(Array.isArray(payload.items) ? payload.items : []);
      } catch (error) {
        stateBadge.className = 'state-badge offline';
        stateBadge.textContent = 'Unavailable';
        todoList.setAttribute('aria-busy', 'false');
        showToast(error.message || 'To-Do unavailable', true);
      }
    }

    function switchView(view) {
      activeView = view;
      const showingTodos = view === 'todos';
      const showingWorklist = view === 'worklist';
      const showingBoard = !showingTodos && !showingWorklist;
      boardView.hidden = !showingBoard;
      boardSummary.hidden = !showingBoard;
      todoView.hidden = !showingTodos;
      worklistView.hidden = !showingWorklist;
      showBoardButton.setAttribute('aria-pressed', String(showingBoard));
      showTodosButton.setAttribute('aria-pressed', String(showingTodos));
      showWorklistButton.setAttribute('aria-pressed', String(showingWorklist));
      if (showingTodos) loadTodos();
      else if (showingWorklist) loadWorklist();
      else loadBoard();
    }

    function renderWorklist() {
      const needle = (worklistFilter.value || '').trim().toLowerCase();
      const rows = needle
        ? worklistItems.filter(function (item) {
            return (item.text + ' ' + (item.who || '') + ' ' + (item.section || '')).toLowerCase().includes(needle);
          })
        : worklistItems;
      worklist.replaceChildren();
      rows.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'worklist-row';
        row.dataset.done = String(Boolean(item.done));
        const mark = document.createElement('span');
        mark.className = 'worklist-mark';
        mark.textContent = item.done ? '✓' : '○';
        const text = document.createElement('span');
        text.className = 'worklist-text';
        text.textContent = item.text;
        const meta = document.createElement('span');
        meta.className = 'worklist-meta';
        if (item.who) { const who = document.createElement('span'); who.textContent = item.who; meta.append(who); }
        if (item.due) { const due = document.createElement('span'); due.textContent = 'due ' + item.due; meta.append(due); }
        row.append(mark, text, meta);
        worklist.append(row);
      });
      const open = worklistItems.filter(function (item) { return !item.done; }).length;
      worklistCount.textContent = rows.length + ' shown · ' + open + ' open of ' + worklistItems.length +
        ' · read-only, personal items are never published';
      worklist.setAttribute('aria-busy', 'false');
    }

    async function loadWorklist() {
      worklist.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/worklist', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Full list request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        worklistItems = Array.isArray(payload.items) ? payload.items : [];
        renderWorklist();
      } catch (error) {
        worklist.setAttribute('aria-busy', 'false');
        showToast(error.message || 'Full list unavailable', true);
      }
    }

    async function loadBoard() {
      board.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/board', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Board request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        render(Array.isArray(payload.items) ? payload.items : []);
      } catch (error) {
        stateBadge.className = 'state-badge offline';
        stateBadge.textContent = 'Unavailable';
        board.setAttribute('aria-busy', 'false');
        showToast(error.message || 'Board unavailable', true);
      }
    }

    const ASSIGNEES = ['frank', 'mark', 'dom', 'steve', 'shayan', 'katherine', 'aries'];

    function defaultSnoozeDate() {
      const when = new Date(Date.now() + 86400000);
      return when.toISOString().slice(0, 10);
    }

    const ACTION_WORDING = {
      done: 'Marked done.',
      note: 'Note queued for Aries.',
      assign: 'Assignment queued for Aries.',
      snooze: 'Snoozed.',
      delete: 'Delete queued for Aries.',
      reorder: 'Reordered.',
    };

    async function submitAction(button, payload, onAccepted) {
      if (button) button.disabled = true;
      try {
        const response = await fetch('/api/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Action was not queued');
        showToast(ACTION_WORDING[payload.operation] || 'Queued for Aries.', false);
        if (typeof onAccepted === 'function') onAccepted();
      } catch (error) {
        showToast(error.message || 'Action failed', true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    noteForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const value = noteText.value.trim();
      if (!noteItem || !value) return;
      noteDialog.close();
      submitAction(null, { operation: 'note', id: noteItem.id, note: value });
      noteItem = null;
    });
    document.querySelector('#note-cancel').addEventListener('click', function () { noteDialog.close(); noteItem = null; });
    document.querySelector('#refresh').addEventListener('click', loadBoard);
    document.querySelector('#refresh-worklist').addEventListener('click', loadWorklist);
    worklistFilter.addEventListener('input', renderWorklist);
    showWorklistButton.addEventListener('click', function () { switchView('worklist'); });
    document.querySelector('#refresh-todos').addEventListener('click', loadTodos);
    document.querySelector('#add-todo').addEventListener('click', function () {
      const text = window.prompt('What needs to be done?');
      if (!text || !text.trim()) return;
      const id = newTaskId();
      submitTodoAction(id, 'add', {
        item: {
          id: id,
          text: text.trim(),
          upstreamIds: [],
          seedDone: false,
        },
      }).catch(function (error) { showToast(error.message || 'Unable to add task', true); });
    });
    showBoardButton.addEventListener('click', function () { switchView('board'); });
    showTodosButton.addEventListener('click', function () { switchView('todos'); });
    loadBoard();
    window.setInterval(function () {
      if (activeView === 'todos') loadTodos();
      else if (activeView === 'worklist') loadWorklist();
      else loadBoard();
    }, 30000);
  </script>
</body>
</html>`
