export interface Env {
  DB: D1Database
  GALLERY: R2Bucket
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

    // PUBLIC GALLERY — list published photos
if (url.pathname === '/api/gallery' && request.method === 'GET') {
  const result = await env.DB.prepare(`
    SELECT
      id,
      r2_key,
      title,
      caption,
      category,
      display_order,
      created_at
    FROM gallery_photos
    WHERE is_published = 1
    ORDER BY display_order ASC, created_at DESC
  `).all()

  const photos = (result.results ?? []).map((photo: any) => ({
    id: photo.id,
    title: photo.title,
    caption: photo.caption,
    category: photo.category,
    displayOrder: photo.display_order,
    createdAt: photo.created_at,
    imageUrl: `/api/gallery/images/${encodeURIComponent(photo.r2_key)}`,
  }))

  return json({ photos })
}

// PUBLIC GALLERY — serve image from private R2 bucket
if (
  url.pathname.startsWith('/api/gallery/images/') &&
  request.method === 'GET'
) {
  const encodedKey = url.pathname.slice('/api/gallery/images/'.length)

  let key: string

  try {
    key = decodeURIComponent(encodedKey)
  } catch {
    return json({ error: 'Invalid image key' }, 400)
  }

  if (!key) {
    return json({ error: 'Image not found' }, 404)
  }

  const object = await env.GALLERY.get(key)

  if (!object) {
    return json({ error: 'Image not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream')
  }

  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=86400')

  return new Response(object.body, {
    headers,
  })
}

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
    // ADMIN GALLERY — upload photo
if (url.pathname === '/api/admin/gallery' && request.method === 'POST') {
  if (!authorised(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const formData = await request.formData()

  const file = formData.get('image')
  const title = String(formData.get('title') || '').trim()
  const caption = String(formData.get('caption') || '').trim()
  const category = String(formData.get('category') || 'NHYM Events').trim()

  if (!(file instanceof File)) {
    return json({ error: 'Image file is required' }, 400)
  }

  if (!title) {
    return json({ error: 'Photo title is required' }, 400)
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ]

  if (!allowedTypes.includes(file.type)) {
    return json(
      { error: 'Only JPG, PNG and WebP images are allowed' },
      400
    )
  }

// Maximum 20 MB per photograph
if (file.size > 20 * 1024 * 1024) {
  return json({ error: 'Image must be 20 MB or smaller' }, 400)
}

  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'

  const r2Key =
    `gallery/${Date.now()}-${crypto.randomUUID()}.${extension}`

  await env.GALLERY.put(r2Key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  })

  try {
    const result = await env.DB.prepare(`
      INSERT INTO gallery_photos (
        r2_key,
        title,
        caption,
        category,
        content_type,
        file_size,
        is_published,
        display_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
      .bind(
        r2Key,
        title,
        caption || null,
        category,
        file.type,
        file.size
      )
      .run()

    return json(
      {
        success: true,
        id: result.meta.last_row_id,
        title,
        category,
        imageUrl: `/api/gallery/images/${encodeURIComponent(r2Key)}`,
      },
      201
    )
  } catch (error) {
    // Avoid leaving an orphaned R2 object if the D1 insert fails.
    await env.GALLERY.delete(r2Key)
    throw error
  }  
}
// ADMIN GALLERY — list all photos
if (url.pathname === '/api/admin/gallery' && request.method === 'GET') {
  if (!authorised(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      r2_key,
      title,
      caption,
      category,
      content_type,
      file_size,
      is_published,
      display_order,
      created_at,
      updated_at
    FROM gallery_photos
    ORDER BY display_order ASC, created_at DESC
  `).all()

  const photos = (result.results ?? []).map((photo: any) => ({
    id: photo.id,
    title: photo.title,
    caption: photo.caption,
    category: photo.category,
    contentType: photo.content_type,
    fileSize: photo.file_size,
    isPublished: Boolean(photo.is_published),
    displayOrder: photo.display_order,
    createdAt: photo.created_at,
    updatedAt: photo.updated_at,
    imageUrl: `/api/gallery/images/${encodeURIComponent(photo.r2_key)}`,
  }))

  return json({ photos })
}
// ADMIN GALLERY - delete photo
if (
  url.pathname.startsWith('/api/admin/gallery/') &&
  request.method === 'DELETE'
) {
  if (!authorised(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const idText = url.pathname.slice('/api/admin/gallery/'.length)
  const id = Number(idText)

  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'Invalid photo ID' }, 400)
  }

  const photo = await env.DB.prepare(
    `SELECT id, r2_key
     FROM gallery_photos
     WHERE id = ?`
  )
    .bind(id)
    .first<{ id: number; r2_key: string }>()

  if (!photo) {
    return json({ error: 'Photo not found' }, 404)
  }

  // Delete the image from R2 first.
  await env.GALLERY.delete(photo.r2_key)

  // Then remove its database record.
  await env.DB.prepare(
    `DELETE FROM gallery_photos
     WHERE id = ?`
  )
    .bind(id)
    .run()

  return json({
    success: true,
    message: 'Photo deleted successfully',
    id: photo.id,
  })
}
// ADMIN GALLERY - update photo details
if (
  url.pathname.startsWith('/api/admin/gallery/') &&
  request.method === 'PATCH'
) {
  if (!authorised(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const idText = url.pathname.slice('/api/admin/gallery/'.length)
  const id = Number(idText)

  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'Invalid photo ID' }, 400)
  }

  let body: {
    title?: string
    caption?: string
    category?: string
    isPublished?: boolean
    displayOrder?: number
  }

  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM gallery_photos WHERE id = ?`
  )
    .bind(id)
    .first()

  if (!existing) {
    return json({ error: 'Photo not found' }, 404)
  }

  const title =
    typeof body.title === 'string' ? body.title.trim() : undefined

  const caption =
    typeof body.caption === 'string' ? body.caption.trim() : undefined

  const category =
    typeof body.category === 'string' ? body.category.trim() : undefined

  const isPublished =
    typeof body.isPublished === 'boolean'
      ? body.isPublished
        ? 1
        : 0
      : undefined

  const displayOrder =
    typeof body.displayOrder === 'number' &&
    Number.isInteger(body.displayOrder)
      ? body.displayOrder
      : undefined

  await env.DB.prepare(
    `UPDATE gallery_photos
     SET
       title = COALESCE(?, title),
       caption = COALESCE(?, caption),
       category = COALESCE(?, category),
       is_published = COALESCE(?, is_published),
       display_order = COALESCE(?, display_order),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      title ?? null,
      caption ?? null,
      category ?? null,
      isPublished ?? null,
      displayOrder ?? null,
      id
    )
    .run()

  return json({
    success: true,
    message: 'Photo updated successfully',
    id,
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
