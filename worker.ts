export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ADMIN_TOKEN: string
}

type RegistrationPayload = {
  email: string
  total: number
  paymentMode: string
  paymentReference: string
  declarations: Record<string, boolean>
  participants: Array<Record<string, unknown> & { name?: string; category?: string; fee?: number }>
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

function authorised(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/registrations' && request.method === 'POST') {
      let body: RegistrationPayload
      try { body = await request.json() as RegistrationPayload } catch { return json({ error: 'Invalid request.' }, 400) }
      if (!body.email || !body.email.includes('@')) return json({ error: 'A valid email address is required.' }, 400)
      if (!Array.isArray(body.participants) || body.participants.length < 1) return json({ error: 'Add at least one participant.' }, 400)
      if (!body.paymentMode || !body.paymentReference || body.paymentReference.trim().length < 2) return json({ error: 'Payment method and transaction/reference number are required.' }, 400)
      if (!body.declarations || !Object.values(body.declarations).every(Boolean)) return json({ error: 'All declarations are required.' }, 400)

      const createdAt = new Date().toISOString()
      const result = await env.DB.prepare(`INSERT INTO registrations
        (email, total_amount, payment_mode, payment_reference, status, declarations_json, created_at)
        VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`)
        .bind(body.email.trim().toLowerCase(), Math.round(Number(body.total) || 0), body.paymentMode, body.paymentReference.trim(), JSON.stringify(body.declarations), createdAt)
        .run()

      const id = Number(result.meta.last_row_id)
      const registrationId = `NHYM26-${String(id).padStart(6, '0')}`
      await env.DB.prepare('UPDATE registrations SET registration_id = ? WHERE id = ?').bind(registrationId, id).run()

      const statements = body.participants.map((p, i) => env.DB.prepare(`INSERT INTO participants
        (registration_id, participant_no, name, dob, gender, address, district, state, pin, age, category, fee, activities_json, cultural, sports, from_outside, accommodation, note, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, i + 1, String(p.name ?? ''), String(p.dob ?? ''), String(p.gender ?? ''), String(p.address ?? ''), String(p.district ?? ''), String(p.state ?? ''), String(p.pin ?? ''), String(p.age ?? ''), String(p.category ?? ''), Math.round(Number(p.fee) || 0), JSON.stringify(p.activities ?? []), String(p.cultural ?? ''), String(p.sports ?? ''), String(p.fromOutside ?? ''), String(p.accommodation ?? ''), String(p.note ?? ''), JSON.stringify(p)))
      if (statements.length) await env.DB.batch(statements)
      return json({ ok: true, registrationId, status: 'PENDING' }, 201)
    }

    if (url.pathname === '/api/admin/registrations' && request.method === 'GET') {
      if (!authorised(request, env)) return json({ error: 'Unauthorized' }, 401)
      const rows = await env.DB.prepare(`SELECT r.*, COUNT(p.id) participant_count
        FROM registrations r LEFT JOIN participants p ON p.registration_id = r.id
        GROUP BY r.id ORDER BY r.id DESC LIMIT 500`).all()
      return json({ registrations: rows.results })
    }

    const match = url.pathname.match(/^\/api\/admin\/registrations\/(\d+)$/)
    if (match && request.method === 'PATCH') {
      if (!authorised(request, env)) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json() as { status?: string }
      const allowed = ['PENDING', 'PAYMENT_VERIFIED', 'APPROVED', 'REJECTED']
      if (!body.status || !allowed.includes(body.status)) return json({ error: 'Invalid status.' }, 400)
      await env.DB.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
        .bind(body.status, new Date().toISOString(), Number(match[1])).run()
      return json({ ok: true })
    }

    return env.ASSETS.fetch(request)
  },
}
