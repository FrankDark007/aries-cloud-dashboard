// The email carries only a board id. Authentication and the explicit POST confirm intent.
export const CARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aries · Confirm card completion</title>
<style>
:root{font-family:system-ui,sans-serif;color:#17191f;background:#f4f5f7;color-scheme:light}
*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:620px;margin:6vh auto;background:white;border:1px solid #dfe2e7;border-radius:18px;padding:28px;box-shadow:0 14px 36px #181d2614}
a{color:#1967d2}h1{font-size:25px;line-height:1.3;overflow-wrap:anywhere}.eyebrow{color:#69707d;font-size:14px}p{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}#state{font-weight:650}#notice{color:#555}button,.back{display:inline-block;padding:12px 18px;border-radius:10px;font:inherit;font-weight:650}button{background:#1967d2;color:white;border:0;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.back{margin:8px 0;text-decoration:none}#refresh{background:#edf3fc;color:#1967d2}#message{min-height:26px}button:focus-visible,a:focus-visible{outline:3px solid #9bbdf5;outline-offset:3px}[hidden]{display:none!important}
</style></head><body><main aria-busy="true" id="card">
<div class="eyebrow">ARIES · OPERATIONS BOARD <span id="number"></span></div>
<h1 id="title">Loading card…</h1><p id="summary" hidden></p><p id="state" aria-live="polite"></p>
<p id="notice">Opening this link does not change the card. Review it, then confirm when the work is finished.</p>
<p id="message" role="status" aria-live="polite"></p>
<button id="confirm" type="button" hidden>Confirm mark done</button>
<button id="refresh" type="button" hidden>Refresh card</button>
<a class="back" href="/">Back to board</a>
</main><script>
(function () {
  'use strict';
  const idText = new URLSearchParams(location.search).get('id') || '';
  const id = /^[1-9][0-9]*$/.test(idText) ? Number(idText) : 0;
  const card = document.querySelector('#card');
  const title = document.querySelector('#title');
  const summary = document.querySelector('#summary');
  const state = document.querySelector('#state');
  const message = document.querySelector('#message');
  const confirm = document.querySelector('#confirm');
  const refresh = document.querySelector('#refresh');
  let revision = null;
  let saving = false;
  let generation = 0;
  function render(data) {
    title.textContent = data.item.title;
    document.querySelector('#number').textContent = '#' + data.item.id;
    summary.textContent = data.item.summary || '';
    summary.hidden = !data.item.summary;
    revision = data.revision || null;
    state.textContent = data.state === 'done' ? 'Done' : data.state === 'deleted' ? 'Removed' : 'Open';
    confirm.hidden = data.state !== 'open';
    confirm.disabled = false;
    refresh.hidden = false;
    if (data.state === 'done') message.textContent = 'This card is already marked done.';
    else if (data.state === 'deleted') message.textContent = 'This card was removed. Nothing was changed.';
  }
  async function readResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (response.redirected || !type.includes('application/json')) throw new Error('Your sign-in may have expired. Reload this page to sign in again; nothing was changed by opening the link.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Card request failed (' + response.status + ').');
    return data;
  }
  async function load() {
    const current = ++generation;
    confirm.hidden = true;
    refresh.hidden = true;
    revision = null;
    card.setAttribute('aria-busy', 'true');
    message.textContent = '';
    try {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('This card link is invalid. Open the board to find the right card.');
      const response = await fetch('/api/card?id=' + id, {credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const data = await readResponse(response);
      if (current === generation) render(data);
    } catch (error) {
      if (current !== generation) return;
      title.textContent = 'Card unavailable';
      state.textContent = '';
      message.textContent = error.message || 'Could not load this card. Try again.';
      refresh.hidden = false;
    } finally { if (current === generation) card.setAttribute('aria-busy', 'false'); }
  }
  confirm.addEventListener('click', async function () {
    if (saving || !revision) return;
    saving = true;
    confirm.disabled = true;
    refresh.disabled = true;
    message.textContent = 'Saving…';
    try {
      const response = await fetch('/api/card/done', {method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({id:id,revision:revision})});
      const data = await readResponse(response);
      render(data);
      message.textContent = data.existing ? 'This card is already marked done.' : 'Marked done on the board. Saved for Aries to sync.';
    } catch (error) {
      // A lost response may have saved successfully. Re-read before offering another POST.
      confirm.hidden = true;
      revision = null;
      message.textContent = (error.message || 'Could not confirm the result.') + ' Refresh the card to check its current state.';
      refresh.hidden = false;
    } finally { saving = false; confirm.disabled = false; refresh.disabled = false; }
  });
  refresh.addEventListener('click', load);
  // Back/Forward must check current state rather than revive a cached confirmation.
  window.addEventListener('pageshow', function (event) { if (event.persisted) load(); });
  load();
}());
</script></body></html>`
