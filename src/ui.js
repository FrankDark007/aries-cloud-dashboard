import { BOARD_UPGRADE_CSS, BOARD_UPGRADE_CONTROLS, BOARD_UPGRADE_DIALOGS, BOARD_UPGRADE_SCRIPT } from './board-ui-upgrades.js'

export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Aries — Operations Board</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #475569;
      --faint: #64748b;
      --paper: #f8fafc;
      --surface: #ffffff;
      --line: #e2e8f0;
      --blue: #1d4ed8;
      --blue-soft: #eff6ff;
      --green: #15803d;
      --green-soft: #dcfce7;
      --amber: #b45309;
      --amber-soft: #fef3c7;
      --red: #b91c1c;
      --red-soft: #fee2e2;
      --violet: #6d28d9;
      --shadow: 0 1px 3px rgba(15, 23, 42, .06), 0 1px 2px rgba(15, 23, 42, .04);
      --radius: 12px;
    }

    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--paper); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    button, input, select { font: inherit; }
    button { min-height: 36px; }
    .skip-link {
      position: fixed;
      left: 16px;
      top: 12px;
      z-index: 20;
      padding: 8px 12px;
      color: white;
      background: var(--ink);
      border-radius: 8px;
      transform: translateY(-160%);
      transition: transform .16s ease;
    }
    .skip-link:focus { transform: translateY(0); }

    .shell { width: min(1480px, 100%); margin: 0 auto; padding: 20px 28px 56px; }
    .masthead {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 22px;
      color: white;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
    }
    .brand, .mast-meta { position: relative; z-index: 1; }
    .brand-line { display: flex; align-items: center; gap: 10px; }
    .mark {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      color: #93c5fd;
      background: rgba(255, 255, 255, .08);
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 8px;
      font-size: 18px;
    }
    h1 { margin: 0; font-size: 1.45rem; line-height: 1.1; letter-spacing: -.03em; }
    .eyebrow { margin: 0 0 4px; color: #93c5fd; font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .subtitle { margin: 4px 0 0 42px; color: #94a3b8; font-size: 12.5px; }
    .mast-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 12px; text-align: right; }
    .state-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 10px;
      color: #bbf7d0;
      background: rgba(21, 128, 61, .24);
      border: 1px solid rgba(74, 222, 128, .3);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .state-badge.stale { color: #fde68a; background: rgba(180, 83, 9, .24); border-color: rgba(251, 191, 36, .32); }
    .state-badge.offline { color: #fecaca; background: rgba(185, 28, 28, .25); border-color: rgba(248, 113, 113, .32); }
    #activity-link { color: #cbd5e1; font-size: 12px; font-weight: 650; text-decoration: none; }
    #activity-link:hover { color: white; text-decoration: underline; }
    #published { color: #94a3b8; font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }

    .view-switch {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin: 14px 0 0;
      padding: 4px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;
    }
    .view-switch a {
      padding: 6px 12px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      text-decoration: none;
      border-radius: 7px;
      white-space: nowrap;
    }
    .view-switch a:hover { color: var(--ink); background: #f1f5f9; }
    .view-switch button {
      min-height: 34px;
      padding: 6px 13px;
      color: var(--muted);
      background: transparent;
      border: 0;
      border-radius: 7px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 650;
      white-space: nowrap;
    }
    .view-switch button:hover { color: var(--ink); background: #f1f5f9; }
    .view-switch button[aria-pressed="true"] { color: white; background: var(--ink); }

    .summary-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 14px 0 18px; }
    .metric {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;
    }
    .metric-label { color: var(--muted); font-size: 11.5px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
    .metric-value { font: 700 22px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }

    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .section-head h2 { margin: 0; font-size: 1.25rem; letter-spacing: -.02em; }
    .section-head p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
    .refresh-button, .card-action, .dialog-action {
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: white;
      color: var(--ink);
      cursor: pointer;
      font-size: 12.5px;
      font-weight: 650;
      transition: border-color .14s ease, background .14s ease;
    }
    .refresh-button { padding: 6px 12px; min-height: 36px; }
    .refresh-button:hover, .card-action:hover, .dialog-action:hover { background: #f8fafc; border-color: #94a3b8; }
    button:focus-visible, input:focus-visible, select:focus-visible, .user-field input:focus { outline: 2px solid var(--blue); outline-offset: 2px; }

    .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .board[data-layout="list"] { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .card[data-collapsed="true"] { min-height: 0; padding: 14px 16px; }
    .card[data-collapsed="true"] :is(.needs, .status-lines, .do-this, .owner-hint, .nudge-row, .prep-row, .history) { display: none !important; }
    .card[data-collapsed="true"] h3 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 8px 0 4px; font-size: 15px; }
    .card-peek, .card-owner-line { display: none; }
    .card[data-collapsed="true"] .card-peek { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 4px 0 0; padding: 6px 9px; background: #f8fafc; border-radius: 6px; color: var(--ink); font-size: 12.5px; border: 1px solid #f1f5f9; }
    .card[data-collapsed="true"] .card-owner-line { display: block; margin: 6px 0 0; overflow: hidden; color: var(--muted); font-size: 11.5px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
    .card[data-collapsed="true"] .owner-row { margin-top: 8px; }
    .card[data-collapsed="true"] .actions { margin-top: 8px; padding-top: 8px; }
    .card-top-right { display: flex; align-items: center; gap: 6px; }
    .card-toggle { display: grid; place-items: center; width: 28px; min-height: 28px; padding: 0; color: var(--muted); background: #f8fafc; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; }
    .card-toggle::before { content: ""; width: 6px; height: 6px; margin-top: -2px; border-right: 1.8px solid currentColor; border-bottom: 1.8px solid currentColor; transform: rotate(45deg); }
    .card-toggle:hover { color: var(--ink); border-color: #94a3b8; }
    .card-toggle[aria-expanded="true"] { transform: rotate(180deg); }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      padding: 16px 16px 14px 18px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: #94a3b8; }
    .card[data-accent="urgent"]::before, .card[data-urgent="true"]::before { width: 5px; background: var(--red); }
    .card[data-accent="handled"]::before { width: 4px; background: var(--green); }
    .card[data-accent="waiting-us"]::before { width: 4px; background: var(--amber); }
    .card[data-accent="waiting-them"]::before { width: 4px; background: #94a3b8; }
    .card[data-urgent="true"] { border-color: #fecaca; }
    .urgent-toggle { min-height: 26px; padding: 2px 8px; color: var(--red); background: white; border: 1px solid #fecaca; border-radius: 6px; cursor: pointer; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
    .urgent-toggle:hover { background: var(--red-soft); border-color: var(--red); }
    .urgent-toggle[aria-pressed="true"] { color: white; background: var(--red); border-color: var(--red); }
    .urgent-toggle:disabled { opacity: .6; cursor: progress; }
    .snoozed-list { margin: 16px 0 0; color: var(--muted); }
    .snoozed-list summary { cursor: pointer; font-weight: 650; font-size: 13px; }
    .snoozed-list[hidden] { display: none; }
    .snoozed-rows { display: grid; gap: 6px; margin: 8px 0 0; }
    .card[data-status="done"] { opacity: .6; }
    .card-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
    .chips { display: flex; flex-basis: 100%; flex-wrap: wrap; align-items: center; gap: 5px; }
    .chip { padding: 2px 7px; color: var(--muted); background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px; font-size: 10.5px; font-weight: 650; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .chip.kind { color: #5b21b6; background: #f5f3ff; border-color: #ddd6fe; }
    .chip.kind[data-act="close"] { color: var(--green); background: var(--green-soft); border-color: #bbf7d0; }
    .chip.mailbox { color: #0369a1; background: #f0f9ff; border-color: #bae6fd; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .chip.client-claim { color: var(--ink); background: #f8fafc; border-color: #cbd5e1; font-weight: 700; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
    .chip.counsel { color: white; background: var(--ink); border-color: var(--ink); }
    .chip.aries-state { color: var(--violet); background: #f5f3ff; border-color: #ddd6fe; }
    .chip.aries-state[data-tone="ready"] { color: var(--green); background: var(--green-soft); border-color: #bbf7d0; }
    .chip.aries-state[data-tone="failed"] { color: var(--red); background: var(--red-soft); border-color: #fecaca; }
    .item-id { color: var(--faint); font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
    .card h3 { margin: 8px 0 6px; font-size: 15.5px; line-height: 1.3; letter-spacing: -.015em; font-weight: 700; }
    .card .summary { display: -webkit-box; overflow: hidden; margin: 0; color: var(--muted); -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .details { display: grid; gap: 5px; margin: 12px 0; color: var(--muted); font-size: 12px; }
    .detail:empty { display: none; }
    .item-note { margin: 0 0 12px; padding: 8px 10px; color: var(--muted); background: #f8fafc; border-left: 2px solid #94a3b8; border-radius: 0 6px 6px 0; font-size: 12px; }
    .item-note:empty { display: none; }
    .note-entry + .note-entry { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
    .note-entry .note-text { font-style: italic; white-space: pre-wrap; }
    .note-entry .note-by { display: block; margin-top: 2px; font-style: normal; font-size: 11px; color: var(--faint); }
    .note-entry.pending { opacity: .7; }
    .actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
    .card-action { flex: 1 1 auto; min-height: 32px; padding: 5px 9px; font-size: 12px; }
    .card-action.done { color: var(--green); background: #f0fdf4; border-color: #bbf7d0; font-weight: 700; }
    .card-action.done:hover { background: #dcfce7; border-color: #86efac; }
    .card-action:disabled { opacity: .5; cursor: wait; }
    .card-action.assign-select { flex: 1 1 40%; padding: 6px 8px; background: white; cursor: pointer; }
    .card-action.source-link { flex: 1 1 40%; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    .card-action.source-link[hidden] { display: none; }
    .card-action.danger { flex: 0 0 auto; color: var(--red); border-color: #fecaca; }
    .card-action.danger:hover { background: var(--red-soft); }
    .chip.when { color: var(--muted); }
    .chip.when[data-tone="soon"] { color: var(--amber); background: var(--amber-soft); border-color: #fde68a; }
    .chip.when[data-tone="late"] { color: var(--red); background: var(--red-soft); border-color: #fecaca; }
    .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .facts:empty { display: none; }
    .needs { margin: 0; color: #334155; font-size: 13px; line-height: 1.45; }
    .status-lines { display: grid; gap: 5px; margin: 10px 0 0; font-size: 12px; line-height: 1.4; }
    .status-line { display: grid; grid-template-columns: 7.8em minmax(0, 1fr); gap: 6px; }
    .status-line dt { white-space: nowrap; color: var(--muted); font-weight: 650; }
    .status-line[hidden] { display: none; }
    .status-line dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
    .status-line dd b { font-weight: 700; }
    .status-line dd .quiet { color: var(--muted); }
    .do-this {
      --act: var(--blue);
      --act-soft: var(--blue-soft);
      margin: 10px 0 0;
      padding: 10px 12px;
      background: var(--act-soft);
      border: 1px solid rgba(29, 78, 216, .16);
      border-radius: 8px;
    }
    .do-this[data-act="call"] { --act: var(--green); --act-soft: var(--green-soft); }
    .do-this[data-act="invoice"], .do-this[data-act="payment"] { --act: var(--amber); --act-soft: var(--amber-soft); }
    .do-this[data-act="decide"] { --act: var(--violet); --act-soft: #f5f3ff; }
    .do-this[data-act="wait"], .do-this[data-act="file"], .do-this[data-act="close"], .do-this[data-act="none"] { --act: #475569; --act-soft: #f8fafc; }
    .do-this[data-act="legal"] { --act: var(--red); --act-soft: var(--red-soft); }
    .do-counsel { margin: 0 0 4px; color: var(--red); font-size: 12px; font-weight: 750; }
    .do-counsel:empty { display: none; }
    .do-text { margin: 0; color: var(--ink); font-size: 13.5px; font-weight: 650; line-height: 1.38; }
    .do-text:empty { display: none; }
    .do-text:empty + .do-buttons { margin-top: 0; }
    .do-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .do-buttons:empty { display: none; }
    .do-button {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 32px; padding: 5px 10px;
      color: var(--act); background: white; border: 1px solid var(--act); border-radius: 7px;
      cursor: pointer; font-size: 12px; font-weight: 700; text-decoration: none;
    }
    .do-button.primary { color: white; background: var(--act); }
    .do-button:hover { filter: brightness(.95); }
    .do-button:disabled { opacity: .55; cursor: wait; }
    .owner-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; margin: 10px 0 0; }
    .owner-label { color: var(--muted); font-size: 11.5px; font-weight: 650; }
    .owner-select { min-height: 32px !important; padding: 4px 8px !important; font-size: 12px !important; }
    .owner-hint { margin: 4px 0 0; color: var(--blue); font-size: 11.5px; font-weight: 600; }
    .nudge-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; }
    .nudge-row[hidden] { display: none; }
    .nudge-button {
      min-height: 30px; padding: 4px 10px;
      color: var(--amber); background: var(--amber-soft); border: 1px solid #fde68a; border-radius: 6px;
      cursor: pointer; font-size: 11.5px; font-weight: 700;
    }
    .nudge-button:hover { border-color: var(--amber); }
    .nudge-button:disabled { color: var(--muted); background: #f1f5f9; border-color: var(--line); cursor: default; }
    .nudge-note { color: var(--muted); font-size: 11.5px; }
    .prep-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0; }
    .prep-row[hidden] { display: none; }
    .prep-button {
      min-height: 30px; padding: 4px 10px;
      color: var(--violet); background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px;
      cursor: pointer; font-size: 11.5px; font-weight: 700;
    }
    .prep-button:hover { border-color: var(--violet); }
    .prep-note { color: var(--muted); font-size: 11.5px; }
    .owner-hint:empty { display: none; }
    .card-action[aria-expanded="true"] { color: white; background: var(--ink); border-color: var(--ink); }
    .choices { display: grid; gap: 6px; margin-top: 8px; padding: 10px; background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; }
    .choices-label { margin: 0; color: var(--muted); font-size: 11.5px; font-weight: 700; }
    .choice-row { display: flex; flex-wrap: wrap; gap: 5px; }
    .choice {
      min-height: 32px; padding: 4px 10px;
      color: var(--ink); background: white; border: 1px solid #cbd5e1; border-radius: 6px;
      cursor: pointer; font-size: 12px; font-weight: 650;
    }
    .choice:hover { border-color: #94a3b8; }
    .choice.danger { color: var(--red); border-color: #fecaca; }
    .choice:disabled { opacity: .55; cursor: wait; }
    .choice-date { min-height: 32px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; font-size: 12px; }
    .history { margin-top: 8px; font-size: 11.5px; }
    .history summary { width: fit-content; color: var(--muted); cursor: pointer; font-weight: 650; }
    .history[hidden] { display: none; }
    .history-list { display: grid; gap: 5px; margin: 6px 0 0; padding: 0; list-style: none; }
    .history-entry { display: grid; grid-template-columns: 7.8em minmax(0, 1fr); gap: 6px; color: #334155; }
    .history-entry time { color: var(--faint); font-variant-numeric: tabular-nums; }
    .history-entry.theirs { color: var(--muted); }
    .history-entry.theirs b { color: #334155; }
    .history-text { overflow-wrap: anywhere; }
    .worklist { display: flex; flex-direction: column; gap: 6px; }
    .worklist-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start;
      padding: 10px 14px; background: white; border: 1px solid var(--line); border-radius: 8px; }
    .worklist-row[data-done="true"] { opacity: .5; }
    .worklist-row[data-done="true"] .worklist-text { text-decoration: line-through; }
    .worklist-mark { font-weight: 800; color: var(--muted); }
    .worklist-text { min-width: 0; overflow-wrap: anywhere; }
    .worklist-meta { display: flex; gap: 8px; white-space: nowrap; color: var(--muted); font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
    #worklist-filter { min-width: 180px; }
    .checked-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center;
      padding: 10px 14px; background: white; border: 1px solid var(--line); border-radius: 8px; }
    .checked-row .worklist-text { text-decoration: line-through; color: var(--muted); }
    .checked-row .card-action { flex: 0 0 auto; }
    .thread-body { max-width: min(760px, 92vw); max-height: 80vh; overflow-y: auto; }
    .thread-message { padding: 12px 0; border-top: 1px solid var(--line); }
    .thread-message:first-of-type { border-top: none; }
    .thread-meta { display: block; color: var(--muted); font-size: 12px; font-weight: 700; margin-bottom: 6px; overflow-wrap: anywhere; }
    .thread-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 1.5; }
    .thread-truncated { color: var(--muted); font-size: 12px; font-style: italic; }
    .empty {
      grid-column: 1 / -1;
      padding: 40px 20px;
      color: var(--muted);
      background: var(--surface);
      border: 1px dashed #cbd5e1;
      border-radius: var(--radius);
      text-align: center;
    }
    .empty strong { display: block; margin-bottom: 4px; color: var(--ink); font-size: 16px; }

    [hidden] { display: none !important; }
    .todo-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .todo-list { display: grid; gap: 12px; }
    .todo-section { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    .todo-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid var(--line); }
    .todo-section-title { margin: 0; font-size: 13.5px; font-weight: 750; color: var(--ink); }
    .todo-section-count { color: var(--muted); font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .todo-section-items { display: grid; }
    .todo-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 12px 14px;
      background: var(--surface);
      border-bottom: 1px solid var(--line);
    }
    .todo-row:last-child { border-bottom: 0; }
    .todo-row[data-done="true"] .todo-copy { opacity: .55; text-decoration: line-through; }
    .todo-row[data-archived="true"] { border-style: dashed; }
    .todo-row[data-urgent="true"] { box-shadow: inset 4px 0 0 var(--red); }
    .todo-meta .chip[data-tone="urgent"] { color: white; background: var(--red); border-color: var(--red); }
    .todo-meta .chip[data-tone="late"] { color: var(--amber); background: var(--amber-soft); border-color: #fde68a; }
    .todo-meta .chip[data-tone="aries"] { color: var(--violet); background: #f5f3ff; border-color: #ddd6fe; }
    .todo-meta .chip[data-tone="failed"] { color: var(--red); background: var(--red-soft); border-color: #fecaca; }
    .todo-actions select, .todo-actions a { min-height: 32px; padding: 4px 8px; color: var(--ink); background: white; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; font-size: 12px; font-weight: 650; text-decoration: none; }
    .todo-actions a { display: inline-flex; align-items: center; color: var(--blue); }
    .todo-toggle { width: 34px; min-width: 34px; min-height: 34px; padding: 0; color: var(--green); background: var(--green-soft); border: 1px solid #bbf7d0; border-radius: 7px; cursor: pointer; font-size: 16px; font-weight: 800; }
    .todo-row[data-done="false"] .todo-toggle { color: var(--faint); background: #f8fafc; border-color: #cbd5e1; }
    .todo-copy h3 { margin: 0; font-size: 14.5px; line-height: 1.35; }
    .todo-copy p { margin: 3px 0 0; color: var(--muted); font-size: 12.5px; }
    .todo-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .todo-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 6px; }
    .todo-actions button { min-height: 32px; padding: 4px 8px; color: var(--ink); background: white; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 650; }
    .sync-line { min-height: 20px; margin: 6px 0 0; color: var(--muted); font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }

    .toast { position: fixed; left: 50%; bottom: 24px; z-index: 30; display: inline-flex; align-items: center; gap: 10px; max-width: min(560px, calc(100vw - 32px)); padding: 10px 14px; color: white; background: var(--ink); border-radius: 9px; box-shadow: 0 12px 30px rgba(15, 23, 42, .25); opacity: 0; transform: translate(-50%, 14px); pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    .toast.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    .toast.error { background: #7f1d1d; }
    .toast-undo { min-height: 26px; padding: 2px 9px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 5px; background: rgba(255, 255, 255, .12); color: white; font-size: 12px; font-weight: 700; cursor: pointer; }
    .toast-undo:hover { background: rgba(255, 255, 255, .22); }

    dialog { width: min(520px, calc(100% - 32px)); padding: 0; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 60px rgba(15, 23, 42, .28); }
    dialog::backdrop { background: rgba(15, 23, 42, .5); backdrop-filter: blur(2px); }
    .dialog-body { padding: 20px; }
    .dialog-body h2 { margin: 0 0 6px; font-size: 18px; }
    .dialog-body p { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
    .dialog-body label { display: block; margin-bottom: 5px; font-weight: 650; font-size: 12.5px; }
    .dialog-body input { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
    .dialog-body textarea { width: 100%; min-height: 110px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; resize: vertical; }
    .dialog-hint { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    .dialog-actions { display: flex; justify-content: end; gap: 8px; margin-top: 16px; }
    .dialog-action { padding: 7px 14px; }
    .dialog-action.primary { color: white; background: var(--blue); border-color: var(--blue); }
    .user-list { display: grid; gap: 10px; }
    .user-row {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) minmax(0, 1.5fr) auto;
      gap: 6px 12px;
      align-items: end;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;
    }
    .user-row.add { margin-top: 14px; background: #f8fafc; border-style: dashed; }
    .user-initial { display: grid; place-items: center; width: 40px; height: 40px; align-self: center; color: var(--blue); background: var(--blue-soft); border-radius: 50%; font-size: 15px; font-weight: 800; }
    .user-row.add .user-initial { color: var(--muted); background: #e2e8f0; }
    .user-field label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 12px; font-weight: 650; }
    .user-field input { width: 100%; min-height: 38px; padding: 7px 10px; color: var(--ink); background: white; border: 1px solid #cbd5e1; border-radius: 7px; font: inherit; }
    .user-save { min-height: 38px; padding: 7px 14px; color: white; background: var(--blue); border: 1px solid var(--blue); border-radius: 7px; cursor: pointer; font-weight: 700; }
    .user-save:disabled { color: var(--faint); background: #f1f5f9; border-color: var(--line); cursor: default; }
    .user-note, .user-error { grid-column: 2 / -1; margin: 0; font-size: 12px; }
    .user-note { color: var(--muted); }
    .user-error { color: var(--red); font-weight: 700; }
    .user-error:empty, .user-note:empty { display: none; }
    .user-help { max-width: 72ch; margin: 12px 0 0; color: var(--muted); font-size: 12.5px; }
    footer { margin-top: 28px; color: var(--faint); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }

    .claim-card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      padding: 14px 12px 12px 16px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .claim-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--blue); }
    .claim-card[data-urgent="true"]::before { width: 5px; background: var(--red); }
    .claim-card[data-urgent="true"] { border-color: #fecaca; }
    .claim-head { display: grid; gap: 6px; margin-bottom: 10px; }
    .claim-head-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; }
    .claim-head h3 { margin: 0; font-size: 16px; line-height: 1.25; letter-spacing: -.015em; }
    .claim-head .facts { margin: 0; }
    .claim-count { margin: 0; color: var(--muted); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .claim-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 4px; }
    .claim-action-btn, .claim-assign-all { min-height: 28px; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; color: var(--ink); font-size: 11.5px; font-weight: 650; cursor: pointer; }
    .claim-action-btn.done { color: var(--green); background: #f0fdf4; border-color: #bbf7d0; }
    .claim-action-btn.merge { color: var(--blue); background: var(--blue-soft); border-color: #bfdbfe; }
    .claim-tasks { display: grid; gap: 8px; }
    .claim-tasks .card { min-height: 0; padding: 12px 12px 12px 16px; background: var(--surface); border-radius: 9px; box-shadow: none; }
    .claim-tasks .card::before { width: 3px; }
    .claim-tasks .card h3 { margin: 6px 0 4px; font-size: 14.5px; }
    .claim-tasks .fact-client { display: none; }
    @media (max-width: 1020px) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 680px) {
      .shell { padding: 12px 12px 40px; }
      .masthead { padding: 14px 16px; }
      .mast-meta { justify-content: start; text-align: left; }
      .subtitle { margin-left: 0; }
      .summary-strip { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .board { grid-template-columns: 1fr; }
      .section-head { align-items: start; flex-direction: column; }
      .todo-row { grid-template-columns: auto minmax(0, 1fr); }
      .todo-actions { grid-column: 2; justify-content: start; }
      .user-row { grid-template-columns: 40px minmax(0, 1fr); }
      .user-row .user-field, .user-row .user-save { grid-column: 2; }
      .user-row .user-save { justify-self: start; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition-duration: .01ms !important; }
    }
${BOARD_UPGRADE_CSS}
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
        <a id="activity-link" href="/activity" hidden>Activity log</a>
      </div>
    </header>

    <nav class="view-switch" aria-label="Aries view"><a href="/mission">Mission Control</a>
      <button id="show-board" type="button" aria-pressed="true">Board</button>
      <button id="show-mine" type="button" aria-pressed="false" hidden>My cards</button>
      <button id="show-exceptions" type="button" aria-pressed="false">Exceptions</button>
      <button id="show-todos" type="button" aria-pressed="false">To-Do</button>
      <button id="show-worklist" type="button" aria-pressed="false">Full list</button>
      <button id="show-checked" type="button" aria-pressed="false">Checked off</button>
      <button id="show-users" type="button" aria-pressed="false" hidden>User settings</button>
    </nav>

    <main id="main">
      <section id="board-summary" class="summary-strip" aria-label="Board summary">
        <div class="metric"><span class="metric-label">Open items</span><strong id="open-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Ready to close</span><strong id="ready-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Urgent</span><strong id="urgent-count" class="metric-value">—</strong></div>
        <div class="metric"><span class="metric-label">Assigned</span><strong id="assigned-count" class="metric-value">—</strong></div>
      </section>

      <section id="board-view" aria-labelledby="board-title">
        <div class="section-head">
          <div><h2 id="board-title">Team attention</h2><p id="board-subtitle">Curated operational items from Aries.</p></div>
          <div class="todo-toolbar"><button id="expand-all" class="refresh-button" type="button">Expand all</button><button id="refresh" class="refresh-button" type="button">Refresh</button></div>
        </div>
${BOARD_UPGRADE_CONTROLS}
        <div id="board" class="board" aria-busy="true"></div>
        <details id="snoozed-list" class="snoozed-list" hidden><summary></summary><div class="snoozed-rows"></div></details>
      </section>

      <section id="checked-view" aria-labelledby="checked-title" hidden>
        <div class="section-head">
          <div><h2 id="checked-title">Checked off</h2><p id="checked-count">Recently completed cards. Undo brings one back to the board.</p></div>
          <button id="refresh-checked" class="refresh-button" type="button">Refresh</button>
        </div>
        <div id="checked" class="worklist" aria-busy="true"></div>
      </section>

      <section id="worklist-view" aria-labelledby="worklist-title" hidden>
        <div class="section-head">
          <div><h2 id="worklist-title">Full list</h2><p id="worklist-count">Aries complete working list, read-only. Personal items are never published.</p></div>
          <div class="todo-toolbar"><input id="worklist-filter" class="refresh-button" type="search" placeholder="Filter…" autocomplete="off" aria-label="Filter the full list"><button id="refresh-worklist" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="worklist" class="worklist" aria-busy="true"></div>
      </section>

      <section id="todo-view" aria-labelledby="todo-title" hidden>
        <div class="section-head">
          <div><h2 id="todo-title">Aries To-Do</h2><p>One client, one clear action, one owner. Checking off a task made from a card closes that card too.</p><p id="todo-sync-status" class="sync-line" aria-live="polite"></p></div>
          <div class="todo-toolbar"><button id="toggle-completed-todos" class="refresh-button" type="button" aria-pressed="false">Show completed (0)</button><button id="add-todo" class="refresh-button" type="button">Add task</button><button id="refresh-todos" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="todo-list" class="todo-list" aria-busy="true"></div>
      </section>

      <section id="users-view" aria-labelledby="users-title" hidden>
        <div class="section-head">
          <div><h2 id="users-title">User settings</h2><p>Change a name or an email address, or add someone. Only you see this tab.</p></div>
        </div>
        <div id="user-list" class="user-list" aria-busy="true"></div>
        <form id="add-user" class="user-row add" autocomplete="off">
          <span class="user-initial" aria-hidden="true">+</span>
          <div class="user-field"><label for="add-user-name">Name</label><input id="add-user-name" name="name" maxlength="40" required></div>
          <div class="user-field"><label for="add-user-email">Email</label><input id="add-user-email" name="email" type="email" maxlength="120" required></div>
          <button class="user-save" type="submit">Add user</button>
          <p class="user-error" role="alert"></p>
        </form>
        <p class="user-help">Use a company address: @flood.doctor, @flooddoctorva.com or @restorationdoctors.com. A new user can sign in to this board right away, and Aries emails them when a card is assigned to them. Renaming someone keeps every card they own.</p>
      </section>
    </main>

    <footer>Cloud-backed read surface · actions queue safely when the Aries workstation is offline</footer>
  </div>

  <template id="card-template">
    <article class="card">
      <div class="card-top"><span class="item-id"></span><div class="card-top-right"><button class="urgent-toggle" data-action="urgent" type="button" aria-pressed="false">Mark urgent</button><button class="card-toggle" data-action="toggle" type="button" aria-expanded="false" aria-label="Show details"></button></div><div class="chips"><span class="chip client-claim" hidden></span><span class="chip mailbox" hidden></span><span class="chip counsel" hidden>Counsel only</span><span class="chip kind"></span><span class="chip when"></span><span class="chip aries-state" hidden></span></div></div>
      <h3></h3>
      <p class="facts"></p>
      <p class="card-peek"></p>
      <p class="card-owner-line"></p>
      <p class="needs"></p>
      <dl class="status-lines">
        <div class="status-line waiting"><dt>Waiting on</dt><dd></dd></div>
        <div class="status-line last"><dt>Last worked on</dt><dd></dd></div>
      </dl>
      <section class="do-this" aria-label="What to do next">
        <p class="do-counsel"></p>
        <p class="do-text"></p>
        <div class="do-buttons"></div>
      </section>
      <div class="owner-row" role="group" aria-label="Owner"><span class="owner-label">Owner</span></div>
      <p class="owner-hint"></p>
      <div class="nudge-row" hidden><button class="nudge-button" data-action="nudge" type="button"></button><span class="nudge-note"></span></div>
      <div class="prep-row" hidden><button class="prep-button" data-action="prep" type="button"></button><span class="prep-note"></span></div>
      <div class="actions">
        <button class="card-action done" data-action="done" type="button" aria-expanded="false">✓ Done</button>
        <button class="card-action" data-action="snooze" type="button" aria-expanded="false">Snooze ▾</button>
        <button class="card-action" data-action="email" type="button" hidden>✉️ Email</button>
        <button class="card-action" data-action="note" type="button">Note</button>
        <button class="card-action" data-action="more" type="button" aria-expanded="false">More ▾</button>
      </div>
      <div class="choices" hidden></div>
      <details class="history"><summary></summary><ol class="history-list"></ol></details>
    </article>
  </template>

  <dialog id="thread-dialog">
    <div class="dialog-body thread-body">
      <h2 id="thread-title">Source email</h2>
      <p id="thread-mailbox" class="sync-line"></p>
      <div id="thread-messages"></div>
      <div class="dialog-actions"><button class="dialog-action" type="button" id="thread-close">Close</button></div>
    </div>
  </dialog>

  <dialog id="note-dialog">
    <form id="note-form" class="dialog-body" method="dialog">
      <h2>Add a note</h2>
      <p id="note-target"></p>
      <label for="note-text">Team note</label>
      <input id="note-text" name="note" maxlength="2000" required autocomplete="off">
      <div class="dialog-actions"><button class="dialog-action" value="cancel" type="button" id="note-cancel">Cancel</button><button class="dialog-action primary" value="submit" type="submit">Queue note</button></div>
    </form>
  </dialog>
  <dialog id="aries-dialog">
    <form id="aries-form" class="dialog-body" method="dialog">
      <h2 id="aries-heading">Assign to Aries</h2>
      <p id="aries-target"></p>
      <label id="aries-label" for="aries-text">What should Aries do? (optional)</label>
      <textarea id="aries-text" name="instruction" maxlength="1800" placeholder="Example: reject the offer and draft a rebuttal using our rebuttal cards."></textarea>
      <p id="aries-hint" class="dialog-hint">Aries reads the email thread, drafts replies for review, and asks teammates if it needs something. It never sends anything outside the company. It writes what it did on this card.</p>
      <div class="dialog-actions"><button class="dialog-action" type="button" id="aries-cancel">Cancel</button><button class="dialog-action primary" type="submit" id="aries-submit">Give it to Aries</button></div>
    </form>
  </dialog>
${BOARD_UPGRADE_DIALOGS}
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
    const showCheckedButton = document.querySelector('#show-checked');
    const checkedView = document.querySelector('#checked-view');
    const checkedList = document.querySelector('#checked');
    const checkedCount = document.querySelector('#checked-count');
    const showUsersButton = document.querySelector('#show-users');
    const showMineButton = document.querySelector('#show-mine');
    const usersView = document.querySelector('#users-view');
    const userList = document.querySelector('#user-list');
    const addUserForm = document.querySelector('#add-user');
    let boardItems = [];
    const threadDialog = document.querySelector('#thread-dialog');
    const threadMessages = document.querySelector('#thread-messages');
    const threadTitle = document.querySelector('#thread-title');
    const threadMailbox = document.querySelector('#thread-mailbox');
    let noteItem = null;
    let noteHost = null;
    let toastTimer = null;
    let activeView = 'board';
    let showCompletedTodos = false;

    function showToast(message, isError, undoCallback) {
      window.clearTimeout(toastTimer);
      toast.replaceChildren();
      const span = document.createElement('span');
      span.textContent = message;
      toast.append(span);
      if (typeof undoCallback === 'function') {
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'toast-undo';
        undoBtn.textContent = 'Undo';
        undoBtn.addEventListener('click', function () {
          window.clearTimeout(toastTimer);
          toast.classList.remove('show');
          undoCallback();
        });
        toast.append(undoBtn);
      }
      toast.classList.toggle('error', Boolean(isError));
      toast.classList.add('show');
      toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 5000);
    }

    function formatTime(value) {
      if (!value) return 'No snapshot published';
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return value;
      const p = {};
      for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date)) p[x.type] = x.value;
      return p.month + '/' + p.day + '/' + p.year + ' ' + p.hour + ':' + p.minute + ' ' + p.dayPeriod + ' ET';
    }

    function formatDue(value) {
      const m = /(\\d{4})-(\\d{1,2})-(\\d{1,2})/.exec(String(value || ''));
      return m ? m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') + '/' + m[1] : String(value || '');
    }

    function setFreshness(payload) {
      const stale = payload.stale || { is_stale: true };
      stateBadge.className = 'state-badge' + (stale.is_stale ? ' stale' : '');
      stateBadge.textContent = stale.is_stale ? 'Snapshot old' : 'Snapshot current';
      published.textContent = payload.published_at ? 'Snapshot published ' + formatTime(payload.published_at) : 'Waiting for first snapshot';
    }

    function isUrgent(item) {
      return Boolean(item.urgent) || String(item.priority || '').toLowerCase() === 'urgent';
    }

    function todayIso() {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    function isResting(item) {
      const day = String(item.due || '').slice(0, 10);
      return !item.pending && item.status === 'snoozed' && ISO_DAY_PATTERN.test(day) && day > todayIso();
    }

    function onBoard(item) {
      return (item.status !== 'done' || (item.pending && (item.command_receipt||{}).operation === 'done')) && !isResting(item);
    }

    let threadIds = new Set();

    function refreshBoardChrome() {
      const open = visibleBoardItems();
      const allActive = boardItems.filter(onBoard);
      updateUpgradeChrome();
      board.querySelectorAll('.claim-card').forEach(fillClaimCard);
      renderSnoozed();
      if (me) showMineButton.textContent = 'My cards (' + allActive.filter(function (item) {
        return String(item.assignee || '').toLowerCase() === me.key;
      }).length + ')';
      syncExpandAll();
      document.querySelector('#open-count').textContent = String(open.length);
      const readyNode = document.querySelector('#ready-count');
      if (readyNode) readyNode.textContent = String(open.filter(isAutoResolvedCandidate).length);
      document.querySelector('#urgent-count').textContent = String(open.filter(isUrgent).length);
      document.querySelector('#assigned-count').textContent = String(open.filter(function (item) { return Boolean(item.assignee); }).length);

      const hasCard = Boolean(board.querySelector('.card, .compact-table tbody tr'));
      if (!hasCard && (filters.query || filters.owner || filters.client || filters.claim || filters.status || filters.quick || activeView === 'exceptions')) {
        const prior = board.querySelector('.empty'); if (prior) prior.remove();
        const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No cards match this view. Change or clear the filters.'; board.append(empty); return;
      }
      const placeholder = board.querySelector('.empty');
      if (hasCard) {
        if (placeholder) placeholder.remove();
        return;
      }
      if (placeholder) return;
      const empty = document.createElement('div');
      empty.className = 'empty';
      const title = document.createElement('strong');
      title.textContent = boardFilter === 'mine' ? 'Nothing is assigned to you right now.' : 'Nothing needs team attention.';
      const detail = document.createElement('span');
      detail.textContent = boardFilter === 'mine' ? 'Cards someone gives you show up here.' : 'Aries will publish the next operational item here.';
      empty.append(title, detail);
      board.append(empty);
    }

    function render(items) {
      const restoreFocus = rememberFocus();
      board.dataset.layout = boardFilter === 'mine' ? 'list' : 'grid';
      const open = items.filter(boardScope).filter(inView).filter(filteredBoardItem).sort(function (left, right) {
        if (filters.sort === 'created') {
          const leftCreated = Date.parse(left.created || left.updated || '') || left.id || 0;
          const rightCreated = Date.parse(right.created || right.updated || '') || right.id || 0;
          if (rightCreated !== leftCreated) return rightCreated - leftCreated;
          return (right.id || 0) - (left.id || 0);
        }
        if (filters.sort === 'assignee') {
          const leftOwner = left.assignee ? nameOf(String(left.assignee).toLowerCase()).toLowerCase() : '\\uffff';
          const rightOwner = right.assignee ? nameOf(String(right.assignee).toLowerCase()).toLowerCase() : '\\uffff';
          const cmp = leftOwner.localeCompare(rightOwner);
          if (cmp !== 0) return cmp;
        }
        const urgent = Number(isUrgent(right)) - Number(isUrgent(left));
        if (urgent) return urgent;
        const leftDue = sortDeadline(left), rightDue = sortDeadline(right);
        if (leftDue === null || rightDue === null) return (leftDue === null ? 1 : 0) - (rightDue === null ? 1 : 0);
        return leftDue - rightDue;
      });
      const slots = [], claims = new Map();
      open.forEach(function (item) {
        const key = item.claim_group || '';
        if (key && claims.has(key)) { claims.get(key).push(item); return; }
        const members = [item]; if (key) claims.set(key,members); slots.push(members);
      });
      const nodes = board.dataset.density === 'compact' && open.length ? [renderCompactTable(open)] : slots.map(function (members,index) { return members.length > 1 ? buildClaimCard(members,index) : buildCard(members[0],index); });
      reconcileChildren(board,nodes);
      refreshBoardChrome();
      board.setAttribute('aria-busy','false');
      restoreFocus();
    }

    // ---- Cards ------------------------------------------------------------------------------
    const OWNERS = ['frank', 'mark', 'steve', 'shayan', 'katherine'];
    let teamList = OWNERS.map(function (key) { return { key: key, name: titleName(key) }; });
    let me = null;
    let boardFilter = 'all';
    const EXPANDED_KEY = 'aries-expanded-cards';
    const expandedCards = new Set((function () {
      try { return JSON.parse(window.localStorage.getItem(EXPANDED_KEY) || '[]'); } catch (error) { return []; }
    })());
    function saveExpanded() {
      try { window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expandedCards).slice(-200))); } catch (error) { /* private window */ }
    }
    function inView(item) {
      return boardFilter !== 'mine' || (me && String(item.assignee || '').toLowerCase() === me.key);
    }
    function setCollapsed(card, item, collapsed) {
      card.dataset.collapsed = String(collapsed);
      const toggle = card.querySelector('.card-toggle');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Show details' : 'Hide details');
      if (collapsed) expandedCards.delete(item.id); else expandedCards.add(item.id);
      saveExpanded();
      syncExpandAll();
    }
    function syncExpandAll() {
      const cards = board.querySelectorAll('.card');
      const allOpen = cards.length > 0 && Array.prototype.every.call(cards, function (card) { return card.dataset.collapsed === 'false'; });
      document.querySelector('#expand-all').textContent = allOpen ? 'Collapse all' : 'Expand all';
    }
    const DONE_REASONS = [
      ['replied', 'Replied'],
      ['paid', 'Paid'],
      ['called', 'Called'],
      ['handled another way', 'Handled another way'],
      ['nothing was needed', 'Nothing needed'],
    ];
    const ISO_DAY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    const openHistory = new Set();

    function titleName(name) { return name ? name.charAt(0).toUpperCase() + name.slice(1) : ''; }
    function nameOf(key) {
      const found = teamList.find(function (person) { return person.key === key; });
      return found ? found.name : titleName(key);
    }

    function daysUntil(isoDay) {
      if (!ISO_DAY_PATTERN.test(String(isoDay || '').slice(0, 10))) return null;
      const parts = String(isoDay).slice(0, 10).split('-').map(Number);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.round((new Date(parts[0], parts[1] - 1, parts[2]) - today) / 86400000);
    }

    function monthDay(isoDay) {
      const parts = String(isoDay || '').slice(0, 10).split('-').map(Number);
      return parts.length === 3 ? parts[1] + '/' + parts[2] : String(isoDay || '');
    }

    function whenShort(value) {
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return String(value || '');
      return date.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    }

    function ago(value) {
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return '';
      const minutes = Math.round((Date.now() - date.valueOf()) / 60000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes + ' min ago';
      const hours = Math.round(minutes / 60);
      if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
      const days = Math.round(hours / 24);
      if (days === 1) return 'yesterday';
      if (days < 14) return days + ' days ago';
      return 'on ' + date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' });
    }

    function isoDayFromNow(days) {
      const date = new Date(Date.now() + days * 86400000);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function daysToNextMonday() {
      const weekday = new Date().getDay();
      return ((8 - weekday) % 7) || 7;
    }

    function cleanSubject(text) {
      let title = String(text || '').trim();
      for (let pass = 0; pass < 8; pass += 1) {
        const lower = title.toLowerCase();
        const prefix = ['re:', 'fw:', 'fwd:'].find(function (word) { return lower.indexOf(word) === 0; });
        const close = title.indexOf(']');
        if (prefix) title = title.slice(prefix.length).trim();
        else if (title.charAt(0) === '[' && close > 0 && close < 26) title = title.slice(close + 1).trim();
        else break;
      }
      return title || String(text || '');
    }

    function cardTitle(item) {
      const brief = item.brief || {};
      return brief.title || cleanSubject(item.title);
    }

    function formatMailboxBadge(item) {
      const raw = String(item.mailbox || item.source_account || '').trim().toLowerCase();
      if (!raw) {
        const m = /^\\[([a-z0-9._-]+?)(?:\\s+inbox)?\\]/i.exec(String(item.title || '').trim());
        if (m) return m[1].toLowerCase();
        return '';
      }
      const at = raw.indexOf('@');
      return at > 0 ? raw.slice(0, at + 1) : raw;
    }

    function cardAccent(item) {
      const brief = item.brief || {};
      const dueDays = daysUntil(brief.deadline || item.due);
      if (isUrgent(item) || (dueDays !== null && dueDays <= 0)) return 'urgent';
      if (isAutoResolvedCandidate(item)) return 'handled';
      if (brief.action === 'wait' || (brief.waiting_on && !/frank|mark|steve|katherine|shayan|shyon|dom|aries|office|us\\b/i.test(brief.waiting_on))) return 'waiting-them';
      return 'waiting-us';
    }

    const ACTION_LABELS = {
      reply: 'Reply', call: 'Call', invoice: 'Invoice', payment: 'Payment', review: 'Review',
      decide: 'Decide', wait: 'Waiting', file: 'File', close: 'Looks done', follow_up: 'Follow up',
    };
    const TASK_STOPPED = ['failed', 'timed_out', 'interrupted', 'cancelled'];

    function staleTask(task) {
      const asked = new Date(task.at).valueOf();
      return (task.status === 'queued' || task.status === 'running') && (!Number.isFinite(asked) || Date.now() - asked > 3 * 3600000);
    }

    function ariesState(item) {
      const owner = String(item.assignee || '').toLowerCase();
      const task = owner === 'aries' ? item.aries_task : item.prep;
      if (!task || !task.status || staleTask(task)) return null;
      const stopped = TASK_STOPPED.indexOf(task.status) >= 0;
      if (owner === 'aries') {
        if (task.status === 'ready') return { text: 'Aries finished', tone: 'ready', title: 'Aries finished ' + ago(task.finished_at || task.at) + '. Its note is on the card.' };
        if (stopped) return { text: 'Aries got stuck', tone: 'failed', title: 'Aries could not finish. The note on the card says why.' };
        return { text: task.status === 'running' ? 'Aries working' : 'Waiting for Aries', tone: 'working', title: 'Asked ' + ago(task.at) + '.' };
      }
      if (task.status === 'ready') return { text: 'Prep ready', tone: 'ready', title: 'Aries prepared this ' + ago(task.finished_at || task.at) + '. See its note on the card.' };
      if (stopped) return { text: 'Prep failed', tone: 'failed', title: 'Aries could not finish the prep. Ask it again.' };
      return { text: task.status === 'running' ? 'Aries prepping' : 'Prep queued', tone: 'working', title: 'Asked ' + ago(task.at) + '.' };
    }

    function sortDeadline(item) {
      const brief = item.brief || {};
      const due = ISO_DAY_PATTERN.test(String(item.due || '')) && item.status !== 'snoozed' ? item.due : '';
      const days = daysUntil(brief.deadline || due);
      return days !== null && days <= 7 ? days : null;
    }

    function whenChip(item) {
      const brief = item.brief || {};
      if (item.status === 'snoozed' && ISO_DAY_PATTERN.test(String(item.due || '').slice(0, 10))) {
        return { text: 'Back from snooze', tone: 'soon', title: 'Snoozed until ' + monthDay(item.due) };
      }
      const deadline = brief.deadline || (ISO_DAY_PATTERN.test(item.due || '') ? item.due : '');
      if (deadline) {
        const days = daysUntil(deadline);
        let text = 'Due ' + monthDay(deadline);
        let tone = 'plain';
        if (days !== null && days < 0) { text = 'Overdue since ' + monthDay(deadline); tone = 'late'; }
        else if (days === 0) { text = 'Due today'; tone = 'late'; }
        else if (days === 1) { text = 'Due tomorrow'; tone = 'late'; }
        else if (days !== null && days <= 7) { text = 'Due ' + monthDay(deadline) + ', in ' + days + ' days'; tone = 'soon'; }
        return { text: text, tone: tone, title: brief.deadline_note || '' };
      }
      const age = daysUntil(item.created || item.updated);
      if (age === null) return null;
      const open = Math.max(0, -age);
      return {
        text: open === 0 ? 'Opened today' : 'Open ' + open + (open === 1 ? ' day' : ' days'),
        tone: open >= 8 ? 'soon' : 'plain',
        title: 'Opened ' + monthDay(item.created || item.updated),
      };
    }

    function addHistory(item, what) {
      const entry = { at: new Date().toISOString(), who: 'You', what: what, ours: true, kind: 'action' };
      item.history = [entry].concat(Array.isArray(item.history) ? item.history : []);
    }

    function buildClaimCard(members, index) {
      const cached = groupNodes.get(members[0].claim_group);
      if (cached) {
        cached.querySelector('.claim-head h3').textContent = members[0].claim_label || cardTitle(members[0]);
        reconcileChildren(cached.querySelector('.claim-tasks'), members.map(function(item, at) { return buildCard(item,index+at); }));
        fillClaimCard(cached); return cached;
      }
      const group = document.createElement('section');
      group.className = 'claim-card';
      group.dataset.claim = members[0].claim_group;
      const head = document.createElement('header');
      head.className = 'claim-head';
      const headTop = document.createElement('div');
      headTop.className = 'claim-head-top';
      const name = document.createElement('h3');
      name.textContent = members[0].claim_label || cardTitle(members[0]);
      group.setAttribute('aria-label', 'Claim: ' + name.textContent);
      const count = document.createElement('p');
      count.className = 'claim-count';
      headTop.append(name, count);
      const facts = document.createElement('p');
      facts.className = 'facts';
      const numbers = [];
      members.forEach(function (item) {
        const claim = item.brief && item.brief.claim ? String(item.brief.claim) : '';
        const text = claim ? (/^(invoice|claim)/i.test(claim) ? claim : 'Claim ' + claim) : '';
        if (text && numbers.indexOf(text) < 0) numbers.push(text);
      });
      numbers.forEach(function (text) {
        const span = document.createElement('span');
        span.textContent = text;
        facts.append(span);
      });
      const actions = document.createElement('div');
      actions.className = 'claim-actions';
      const completeAllBtn = document.createElement('button');
      completeAllBtn.type = 'button';
      completeAllBtn.className = 'claim-action-btn done';
      completeAllBtn.dataset.claimAction = 'complete-all';
      completeAllBtn.addEventListener('click', async function () {
        const activeCards = Array.from(group.querySelectorAll('.card')).map(function (c) {
          return boardItems.find(function (row) { return String(row.id) === c.dataset.id; });
        }).filter(Boolean);
        if (!activeCards.length) return;
        completeAllBtn.disabled = true;
        try {
          for (const item of activeCards) {
            await postAction({ operation: 'done', id: item.id });
            item.status = 'done';
            item.pending = false;
          }
          render(boardItems);
          renderChecked();
          showToast('Completed all ' + activeCards.length + ' tasks for ' + name.textContent + '.', false);
        } catch (error) {
          showToast(error.message || 'Could not complete claim group', true);
          completeAllBtn.disabled = false;
        }
      });
      const assignAllSelect = document.createElement('select');
      assignAllSelect.className = 'claim-assign-all';
      assignAllSelect.setAttribute('aria-label', 'Assign all tasks for ' + name.textContent);
      assignAllSelect.addEventListener('change', async function () {
        const targetOwner = assignAllSelect.value;
        if (targetOwner === '__prompt__') return;
        const activeCards = Array.from(group.querySelectorAll('.card')).map(function (c) {
          return boardItems.find(function (row) { return String(row.id) === c.dataset.id; });
        }).filter(Boolean);
        assignAllSelect.disabled = true;
        try {
          for (const item of activeCards) {
            await postAction({ operation: 'assign', id: item.id, value: targetOwner });
            item.assignee = targetOwner;
            if (item.responsibility) item.responsibility.owner = targetOwner || null;
          }
          render(boardItems);
          showToast('Assigned ' + activeCards.length + ' tasks to ' + (targetOwner ? nameOf(targetOwner) : 'Unassigned') + '.', false);
        } catch (error) {
          showToast(error.message || 'Could not assign claim group', true);
        } finally {
          assignAllSelect.disabled = false;
          assignAllSelect.value = '__prompt__';
        }
      });
      const mergeBtn = document.createElement('button');
      mergeBtn.type = 'button';
      mergeBtn.className = 'claim-action-btn merge';
      mergeBtn.dataset.claimAction = 'merge-duplicates';
      mergeBtn.textContent = 'Merge & Close Older Duplicates';
      mergeBtn.addEventListener('click', async function () {
        const activeCards = Array.from(group.querySelectorAll('.card')).map(function (c) {
          return boardItems.find(function (row) { return String(row.id) === c.dataset.id; });
        }).filter(Boolean);
        if (activeCards.length < 2) return;
        const sorted = activeCards.slice().sort(function (a, b) { return b.id - a.id; });
        const newest = sorted[0];
        const older = sorted.slice(1);
        mergeBtn.disabled = true;
        try {
          for (const dup of older) {
            await postAction({ operation: 'note', id: dup.id, note: 'Merged into #' + newest.id + ' and closed as older duplicate.' });
            await postAction({ operation: 'done', id: dup.id });
            dup.status = 'done';
            dup.pending = false;
          }
          render(boardItems);
          renderChecked();
          showToast('Kept #' + newest.id + ' open and closed ' + older.length + ' older duplicate(s).', false);
        } catch (error) {
          showToast(error.message || 'Could not merge duplicates', true);
          mergeBtn.disabled = false;
        }
      });
      actions.append(completeAllBtn, assignAllSelect, mergeBtn);
      const list = document.createElement('div');
      list.className = 'claim-tasks';
      members.forEach(function (item, at) { list.append(buildCard(item, index + at)); });
      head.append(headTop, facts, actions);
      group.append(head, list);
      fillClaimCard(group);
      groupNodes.set(members[0].claim_group,group);
      return group;
    }

    function fillClaimCard(group) {
      const cards = group.querySelectorAll('.card');
      if (!cards.length) { group.remove(); return; }
      group.querySelector('.claim-count').textContent = cards.length + (cards.length === 1 ? ' open task' : ' open tasks');
      const completeBtn = group.querySelector('[data-claim-action="complete-all"]');
      if (completeBtn) completeBtn.textContent = '✓ Complete All (' + cards.length + ')';
      const mergeBtn = group.querySelector('[data-claim-action="merge-duplicates"]');
      if (mergeBtn) mergeBtn.hidden = cards.length < 2;
      const assignSelect = group.querySelector('.claim-assign-all');
      if (assignSelect && document.activeElement !== assignSelect) {
        assignSelect.replaceChildren(new Option('Assign All…', '__prompt__'), new Option('Unassigned', ''));
        teamList.concat([{ key: 'aries', name: 'Aries' }]).forEach(function (person) {
          assignSelect.append(new Option('Assign All: ' + person.name, person.key));
        });
        assignSelect.value = '__prompt__';
      }
      group.dataset.urgent = String(Array.prototype.some.call(cards, function (card) { return card.dataset.urgent === 'true'; }));
    }

    function buildCard(item, index) {
      const cached = cardNodes.get(String(item.id));
      if (cached) {
        if (!cached.contains(document.activeElement) && !cached.querySelector('.choices:not([hidden])')) fillCard(cached,item);
        else decorateCard(cached,item);
        return cached;
      }
      const fragment = template.content.cloneNode(true);
      const card = fragment.querySelector('.card');
      card.dataset.id = String(item.id);
      cardNodes.set(String(item.id),card);
      card.dataset.priority = String(item.priority || 'normal').toLowerCase();
      card.querySelector('[data-action="urgent"]').addEventListener('click', function (event) {
        toggleUrgent(card, item, event.currentTarget);
      });
      card.querySelector('[data-action="toggle"]').addEventListener('click', function (event) {
        event.stopPropagation();
        setCollapsed(card, item, card.dataset.collapsed !== 'true');
      });
      card.addEventListener('click', function (event) {
        if (card.dataset.collapsed === 'true' && !event.target.closest('a, button, input, select, label')) setCollapsed(card, item, false);
      });
      card.dataset.collapsed = String(!expandedCards.has(item.id));
      card.querySelector('.card-toggle').setAttribute('aria-expanded', String(expandedCards.has(item.id)));
      card.querySelector('.card-toggle').setAttribute('aria-label', expandedCards.has(item.id) ? 'Hide details' : 'Show details');
      card.dataset.status = String(item.status || 'open').toLowerCase();
      fragment.querySelector('.item-id').textContent = '#' + item.id;
      const cardLink = document.createElement('a');
      cardLink.className = 'card-action';
      cardLink.href = '/card?id=' + item.id;
      cardLink.textContent = 'Card link';
      cardLink.setAttribute('aria-label', 'Open card #' + item.id);
      fragment.querySelector('.actions').append(cardLink);

      card.querySelector('[data-action="done"]').addEventListener('click', function (event) {
        doneImmediate(card, item, event.currentTarget);
      });
      card.querySelector('[data-action="snooze"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'snooze', event.currentTarget);
      });
      card.querySelector('[data-action="email"]').addEventListener('click', function () {
        openThread(item);
      });
      card.querySelector('[data-action="more"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'more', event.currentTarget);
      });
      card.querySelector('[data-action="nudge"]').addEventListener('click', function (event) {
        nudgeOwner(card, item, event.currentTarget);
      });
      card.querySelector('[data-action="prep"]').addEventListener('click', function () {
        openAriesDialog(card, item, 'prep');
      });
      card.querySelector('[data-action="note"]').addEventListener('click', function () {
        noteItem = item;
        noteHost = card;
        document.querySelector('#note-target').textContent = '#' + item.id + ' · ' + cardTitle(item);
        noteText.value = '';
        noteDialog.showModal();
        noteText.focus();
      });
      const history = card.querySelector('.history');
      history.open = openHistory.has(item.id);
      history.addEventListener('toggle', function () {
        if (history.open) openHistory.add(item.id); else openHistory.delete(item.id);
      });
      fillCard(card, item);
      return card;
    }

    function fillCard(card, item) {
      const brief = item.brief || null;
      card.dataset.accent = cardAccent(item);
      const clientClaimChip = card.querySelector('.chip.client-claim');
      if (clientClaimChip) {
        const badgeParts = [];
        if (brief && brief.client) badgeParts.push(brief.client);
        if (brief && brief.claim) badgeParts.push(/^invoice/i.test(brief.claim) ? brief.claim : 'Claim ' + brief.claim);
        const badgeText = badgeParts.join(' · ');
        clientClaimChip.hidden = !badgeText;
        clientClaimChip.textContent = badgeText;
      }
      const mailboxChip = card.querySelector('.chip.mailbox');
      if (mailboxChip) {
        const mb = formatMailboxBadge(item);
        mailboxChip.hidden = !mb;
        mailboxChip.textContent = mb;
      }
      const emailBtn = card.querySelector('[data-action="email"]');
      if (emailBtn) {
        emailBtn.hidden = !threadIds.has(item.id);
      }
      const kind = card.querySelector('.kind');
      const resolved = isAutoResolvedCandidate(item);
      kind.textContent = resolved ? 'Handled in email' : (brief && ACTION_LABELS[brief.action] ? ACTION_LABELS[brief.action] : (item.kind || 'operations'));
      kind.dataset.act = resolved ? 'close' : (brief ? brief.action : '');
      card.querySelector('.chip.counsel').hidden = !(brief && brief.counsel_only);
      const state = ariesState(item);
      const stateChip = card.querySelector('.aries-state');
      stateChip.hidden = !state;
      if (state) {
        stateChip.textContent = state.text;
        stateChip.dataset.tone = state.tone;
        stateChip.title = state.title;
      }
      const chip = card.querySelector('.when');
      const when = whenChip(item);
      chip.hidden = !when;
      if (when) {
        chip.textContent = when.text;
        chip.dataset.tone = when.tone;
        chip.title = when.title;
      }
      const heading = card.querySelector('h3');
      heading.textContent = cardTitle(item);
      heading.title = heading.textContent !== item.title ? 'Email subject: ' + item.title : '';
      const urgent = isUrgent(item);
      card.dataset.urgent = String(urgent);
      const urgentButton = card.querySelector('[data-action="urgent"]');
      urgentButton.setAttribute('aria-pressed', String(urgent));
      urgentButton.textContent = urgent ? 'Urgent ✕' : 'Mark urgent';
      urgentButton.title = urgent ? 'Clear urgent' : 'Move this card to the top and have Aries email whoever must act now';

      const facts = card.querySelector('.facts');
      facts.textContent = '';
      if (brief) {
        const claim = brief.claim ? (/^invoice/i.test(brief.claim) ? brief.claim : 'Claim ' + brief.claim) : '';
        [brief.client, claim, brief.amount].forEach(function (text, at) {
          if (!text) return;
          const span = document.createElement('span');
          span.textContent = text;
          if (at === 0) span.className = 'fact-client';
          facts.append(span);
        });
      }
      card.querySelector('.needs').textContent = (brief && brief.needs) || item.summary || '';
      card.querySelector('.card-peek').textContent = (brief && (brief.next_step || brief.needs)) || item.summary || '';
      const ownerKey = String(item.assignee || '').toLowerCase();
      const hintKey = brief ? brief.owner_hint : '';
      const ownerParts = [ownerKey ? 'Owner: ' + (ownerKey === 'aries' ? 'Aries' : nameOf(ownerKey)) : 'No owner yet'];
      if (!ownerKey && hintKey) ownerParts.push('Aries suggests ' + nameOf(hintKey));
      if (brief && brief.waiting_on) {
        const waited = daysUntil(brief.waiting_since);
        ownerParts.push('Waiting on ' + brief.waiting_on + (waited !== null && waited < 0 ? ' for ' + (-waited) + (waited === -1 ? ' day' : ' days') : ''));
      }
      card.querySelector('.card-owner-line').textContent = ownerParts.join('. ');

      const waiting = card.querySelector('.waiting');
      const waitingText = waiting.querySelector('dd');
      waiting.hidden = !brief;
      waitingText.textContent = '';
      if (brief && !brief.waiting_on) waitingText.textContent = 'Nobody is waiting on us right now.';
      if (brief && brief.waiting_on) {
        waitingText.textContent = brief.waiting_on;
        const since = daysUntil(brief.waiting_since);
        if (since !== null) {
          const quiet = document.createElement('span');
          quiet.className = 'quiet';
          const count = Math.max(0, -since);
          quiet.textContent = ', since ' + monthDay(brief.waiting_since) + (count ? ' (' + count + (count === 1 ? ' day)' : ' days)') : '');
          waitingText.append(quiet);
        }
      }

      const lastText = card.querySelector('.last dd');
      lastText.textContent = '';
      const last = (Array.isArray(item.history) ? item.history : []).find(function (entry) { return entry.ours; });
      if (last) {
        const who = document.createElement('b');
        who.textContent = last.who;
        const quiet = document.createElement('span');
        quiet.className = 'quiet';
        quiet.textContent = ', ' + ago(last.at);
        lastText.append(who, document.createTextNode(' ' + last.what), quiet);
      } else {
        lastText.textContent = 'Nobody yet.';
        if (item.created) {
          const quiet = document.createElement('span');
          quiet.className = 'quiet';
          quiet.textContent = ' Card opened ' + monthDay(item.created) + '.';
          lastText.append(quiet);
        }
      }

      fillDoThis(card, item);
      fillOwners(card, item);
      fillNudge(card, item);
      fillPrep(card, item);
      fillHistory(card, item);
      decorateCard(card, item);
    }

    function doButton(label, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'do-button';
      button.textContent = label;
      button.addEventListener('click', function () { onClick(button); });
      return button;
    }

    function fillDoThis(card, item) {
      const brief = item.brief || null;
      const section = card.querySelector('.do-this');
      const counsel = Boolean(brief && brief.counsel_only);
      section.dataset.act = counsel ? 'legal' : (brief ? brief.action : 'none');
      section.querySelector('.do-counsel').textContent = counsel ? 'Counsel only. No direct contact with this party.' : '';
      section.querySelector('.do-text').textContent = brief ? brief.next_step : '';
      const buttons = section.querySelector('.do-buttons');
      buttons.textContent = '';
      const owner = String(item.assignee || '').toLowerCase();
      const hint = brief ? brief.owner_hint : '';
      if (brief && brief.action === 'close') {
        buttons.append(doButton('Mark done', function (button) { doneImmediate(card, item, button); }));
      }
      if (hint && hint !== owner && !(brief && brief.action === 'close')) {
        buttons.append(doButton('Hand to ' + nameOf(hint), function (button) { assignTo(card, item, hint, button); }));
      }
      if (brief && brief.action === 'call' && brief.phone && !counsel) {
        const call = document.createElement('a');
        call.className = 'do-button';
        call.href = 'tel:' + brief.phone.replace(/[^0-9+]/g, '');
        call.textContent = 'Call ' + brief.phone;
        buttons.append(call);
      }
      if (brief && brief.action === 'wait') {
        const until = isoDayFromNow(3);
        buttons.append(doButton('Still waiting, check again ' + monthDay(until), function (button) {
          markWaiting(card, item, until, button);
        }));
      }
      if (threadIds.has(item.id)) {
        buttons.append(doButton('Open email', function () { openThread(item); }));
      }
      if (buttons.firstElementChild) buttons.firstElementChild.classList.add('primary');
      section.hidden = !brief && !buttons.childElementCount;
    }

    function fillOwners(card, item) {
      const row = card.querySelector('.owner-row');
      let select = row.querySelector('select');
      if (!select) {
        select = document.createElement('select'); select.className = 'owner-select';
        select.setAttribute('aria-label','Owner for card #'+item.id);
        select.addEventListener('change',function () {
          if (select.value === 'aries') { openAriesDialog(card,item,'assign'); select.value=String(item.assignee||'').toLowerCase(); }
          else assignTo(card,item,select.value,select);
        }); row.append(select);
      }
      if (document.activeElement !== select) {
        const owner=String(item.assignee||'').toLowerCase();
        const people=[{key:'',name:'Unassigned'}].concat(teamList,[{key:'aries',name:'Aries (delegate work)'}]);
        if(owner && !people.some(function(person){return person.key===owner;}))people.push({key:owner,name:nameOf(owner)});
        select.replaceChildren();people.forEach(function(person){select.append(new Option(person.name,person.key));});select.value=owner;
      }
      const hint=(item.brief||{}).owner_hint;
      card.querySelector('.owner-hint').textContent=hint && hint!==item.assignee?'Suggested owner: '+nameOf(hint)+'. Preparation is separate below.':'Owner is accountable. Preparation by Aries keeps this owner.';
    }

    function fillHistory(card, item) {
      const history = Array.isArray(item.history) ? item.history : [];
      const details = card.querySelector('.history');
      details.hidden = !history.length;
      details.querySelector('summary').textContent = 'History (' + history.length + ')';
      const list = details.querySelector('.history-list');
      list.textContent = '';
      history.forEach(function (entry) {
        const row = document.createElement('li');
        row.className = 'history-entry' + (entry.ours ? '' : ' theirs');
        const time = document.createElement('time');
        time.dateTime = entry.at;
        time.textContent = whenShort(entry.at);
        const text = document.createElement('span');
        text.className = 'history-text';
        const who = document.createElement('b');
        who.textContent = entry.who;
        text.append(who, document.createTextNode(' ' + entry.what));
        row.append(time, text);
        list.append(row);
      });
    }

    function urgentTarget(item) {
      const owner = String(item.assignee || '').toLowerCase();
      if (owner && owner !== 'aries') return nameOf(owner);
      const hint = item.brief ? item.brief.owner_hint : '';
      return hint ? nameOf(hint) : 'Frank';
    }

    function toggleUrgent(card, item, button) {
      const turningOn = !isUrgent(item);
      submitAction(button, { operation: 'urgent', id: item.id, value: turningOn ? 'on' : 'off' }, function (command) {
        if (turningOn) item.urgent = command.created_at || new Date().toISOString();
        else delete item.urgent;
        addHistory(item, turningOn ? 'marked it urgent' : 'cleared urgent');
        render(boardItems);
      }, turningOn ? 'Marked urgent. It is at the top, and Aries emails ' + urgentTarget(item) + ' now.' : 'No longer urgent.');
    }

    function renderSnoozed() {
      const holder = document.querySelector('#snoozed-list');
      const resting = boardItems.filter(isResting).sort(function (left, right) {
        return String(left.due).localeCompare(String(right.due));
      });
      holder.hidden = !resting.length;
      holder.querySelector('summary').textContent = 'Snoozed (' + resting.length + '). Each one comes back on its date.';
      const rows = holder.querySelector('.snoozed-rows');
      rows.replaceChildren();
      resting.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'checked-row';
        const text = document.createElement('span');
        text.className = 'worklist-text';
        text.textContent = '#' + item.id + ' · ' + cardTitle(item) + ' · back ' + monthDay(item.due);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'card-action';
        back.textContent = 'Bring back now';
        back.addEventListener('click', function (event) {
          submitAction(event.currentTarget, { operation: 'reopen', id: item.id }, function () {
            addHistory(item, 'requested reopening');
            back.textContent = commandReceiptText(item.command_receipt);
          }, 'Back on the board.');
        });
        row.append(text, back);
        rows.append(row);
      });
    }

    const NUDGE_GAP_MS = 3600000;

    function lastNudge(item) {
      return (Array.isArray(item.history) ? item.history : []).find(function (entry) {
        return entry.kind === 'action' && entry.what.indexOf('for an update') >= 0;
      }) || null;
    }

    function fillNudge(card, item) {
      const row = card.querySelector('.nudge-row');
      const owner = String(item.assignee || '').toLowerCase();
      row.hidden = !owner || owner === 'aries';
      if (row.hidden) return;
      const button = row.querySelector('.nudge-button');
      const note = row.querySelector('.nudge-note');
      const last = lastNudge(item);
      const recent = last && Date.now() - new Date(last.at).valueOf() < NUDGE_GAP_MS;
      button.textContent = 'Nudge ' + nameOf(owner) + ' for an update';
      button.disabled = Boolean(recent);
      button.title = 'Aries emails ' + nameOf(owner) + ' that you are asking where this stands, and copies you';
      note.textContent = last ? 'Last nudged ' + ago(last.at) + (recent ? '. You can nudge again in an hour.' : '.') : '';
    }

    function nudgeOwner(card, item, button) {
      const owner = String(item.assignee || '').toLowerCase();
      if (!owner) return;
      submitAction(button, { operation: 'nudge', id: item.id, value: owner }, function () {
        addHistory(item, 'asked ' + nameOf(owner) + ' for an update');
        fillCard(card, item);
      }, 'Nudged ' + nameOf(owner) + '. Aries emails them now and copies you.').then(function () {
        fillNudge(card, item);
      });
    }

    const PREP_GAP_MS = 2 * 3600000;

    function lastPrep(item) {
      return (Array.isArray(item.history) ? item.history : []).find(function (entry) {
        return entry.kind === 'action' && entry.what.indexOf('asked Aries to prep') === 0;
      }) || null;
    }

    function fillPrep(card, item) {
      const row = card.querySelector('.prep-row');
      const owner = String(item.assignee || '').toLowerCase();
      row.hidden = !owner || owner === 'aries';
      if (row.hidden) return;
      const last = lastPrep(item);
      const task = item.prep && item.prep.status && !staleTask(item.prep) ? item.prep : null;
      const stopped = Boolean(task && TASK_STOPPED.indexOf(task.status) >= 0);
      const working = task
        ? task.status === 'queued' || task.status === 'running'
        : Boolean(last && Date.now() - new Date(last.at).valueOf() < PREP_GAP_MS);
      const button = row.querySelector('.prep-button');
      if (working) button.textContent = '♈ Aries is prepping: add an instruction';
      else if (stopped) button.textContent = '♈ Prep did not finish: ask Aries again';
      else if (task && task.status === 'ready') button.textContent = '♈ Ask Aries to prep it again';
      else button.textContent = '♈ Have Aries prep this for ' + nameOf(owner);
      button.title = nameOf(owner) + ' keeps the card. Aries reads the email, gathers what ' + nameOf(owner) + ' needs and drafts replies for review.';
      let prepNote = last ? 'Asked ' + ago(last.at) + '.' : '';
      if (task && task.status === 'queued') prepNote = 'Asked ' + ago(task.at) + '. Waiting its turn.';
      if (task && task.status === 'running') prepNote = 'Asked ' + ago(task.at) + '. Aries is on it now.';
      if (task && task.status === 'ready') prepNote = 'Ready ' + ago(task.finished_at || task.at) + '. The prep is in the notes on this card.';
      if (stopped) prepNote = 'Stopped ' + ago(task.finished_at || task.at) + '. The note on the card says why.';
      row.querySelector('.prep-note').textContent = prepNote;
    }

    const ariesDialog = document.querySelector('#aries-dialog');
    const ariesText = document.querySelector('#aries-text');
    const ARIES_LABEL = document.querySelector('#aries-label').textContent;
    const ARIES_HINT = document.querySelector('#aries-hint').textContent;
    const ARIES_PLACEHOLDER = ariesText.placeholder;
    let ariesCard = null;
    let ariesItem = null;
    let ariesMode = 'assign';

    function openAriesDialog(card, item, mode) {
      ariesCard = card;
      ariesItem = item;
      ariesMode = mode === 'prep' ? 'prep' : 'assign';
      const owner = String(item.assignee || '').toLowerCase();
      const heading = document.querySelector('#aries-heading');
      const submit = document.querySelector('#aries-submit');
      let already = owner === 'aries';
      if (ariesMode === 'prep') {
        const last = lastPrep(item);
        already = Boolean(last && Date.now() - new Date(last.at).valueOf() < PREP_GAP_MS);
        heading.textContent = already ? 'Give Aries a new instruction for this prep' : 'Aries preps this for ' + nameOf(owner);
        document.querySelector('#aries-label').textContent = 'What should Aries get ready for ' + nameOf(owner) + '?' + (already ? '' : ' (optional)');
        document.querySelector('#aries-hint').textContent = nameOf(owner) + ' keeps the card. Aries reads the email, gathers the facts and documents ' + nameOf(owner) + ' needs, drafts replies for review, and writes what it prepared on this card. It never sends anything outside the company.';
        ariesText.placeholder = 'Example: pull the invoice and photos, and draft the reply to the adjuster.';
        submit.textContent = already ? 'Send to Aries' : 'Start prep';
      } else {
        heading.textContent = already ? 'Give Aries a new instruction' : 'Assign to Aries';
        document.querySelector('#aries-label').textContent = ARIES_LABEL;
        document.querySelector('#aries-hint').textContent = ARIES_HINT;
        ariesText.placeholder = ARIES_PLACEHOLDER;
        submit.textContent = already ? 'Send to Aries' : 'Give it to Aries';
      }
      document.querySelector('#aries-target').textContent = '#' + item.id + ' · ' + cardTitle(item);
      ariesText.value = '';
      ariesText.required = already;
      ariesDialog.showModal();
      ariesText.focus();
    }

    async function prepForOwner(card, item, instruction) {
      const owner = String(item.assignee || '').toLowerCase();
      const submit = document.querySelector('#aries-submit');
      submit.disabled = true;
      try {
        if (instruction) {
          const command = await postAction({ operation: 'note', id: item.id, note: 'For Aries: ' + instruction });
          item.notes = (Array.isArray(item.notes) ? item.notes : []).concat([{ text: 'For Aries: ' + instruction, by: command.actor_email || '', at: command.created_at || '', pending: true }]);
          addHistory(item, 'wrote: For Aries: ' + instruction);
        }
        await postAction({ operation: 'prep', id: item.id, value: owner });
        addHistory(item, 'asked Aries to prep it for ' + nameOf(owner));
        ariesDialog.close();
        if (card.isConnected) fillCard(card, item);
        showToast(commandReceiptText(item.command_receipt)+'. Preparation has been requested.', false);
      } catch (error) {
        showToast(error.message || 'Could not start the prep', true);
      } finally {
        submit.disabled = false;
      }
    }

    async function giveToAries(card, item, instruction) {
      const submit = document.querySelector('#aries-submit');
      submit.disabled = true;
      try {
        if (instruction) {
          const command = await postAction({ operation: 'note', id: item.id, note: 'For Aries: ' + instruction });
          item.notes = (Array.isArray(item.notes) ? item.notes : []).concat([{ text: 'For Aries: ' + instruction, by: command.actor_email || '', at: command.created_at || '', pending: true }]);
          addHistory(item, 'wrote: For Aries: ' + instruction);
        }
        await postAction({ operation: 'assign', id: item.id, value: 'aries' });
        addHistory(item, 'requested assignment to Aries');
        ariesDialog.close();
        if (card.isConnected) fillCard(card, item);
        refreshBoardChrome();
        showToast(commandReceiptText(item.command_receipt)+'. Awaiting application by Aries.', false);
      } catch (error) {
        showToast(error.message || 'Could not give it to Aries', true);
      } finally {
        submit.disabled = false;
      }
    }

    document.querySelector('#aries-form').addEventListener('submit', function (event) {
      event.preventDefault();
      if (!ariesItem) return;
      if (ariesMode === 'prep') prepForOwner(ariesCard, ariesItem, ariesText.value.trim());
      else giveToAries(ariesCard, ariesItem, ariesText.value.trim());
    });
    document.querySelector('#aries-cancel').addEventListener('click', function () { ariesDialog.close(); });

    function closeChoices(card) {
      const panel = card.querySelector('.choices');
      panel.hidden = true;
      panel.textContent = '';
      card.querySelectorAll('.actions [aria-expanded]').forEach(function (button) {
        button.setAttribute('aria-expanded', 'false');
      });
    }

    function choice(label, onClick, danger) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice' + (danger ? ' danger' : '');
      button.textContent = label;
      button.addEventListener('click', function () { onClick(button); });
      return button;
    }

    // 1-Click Done with optimistic UI removal and 5-second Undo toast
    async function doneImmediate(card, item, button) {
      if (button) button.disabled = true;
      const previousStatus = item.status || 'open';
      item.status = 'done';
      item.pending = false;
      closeChoices(card);
      card.remove();
      refreshBoardChrome();
      renderChecked();
      try {
        await postAction({ operation: 'done', id: item.id });
        item.status = 'done';
        item.pending = false;
        showToast('Marked #' + item.id + ' done', false, async function () {
          try {
            await postAction({ operation: 'reopen', id: item.id });
            item.status = 'open';
            item.pending = false;
            render(boardItems);
            renderChecked();
            showToast('Reopened #' + item.id + '.', false);
          } catch (undoErr) {
            showToast(undoErr.message || 'Could not undo', true);
          }
        });
      } catch (error) {
        item.status = previousStatus;
        render(boardItems);
        renderChecked();
        showToast(error.message || 'Could not mark it done', true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    function toggleChoices(card, item, kind, trigger) {
      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
      closeChoices(card);
      if (wasOpen) return;
      trigger.setAttribute('aria-expanded', 'true');
      const panel = card.querySelector('.choices');
      const label = document.createElement('p');
      label.className = 'choices-label';
      const row = document.createElement('div');
      row.className = 'choice-row';
      panel.append(label, row);
      if (kind === 'snooze') {
        label.textContent = 'Bring it back on:';
        [['Tomorrow', 1], ['In 3 days', 3], ['Next Monday', daysToNextMonday()]].forEach(function (pair) {
          const day = isoDayFromNow(pair[1]);
          row.append(choice(pair[0] + ' (' + monthDay(day) + ')', function (button) { snoozeTo(card, item, day, button); }));
        });
        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'choice-date';
        picker.min = isoDayFromNow(1);
        picker.value = isoDayFromNow(7);
        picker.setAttribute('aria-label', 'Snooze until a date');
        row.append(picker, choice('Snooze to this date', function (button) {
          if (!ISO_DAY_PATTERN.test(picker.value)) { showToast('Pick a date first.', true); return; }
          snoozeTo(card, item, picker.value, button);
        }));
      } else {
        label.textContent = 'Done with note or other actions:';
        DONE_REASONS.forEach(function (pair) {
          row.append(choice('✓ ' + pair[1], function (button) { doneWithReason(card, item, pair[0], button); }));
        });
        if (item.assignee) {
          row.append(choice('Clear the owner', function (button) { assignTo(card, item, '', button); }));
        }
        row.append(choice('\u{1F44D} Worth a card', function (button) {
          submitAction(button, { operation: 'useful', id: item.id }, function () {
            addHistory(item, 'said it was worth a card');
            closeChoices(card);
            fillCard(card, item);
          });
        }));
        row.append(choice('\u{1F44E} Not a task', function (button) {
          if (!window.confirm('Tell Aries to stop making tasks out of emails like this one?\\n\\n' + item.title)) return;
          submitAction(button, { operation: 'not_useful', id: item.id }, function () {
            closeChoices(card);
            fillCard(card, item);
            refreshBoardChrome();
          });
        }));
        row.append(choice('Delete', function (button) {
          if (!window.confirm('Delete #' + item.id + ' permanently? ' + item.title)) return;
          submitAction(button, { operation: 'delete', id: item.id }, function () {
            closeChoices(card);
            fillCard(card, item);
            refreshBoardChrome();
          });
        }, true));
      }
      panel.hidden = false;
      const first = row.querySelector('button');
      if (first) first.focus();
    }

    function assignTo(card, item, person, button) {
      const message = person === 'aries'
        ? 'Assigned to Aries. It starts within a few minutes and writes what it did on the card.'
        : person
          ? 'Assigned to ' + nameOf(person) + '. Aries emails ' + nameOf(person) + ' about it.'
          : 'Owner cleared.';
      submitAction(button, { operation: 'assign', id: item.id, value: person }, function () {
        item.assignee = person;
        if (item.responsibility) item.responsibility.owner = person || null;
        addHistory(item, person ? 'requested assignment to ' + nameOf(person) : 'requested clearing the owner');
        closeChoices(card);
        if (!inView(item)) card.remove();
        else fillCard(card, item);
        refreshBoardChrome();
      }, message);
    }

    function snoozeTo(card, item, day, button) {
      submitAction(button, { operation: 'snooze', id: item.id, value: day }, function () {
        item.status = 'snoozed';
        item.due = day;
        item.pending = false;
        addHistory(item, 'requested snooze to ' + monthDay(day));
        closeChoices(card);
        if (isResting(item)) {
          card.remove();
          refreshBoardChrome();
        } else {
          fillCard(card, item);
        }
      }, 'Snoozed to ' + monthDay(day) + '. It leaves the board until then.');
    }

    async function doneWithReason(card, item, reason, button) {
      button.disabled = true;
      try {
        await postAction({ operation: 'note', id: item.id, note: 'Done: ' + reason + '.' });
        await postAction({ operation: 'done', id: item.id });
        item.status = 'done';
        item.pending = false;
        closeChoices(card);
        card.remove();
        refreshBoardChrome();
        renderChecked();
        showToast(commandReceiptText(item.command_receipt)+'. Completion requested: '+reason+'.', false);
      } catch (error) {
        button.disabled = false;
        showToast(error.message || 'Could not mark it done', true);
      }
    }

    async function markWaiting(card, item, day, button) {
      const who = (item.brief && item.brief.waiting_on) || 'the other side';
      button.disabled = true;
      try {
        await postAction({ operation: 'note', id: item.id, note: 'Still waiting on ' + who + '. Check again ' + monthDay(day) + '.' });
        await postAction({ operation: 'snooze', id: item.id, value: day });
        addHistory(item, 'requested a check on ' + monthDay(day) + ' while waiting on ' + who);
        fillCard(card, item);
        showToast(commandReceiptText(item.command_receipt)+'. Return date requested: '+monthDay(day)+'.', false);
      } catch (error) {
        button.disabled = false;
        showToast(error.message || 'Could not mark it waiting', true);
      }
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
      todoSyncStatus.textContent = 'Saved.';
      await loadTodos();
    }

    function todoUrgent(item) {
      return item.urgent === true || String(item.text || '').indexOf('URGENT: ') === 0;
    }

    function todoText(item) {
      const text = String(item.text || '');
      return text.indexOf('URGENT: ') === 0 ? text.slice(8) : text;
    }

    function fullDate(value) {
      const text = String(value || '');
      if (ISO_DAY_PATTERN.test(text)) {
        const parts = text.split('-').map(Number);
        return parts[1] + '/' + parts[2] + '/' + parts[0];
      }
      const date = new Date(text);
      if (Number.isNaN(date.valueOf())) return text;
      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
    }

    function todoOwner(value) {
      const wanted = String(value || '').trim().toLowerCase();
      if (wanted === 'aries') return 'Aries';
      const person = teamList.find(function (entry) { return entry.key === wanted || entry.name.toLowerCase() === wanted; });
      return person ? person.name : String(value || '');
    }

    function todoOwnerKey(value) {
      const wanted = String(value || '').trim().toLowerCase();
      if (!wanted || wanted === 'aries') return wanted;
      const person = teamList.find(function (entry) { return entry.key === wanted || entry.name.toLowerCase() === wanted; });
      return person ? person.key : '';
    }

    const TODO_PREP_LABELS = {
      queued: ['Aries prep queued', 'aries'],
      running: ['Aries prepping', 'aries'],
      ready: ['Aries prep ready', 'aries'],
      failed: ['Aries prep failed', 'failed'],
    };

    const TODO_NICKNAMES = {
      tom: 'thomas', tommy: 'thomas', mike: 'michael', bob: 'robert', bobby: 'robert', rob: 'robert',
      bill: 'william', will: 'william', jim: 'james', jen: 'jennifer', jenny: 'jennifer',
      liz: 'elizabeth', beth: 'elizabeth', dave: 'david', dan: 'daniel', steve: 'steven',
      kate: 'katherine', katie: 'katherine', sue: 'susan', joe: 'joseph', nick: 'nicholas',
      matt: 'matthew', tony: 'anthony', andy: 'andrew', rick: 'richard', ben: 'benjamin',
    };
    const TODO_TITLES = { mr:1, mrs:1, ms:1, miss:1, dr:1, commander:1, cdr:1, capt:1, col:1, jr:1, sr:1 };

    function parseTodoClientTokens(raw) {
      const text = String(raw || '').toLowerCase().replace(/\\([^)]*\\)/g, ' ').replace(/[^a-z,&+/ -]+/g, ' ').replace(/\\s+/g, ' ').trim();
      if (!text || text === 'unidentified matter' || text === 'unknown' || text === 'general') return null;
      const chunks = text.split(/\\s*(?:&|\\+|\\/|\\band\\b)\\s*/).filter(Boolean);
      const people = [];
      chunks.forEach(function (chunk) {
        const pieces = chunk.split(/\\s*,\\s*/).filter(Boolean);
        const normalized = (pieces.length === 2 && pieces[0].indexOf(' ') < 0 && pieces[1].split(' ').length <= 2)
          ? (pieces[1] + ' ' + pieces[0])
          : pieces.join(' ');
        const words = normalized.split(/\\s+/).filter(function (w) { return w && !TODO_TITLES[w]; });
        if (!words.length) return;
        if (words.length === 1) {
          people.push({ first: '', last: words[0] });
        } else {
          const first = TODO_NICKNAMES[words[0]] || words[0];
          const last = words[words.length - 1];
          people.push({ first: first, last: last });
        }
      });
      if (people.length > 1 && people[people.length - 1].last) {
        const sharedLast = people[people.length - 1].last;
        people.forEach(function (p) { if (!p.first) { p.first = TODO_NICKNAMES[p.last] || p.last; p.last = sharedLast; } });
      }
      return people.length ? people : null;
    }

    function groupTodoItemsByClient(items) {
      const surnameBuckets = new Map();
      const parsedByItem = new Map();
      items.forEach(function (item) {
        const rawLabel = String(item.client || item.section || '').trim();
        const parsed = parseTodoClientTokens(rawLabel);
        parsedByItem.set(item.id, { rawLabel: rawLabel || 'Unidentified matter', parsed: parsed });
        if (parsed && parsed.length) {
          const surname = parsed[parsed.length - 1].last;
          if (surname && surname.length >= 2) {
            if (!surnameBuckets.has(surname)) surnameBuckets.set(surname, []);
            surnameBuckets.get(surname).push(item);
          }
        }
      });
      const sections = new Map();
      items.forEach(function (item) {
        const info = parsedByItem.get(item.id);
        let key = 'unidentified';
        let label = info.rawLabel || 'Unidentified matter';
        if (info.parsed && info.parsed.length) {
          const surname = info.parsed[info.parsed.length - 1].last;
          const bucket = surnameBuckets.get(surname) || [item];
          key = 'client:' + surname;
          const candidates = bucket.map(function (b) { return String(b.client || b.section || '').trim(); }).filter(Boolean);
          candidates.sort(function (a, b) { return b.length - a.length; });
          if (candidates.length) label = candidates[0];
        } else if (info.rawLabel && info.rawLabel.toLowerCase() !== 'unidentified matter') {
          key = 'section:' + info.rawLabel.toLowerCase();
          label = info.rawLabel;
        }
        if (!sections.has(key)) sections.set(key, { key: key, label: label, items: [] });
        sections.get(key).items.push(item);
      });
      return Array.from(sections.values()).sort(function (a, b) {
        if (a.key === 'unidentified') return 1;
        if (b.key === 'unidentified') return -1;
        const aUrg = a.items.some(todoUrgent) ? 1 : 0;
        const bUrg = b.items.some(todoUrgent) ? 1 : 0;
        if (bUrg !== aUrg) return bUrg - aUrg;
        return a.label.localeCompare(b.label);
      });
    }

    let currentTodos = [];
    function renderTodos(items) {
      currentTodos = items;
      const restoreFocus=rememberFocus();
      const existingTodos=new Map(Array.from(todoList.querySelectorAll('[data-task-id]')).map(function(row){return [row.dataset.taskId,row];}));
      const completedCount = items.filter(function (item) { return Boolean(item.done); }).length;
      const toggleCompletedBtn = document.querySelector('#toggle-completed-todos');
      if (toggleCompletedBtn) {
        toggleCompletedBtn.textContent = (showCompletedTodos ? 'Hide completed (' : 'Show completed (') + completedCount + ')';
        toggleCompletedBtn.setAttribute('aria-pressed', String(showCompletedTodos));
      }
      const visibleItems = items.filter(function (item) {
        if (item.archived && !showCompletedTodos) return false;
        if (item.done && !showCompletedTodos) return false;
        return true;
      }).slice().sort(function (left, right) { return Number(todoUrgent(right)) - Number(todoUrgent(left)); });

      todoList.replaceChildren();
      if (!visibleItems.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        const title = document.createElement('strong');
        title.textContent = completedCount && !showCompletedTodos ? 'All active tasks are complete.' : 'No active team tasks.';
        const detail = document.createElement('span');
        detail.textContent = completedCount && !showCompletedTodos ? 'Use Show completed above to review finished items.' : 'Add one here or let Aries publish the next catalogue.';
        empty.append(title, detail);
        todoList.append(empty);
        todoList.setAttribute('aria-busy', 'false');
        restoreFocus();
        handleTodoLink();
        return;
      }

      const groupedSections = groupTodoItemsByClient(visibleItems);
      const sectionNodes = groupedSections.map(function (group) {
        const sectionEl = document.createElement('section');
        sectionEl.className = 'todo-section';
        const headEl = document.createElement('header');
        headEl.className = 'todo-section-head';
        const h4 = document.createElement('h3');
        h4.className = 'todo-section-title';
        h4.textContent = group.label;
        const countSpan = document.createElement('span');
        countSpan.className = 'todo-section-count';
        countSpan.textContent = group.items.length + (group.items.length === 1 ? ' task' : ' tasks');
        headEl.append(h4, countSpan);
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'todo-section-items';

        group.items.forEach(function (item) {
          const row = document.createElement('article');
          row.className = 'todo-row';
          row.dataset.taskId=String(item.id);
          row.dataset.signature=JSON.stringify(item);
          row.dataset.done = String(Boolean(item.done));
          row.dataset.archived = String(Boolean(item.archived));
          row.dataset.urgent = String(todoUrgent(item) && !item.done);

          const toggle = document.createElement('button');
          toggle.className = 'todo-toggle';
          toggle.type = 'button';
          toggle.setAttribute('aria-label', (item.done ? 'Reopen ' : 'Complete ') + todoText(item));
          toggle.setAttribute('aria-pressed', String(Boolean(item.done)));
          toggle.textContent = item.done ? '✓' : '○';
          toggle.addEventListener('click', function () {
            toggle.disabled = true;
            submitTodoAction(item.id, 'toggle', { done: !(currentTodos.find(function(current){return current.id===item.id;})||item).done }).catch(function (error) {
              showToast(error.message || 'Unable to update task', true);
              toggle.disabled = false;
            });
          });

          const copy = document.createElement('div');
          copy.className = 'todo-copy';
          const title = document.createElement('h3');
          title.textContent = todoText(item);
          const details = document.createElement('p');
          details.textContent = item.details || '';
          const meta = document.createElement('div');
          meta.className = 'todo-meta';
          const dueIn = item.due ? daysUntil(String(item.due).slice(0, 10)) : null;
          const received = item.notificationDate ? daysUntil(String(item.notificationDate).slice(0, 10)) : null;
          const prepLabel = TODO_PREP_LABELS[item.ariesPrep];
          const prep = prepLabel && item.ariesPrepFor && item.ariesPrep !== 'failed'
            ? [prepLabel[0] + ' for ' + todoOwner(item.ariesPrepFor), prepLabel[1]]
            : prepLabel;
          [
            todoUrgent(item) ? ['Urgent', 'urgent'] : null,
            [item.assignee ? 'Owner: ' + todoOwner(item.assignee) : 'No owner yet', ''],
            item.client ? ['Client: ' + item.client, ''] : null,
            item.sourceAccount ? ['Mailbox: ' + item.sourceAccount, ''] : null,
            item.due ? ['Due ' + fullDate(item.due), dueIn !== null && dueIn <= 1 ? 'late' : ''] : null,
            item.notificationDate ? ['Received ' + fullDate(item.notificationDate)
              + (received !== null && received < 0 ? ', ' + (-received) + (received === -1 ? ' day ago' : ' days ago') : ''), ''] : null,
            prep ? prep : null,
            item.snoozedUntil ? ['Snoozed until ' + fullDate(item.snoozedUntil), ''] : null,
            item.archived ? ['Archived', ''] : null,
          ].filter(Boolean).forEach(function (entry) {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = entry[0];
            if (entry[1]) chip.dataset.tone = entry[1];
            meta.append(chip);
          });
          copy.append(title, details, meta);

          const actions = document.createElement('div');
          actions.className = 'todo-actions';
          const assign = document.createElement('select');
          assign.setAttribute('aria-label', 'Owner of ' + todoText(item));
          [{ key: '', name: 'No owner' }].concat(teamList, [{ key: 'aries', name: 'Aries' }]).forEach(function (person) {
            const option = document.createElement('option');
            option.value = person.key;
            option.textContent = person.key ? 'Owner: ' + person.name : 'No owner';
            assign.append(option);
          });
          assign.value = todoOwnerKey(item.assignee);
          assign.addEventListener('change', function () {
            assign.disabled = true;
            submitTodoAction(item.id, 'assign', { assignee: assign.value }).catch(function (error) {
              showToast(error.message || 'Unable to change the owner', true);
              assign.disabled = false;
            });
          });
          const snooze = document.createElement('select');
          snooze.setAttribute('aria-label', 'Snooze ' + todoText(item));
          [['', 'Snooze'], ['1', 'Until tomorrow'], ['monday', 'Until Monday'], ['7', 'For a week'], ['14', 'For two weeks']].forEach(function (entry) {
            const option = document.createElement('option');
            option.value = entry[0];
            option.textContent = entry[1];
            snooze.append(option);
          });
          snooze.addEventListener('change', function () {
            if (!snooze.value) return;
            const until = isoDayFromNow(snooze.value === 'monday' ? daysToNextMonday() : Number(snooze.value));
            snooze.disabled = true;
            submitTodoAction(item.id, 'snooze', { until: until }).catch(function (error) {
              showToast(error.message || 'Unable to snooze', true);
              snooze.disabled = false;
            });
          });
          actions.append(assign, snooze);
          if (/^https:[/][/]/.test(String(item.sourceUrl || ''))) {
            const source = document.createElement('a');
            source.href = item.sourceUrl;
            source.target = '_blank';
            source.rel = 'noopener';
            source.textContent = 'Open email';
            actions.append(source);
          }
          row.append(toggle, copy, actions);
          const previous=existingTodos.get(String(item.id));
          itemsContainer.append(previous && (previous.dataset.signature===row.dataset.signature || (previous.contains(document.activeElement) && !previous.querySelector(':disabled'))) ? previous : row);
        });
        sectionEl.append(headEl, itemsContainer);
        return sectionEl;
      });
      reconcileChildren(todoList, sectionNodes);
      todoList.setAttribute('aria-busy', 'false');
      restoreFocus();
      handleTodoLink();
    }

    async function loadTodos() {
      todoList.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/todos?active_only=1', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('To-Do request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        todoSyncStatus.textContent = payload.stale && payload.stale.is_stale
          ? 'Last known list. Aries has not refreshed it in the last few minutes.'
          : 'Catalogue snapshot received. Source tasks may have older evidence.';
        const catalogue=Array.isArray(payload.items)?payload.items:[];
        todoSyncStatus.textContent += ' '+catalogue.length+' catalogue tasks, '+catalogue.filter(function(item){return !item.done;}).length+' open. This is a separate collection from Board.';
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
      const showingChecked = view === 'checked';
      const showingUsers = view === 'users';
      const showingMine = view === 'mine';
      const showingExceptions = view === 'exceptions';
      document.querySelector('#show-exceptions').setAttribute('aria-pressed', String(showingExceptions));
      const showingBoard = !showingExceptions && !showingTodos && !showingWorklist && !showingChecked && !showingUsers && !showingMine;
      boardFilter = showingMine ? 'mine' : 'all';
      document.querySelector('#board-title').textContent = showingExceptions ? 'Exceptions requiring review' : showingMine ? 'My cards' : 'Team attention';
      document.querySelector('#board-subtitle').textContent = showingMine && me
        ? 'Only the cards assigned to you, ' + me.name + '.'
        : 'Curated operational items from Aries.';
      boardView.hidden = !showingBoard && !showingMine && !showingExceptions;
      boardSummary.hidden = !showingBoard && !showingMine && !showingExceptions;
      showMineButton.setAttribute('aria-pressed', String(showingMine));
      todoView.hidden = !showingTodos;
      worklistView.hidden = !showingWorklist;
      checkedView.hidden = !showingChecked;
      usersView.hidden = !showingUsers;
      showBoardButton.setAttribute('aria-pressed', String(showingBoard));
      showTodosButton.setAttribute('aria-pressed', String(showingTodos));
      showWorklistButton.setAttribute('aria-pressed', String(showingWorklist));
      showCheckedButton.setAttribute('aria-pressed', String(showingChecked));
      showUsersButton.setAttribute('aria-pressed', String(showingUsers));
      if (showingUsers) loadUsers();
      else if (showingTodos) loadTodos();
      else if (showingWorklist) loadWorklist();
      else loadBoard();
    }

    async function openThread(item) {
      threadTitle.textContent = '#' + item.id + ' · ' + cardTitle(item);
      threadMailbox.textContent = 'Loading the conversation…';
      threadMessages.replaceChildren();
      threadDialog.showModal();
      try {
        const response = await fetch('/api/thread?id=' + encodeURIComponent(item.id), {
          headers: { accept: 'application/json' }, cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load the email');
        threadMailbox.textContent = (payload.mailbox ? 'Mailbox: ' + payload.mailbox + ' · ' : '') +
          payload.messages.length + ' message' + (payload.messages.length === 1 ? '' : 's');
        payload.messages.forEach(function (message) {
          const block = document.createElement('div');
          block.className = 'thread-message';
          const meta = document.createElement('span');
          meta.className = 'thread-meta';
          meta.textContent = [message.from, message.date].filter(Boolean).join(' · ');
          const text = document.createElement('div');
          text.className = 'thread-text';
          text.textContent = message.body || '(no text in this message)';
          block.append(meta, text);
          if (message.truncated) {
            const note = document.createElement('div');
            note.className = 'thread-truncated';
            note.textContent = 'Message shortened — the rest is in the original mailbox.';
            block.append(note);
          }
          threadMessages.append(block);
        });
      } catch (error) {
        threadMailbox.textContent = error.message || 'Could not load the email';
      }
    }

    function renderChecked() {
      const done = boardItems.filter(function (item) { return item.status === 'done' && !item.pending; });
      checkedList.replaceChildren();
      done.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'checked-row';
        const text = document.createElement('span');
        text.className = 'worklist-text';
        text.textContent = '#' + item.id + ' · ' + cardTitle(item);
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'card-action';
        undo.textContent = 'Undo';
        undo.addEventListener('click', function (event) {
          submitAction(event.currentTarget, { operation: 'reopen', id: item.id }, function () {
            item.status = 'open';
            item.pending = false;
            undo.textContent = commandReceiptText(item.command_receipt);
            undo.disabled = true;
            render(boardItems);
            renderChecked();
          });
        });
        row.append(text, undo);
        checkedList.append(row);
      });
      checkedCount.textContent = done.length
        ? done.length + ' recently checked off · Undo brings one back to the board'
        : 'Nothing checked off in the last 7 days.';
      checkedList.setAttribute('aria-busy', 'false');
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
        if (item.due) { const due = document.createElement('span'); due.textContent = 'due ' + formatDue(item.due); meta.append(due); }
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

    // ---- User settings -----------------------------------------------------------------------
    async function teamRequest(body) {
      const response = await fetch('/api/team', {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        const failure = new Error(result.error || 'The user list did not answer (' + response.status + ')');
        failure.status = response.status;
        throw failure;
      }
      return result;
    }

    function applyTeam(list) {
      teamList = list.map(function (person) { return { key: person.key, name: person.name }; });
      renderUsers(list);
      if (boardItems.length) render(boardItems);
    }

    function userField(label, id, type, value, limit) {
      const field = document.createElement('div');
      field.className = 'user-field';
      const caption = document.createElement('label');
      caption.htmlFor = id;
      caption.textContent = label;
      const input = document.createElement('input');
      input.id = id;
      input.type = type;
      input.required = true;
      input.maxLength = limit;
      input.autocomplete = 'off';
      input.value = value;
      field.append(caption, input);
      return field;
    }

    function userRow(person) {
      const form = document.createElement('form');
      form.className = 'user-row';
      const initial = document.createElement('span');
      initial.className = 'user-initial';
      initial.setAttribute('aria-hidden', 'true');
      initial.textContent = person.name.charAt(0).toUpperCase();
      const nameField = userField('Name', 'user-name-' + person.key, 'text', person.name, 40);
      const emailField = userField('Email', 'user-email-' + person.key, 'email', person.email, 120);
      const nameInput = nameField.querySelector('input');
      const emailInput = emailField.querySelector('input');
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'user-save';
      save.textContent = 'Save changes';
      save.disabled = true;
      const note = document.createElement('p');
      note.className = 'user-note';
      const past = Array.isArray(person.past_emails) ? person.past_emails : [];
      note.textContent = past.length ? 'Earlier address: ' + past.join(', ') : '';
      const error = document.createElement('p');
      error.className = 'user-error';
      error.setAttribute('role', 'alert');
      function edited() {
        return nameInput.value.trim() !== person.name || emailInput.value.trim().toLowerCase() !== person.email;
      }
      form.addEventListener('input', function () {
        save.disabled = !edited();
        error.textContent = '';
      });
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!edited()) return;
        const name = nameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        save.disabled = true;
        save.textContent = 'Saving';
        teamRequest({ key: person.key, name: name, email: email }).then(function (result) {
          const renamed = name !== person.name;
          const moved = email !== person.email;
          applyTeam(result.team);
          if (renamed && moved) showToast('Saved. ' + person.name + ' is now ' + name + ', at ' + email + '.', false);
          else if (renamed) showToast('Saved. ' + person.name + ' is now ' + name + '.', false);
          else showToast('Saved. Aries emails ' + name + ' at ' + email + ' from now on.', false);
        }).catch(function (failure) {
          error.textContent = failure.message;
          save.textContent = 'Save changes';
          save.disabled = !edited();
        });
      });
      form.append(initial, nameField, emailField, save, note, error);
      return form;
    }

    function renderUsers(list) {
      userList.textContent = '';
      list.forEach(function (person) { userList.append(userRow(person)); });
      userList.setAttribute('aria-busy', 'false');
    }

    async function loadUsers() {
      userList.setAttribute('aria-busy', 'true');
      try {
        const result = await teamRequest(null);
        renderUsers(Array.isArray(result.team) ? result.team : []);
      } catch (failure) {
        userList.setAttribute('aria-busy', 'false');
        if (failure.status === 404) {
          showUsersButton.hidden = true;
          switchView('board');
          return;
        }
        showToast(failure.message || 'User list unavailable', true);
      }
    }

    addUserForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const nameInput = document.querySelector('#add-user-name');
      const emailInput = document.querySelector('#add-user-email');
      const error = addUserForm.querySelector('.user-error');
      const button = addUserForm.querySelector('.user-save');
      const name = nameInput.value.trim();
      error.textContent = '';
      button.disabled = true;
      teamRequest({ name: name, email: emailInput.value.trim().toLowerCase() }).then(function (result) {
        applyTeam(result.team);
        addUserForm.reset();
        showToast('Added ' + name + '. Cards can be assigned to them now.', false);
      }).catch(function (failure) {
        error.textContent = failure.message;
      }).finally(function () {
        button.disabled = false;
      });
    });
    addUserForm.addEventListener('input', function () { addUserForm.querySelector('.user-error').textContent = ''; });

    async function loadBoard() {
      board.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/board', { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Board request failed (' + response.status + ')');
        const payload = await response.json();
        setFreshness(payload);
        boardItems = reconcileBoardItems(boardItems,Array.isArray(payload.items) ? payload.items : []);
        currentReceipts = Array.isArray(payload.command_receipts) ? payload.command_receipts : [];
        const availableIds=new Set(boardItems.map(function(item){return String(item.id);}));
        selectedCards.forEach(function(id){if(!availableIds.has(id)||boardItems.some(function(item){return String(item.id)===id&&item.status==='done';}))selectedCards.delete(id);});
        cardNodes.forEach(function(node,id){if(!availableIds.has(id))cardNodes.delete(id);});
        compactRows.forEach(function(node,id){if(!availableIds.has(id))compactRows.delete(id);});
        threadIds = new Set(Array.isArray(payload.thread_ids) ? payload.thread_ids : []);
        document.querySelector('#activity-link').hidden = payload.activity !== true;
        showUsersButton.hidden = payload.activity !== true;
        if (Array.isArray(payload.team) && payload.team.length) teamList = payload.team;
        me = payload.me && payload.me.key ? payload.me : null;
        showMineButton.hidden = !me;
        render(boardItems);
        renderChecked();
        handleBoardLink();
      } catch (error) {
        stateBadge.className = 'state-badge offline';
        stateBadge.textContent = 'Unavailable';
        board.setAttribute('aria-busy', 'false');
        showToast(error.message || 'Board unavailable', true);
      }
    }

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
      useful: 'Noted \u2014 Aries will keep flagging these.',
      not_useful: 'Noted \u2014 Aries will stop flagging these.',
    };

    async function postAction(payload) {
      const response = await fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Action was not queued');
      const command = result.command || {};
      const item = boardItems.find(function (row) { return row.id === payload.id; });
      if (item) { item.command_receipt = result.receipt || command.receipt || Object.assign({},command,{state:command.state || 'queued'}); const card=cardNodes.get(String(item.id)); if(card)decorateCard(card,item); }
      return command;
    }

    async function submitAction(button, payload, onAccepted, message) {
      if (button) button.disabled = true;
      try {
        const command = await postAction(payload);
        showToast(message || commandReceiptText((boardItems.find(function(item){return item.id===payload.id;})||{}).command_receipt), false);
        if (typeof onAccepted === 'function') onAccepted(command);
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
      const item = noteItem;
      const host = noteHost;
      submitAction(null, { operation: 'note', id: item.id, note: value }, function (command) {
        const entry = { text: value, by: command.actor_email || '', at: command.created_at || '', pending: true };
        item.notes = (Array.isArray(item.notes) ? item.notes : []).concat([entry]);
        item.note = value;
        addHistory(item, 'wrote: ' + value);
        if (host && host.isConnected) fillCard(host, item);
      });
      noteItem = null;
      noteHost = null;
    });
    document.querySelector('#note-cancel').addEventListener('click', function () { noteDialog.close(); noteItem = null; });
    document.querySelector('#thread-close').addEventListener('click', function () { threadDialog.close(); });
    document.querySelector('#refresh').addEventListener('click', loadBoard);
    document.querySelector('#refresh-worklist').addEventListener('click', loadWorklist);
    worklistFilter.addEventListener('input', renderWorklist);
    showWorklistButton.addEventListener('click', function () { switchView('worklist'); });
    showCheckedButton.addEventListener('click', function () { switchView('checked'); });
    showUsersButton.addEventListener('click', function () { switchView('users'); });
    showMineButton.addEventListener('click', function () { switchView('mine'); });
    document.querySelector('#expand-all').addEventListener('click', function () {
      const cards = Array.prototype.slice.call(board.querySelectorAll('.card'));
      const open = document.querySelector('#expand-all').textContent === 'Expand all';
      cards.forEach(function (card) {
        const item = boardItems.find(function (entry) { return String(entry.id) === card.dataset.id; });
        if (item) setCollapsed(card, item, !open);
      });
    });
    document.querySelector('#refresh-checked').addEventListener('click', loadBoard);
    document.querySelector('#refresh-todos').addEventListener('click', loadTodos);
    document.querySelector('#toggle-completed-todos').addEventListener('click', function () {
      showCompletedTodos = !showCompletedTodos;
      renderTodos(currentTodos);
    });
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
    ${BOARD_UPGRADE_SCRIPT}
    const initialView = new URLSearchParams(location.search).get('view');
    if (['todos','worklist','exceptions','mine'].includes(initialView)) switchView(initialView); else loadBoard();
    window.setInterval(function () {
      if (activeView === 'users' || noteDialog.open || ariesDialog.open || bulkDialog.open) return;
      if (activeView === 'todos') loadTodos();
      else if (activeView === 'worklist') loadWorklist();
      else if (!board.querySelector('.choices:not([hidden])')) loadBoard();
    }, 30000);
  </script>
</body>
</html>`
