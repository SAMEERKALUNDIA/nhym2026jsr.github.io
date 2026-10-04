export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ADMIN_TOKEN: string
  EMAIL_SERVICE_URL: string
  NHYM_EMAIL_SECRET: string
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

    // Participant Portal — look up one registration using
    // Registration ID + the email used during registration.
    if (
      url.pathname === '/api/participant/lookup' &&
      request.method === 'POST'
    ) {
      let body: {
        registrationId?: string
        email?: string
      }

      try {
        body = await request.json() as {
          registrationId?: string
          email?: string
        }
      } catch {
        return json({ error: 'Invalid request.' }, 400)
      }

      const registrationId =
        String(body.registrationId ?? '')
          .trim()
          .toUpperCase()

      const email =
        String(body.email ?? '')
          .trim()
          .toLowerCase()

      if (!registrationId || !email) {
        return json(
          {
            error:
              'Registration ID and registered email address are required.'
          },
          400
        )
      }

      const registration = await env.DB.prepare(`
        SELECT
          id,
          registration_id,
          email,
          total_amount,
          payment_mode,
          status,
          created_at,
          updated_at,
          approval_email_sent_at
        FROM registrations
        WHERE registration_id = ?
          AND LOWER(email) = ?
        LIMIT 1
      `)
        .bind(registrationId, email)
        .first<{
          id: number
          registration_id: string
          email: string
          total_amount: number
          payment_mode: string
          status: string
          created_at: string
          updated_at: string | null
          approval_email_sent_at: string | null
        }>()

      /*
       * Use the same response whether the ID does not exist
       * or the email does not match. This avoids revealing
       * whether a particular Registration ID exists.
       */
      if (!registration) {
        return json(
          {
            error:
              'Registration not found. Check your Registration ID and registered email address.'
          },
          404
        )
      }

      const participantResult = await env.DB.prepare(`
        SELECT
          participant_no,
          name,
          dob,
          gender,
          district,
          state,
          age,
          category,
          fee,
          activities_json,
          cultural,
          sports,
          from_outside,
          accommodation,
          note
        FROM participants
        WHERE registration_id = ?
        ORDER BY participant_no
      `)
        .bind(registration.id)
        .all()

      return json({
        ok: true,

        registration: {
          registrationId: registration.registration_id,
          email: registration.email,
          totalAmount: registration.total_amount,
          paymentMode: registration.payment_mode,
          status: registration.status,
          createdAt: registration.created_at,
          updatedAt: registration.updated_at,
          approvalEmailSent:
            Boolean(registration.approval_email_sent_at),

          participants: participantResult.results
        }
      })
    }
    if (url.pathname === '/api/admin/registrations' && request.method === 'GET') {
  if (!authorised(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const rows = await env.DB.prepare(`
    SELECT
      r.*,
      COUNT(p.id) AS participant_count
    FROM registrations r
    LEFT JOIN participants p
      ON p.registration_id = r.id
    GROUP BY r.id
    ORDER BY r.id DESC
    LIMIT 500
  `).all()

  const registrations = await Promise.all(
    rows.results.map(async (row: any) => {
      const participants = await env.DB.prepare(`
        SELECT
          id,
          participant_no,
          name,
          dob,
          gender,
          address,
          district,
          state,
          pin,
          age,
          category,
          fee,
          activities_json,
          cultural,
          sports,
          from_outside,
          accommodation,
          note,
          details_json
        FROM participants
        WHERE registration_id = ?
        ORDER BY participant_no
      `)
        .bind(row.id)
        .all()

      return {
        ...row,
        participants: participants.results
      }
    })
  )

  return json({ registrations })
}
    const match = url.pathname.match(/^\/api\/admin\/registrations\/(\d+)$/)
    if (match && request.method === 'PATCH') {
      if (!authorised(request, env)) {
        return json({ error: 'Unauthorised' }, 401)
      }

      const body = await request.json() as { status?: string }

      const allowed = [
        'PENDING',
        'PAYMENT_VERIFIED',
        'APPROVED',
        'REJECTED'
      ]

      if (!body.status || !allowed.includes(body.status)) {
        return json({ error: 'Invalid status.' }, 400)
      }

      const id = Number(match[1])

      const registration = await env.DB.prepare(`
        SELECT
          id,
          registration_id,
          email,
          total_amount,
          payment_mode,
          payment_reference,
          status,
          approval_email_sent_at
        FROM registrations
        WHERE id = ?
      `)
        .bind(id)
        .first<{
          id: number
          registration_id: string
          email: string
          total_amount: number
          payment_mode: string
          payment_reference: string
          status: string
          approval_email_sent_at: string | null
        }>()

      if (!registration) {
        return json({ error: 'Registration not found.' }, 404)
      }

      // Require payment verification before final approval.
      if (
        body.status === 'APPROVED' &&
        registration.status !== 'PAYMENT_VERIFIED'
      ) {
        return json(
          { error: 'Payment must be verified before approval.' },
          400
        )
      }

      // Send approval email before changing the final status.
      if ( 
        body.status === 'APPROVED' &&
          !registration.approval_email_sent_at
       ) {
        const participantResult = await env.DB.prepare(`
          SELECT name
          FROM participants
          WHERE registration_id = ?
          ORDER BY participant_no
        `)
          .bind(id)
          .all<{ name: string }>()

        const participantNames =
          participantResult.results.map((participant) => participant.name)

        if (!env.EMAIL_SERVICE_URL || !env.NHYM_EMAIL_SECRET) {
          return json(
            { error: 'Email service is not configured.' },
            500
          )
        }

        try {
          const emailResponse = await fetch(env.EMAIL_SERVICE_URL, {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              secret: env.NHYM_EMAIL_SECRET,
              email: registration.email,
              registrationId: registration.registration_id,
              participants: participantNames,
              totalAmount: registration.total_amount,
              paymentMode: registration.payment_mode,
              paymentReference: registration.payment_reference
            })
          })

          if (!emailResponse.ok) {
            return json(
              { error: 'Approval email could not be sent.' },
              502
            )
          }

          const emailResult = await emailResponse.json() as {
            ok?: boolean
            error?: string
          }

          if (!emailResult.ok) {
            return json(
              {
                error:
                  emailResult.error ||
                  'Approval email could not be sent.'
              },
              502
            )
          }
        } catch {
          return json(
            { error: 'Unable to contact the email service.' },
            502
          )
        }
      }

      const updatedAt = new Date().toISOString()

      const shouldSendApprovalEmail =
        body.status === 'APPROVED' &&
        !registration.approval_email_sent_at

      if (shouldSendApprovalEmail) {
        await env.DB.prepare(`
          UPDATE registrations
          SET status = ?,
              updated_at = ?,
              approval_email_sent_at = ?
          WHERE id = ?
        `)
          .bind(
            body.status,
            updatedAt,
            updatedAt,
            id
          )
          .run()
      } else {
        await env.DB.prepare(`
          UPDATE registrations
          SET status = ?,
              updated_at = ?
          WHERE id = ?
        `)
          .bind(
            body.status,
            updatedAt,
            id
          )
          .run()
      }

      return json({
        ok: true,
        status: body.status,
        emailSent: shouldSendApprovalEmail
      })
    }

    return env.ASSETS.fetch(request)
  },
}
