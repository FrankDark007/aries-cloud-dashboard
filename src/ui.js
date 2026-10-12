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
    #activity-link { color: #aeb4c0; font-size: 12px; font-weight: 700; }
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
    button:focus-visible, input:focus-visible, .user-field input:focus { outline: 3px solid rgba(25, 103, 210, .28); outline-offset: 2px; }

    .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; align-items: start; }
    .board[data-layout="list"] { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .card[data-collapsed="true"] { min-height: 0; padding: 16px 18px; cursor: pointer; }
    .card[data-collapsed="true"] :is(.needs, .status-lines, .do-this, .owner-row, .owner-hint, .nudge-row, .prep-row, .actions, .choices, .history) { display: none !important; }
    .card[data-collapsed="true"] h3 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .card-peek, .card-owner-line { display: none; }
    .card[data-collapsed="true"] .card-peek { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 6px 0 0; color: var(--ink); font-size: 13px; }
    .card[data-collapsed="true"] .card-owner-line { display: block; margin: 8px 0 0; overflow: hidden; color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
    .card-top-right { display: flex; align-items: center; gap: 6px; }
    .card-toggle { display: grid; place-items: center; width: 32px; min-height: 32px; padding: 0; color: var(--muted); background: #f2f4f7; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
    .card-toggle::before { content: ""; width: 7px; height: 7px; margin-top: -3px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }
    .card-toggle:hover { color: var(--ink); border-color: #9fa8b5; }
    .card-toggle[aria-expanded="true"] { transform: rotate(180deg); }
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
    .card[data-urgent="true"]::before { width: 6px; background: var(--red); }
    .card[data-urgent="true"] { border-color: #f0b7b3; box-shadow: 0 14px 36px rgba(189, 45, 40, .12); }
    .urgent-toggle { min-height: 28px; padding: 4px 10px; color: var(--red); background: white; border: 1px solid #f0b7b3; border-radius: 999px; cursor: pointer; font-size: 10.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
    .urgent-toggle:hover { background: var(--red-soft); border-color: var(--red); }
    .urgent-toggle[aria-pressed="true"] { color: white; background: var(--red); border-color: var(--red); }
    .urgent-toggle:disabled { opacity: .6; cursor: progress; }
    .snoozed-list { margin: 18px 0 0; color: var(--muted); }
    .snoozed-list summary { cursor: pointer; font-weight: 750; }
    .snoozed-list[hidden] { display: none; }
    .snoozed-rows { display: grid; gap: 8px; margin: 10px 0 0; }
    .card[data-status="done"] { opacity: .64; }
    .card-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .chips { display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 4px 8px; color: #4e5663; background: #f2f4f7; border: 1px solid #e0e4e9; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
    .chip.kind { color: #6841a5; background: #f2ecfb; border-color: #e2d5f5; }
    .chip.kind[data-act="close"] { color: var(--green); background: var(--green-soft); border-color: #b9dfcc; }
    .chip.counsel { color: white; background: var(--ink); border-color: var(--ink); }
    .chip.aries-state { color: var(--violet); background: #f6f1fd; border-color: #d9c8f3; }
    .chip.aries-state[data-tone="ready"] { color: var(--green); background: var(--green-soft); border-color: #b9dfcc; }
    .chip.aries-state[data-tone="failed"] { color: var(--red); background: var(--red-soft); border-color: #f0b7b3; }
    .item-id { color: var(--faint); font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .card h3 { margin: 12px 0 8px; font-size: 18px; line-height: 1.25; letter-spacing: -.02em; }
    .card .summary { display: -webkit-box; overflow: hidden; margin: 0; color: var(--muted); -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .details { display: grid; gap: 5px; margin: 16px 0; color: #596170; font-size: 12px; }
    .detail:empty { display: none; }
    .item-note { margin: 0 0 16px; padding: 10px 11px; color: #505764; background: #f7f8fa; border-left: 2px solid #aab2bf; border-radius: 0 8px 8px 0; font-size: 12px; }
    .item-note:empty { display: none; }
    .note-entry + .note-entry { margin-top: 9px; padding-top: 9px; border-top: 1px solid #e5e8ed; }
    .note-entry .note-text { font-style: italic; white-space: pre-wrap; }
    .note-entry .note-by { display: block; margin-top: 3px; font-style: normal; font-size: 11px; color: var(--faint); }
    .note-entry.pending { opacity: .7; }
    .actions { display: flex; gap: 8px; margin-top: auto; padding-top: 5px; }
    .card-action { flex: 1; padding: 8px 12px; }
    /* Done is deliberately NOT a filled button. A solid dark control on every single card
       read as a badge announcing the item was already done, instead of a control that marks
       it done. It keeps a quiet green tint so it is still the obvious first action. */
    .card-action.done { flex: 1 1 40%; color: #14663f; background: #f2faf5; border-color: #bfe3ce; font-weight: 700; }
    .card-action.done:hover { background: #e3f5ea; border-color: #93cfae; }
    .card-action:disabled { opacity: .5; cursor: wait; transform: none; }
    .actions { flex-wrap: wrap; gap: 6px; }
    .card-action.assign-select { flex: 1 1 40%; padding: 8px 10px; background: white; cursor: pointer; }
    .card-action.source-link { flex: 1 1 40%; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    .card-action.source-link[hidden] { display: none; }
    .card-action.danger { flex: 0 0 auto; color: #a1231f; border-color: #e6c3c1; }
    .card-action.danger:hover { background: #fdf2f1; }
    /* The thumbs sit on their own row: they teach the inbox sweep rather than change the task,
       and mixing them in with Done/Delete invites a mis-click on the one control here that has
       a lasting effect on what Aries shows everybody. */
    .feedback-group { flex: 1 0 100%; display: flex; gap: 8px; margin-top: 2px; padding-top: 8px; border-top: 1px dashed var(--line, #e3e6ec); }
    .card-action.thumb { flex: 1; font-size: .85rem; color: var(--muted, #5d6674); }
    .card-action.thumb:disabled { opacity: .6; cursor: default; }
    /* The card answers three questions in order: what does it need, who touched it last, what
       do I do now. The "Do this" panel is the one loud element; its color says what kind of
       move it is (answer, call, money, decide, wait, counsel), so a column of cards can be
       scanned by color before a word is read. */
    .chip.when { color: #4e5663; }
    .chip.when[data-tone="soon"] { color: var(--amber); background: var(--amber-soft); border-color: #f3d9a4; }
    .chip.when[data-tone="late"] { color: var(--red); background: var(--red-soft); border-color: #f2c4c0; }
    .card h3 { margin-top: 14px; }
    .facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 10px; color: #4e5663; font-size: 13px; font-weight: 650; }
    .facts:empty { display: none; }
    .needs { margin: 0; color: #3b414c; font-size: 14px; line-height: 1.5; }
    .status-lines { display: grid; gap: 6px; margin: 14px 0 0; font-size: 13px; line-height: 1.45; }
    .status-line { display: grid; grid-template-columns: 8.4em minmax(0, 1fr); gap: 8px; }
    .status-line dt { white-space: nowrap; }
    .status-line[hidden] { display: none; }
    .status-line dt { color: var(--muted); font-weight: 700; }
    .status-line dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
    .status-line dd b { font-weight: 750; }
    .status-line dd .quiet { color: var(--muted); }
    .do-this {
      --act: var(--blue);
      --act-soft: var(--blue-soft);
      margin: 16px 0 0;
      padding: 13px 14px 12px;
      background: var(--act-soft);
      border-left: 4px solid var(--act);
      border-radius: 4px 12px 12px 4px;
    }
    .do-this[data-act="call"] { --act: var(--green); --act-soft: var(--green-soft); }
    .do-this[data-act="invoice"], .do-this[data-act="payment"] { --act: var(--amber); --act-soft: var(--amber-soft); }
    .do-this[data-act="decide"] { --act: var(--violet); --act-soft: #f2ecfb; }
    .do-this[data-act="wait"], .do-this[data-act="file"], .do-this[data-act="close"], .do-this[data-act="none"] { --act: #5d6674; --act-soft: #f2f4f7; }
    .do-this[data-act="legal"] { --act: var(--red); --act-soft: var(--red-soft); }
    .do-counsel { margin: 0 0 6px; color: var(--red); font-size: 13px; font-weight: 800; }
    .do-counsel:empty { display: none; }
    .do-text { margin: 0; color: var(--ink); font-size: 15px; font-weight: 650; line-height: 1.4; }
    .do-text:empty { display: none; }
    .do-text:empty + .do-buttons { margin-top: 0; }
    .do-buttons { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .do-buttons:empty { display: none; }
    .do-button {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 40px; padding: 8px 13px;
      color: var(--act); background: white; border: 1px solid var(--act); border-radius: 10px;
      cursor: pointer; font-weight: 750; text-decoration: none;
    }
    .do-button.primary { color: white; background: var(--act); }
    .do-button:hover { filter: brightness(.95); }
    .do-button:disabled { opacity: .55; cursor: wait; }
    .owner-row { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 14px 0 0; }
    .owner-label { margin-right: 2px; color: var(--muted); font-size: 12px; font-weight: 700; }
    .owner-chip {
      min-height: 32px; padding: 4px 8px;
      color: #3b414c; background: white; border: 1px solid #d4d8de; border-radius: 999px;
      cursor: pointer; font-size: 12px; font-weight: 700;
    }
    .owner-chip[aria-pressed="true"] { color: white; background: var(--ink); border-color: var(--ink); }
    .owner-chip.suggested:not([aria-pressed="true"]) { color: var(--blue); border: 1px dashed var(--blue); }
    .owner-chip:disabled { opacity: .55; cursor: wait; }
    .owner-chip.aries { color: var(--violet); background: #f6f1fd; border-color: #d9c8f3; }
    .owner-chip.aries[aria-pressed="true"] { color: white; background: var(--violet); border-color: var(--violet); }
    .owner-hint { margin: 5px 0 0; color: var(--blue); font-size: 12px; font-weight: 650; }
    .nudge-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 0; }
    .nudge-row[hidden] { display: none; }
    .nudge-button {
      min-height: 34px; padding: 5px 12px;
      color: var(--amber); background: var(--amber-soft); border: 1px solid #f0cf8f; border-radius: 999px;
      cursor: pointer; font-size: 12px; font-weight: 750;
    }
    .nudge-button:hover { border-color: var(--amber); }
    .nudge-button:disabled { color: var(--muted); background: #f2f4f7; border-color: var(--line); cursor: default; }
    .nudge-note { color: var(--muted); font-size: 12px; }
    .prep-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; }
    .prep-row[hidden] { display: none; }
    .prep-button {
      min-height: 34px; padding: 5px 12px;
      color: var(--violet); background: #f3eefc; border: 1px solid #d5c6f1; border-radius: 999px;
      cursor: pointer; font-size: 12px; font-weight: 750;
    }
    .prep-button:hover { border-color: var(--violet); }
    .prep-note { color: var(--muted); font-size: 12px; }
    .owner-hint:empty { display: none; }
    .card .actions { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
    .card .actions .card-action { flex: 1 1 0; min-height: 40px; padding: 7px 10px; }
    .card-action[aria-expanded="true"] { color: white; background: var(--ink); border-color: var(--ink); }
    .choices { display: grid; gap: 8px; margin-top: 8px; padding: 11px; background: #f7f8fa; border: 1px solid var(--line); border-radius: 12px; }
    .choices-label { margin: 0; color: var(--muted); font-size: 12px; font-weight: 700; }
    .choice-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .choice {
      min-height: 36px; padding: 6px 11px;
      color: var(--ink); background: white; border: 1px solid #cfd3da; border-radius: 9px;
      cursor: pointer; font-size: 13px; font-weight: 700;
    }
    .choice:hover { border-color: #9fa8b5; }
    .choice.danger { color: #a1231f; border-color: #e6c3c1; }
    .choice:disabled { opacity: .55; cursor: wait; }
    .choice-date { min-height: 36px; padding: 5px 8px; border: 1px solid #cfd3da; border-radius: 9px; font: inherit; font-size: 13px; }
    .history { margin-top: 10px; font-size: 12px; }
    .history summary { width: fit-content; color: var(--muted); cursor: pointer; font-weight: 700; }
    .history[hidden] { display: none; }
    .history-list { display: grid; gap: 7px; margin: 9px 0 0; padding: 0; list-style: none; }
    .history-entry { display: grid; grid-template-columns: 8.4em minmax(0, 1fr); gap: 8px; color: #3b414c; }
    .history-entry time { color: var(--faint); font-variant-numeric: tabular-nums; }
    .history-entry.theirs { color: var(--muted); }
    .history-entry.theirs b { color: #3b414c; }
    .history-text { overflow-wrap: anywhere; }
    .worklist { display: flex; flex-direction: column; gap: 6px; }
    .worklist-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start;
      padding: 11px 14px; background: white; border: 1px solid #e4e7ec; border-radius: 11px; }
    .worklist-row[data-done="true"] { opacity: .5; }
    .worklist-row[data-done="true"] .worklist-text { text-decoration: line-through; }
    .worklist-mark { font-weight: 800; color: var(--muted); }
    .worklist-text { min-width: 0; overflow-wrap: anywhere; }
    .worklist-meta { display: flex; gap: 8px; white-space: nowrap; color: var(--muted); font-size: 12px; font-weight: 700; }
    #worklist-filter { min-width: 180px; }
    .checked-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center;
      padding: 12px 14px; background: white; border: 1px solid #e4e7ec; border-radius: 11px; }
    .checked-row .worklist-text { text-decoration: line-through; color: var(--muted); }
    .checked-row .card-action { flex: 0 0 auto; }
    .thread-body { max-width: min(760px, 92vw); max-height: 80vh; overflow-y: auto; }
    .thread-message { padding: 12px 0; border-top: 1px solid #e4e7ec; }
    .thread-message:first-of-type { border-top: none; }
    .thread-meta { display: block; color: var(--muted); font-size: 12px; font-weight: 700; margin-bottom: 6px; overflow-wrap: anywhere; }
    .thread-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.5; }
    .thread-truncated { color: var(--muted); font-size: 12px; font-style: italic; }
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
    .todo-row[data-urgent="true"] { border-color: #f0b7b3; box-shadow: inset 5px 0 0 var(--red), 0 8px 22px rgba(189, 45, 40, .08); }
    .todo-meta .chip[data-tone="urgent"] { color: white; background: var(--red); border-color: var(--red); }
    .todo-meta .chip[data-tone="late"] { color: var(--amber); background: #fff5e6; border-color: #f1d3a6; }
    .todo-meta .chip[data-tone="aries"] { color: var(--violet); background: #f6f1fd; border-color: #d9c8f3; }
    .todo-meta .chip[data-tone="failed"] { color: var(--red); background: var(--red-soft); border-color: #f0b7b3; }
    .todo-actions select, .todo-actions a { min-height: 38px; padding: 7px 10px; color: var(--ink); background: white; border: 1px solid #d4d8de; border-radius: 9px; font: inherit; font-size: 12px; font-weight: 750; text-decoration: none; }
    .todo-actions a { display: inline-flex; align-items: center; color: var(--blue); }
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
    .dialog-body textarea { width: 100%; min-height: 120px; padding: 11px 12px; border: 1px solid #bbc1ca; border-radius: 10px; font: inherit; resize: vertical; }
    .dialog-hint { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    .dialog-actions { display: flex; justify-content: end; gap: 9px; margin-top: 18px; }
    .dialog-action { padding: 9px 16px; }
    .dialog-action.primary { color: white; background: var(--blue); border-color: var(--blue); }
    .user-list { display: grid; gap: 10px; }
    .user-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) minmax(0, 1.5fr) auto;
      gap: 6px 14px;
      align-items: end;
      padding: 16px 18px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 22px rgba(24, 29, 38, .045);
    }
    .user-row.add { margin-top: 18px; background: rgba(255, 255, 255, .6); border-style: dashed; box-shadow: none; }
    .user-initial { display: grid; place-items: center; width: 44px; height: 44px; align-self: center; color: var(--blue); background: var(--blue-soft); border-radius: 50%; font-size: 17px; font-weight: 800; }
    .user-row.add .user-initial { color: var(--muted); background: #eef0f3; }
    .user-field label { display: block; margin-bottom: 5px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .user-field input { width: 100%; min-height: 42px; padding: 9px 11px; color: var(--ink); background: white; border: 1px solid #bbc1ca; border-radius: 10px; font: inherit; }
    .user-save { min-height: 42px; padding: 9px 16px; color: white; background: var(--blue); border: 1px solid var(--blue); border-radius: 10px; cursor: pointer; font-weight: 750; }
    .user-save:disabled { color: var(--faint); background: #f1f3f5; border-color: var(--line); cursor: default; }
    .user-note, .user-error { grid-column: 2 / -1; margin: 0; font-size: 12px; }
    .user-note { color: var(--muted); }
    .user-error { color: var(--red); font-weight: 700; }
    .user-error:empty, .user-note:empty { display: none; }
    .user-help { max-width: 72ch; margin: 14px 0 0; color: var(--muted); font-size: 13px; }
    footer { margin-top: 30px; color: var(--faint); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }

    @keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    /* One claim, one card: the client and claim on top, each open task below it as a slim card
       that keeps its own Done, Snooze, Note and owner. */
    .claim-card {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      padding: 18px 14px 14px 20px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      animation: reveal .32s both;
    }
    .claim-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--blue); }
    .claim-card[data-urgent="true"]::before { width: 6px; background: var(--red); }
    .claim-card[data-urgent="true"] { border-color: #f0b7b3; }
    .claim-head h3 { margin: 0 0 6px; font-size: 19px; line-height: 1.25; letter-spacing: -.02em; }
    .claim-head .facts { margin: 0 0 4px; }
    .claim-count { margin: 0 0 12px; color: var(--muted); font-size: 13px; font-weight: 700; }
    .claim-tasks { display: grid; gap: 8px; }
    .claim-tasks .card { min-height: 0; padding: 14px 14px 14px 18px; background: #f8f9fb; border-radius: 12px; box-shadow: none; animation: none; }
    .claim-tasks .card[data-collapsed="false"] { background: var(--surface); }
    .claim-tasks .card::before { width: 3px; }
    .claim-tasks .card h3 { margin: 8px 0 4px; font-size: 15.5px; }
    .claim-tasks .fact-client { display: none; }
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
      .view-switch { display: flex; flex-wrap: wrap; }
      .view-switch button { flex: 1 1 30%; min-width: 0; padding: 7px 10px; }
      .user-row { grid-template-columns: 44px minmax(0, 1fr); }
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

    <nav class="view-switch" aria-label="Aries view"><a href="/mission" style="padding:12px;color:inherit">Mission Control</a>
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
          <div><h2 id="worklist-title">Full list</h2><p id="worklist-count">Aries' complete working list, read-only. Personal items are never published.</p></div>
          <div class="todo-toolbar"><input id="worklist-filter" class="refresh-button" type="search" placeholder="Filter…" autocomplete="off" aria-label="Filter the full list"><button id="refresh-worklist" class="refresh-button" type="button">Refresh</button></div>
        </div>
        <div id="worklist" class="worklist" aria-busy="true"></div>
      </section>

      <section id="todo-view" aria-labelledby="todo-title" hidden>
        <div class="section-head">
          <div><h2 id="todo-title">Aries To-Do</h2><p>One client, one clear action, one owner. Checking off a task made from a card closes that card too.</p><p id="todo-sync-status" class="sync-line" aria-live="polite"></p></div>
          <div class="todo-toolbar"><button id="add-todo" class="refresh-button" type="button">Add task</button><button id="refresh-todos" class="refresh-button" type="button">Refresh</button></div>
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
      <div class="card-top"><span class="item-id"></span><div class="card-top-right"><button class="urgent-toggle" data-action="urgent" type="button" aria-pressed="false">Mark urgent</button><button class="card-toggle" data-action="toggle" type="button" aria-expanded="false" aria-label="Show details"></button></div><div class="chips"><span class="chip counsel" hidden>Counsel only</span><span class="chip kind"></span><span class="chip when"></span><span class="chip aries-state" hidden></span></div></div>
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
        <button class="card-action" data-action="snooze" type="button" aria-expanded="false">Snooze</button>
        <button class="card-action" data-action="note" type="button">Note</button>
        <button class="card-action" data-action="more" type="button" aria-expanded="false">More</button>
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

    // Frank, 09/29/2026: "remove cards from the board that are snoozed so they dont clutter the
    // board. brin them back after the snooz period". A snoozed card rests until its date, in the
    // viewer's own calendar, and is back on the board that morning.
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

    // The three header counters and the empty state are DERIVED from the board, so every path
    // that takes a card away has to recompute them. Removing only the node left "12 open"
    // sitting above an eleven card board.
    function refreshBoardChrome() {
      const open = visibleBoardItems();
      updateUpgradeChrome();
      board.querySelectorAll('.claim-card').forEach(fillClaimCard);
      renderSnoozed();
      if (me) showMineButton.textContent = 'My cards (' + boardItems.filter(function (item) {
        return onBoard(item) && String(item.assignee || '').toLowerCase() === me.key;
      }).length + ')';
      syncExpandAll();
      document.querySelector('#open-count').textContent = String(open.length);
      document.querySelector('#urgent-count').textContent = String(open.filter(isUrgent).length);
      document.querySelector('#assigned-count').textContent = String(open.filter(function (item) { return Boolean(item.assignee); }).length);

      const hasCard = Boolean(board.querySelector('.card, .compact-table tbody tr'));
      if (!hasCard && (filters.query || filters.owner || filters.client || filters.claim || filters.status || activeView === 'exceptions')) {
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
    // Frank, 09/29/2026: "I never know what each task needs or who was last to work on that
    // task or what I should do about it." Each card now answers those three in that order,
    // from the brief Aries writes out of the card's email thread and the card's own history.
    const OWNERS = ['frank', 'mark', 'steve', 'shayan', 'katherine'];
    // The roster the board sends with every refresh (key and name). A key never changes, so a
    // renamed person keeps their cards; only the name on the chips and labels moves.
    let teamList = OWNERS.map(function (key) { return { key: key, name: titleName(key) }; });
    // Frank, 09/30/2026: "the board cards are huge now. make them collapsobale and give each use
    // a tab where they can see a list of ony the cards assigned to them". Cards start folded to
    // their title, facts and next step. The ones a viewer opens stay open across refreshes on
    // that browser. My cards is the same board, filtered to the signed-in person, as a list.
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

    // Whole days from today to a calendar day (negative means it has passed), in the viewer's
    // own calendar so "due tomorrow" means tomorrow where they are sitting.
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

    // A calendar day N days out, in local time. toISOString would give the UTC day, which after
    // 8 PM Eastern is already tomorrow and would snooze a card one day too long.
    function isoDayFromNow(days) {
      const date = new Date(Date.now() + days * 86400000);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function daysToNextMonday() {
      const weekday = new Date().getDay();
      return ((8 - weekday) % 7) || 7;
    }

    // Frank, 09/30/2026: "audit the aries todo list and aries prep work and aries cards ob the
    // board and enhance in anywway that you can". A third of the cards were titled with a raw
    // email subject. Aries' brief now writes a title; until a card has one, the subject loses its
    // mail prefixes and Aries' own inbox tag, which say nothing about the task.
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

    // The chip says what the card needs done, from the brief, instead of the mail category.
    const ACTION_LABELS = {
      reply: 'Reply', call: 'Call', invoice: 'Invoice', payment: 'Payment', review: 'Review',
      decide: 'Decide', wait: 'Waiting', file: 'File', close: 'Looks done',
    };
    const TASK_STOPPED = ['failed', 'timed_out', 'interrupted', 'cancelled'];

    // A task still "queued" or "running" hours after it was asked has lost its ending (a prep
    // stops at 20 minutes, an Aries task at an hour), so the board stops claiming it is running.
    function staleTask(task) {
      const asked = new Date(task.at).valueOf();
      return (task.status === 'queued' || task.status === 'running') && (!Number.isFinite(asked) || Date.now() - asked > 3 * 3600000);
    }

    // What Aries is doing on the card, shown on the folded card too: the prep for its owner, or
    // the card itself when Aries owns it.
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

    // Days until the deadline that orders the board, for cards overdue or due within a week.
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
      const age = daysUntil(item.created);
      if (age === null) return null;
      const open = Math.max(0, -age);
      return {
        text: open === 0 ? 'Opened today' : 'Open ' + open + (open === 1 ? ' day' : ' days'),
        tone: open >= 14 ? 'soon' : 'plain',
        title: 'Opened ' + monthDay(item.created),
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
      group.style.animationDelay = Math.min(index * 45, 360) + 'ms';
      const head = document.createElement('header');
      head.className = 'claim-head';
      const name = document.createElement('h3');
      name.textContent = members[0].claim_label || cardTitle(members[0]);
      group.setAttribute('aria-label', 'Claim: ' + name.textContent);
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
      const count = document.createElement('p');
      count.className = 'claim-count';
      const list = document.createElement('div');
      list.className = 'claim-tasks';
      members.forEach(function (item, at) { list.append(buildCard(item, index + at)); });
      head.append(name, facts, count);
      group.append(head, list);
      fillClaimCard(group);
      groupNodes.set(members[0].claim_group,group);
      return group;
    }

    // The task count and the urgent bar follow the cards inside. A claim whose last task was
    // checked off leaves the board with it.
    function fillClaimCard(group) {
      const cards = group.querySelectorAll('.card');
      if (!cards.length) { group.remove(); return; }
      group.querySelector('.claim-count').textContent = cards.length + (cards.length === 1 ? ' open task' : ' open tasks');
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
      card.style.animationDelay = Math.min(index * 45, 360) + 'ms';
      fragment.querySelector('.item-id').textContent = '#' + item.id;
      const cardLink = document.createElement('a');
      cardLink.className = 'card-action';
      cardLink.href = '/card?id=' + item.id;
      cardLink.textContent = 'Card link';
      cardLink.setAttribute('aria-label', 'Open card #' + item.id);
      fragment.querySelector('.actions').append(cardLink);

      card.querySelector('[data-action="done"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'done', event.currentTarget);
      });
      card.querySelector('[data-action="snooze"]').addEventListener('click', function (event) {
        toggleChoices(card, item, 'snooze', event.currentTarget);
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

    // Everything on a card that changes when someone acts on it. Called on first render and
    // again after an action, so the card shows the new owner or note at once instead of
    // waiting 30 seconds for the next poll and looking like the button did nothing.
    function fillCard(card, item) {
      const brief = item.brief || null;
      const kind = card.querySelector('.kind');
      kind.textContent = brief && ACTION_LABELS[brief.action] ? ACTION_LABELS[brief.action] : (item.kind || 'operations');
      kind.dataset.act = brief ? brief.action : '';
      // Counsel-only shows folded too: the banner that says so sits in the part a fold hides.
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
        // A card with no claim number may carry its invoice number there, already labeled.
        const claim = brief.claim ? (/^invoice/i.test(brief.claim) ? brief.claim : 'Claim ' + brief.claim) : '';
        [brief.client, claim, brief.amount].forEach(function (text, at) {
          if (!text) return;
          const span = document.createElement('span');
          span.textContent = text;
          // Inside a claim card the client is already its heading.
          if (at === 0) span.className = 'fact-client';
          facts.append(span);
        });
      }
      card.querySelector('.needs').textContent = (brief && brief.needs) || item.summary || '';
      card.querySelector('.card-peek').textContent = (brief && (brief.next_step || brief.needs)) || item.summary || '';
      // The folded card's last line: who has it (or who Aries thinks should), and who we wait on.
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
      // Aries reads the thread as finished. Closing is the next step, so it is the first button;
      // it still asks nothing further and writes why on the card like any other Done.
      if (brief && brief.action === 'close') {
        buttons.append(doButton('Mark done', function (button) { doneWithReason(card, item, 'nothing more was needed', button); }));
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

    // Urgent: the card goes to the top of the board and Aries emails whoever must act now, the
    // owner first. Clearing it sends nothing.
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

    // The Nudge button: Aries emails the owner that someone is asking for an update and copies
    // whoever asked. One an hour per card, the same limit Aries holds itself to, so a double tap
    // or a second teammate a minute later does not send the owner two emails.
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
        // submitAction re-enables its button when it settles; the hour limit has to win.
        fillNudge(card, item);
      });
    }

    // Aries prep: the teammate keeps the card and Aries does the groundwork for them. Frank,
    // 09/29/2026: "assign a task to a teamate, and also assign it to aries so that aries can do
    // some prep work for that teamate." Aries holds a repeat inside two hours unless it carries a
    // new instruction, so the button says when it is already working.
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
      // The queue's own state when the board has it, else the last time someone asked.
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

    // Same order as giveToAries: the instruction note first, so Aries reads it as its task.
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

    // The instruction travels as a note that starts "For Aries:", queued before the assignment,
    // so Aries reads it as its task and everyone else can see what it was asked to do.
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

    // Done, Snooze and More open a row of choices inside the card rather than a browser prompt:
    // one tap to pick, and the answer is written on the card for the next person.
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
      if (kind === 'done') {
        label.textContent = 'What happened? It goes on the card so the team knows.';
        DONE_REASONS.forEach(function (pair) {
          row.append(choice(pair[1], function (button) { doneWithReason(card, item, pair[0], button); }));
        });
      } else if (kind === 'snooze') {
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
        label.textContent = 'Other actions:';
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
        addHistory(item, person ? 'requested assignment to ' + nameOf(person) : 'requested clearing the owner');
        closeChoices(card);
        if (!inView(item)) card.remove();
        else fillCard(card, item);
        refreshBoardChrome();
      }, message);
    }

    function snoozeTo(card, item, day, button) {
      submitAction(button, { operation: 'snooze', id: item.id, value: day }, function () {
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

    // Two queued commands, in order: the note that says why, then the change itself. The note
    // goes first so whoever reads the card later sees the reason next to the action.
    async function doneWithReason(card, item, reason, button) {
      button.disabled = true;
      try {
        await postAction({ operation: 'note', id: item.id, note: 'Done: ' + reason + '.' });
        await postAction({ operation: 'done', id: item.id });
        closeChoices(card);
        fillCard(card, item);
        refreshBoardChrome();
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

    // Frank, 09/29/2026: "make sure the "Aries To-Do / One client, one clear action, one owner."
    // gets updated as board gets updated". Aries carries urgent and its prep state over from the
    // card; older catalogues only prefixed the task with "URGENT: ".
    function todoUrgent(item) {
      return item.urgent === true || String(item.text || '').indexOf('URGENT: ') === 0;
    }

    function todoText(item) {
      const text = String(item.text || '');
      return text.indexOf('URGENT: ') === 0 ? text.slice(8) : text;
    }

    // Month/day/year, in Eastern time for a timestamp.
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

    let currentTodos = [];
    function renderTodos(items) {
      currentTodos = items;
      const restoreFocus=rememberFocus();
      const existingTodos=new Map(Array.from(todoList.querySelectorAll('[data-task-id]')).map(function(row){return [row.dataset.taskId,row];}));
      const nextTodoNodes=[];
      if(!items.length)todoList.replaceChildren();
      items = items.slice().sort(function (left, right) { return Number(todoUrgent(right)) - Number(todoUrgent(left)); });
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
        // The owner is picked from the roster, so a typo can no longer invent a teammate.
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
        nextTodoNodes.push(previous && (previous.dataset.signature===row.dataset.signature || (previous.contains(document.activeElement) && !previous.querySelector(':disabled'))) ? previous : row);
      });
      if(items.length)reconcileChildren(todoList,nextTodoNodes);
      todoList.setAttribute('aria-busy', 'false');
      restoreFocus();
      handleTodoLink();
    }

    async function loadTodos() {
      todoList.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/api/todos', { headers: { accept: 'application/json' }, cache: 'no-store' });
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
            undo.textContent = commandReceiptText(item.command_receipt);
            undo.disabled = true;
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
    // Frank, 09/29/2026: "if i want to change mark's name to Mike, I dont have a way to do that
    // right now. If mark changes his email address, I want to be able to update it." Owner only:
    // the worker answers /api/team with a 404 for everyone else.
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
        showToast(commandReceiptText((boardItems.find(function(item){return item.id===payload.id;})||{}).command_receipt), false);
        // The accepted row carries the identity Access proved and the time the worker stamped.
        // Callers render from THAT rather than guessing at either.
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
      // Show it on the card straight away, marked as still on its way. The note only reaches
      // the board on the next sync, and a card that looked completely unchanged afterwards is
      // why the button read as doing nothing at all.
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
      // A card with its Done, Snooze or More choices open is mid-decision. Re-rendering the
      // board under it would close the row and throw away a half-picked date.
      else if (!board.querySelector('.choices:not([hidden])')) loadBoard();  // also refreshes the checked-off list
    }, 30000);
  </script>
</body>
</html>`
