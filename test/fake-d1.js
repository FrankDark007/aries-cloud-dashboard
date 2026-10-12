function result(results = [], changes = 0, lastRowId = 0) {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
      last_row_id: lastRowId,
      changed_db: changes > 0,
      changes,
    },
  }
}

class FakeD1Statement {
  constructor(database, query, values = []) {
    this.database = database
    this.query = query.replace(/\s+/g, ' ').trim().toLowerCase()
    this.values = values
  }

  bind(...values) {
    return new FakeD1Statement(this.database, this.query, values)
  }

  async first(columnName) {
    let row = null
    if (this.query.includes('from board_snapshot')) {
      row = this.database.snapshot ? { ...this.database.snapshot } : null
    } else if (this.query.includes('from board_threads')) {
      row = this.database.threads.get(Number(this.values[0])) || null
      row = row ? { ...row } : null
    } else if (this.query.includes('from worklist_snapshot')) {
      row = this.database.worklist ? { ...this.database.worklist } : null
    } else if (this.query.includes('from todo_catalogue')) {
      row = this.database.todoCatalogue ? { ...this.database.todoCatalogue } : null
    } else if (this.query.includes('max(sequence)') && this.query.includes('from todo_operations')) {
      row = { latest_sequence: this.database.todoOperations.length
        ? Math.max(...this.database.todoOperations.map((operation) => operation.sequence))
        : 0 }
    } else if (this.query.includes('from todo_operations') && this.query.includes('where event_id = ?')) {
      row = this.database.todoOperations.find((operation) => operation.event_id === this.values[0]) || null
      row = row ? { ...row } : null
    } else if (this.query.includes('from command_queue') && this.query.includes('where id = ?')) {
      row = this.database.commands.find((command) => command.id === Number(this.values[0])) || null
      row = row ? { ...row } : null
    } else {
      throw new Error(`Unsupported D1 first(): ${this.query}`)
    }
    return columnName && row ? row[columnName] ?? null : row
  }

  async all() {
    if(this.query.startsWith('update command_queue set received_at = ?')) {
      const [at,expires,max,now,limit]=this.values
      const rows=this.database.commands.filter(c=>c.state==='queued'&&!c.lease_token&&!c.received_at&&(c.attempts||0)<max&&(!c.next_attempt_at||c.next_attempt_at<=now)).sort((a,b)=>a.id-b.id).slice(0,limit)
      for(const c of rows)Object.assign(c,{received_at:at,lease_expires_at:expires,attempts:(c.attempts||0)+1})
      return result(rows.map(c=>({...c})),rows.length)
    }
    if (this.query === 'select * from command_queue order by id desc limit 1000') return result(this.database.commands.slice().sort((a,b)=>b.id-a.id).slice(0,1000).map(c=>({...c})))
    if (this.query.includes('from command_queue') && this.query.includes("state = 'applied'")) {
      return result(this.database.commands.filter((c) => (!this.query.includes("where operation in") || ['done', 'reopen', 'delete'].includes(c.operation)) && (c.state === 'queued' || (c.state === 'applied' && c.acked_at > this.values[0]))).sort((a, b) => a.id - b.id).map((c) => ({ ...c })))
    }
    if (this.query.includes('from command_queue') && this.query.includes("state = 'queued'")) {
      // The board read folds in every queued command and binds no limit; the sync read binds one.
      const limit = this.values.length ? Number(this.values.at(-1)) : Infinity
      const rows = this.database.commands
        .filter((command) => command.state === 'queued' && (!this.query.includes('lease_token is null') || !command.lease_token) && (!this.query.includes('next_attempt_at') || !command.next_attempt_at || command.next_attempt_at <= this.values[0]))
        .sort((left, right) => left.id - right.id)
        .slice(0, limit)
        .map(({ id, operation, item_id, note, value, actor_email, created_at }) => ({
          id,
          operation,
          item_id,
          note,
          value,
          actor_email,
          created_at,
        }))
      return result(rows)
    }
    if (this.query.includes('from todo_operations') && this.query.includes('where sequence > ?')) {
      const after = Number(this.values[0])
      const rows = this.database.todoOperations
        .filter((operation) => operation.sequence > after)
        .sort((left, right) => left.sequence - right.sequence)
        .map((operation) => ({ ...operation }))
      return result(rows)
    }
    if (this.query.includes('from activity_log')) {
      // A card's history on the board: that card's actions since a cutoff, newest first.
      if (this.query.includes("where source = 'board' and at >= ?")) {
        const since = String(this.values[0])
        return result(this.database.activity
          .filter((row) => row.source === 'board' && row.at >= since)
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(({ item_id, at, actor_email, operation, value }) => ({ item_id, at, actor_email, operation, value })))
      }
      if (this.query.includes('select distinct')) {
        return result(this.database.activity.map(({ actor_email, operation }) => ({ actor_email, operation })))
      }
      if (this.query.includes('where at >= ?')) {
        const since = String(this.values[0])
        return result(this.database.activity.filter((row) => row.at >= since).sort((a, b) => a.at.localeCompare(b.at)))
      }
      const [who, , op, , limit] = this.values
      return result(this.database.activity
        .filter((row) => (!who || row.actor_email.toLowerCase() === who) && (!op || row.operation === op))
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        .slice(0, Number(limit)))
    }
    if (this.query.includes('from team_users')) {
      return result([...this.database.team]
        .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
        .map(({ key, name, email, past_emails }) => ({ key, name, email, past_emails })))
    }
    // Which cards have a rendered email chain. The board serves this so the UI can offer
    // "Open email" only where there is one to open.
    if (this.query.includes('from board_threads')) {
      return result([...this.database.threads].map(([item_id,row]) => ({ item_id, source_subject: JSON.parse(row.thread_json).subject })))
    }
    throw new Error(`Unsupported D1 all(): ${this.query}`)
  }

  async run() {
    if (this.query.startsWith('insert into board_snapshot')) {
      const [snapshot_json, published_at] = this.values
      this.database.snapshot = { snapshot_json, published_at }
      return result([], 1, 1)
    }

    if (this.query.startsWith('delete from board_threads')) {
      this.database.threads.clear()
      return result([], 1, 0)
    }

    if (this.query.startsWith('insert into board_threads')) {
      const [item_id, thread_json, published_at] = this.values
      this.database.threads.set(Number(item_id), { item_id, thread_json, published_at })
      return result([], 1, 1)
    }

    if (this.query.startsWith('insert into worklist_snapshot')) {
      const [worklist_json, published_at] = this.values
      this.database.worklist = { worklist_json, published_at }
      return result([], 1, 1)
    }

    if (this.query.startsWith('insert into todo_catalogue')) {
      const [catalogue_json, published_at] = this.values
      this.database.todoCatalogue = { catalogue_json, published_at }
      return result([], 1, 1)
    }

    if (this.query.startsWith('insert into command_queue')) {
      const [operation, item_id, note, value, actor_email, created_at] = this.values
      const id = this.database.nextCommandId
      this.database.nextCommandId += 1
      this.database.commands.push({
        id,
        operation,
        item_id,
        note,
        value,
        actor_email,
        state: 'queued',
        created_at,
        acked_at: null,
        ack_status: null,
        ack_detail: null,
      })
      return result([], 1, id)
    }

    if (this.query.startsWith('insert or ignore into todo_operations')) {
      const [event_id, item_id, operation, payload_json, actor_email, actor_name, client_ts, server_ts] = this.values
      const existing = this.database.todoOperations.find((entry) => entry.event_id === event_id)
      if (existing) return result([], 0, existing.sequence)
      const sequence = this.database.nextTodoSequence
      this.database.nextTodoSequence += 1
      this.database.todoOperations.push({
        sequence,
        event_id,
        item_id,
        operation,
        payload_json,
        actor_email,
        actor_name,
        client_ts,
        server_ts,
      })
      return result([], 1, sequence)
    }

    if (this.query.startsWith('insert into activity_log')) {
      const [at, actor_email, source, operation, item_id, value, , , , , ip, country, user_agent] = this.values
      let title = null
      if (source === 'board' && this.database.snapshot) {
        const found = JSON.parse(this.database.snapshot.snapshot_json).items.find((item) => String(item.id) === item_id)
        title = found ? found.title : null
      } else if (source === 'todo' && this.database.todoCatalogue) {
        const found = JSON.parse(this.database.todoCatalogue.catalogue_json).items.find((item) => item.id === item_id)
        title = found ? found.text : null
      }
      const id = this.database.activity.length + 1
      this.database.activity.push({ id, at, actor_email, source, operation, item_id, value, title, ip, country, user_agent })
      return result([], 1, id)
    }

    if (this.query.startsWith('insert into team_users')) {
      const [key, name, email, updated_at, updated_by] = this.values
      if (this.database.team.some((row) => row.key === key || row.email === email)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed')
      }
      const position = Math.max(0, ...this.database.team.map((row) => row.position)) + 1
      this.database.team.push({ key, name, email, past_emails: '[]', position, updated_at, updated_by })
      return result([], 1, this.database.team.length)
    }

    if (this.query.startsWith('update team_users')) {
      const [name, email, past_emails, updated_at, updated_by, key] = this.values
      const row = this.database.team.find((candidate) => candidate.key === key)
      if (!row) return result([], 0)
      if (this.database.team.some((other) => other !== row && other.email === email)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed')
      }
      Object.assign(row, { name, email, past_emails, updated_at, updated_by })
      return result([], 1)
    }

    if (this.query.startsWith('insert into team_changes')) {
      const [at, actor_email, user_key, field, old_value, new_value] = this.values
      this.database.teamChanges.push({ at, actor_email, user_key, field, old_value, new_value })
      return result([], 1, this.database.teamChanges.length)
    }

    if (this.query.startsWith('update command_queue') && this.query.includes("error_code = 'lease_expired'")) {
      let changes=0
      for(const c of this.database.commands) if(c.state==='queued'&&c.lease_expires_at&&c.lease_expires_at<=this.values[1]) {Object.assign(c,{state:'failed',error_code:'lease_expired',acked_at:this.values[0],ack_detail:'Processing lease expired. Check the source before retrying.'});changes++}
      return result([],changes)
    }
    if (this.query.startsWith('update command_queue') && this.query.includes('received_at = coalesce')) {
      const c=this.database.commands.find(c=>c.id===this.values[1]&&c.state==='queued'&&!c.lease_token)
      if(!c)return result([],0)
      if(!c.received_at){c.received_at=this.values[0];c.attempts=(c.attempts||0)+1}
      return result([],1)
    }
    if (this.query.startsWith('update command_queue') && this.query.includes('next_attempt_at = ?')) {
      const [state,detail,acked_at,error_code,next_attempt_at,id,token]=this.values
      const c=this.database.commands.find(c=>c.id===id&&c.state==='queued'&&(!c.lease_token||c.lease_token===token))
      if(!c)return result([],0)
      Object.assign(c,{state,ack_status:state,ack_detail:detail,acked_at,error_code,next_attempt_at})
      return result([],1)
    }
    if (this.query.startsWith('update command_queue')) {
      const [state, detail, acked_at, id] = this.values
      const command = this.database.commands.find((candidate) => candidate.id === Number(id))
      if (!command || command.state !== 'queued') return result([], 0)
      command.state = state
      command.ack_status = state
      command.ack_detail = detail
      command.acked_at = acked_at
      return result([], 1)
    }
    throw new Error(`Unsupported D1 run(): ${this.query}`)
  }
}

export class FakeD1Database {
  constructor() {
    this.snapshot = null
    this.worklist = null
    this.threads = new Map()
    this.commands = []
    this.nextCommandId = 1
    this.todoCatalogue = null
    this.todoOperations = []
    this.nextTodoSequence = 1
    this.activity = []
    // Empty, as before migration 0007 seeds it; seedTeam() is the seeded roster.
    this.team = []
    this.teamChanges = []
  }

  seedTeam() {
    const people = [
      ['frank', 'Frank', 'frankd@flooddoctorva.com'],
      ['mark', 'Mark', 'mark@flood.doctor'],
      ['steve', 'Steve', 'steve@restorationdoctors.com'],
      ['shayan', 'Shayan', 'shyon@restorationdoctors.com'],
      ['katherine', 'Katherine', 'katherine@restorationdoctors.com'],
    ]
    this.team = people.map(([key, name, email], index) => ({
      key, name, email, past_emails: '[]', position: index + 1, updated_at: '2026-09-30T00:00:00Z', updated_by: 'seed',
    }))
  }

  prepare(query) {
    return new FakeD1Statement(this, query)
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()))
  }

  async exec() {
    return { count: 0, duration: 0 }
  }

  seedSnapshot(items, publishedAt) {
    this.snapshot = {
      snapshot_json: JSON.stringify({ items }),
      published_at: publishedAt,
    }
  }

  seedTodoCatalogue(items, publishedAt) {
    this.todoCatalogue = {
      catalogue_json: JSON.stringify({ items }),
      published_at: publishedAt,
    }
  }
}
