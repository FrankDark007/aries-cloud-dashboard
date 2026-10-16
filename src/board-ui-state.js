/** @param {any} item */
export function isAutoResolvedCandidate(item) {
  if (!item || (item.status || 'open') !== 'open') return false;
  if (item.auto_resolved_candidate === true) return true;
  const brief = item.brief || {};
  if (brief.action === 'close' || brief.looks_done === true || item.looks_done === true) return true;
  const oursAt = brief.last_ours && brief.last_ours.at ? Date.parse(brief.last_ours.at) : NaN;
  const theirsAt = brief.last_theirs && brief.last_theirs.at ? Date.parse(brief.last_theirs.at) : NaN;
  if (Number.isFinite(oursAt) && Number.isFinite(theirsAt) && oursAt > theirsAt && brief.action !== 'follow_up') return true;
  return false;
}

/** @param {any} item @param {string} [today] */
export function isStaleCard(item, today) {
  if (!item || (item.status || 'open') !== 'open') return false;
  const refMs = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? Date.parse(today + 'T23:59:59Z') : Date.now();
  const stamp = item.updated || item.created || (item.brief && item.brief.waiting_since) || '';
  if (!stamp) return false;
  const atMs = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(stamp)) ? String(stamp) + 'T00:00:00Z' : String(stamp));
  if (!Number.isFinite(atMs) || !Number.isFinite(refMs)) return false;
  return (refMs - atMs) > 7 * 86400000;
}

/** @param {any} item @param {number} [now] */
export function cardExceptions(item, now = Date.now()) {
  const issues = [];
  const prep = item.prep || {};
  const stopped = ['failed', 'stopped', 'cancelled', 'timeout', 'timed_out', 'interrupted'];
  if (stopped.includes(prep.status)) issues.push({ code: 'prep_failed', message: prep.error || prep.detail || 'Preparation did not finish.', recovery: 'Review the preparation note, then request preparation again.' });
  const task = item.aries_task || {};
  if (stopped.includes(task.status)) issues.push({ code: 'aries_failed', message: task.error || task.detail || 'The delegated Aries task did not finish.', recovery: 'Open the task history and resolve the failure before delegating again.' });
  for (const [kind, work] of [['prep', prep], ['aries', task]]) {
    const started = Date.parse(work.at || work.started_at || '');
    if (['queued', 'running'].includes(work.status) && Number.isFinite(started) && now - started > 3 * 3600000) issues.push({ code: kind + '_stuck', message: (kind === 'prep' ? 'Preparation' : 'The delegated Aries task') + ' has been waiting or running for more than three hours.', recovery: 'Review the task history and runner health before requesting another action.' });
  }
  const receipt = item.command_receipt || {};
  if (receipt.state === 'failed') issues.push({ code: 'command_failed', message: receipt.detail || 'A command failed.', recovery: 'Review the failure and retry the same command.' });
  const queued = Date.parse(receipt.received_at || receipt.created_at || '');
  if (['queued', 'received', 'processing'].includes(receipt.state) && Number.isFinite(queued) && now - queued > 30 * 60000) issues.push({ code: 'command_stuck', message: 'This command has waited more than 30 minutes.', recovery: 'Check runner health before requesting another action.' });
  const evidence = item.evidence_at || item.source_updated_at || item.updated_at || item.updated || (item.brief || {}).updated_at;
  const at = Date.parse(evidence || '');
  if (!Number.isFinite(at)) issues.push({ code: 'evidence_unknown', message: 'Source evidence time is unavailable.', recovery: 'Open the source email and verify the next action.' });
  else if (now - at > 7 * 86400000) issues.push({ code: 'evidence_stale', message: 'Source evidence is more than seven days old.', recovery: 'Check the source before acting on this summary.' });
  if (['close', 'looks_done'].includes((item.brief || {}).action) || (item.brief || {}).looks_done || item.looks_done) issues.push({ code: 'looks_done', message: 'This card may already be complete.', recovery: 'Verify the evidence before marking it done.' });
  for (const issue of (item.quality || {}).issues || []) issues.push({ code: issue.code, message: issue.message, recovery: 'Compare the summary with the source and add a correction note.' });
  return issues;
}

/** @param {any} item @param {any} filters @param {string} today */
export function matchesBoardFilters(item, filters, today) {
  const brief = item.brief || {};
  const identity = item.identity || {};
  const lower = (/** @type {any} */ value) => String(value || '').toLowerCase();
  const contains = (/** @type {any} */ value, /** @type {any} */ query) => lower(value).includes(lower(query).trim());
  const status = item.status || 'open';
  const owner = lower((item.responsibility || {}).owner || item.assignee);
  const mailbox = lower(item.mailbox || item.source_account);
  const text = [item.id, item.title, item.summary, brief.client, brief.claim, brief.needs, brief.next_step, item.claim_label, identity.claim_id, identity.client_id, identity.invoice_id, owner, mailbox].join(' ');
  if (filters.query && !contains(text, filters.query)) return false;
  if (filters.owner && (filters.owner === 'unassigned' ? Boolean(owner) : owner !== lower(filters.owner))) return false;
  if (filters.client && !contains([brief.client, item.claim_label, identity.client_id].join(' '), filters.client)) return false;
  if (filters.claim && !contains([brief.claim, identity.claim_id, identity.invoice_id].join(' '), filters.claim)) return false;
  if (filters.mailbox && !contains(mailbox, filters.mailbox)) return false;
  const urgent = Boolean(item.urgent) || lower(item.priority) === 'urgent';
  if (filters.urgency === 'urgent' && !urgent) return false;
  if (filters.urgency === 'normal' && urgent) return false;
  if (filters.status && status !== filters.status) return false;
  if (filters.quick === 'ready' && !isAutoResolvedCandidate(item)) return false;
  if (filters.quick === 'stale' && !isStaleCard(item, today)) return false;
  if (filters.quick === 'urgent' && !urgent) return false;
  if (filters.quick === 'unassigned' && Boolean(owner)) return false;
  const due = /^\d{4}-\d{2}-\d{2}/.test(String(item.due || '')) ? String(item.due).slice(0, 10) : '';
  if (filters.due === 'overdue' && (!due || due >= today)) return false;
  if (filters.due === 'today' && due !== today) return false;
  if (filters.due === 'undated' && due) return false;
  if (filters.due === 'upcoming' && (!due || due <= today)) return false;
  return true;
}

/** @param {any} receipt */
export function commandReceiptText(receipt) {
  if (!receipt) return 'No recent command';
  const states = /** @type {Record<string,string>} */ ({ queued: 'Queued for Aries', received: 'Received by Aries', processing: 'Processing', applied: 'Applied by Aries', failed: 'Failed' });
  return (states[receipt.state] || 'Status unknown') + (receipt.operation ? ' · ' + receipt.operation : '') + (receipt.state === 'failed' && receipt.detail ? ': ' + receipt.detail : '');
}

/** Build a frozen, reviewable plan. It never mutates cards. @param {any[]} items @param {Set<string>} selected @param {string} operation @param {string} value */
export function bulkActionPlan(items, selected, operation, value) {
  if (!['assign', 'snooze', 'duplicate-review', 'done'].includes(operation)) throw new Error('This bulk action is not supported.');
  if (operation === 'snooze' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a snooze date.');
  return items.filter(item => selected.has(String(item.id)) && item.status !== 'done').map(item => ({
    id: item.id, title: item.title || '', operation, value: operation === 'done' ? '' : value,
    before: { assignee: item.assignee || '', due: item.due || '', status: item.status || 'open' },
    payload: {
      ...(operation === 'duplicate-review'
        ? { id: item.id, operation: 'note', note: 'Duplicate review requested. Compare related cards and source evidence before changing or closing any card.' }
        : operation === 'done'
        ? { id: item.id, operation: 'done' }
        : { id: item.id, operation, value }),
      expected: { command_id: item.command_receipt?.id || 0, assignee: item.assignee || '', due: item.due || '', status: item.status || 'open' },
    },
  }));
}

/** An inverse is valid only after this exact command was applied and its effect still holds. @param {any} entry @param {any} item @param {any} receipt */
export function bulkUndoPayload(entry, item, receipt) {
  if (!item || !receipt || receipt.state !== 'applied' || String(receipt.id) !== String(entry.command_id)) return null;
  if (item.command_receipt && Number(item.command_receipt.id) > Number(entry.command_id)) return null;
  const expected = { command_id: receipt.id, assignee: item.assignee || '', due: item.due || '', status: item.status || 'open' };
  if (entry.operation === 'assign' && (item.assignee || '') === entry.value) return { id: item.id, operation: 'assign', value: entry.before.assignee, expected };
  if (entry.operation === 'snooze' && item.status === 'snoozed' && item.due === entry.value && entry.before.status === 'snoozed' && /^\d{4}-\d{2}-\d{2}$/.test(entry.before.due || '')) return { id: item.id, operation: 'snooze', value: entry.before.due, expected };
  if (entry.operation === 'done' && item.status === 'done' && (entry.before.status || 'open') === 'open') return { id: item.id, operation: 'reopen', expected };
  return null;
}

/** Preserve object identity so event handlers never retain an obsolete snapshot. @param {any[]} current @param {any[]} incoming */
export function reconcileBoardItems(current, incoming) {
  const byId = new Map(current.map(item => [String(item.id), item]));
  return incoming.map(next => {
    const item = byId.get(String(next.id));
    if (!item) return next;
    for (const key of Object.keys(item)) if (!(key in next)) delete item[key];
    Object.assign(item, next);
    return item;
  });
}
