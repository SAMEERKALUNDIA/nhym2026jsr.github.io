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

// Finance responses contain private accounting/user data and must not be cached.
const financeJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' } })

// Store registration text in uppercase while preserving Payment Reference exactly.
function uppercaseRegistrationValues(value: unknown, key = ''): unknown {
  if (key.toLowerCase() === 'paymentreference') return value
  if (typeof value === 'string') return value.toUpperCase()
  if (Array.isArray(value)) return value.map((item) => uppercaseRegistrationValues(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        uppercaseRegistrationValues(childValue, childKey),
      ])
    )
  }
  return value
}

function authorised(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)
}

async function financeDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function financePasswordHash(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, key, 256)
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')
}

function financeRandomHex(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

function isValidFinanceDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
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
      body = uppercaseRegistrationValues(body) as RegistrationPayload
      if (!body.email || !body.email.includes('@')) return json({ error: 'A valid email address is required.' }, 400)
      if (!Array.isArray(body.participants) || body.participants.length < 1) return json({ error: 'Add at least one participant.' }, 400)
      if (!body.paymentMode || !body.paymentReference || body.paymentReference.trim().length < 2) return json({ error: 'Payment method and transaction/reference number are required.' }, 400)
      if (!body.declarations || !Object.values(body.declarations).every(Boolean)) return json({ error: 'All declarations are required.' }, 400)

      // Treat references consistently so spacing/case changes cannot bypass duplicate protection.
      const normalizedReference = body.paymentReference.trim().replace(/\s+/g, '').toUpperCase()
      if (normalizedReference.length < 2) return json({ error: 'Enter a valid payment transaction/reference number.' }, 400)
      const duplicate = await env.DB.prepare(`
        SELECT id FROM registrations
        WHERE UPPER(REPLACE(REPLACE(REPLACE(TRIM(payment_reference), ' ', ''), char(9), ''), char(10), '')) = ?
        LIMIT 1
      `).bind(normalizedReference).first<{ id: number }>()
      if (duplicate) {
        return json({ error: 'This transaction ID/payment reference has already been submitted. Please check your payment details.' }, 409)
      }

      const createdAt = new Date().toISOString()
      let result
      try {
        result = await env.DB.prepare(`INSERT INTO registrations
          (email, total_amount, payment_mode, payment_reference, status, declarations_json, created_at)
          VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`)
          .bind(body.email.trim().toUpperCase(), Math.round(Number(body.total) || 0), body.paymentMode, normalizedReference, JSON.stringify(body.declarations), createdAt)
          .run()
      } catch (error) {
        // The unique index is the final guard against simultaneous duplicate submissions.
        const message = error instanceof Error ? error.message : ''
        if (/unique constraint|constraint failed/i.test(message)) {
          return json({ error: 'This transaction ID/payment reference has already been submitted. Please check your payment details.' }, 409)
        }
        throw error
      }

      const id = Number(result.meta.last_row_id)
      const registrationId = `NHYM26-${String(id).padStart(6, '0')}`
      await env.DB.prepare('UPDATE registrations SET registration_id = ? WHERE id = ?').bind(registrationId, id).run()

      const statements = body.participants.map((p, i) => env.DB.prepare(`INSERT INTO participants
        (registration_id, participant_no, name, dob, gender, address, district, state, pin, age, category, fee, activities_json, cultural, sports, from_outside, accommodation, note, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, i + 1, String(p.name ?? '').trim().toUpperCase(), String(p.dob ?? ''), String(p.gender ?? ''), String(p.address ?? ''), String(p.district ?? ''), String(p.state ?? ''), String(p.pin ?? ''), String(p.age ?? ''), String(p.category ?? ''), Math.round(Number(p.fee) || 0), JSON.stringify(p.activities ?? []), String(p.cultural ?? ''), String(p.sports ?? ''), String(p.fromOutside ?? ''), String(p.accommodation ?? ''), String(p.note ?? ''), JSON.stringify({ ...p, name: String(p.name ?? '').trim().toUpperCase() })))
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

// Atomically reserve space shared by gallery photos and finance documents.
const MAX_SHARED_STORAGE = 10 * 1024 * 1024 * 1024
const storageReservationId = crypto.randomUUID()
const reservationBatch = await env.DB.batch([
  env.DB.prepare("DELETE FROM finance_storage_reservations WHERE expires_at <= CURRENT_TIMESTAMP"),
  env.DB.prepare(`
    INSERT INTO finance_storage_reservations (id, size_bytes, expires_at)
    SELECT ?, ?, datetime('now', '+1 hour')
    WHERE
      (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
      (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
      (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) +
      ? <= ?
  `).bind(storageReservationId, file.size, file.size, MAX_SHARED_STORAGE),
])
if (Number(reservationBatch[1]?.meta?.changes ?? 0) !== 1) {
  const storageResult = await env.DB.prepare(`
    SELECT
      (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
      (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
      (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) AS total_bytes
  `).first<{ total_bytes: number }>()
  const usedBytes = Number(storageResult?.total_bytes ?? 0)
  return json(
    {
      error: 'Shared R2 storage limit reached.',
      message: 'This upload would exceed the shared 10 GB gallery and finance document storage limit.',
      currentStorageBytes: usedBytes,
      availableBytes: Math.max(0, MAX_SHARED_STORAGE - usedBytes),
      fileSize: file.size,
      maxStorageBytes: MAX_SHARED_STORAGE,
    },
    400
  )
}

  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'

  const r2Key =
    `gallery/${Date.now()}-${crypto.randomUUID()}.${extension}`

  try {
    await env.GALLERY.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    })
  } catch (error) {
    try { await env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(storageReservationId).run() } catch (cleanupError) {
      console.error('Gallery storage reservation cleanup failed after R2 upload error', { storageReservationId, cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) })
    }
    throw error
  }

  try {
    const result = await env.DB.batch([
      env.DB.prepare(`
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
      `).bind(r2Key, title, caption || null, category, file.type, file.size),
      env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(storageReservationId),
    ])

    return json(
      {
        success: true,
        id: result[0]?.meta?.last_row_id,
        title,
        category,
        imageUrl: `/api/gallery/images/${encodeURIComponent(r2Key)}`,
      },
      201
    )
  } catch (error) {
    // Best-effort cleanup; preserve reservation if R2 cleanup fails so the quota stays conservatively accounted for until expiry.
    try {
      await env.GALLERY.delete(r2Key)
      await env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(storageReservationId).run()
    } catch (cleanupError) {
      console.error('Gallery upload cleanup failed', { storageReservationId, cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) })
    }
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
    // NHYM FINANCE PANEL — individually authenticated finance users.
    if (url.pathname.startsWith('/api/finance/')) {
      if (url.pathname === '/api/finance/setup-status' && request.method === 'GET') {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM finance_users').first<{ total: number }>()
        return financeJson({ setupComplete: Number(count?.total ?? 0) > 0 })
      }
      if (url.pathname === '/api/finance/bootstrap' && request.method === 'POST') {
        if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
        let body: { displayName?: string; loginId?: string; password?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM finance_users').first<{ total: number }>()
        if (Number(count?.total ?? 0) !== 0) return financeJson({ error: 'Finance setup is already complete. Ask a Finance Head to create accounts.' }, 409)
        const displayName = String(body.displayName ?? '').trim().slice(0, 100)
        const loginId = String(body.loginId ?? '').trim().toLowerCase().slice(0, 80)
        const password = String(body.password ?? '')
        if (displayName.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 200) return financeJson({ error: 'Name, login ID (3–80 letters/numbers/._-) and a password of at least 12 characters are required.' }, 400)
        const salt = financeRandomHex(16)
        const passwordHash = await financePasswordHash(password, salt)
        const id = crypto.randomUUID()
        const created = await env.DB.prepare("INSERT INTO finance_users (id, display_name, login_id, role, password_salt, password_hash) SELECT ?, ?, ?, 'FINANCE_HEAD', ?, ? WHERE NOT EXISTS (SELECT 1 FROM finance_users)").bind(id, displayName, loginId, salt, passwordHash).run()
        if (Number(created.meta?.changes ?? 0) !== 1) return financeJson({ error: 'Finance setup was completed by another request. Please sign in.' }, 409)
        return financeJson({ ok: true, message: 'Finance Head account created. Sign in using your individual credentials.' }, 201)
      }

      if (url.pathname === '/api/finance/login' && request.method === 'POST') {
        let body: { loginId?: string; password?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const loginId = String(body.loginId ?? '').trim().toLowerCase()
        const password = String(body.password ?? '')
        if (!loginId || !password || password.length > 200) return financeJson({ error: 'Login ID and password are required.' }, 400)
        // Rate-limit per login ID and Cloudflare-provided client IP; store only a digest, not the raw IP.
        const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown'
        const attemptKey = await financeDigest(`${loginId}:${clientIp}`)
        const limit = await env.DB.prepare("SELECT locked_until FROM finance_login_limits WHERE attempt_key = ? AND datetime(locked_until) > datetime('now')").bind(attemptKey).first<{ locked_until: string }>()
        if (limit) return financeJson({ error: 'Too many failed login attempts. Try again after 15 minutes.' }, 429)
        const user = await env.DB.prepare('SELECT id, display_name, login_id, role, password_salt, password_hash FROM finance_users WHERE login_id = ? AND is_active = 1').bind(loginId).first<{ id: string; display_name: string; login_id: string; role: string; password_salt: string; password_hash: string }>()
        // Perform the same PBKDF2 work for unknown users to reduce login-ID timing leaks.
        const candidate = await financePasswordHash(password, user?.password_salt ?? 'NHYM-FINANCE-UNKNOWN-USER-SALT')
        if (!user || candidate !== user.password_hash) {
          await env.DB.prepare(`INSERT INTO finance_login_limits (attempt_key, failed_attempts, window_started_at, locked_until, updated_at)
            VALUES (?, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
            ON CONFLICT(attempt_key) DO UPDATE SET
              failed_attempts = CASE WHEN datetime(finance_login_limits.window_started_at) <= datetime('now', '-15 minutes') THEN 1 ELSE finance_login_limits.failed_attempts + 1 END,
              window_started_at = CASE WHEN datetime(finance_login_limits.window_started_at) <= datetime('now', '-15 minutes') THEN CURRENT_TIMESTAMP ELSE finance_login_limits.window_started_at END,
              locked_until = CASE WHEN datetime(finance_login_limits.window_started_at) <= datetime('now', '-15 minutes') THEN NULL ELSE finance_login_limits.locked_until END,
              updated_at = CURRENT_TIMESTAMP`).bind(attemptKey).run()
          await env.DB.prepare(`UPDATE finance_login_limits SET locked_until = datetime('now', '+15 minutes'), updated_at = CURRENT_TIMESTAMP
            WHERE attempt_key = ? AND failed_attempts >= 5 AND datetime(window_started_at) > datetime('now', '-15 minutes')
              AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))`).bind(attemptKey).run()
          return financeJson({ error: 'Login ID or password is incorrect.' }, 401)
        }
        await env.DB.prepare('DELETE FROM finance_login_limits WHERE attempt_key = ?').bind(attemptKey).run()
        const token = financeRandomHex(32)
        const tokenHash = await financeDigest(token)
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
        await env.DB.prepare('INSERT INTO finance_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run()
        await env.DB.prepare('UPDATE finance_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run()
        return financeJson({ ok: true, token, expiresAt, user: { id: user.id, displayName: user.display_name, loginId: user.login_id, role: user.role } })
      }

      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
      if (!bearer) return financeJson({ error: 'Sign in to access Finance Management.' }, 401)
      const tokenHash = await financeDigest(bearer)
      const actor = await env.DB.prepare("SELECT u.id, u.display_name, u.login_id, u.role FROM finance_sessions s JOIN finance_users u ON u.id = s.user_id WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1").bind(tokenHash).first<{ id: string; display_name: string; login_id: string; role: 'FINANCE_HEAD' | 'OPERATOR' | 'APPROVER' | 'AUDITOR' }>()
      if (!actor) return financeJson({ error: 'Finance session expired. Please sign in again.' }, 401)
      if (url.pathname === '/api/finance/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM finance_sessions WHERE token_hash = ?').bind(tokenHash).run()
        return financeJson({ ok: true })
      }
      const actorId = actor.id
      const role = actor.role
      const method = request.method
      const pathname = url.pathname
      const isDashboard = pathname === '/api/finance/dashboard' && method === 'GET'
      const isAuditLogs = pathname === '/api/finance/audit' && method === 'GET'
      const isUserAdmin = (pathname === '/api/finance/users' && (method === 'GET' || method === 'POST')) || (/^\/api\/finance\/users\/[a-f0-9-]+\/status$/i.test(pathname) && method === 'POST')
      const isExpenseCreate = pathname === '/api/finance/expenses' && method === 'POST'
      const isIncomeCreate = pathname === '/api/finance/income' && method === 'POST'
      const isBudgetCreate = pathname === '/api/finance/budgets' && method === 'POST'
      const isExpenseDecision = /^\/api\/finance\/expenses\/[a-f0-9-]+\/decision$/i.test(pathname) && method === 'POST'
      const isBudgetDecision = /^\/api\/finance\/budgets\/[a-f0-9-]+\/decision$/i.test(pathname) && method === 'POST'
      const isPaymentCreate = /^\/api\/finance\/expenses\/[a-f0-9-]+\/payments$/i.test(pathname) && method === 'POST'
      const isDocumentUpload = pathname === '/api/finance/documents' && method === 'POST'
      const isDocumentDownload = /^\/api\/finance\/documents\/[a-f0-9-]+$/i.test(pathname) && method === 'GET'
      const allowed = role === 'FINANCE_HEAD' ||
        (role === 'OPERATOR' && (isDashboard || isExpenseCreate || isIncomeCreate || isBudgetCreate || isPaymentCreate || isDocumentUpload || isDocumentDownload)) ||
        (role === 'APPROVER' && (isDashboard || isExpenseDecision || isBudgetDecision || isDocumentDownload)) ||
        (role === 'AUDITOR' && (isDashboard || isAuditLogs || isDocumentDownload))
      if (!allowed && !isUserAdmin) return financeJson({ error: 'Your finance role does not permit this action.' }, 403)
      if (isUserAdmin && role !== 'FINANCE_HEAD') return financeJson({ error: 'Only the Finance Head can manage finance accounts.' }, 403)

      if (isAuditLogs) {
        const requestedLimit = Number(url.searchParams.get('limit') ?? 200)
        const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, Math.floor(requestedLimit))) : 200
        const entityType = String(url.searchParams.get('entityType') ?? '').trim().toUpperCase()
        if (entityType && !['EXPENSE', 'PAYMENT', 'INCOME', 'BUDGET', 'FINANCE_USER', 'DOCUMENT'].includes(entityType)) {
          return financeJson({ error: 'Invalid audit entity type.' }, 400)
        }
        const logs = entityType
          ? await env.DB.prepare(`SELECT l.id, l.actor_user_id, u.display_name AS actor_name, l.entity_type, l.entity_id, l.action, l.old_values_json, l.new_values_json, l.reason, l.request_id, l.created_at FROM finance_audit_logs l LEFT JOIN finance_users u ON u.id = l.actor_user_id WHERE l.entity_type = ? ORDER BY l.created_at DESC LIMIT ?`).bind(entityType, limit).all()
          : await env.DB.prepare(`SELECT l.id, l.actor_user_id, u.display_name AS actor_name, l.entity_type, l.entity_id, l.action, l.old_values_json, l.new_values_json, l.reason, l.request_id, l.created_at FROM finance_audit_logs l LEFT JOIN finance_users u ON u.id = l.actor_user_id ORDER BY l.created_at DESC LIMIT ?`).bind(limit).all()
        return financeJson({ logs: logs.results ?? [] })
      }

      if (pathname === '/api/finance/users' && method === 'GET') {
        const users = await env.DB.prepare('SELECT id, display_name, login_id, role, is_active, created_at, last_login_at FROM finance_users ORDER BY created_at').all()
        return financeJson({ users: users.results ?? [] })
      }
      const userStatusMatch = pathname.match(/^\/api\/finance\/users\/([a-f0-9-]+)\/status$/i)
      if (userStatusMatch && method === 'POST') {
        let body: { active?: boolean }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        if (typeof body.active !== 'boolean') return financeJson({ error: 'Active must be true or false.' }, 400)
        const target = await env.DB.prepare('SELECT id, display_name, login_id, role, is_active FROM finance_users WHERE id = ?').bind(userStatusMatch[1]).first<{ id: string; display_name: string; login_id: string; role: string; is_active: number }>()
        if (!target) return financeJson({ error: 'Finance user not found.' }, 404)
        if (target.id === actorId && !body.active) return financeJson({ error: 'You cannot deactivate your own account.' }, 400)
        if (!body.active && target.role === 'FINANCE_HEAD' && Number(target.is_active) === 1) {
          const activeHeads = await env.DB.prepare("SELECT COUNT(*) AS total FROM finance_users WHERE role = 'FINANCE_HEAD' AND is_active = 1").first<{ total: number }>()
          if (Number(activeHeads?.total ?? 0) <= 1) return financeJson({ error: 'At least one active Finance Head must remain.' }, 409)
        }
        const nextActive = body.active ? 1 : 0
        if (Number(target.is_active) === nextActive) {
          return financeJson({ ok: true, active: body.active, unchanged: true })
        }
        const statusBatch = await env.DB.batch([
          // Re-check the final active Finance Head inside the write transaction to prevent concurrent deactivations removing every head.
          env.DB.prepare(`UPDATE finance_users SET is_active = ?
            WHERE id = ? AND is_active <> ?
              AND (? = 1 OR role <> 'FINANCE_HEAD' OR EXISTS (
                SELECT 1 FROM finance_users
                WHERE role = 'FINANCE_HEAD' AND is_active = 1 AND id <> ?
              ))`).bind(nextActive, target.id, nextActive, nextActive, target.id),
          env.DB.prepare(`INSERT INTO finance_audit_logs
            (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id)
            SELECT ?, ?, 'FINANCE_USER', ?, ?, ?, ?, NULL, ?
            WHERE changes() = 1`).bind(
              crypto.randomUUID(), actorId, target.id,
              body.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
              JSON.stringify({ isActive: Boolean(target.is_active) }),
              JSON.stringify({ isActive: body.active }),
              request.headers.get('cf-ray')
            ),
          env.DB.prepare('DELETE FROM finance_sessions WHERE user_id = ? AND ? = 0 AND changes() = 1').bind(target.id, nextActive)
        ])
        if (Number(statusBatch[0]?.meta?.changes ?? 0) !== 1) {
          return financeJson({ error: 'The account status changed concurrently or at least one active Finance Head must remain. Refresh and try again; no changes were made.' }, 409)
        }
        return financeJson({ ok: true, active: body.active })
      }

      if (pathname === '/api/finance/users' && method === 'POST') {
        let body: { displayName?: string; loginId?: string; password?: string; role?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const displayName = String(body.displayName ?? '').trim().slice(0, 100)
        const loginId = String(body.loginId ?? '').trim().toLowerCase().slice(0, 80)
        const password = String(body.password ?? '')
        const newRole = String(body.role ?? '')
        if (displayName.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 200 || !['FINANCE_HEAD','OPERATOR','APPROVER','AUDITOR'].includes(newRole)) return financeJson({ error: 'Enter a valid name, login ID, password (at least 12 characters) and role.' }, 400)
        const salt = financeRandomHex(16)
        const passwordHash = await financePasswordHash(password, salt)
        const id = crypto.randomUUID()
        try {
          await env.DB.batch([
            env.DB.prepare('INSERT INTO finance_users (id, display_name, login_id, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(id, displayName, loginId, newRole, salt, passwordHash),
            env.DB.prepare(`INSERT INTO finance_audit_logs
              (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id)
              VALUES (?, ?, 'FINANCE_USER', ?, 'USER_CREATED', NULL, ?, NULL, ?)`).bind(
                crypto.randomUUID(), actorId, id,
                JSON.stringify({ displayName, loginId, role: newRole }),
                request.headers.get('cf-ray')
              )
          ])
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (/finance_users\.login_id/i.test(message)) {
            return financeJson({ error: 'This login ID is already in use.' }, 409)
          }
          if (/unique constraint|constraint failed|foreign key constraint/i.test(message)) {
            return financeJson({ error: 'Finance user could not be created because the request conflicts with existing finance data. Refresh and try again.' }, 409)
          }
          throw error
        }
        return financeJson({ ok: true, user: { id, displayName, loginId, role: newRole } }, 201)
      }
      const audit = async (entityType: string, entityId: string, action: string, oldValues?: unknown, newValues?: unknown, reason?: string) => {
        await env.DB.prepare(`
          INSERT INTO finance_audit_logs
            (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(), actorId, entityType, entityId, action,
          oldValues == null ? null : JSON.stringify(oldValues),
          newValues == null ? null : JSON.stringify(newValues),
          reason ?? null, request.headers.get('cf-ray')
        ).run()
      }

      // Finance documents are private: downloads require the same authenticated finance API.
      if (url.pathname === '/api/finance/documents' && request.method === 'POST') {
        let form: FormData
        try { form = await request.formData() } catch { return financeJson({ error: 'Invalid multipart form.' }, 400) }
        const file = form.get('file')
        const expenseId = String(form.get('expenseId') ?? '').trim()
        const incomeId = String(form.get('incomeId') ?? '').trim()
        const documentType = String(form.get('documentType') ?? '').trim().toUpperCase()
        const allowedTypes = ['BILL', 'RECEIPT', 'PAYMENT_PROOF', 'APPROVAL', 'VOUCHER', 'OTHER']
        if (!(file instanceof File)) return financeJson({ error: 'Choose a document file.' }, 400)
        if (Boolean(expenseId) === Boolean(incomeId)) return financeJson({ error: 'Select exactly one expense or income record.' }, 400)
        if (!allowedTypes.includes(documentType)) return financeJson({ error: 'Invalid document type.' }, 400)
        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
        if (!allowedMimeTypes.includes(file.type)) return financeJson({ error: 'Only PDF, JPG, PNG and WebP files are allowed.' }, 400)
        const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
        const matchesAt = (offset: number, ...bytes: number[]) => bytes.every((byte, index) => signature[offset + index] === byte)
        const detectedType =
          matchesAt(0, 0x25, 0x50, 0x44, 0x46, 0x2d) ? 'application/pdf' :
          matchesAt(0, 0xff, 0xd8, 0xff) ? 'image/jpeg' :
          matchesAt(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ? 'image/png' :
          matchesAt(0, 0x52, 0x49, 0x46, 0x46) && matchesAt(8, 0x57, 0x45, 0x42, 0x50) ? 'image/webp' : ''
        if (!detectedType || detectedType !== file.type) return financeJson({ error: 'File contents do not match the declared PDF/image type.' }, 400)
        const maxDocumentBytes = 20 * 1024 * 1024
        if (file.size <= 0 || file.size > maxDocumentBytes) return financeJson({ error: 'Document must be between 1 byte and 20 MB.' }, 400)
        if (expenseId) {
          const row = await env.DB.prepare('SELECT id FROM finance_expenses WHERE id = ?').bind(expenseId).first()
          if (!row) return financeJson({ error: 'Expense record not found.' }, 404)
        }
        if (incomeId) {
          const row = await env.DB.prepare('SELECT id FROM finance_income WHERE id = ?').bind(incomeId).first()
          if (!row) return financeJson({ error: 'Income record not found.' }, 404)
        }
        // Atomically reserve shared gallery/document storage before writing to R2.
        const maxSharedStorageBytes = 10 * 1024 * 1024 * 1024
        const storageReservationId = crypto.randomUUID()
        const reservationBatch = await env.DB.batch([
          env.DB.prepare("DELETE FROM finance_storage_reservations WHERE expires_at <= CURRENT_TIMESTAMP"),
          env.DB.prepare(`
            INSERT INTO finance_storage_reservations (id, size_bytes, expires_at)
            SELECT ?, ?, datetime('now', '+1 hour')
            WHERE
              (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
              (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
              (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) +
              ? <= ?
          `).bind(storageReservationId, file.size, file.size, maxSharedStorageBytes),
        ])
        if (Number(reservationBatch[1]?.meta?.changes ?? 0) !== 1) {
          const storageUsage = await env.DB.prepare(`
            SELECT
              (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
              (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
              (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) AS total_bytes
          `).first<{ total_bytes: number }>()
          const usedBytes = Number(storageUsage?.total_bytes ?? 0)
          return financeJson({ error: 'Shared R2 storage limit reached. Delete unused gallery photos or documents before uploading more.', usedBytes, availableBytes: Math.max(0, maxSharedStorageBytes - usedBytes), fileSize: file.size, maxStorageBytes: maxSharedStorageBytes }, 400)
        }
        const documentId = crypto.randomUUID()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document'
        const storageKey = `finance-documents/${expenseId ? 'expenses' : 'income'}/${documentId}-${safeName}`
        try {
          await env.GALLERY.put(storageKey, file.stream(), {
            httpMetadata: { contentType: file.type },
            customMetadata: { documentId, documentType, uploadedBy: actorId }
          })
        } catch (error) {
          try { await env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(storageReservationId).run() } catch (cleanupError) {
            console.error('Finance storage reservation cleanup failed after R2 upload error', { storageReservationId, cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) })
          }
          throw error
        }
        try {
          await env.DB.batch([
            env.DB.prepare(`
              INSERT INTO finance_documents
                (id, expense_id, income_id, document_type, storage_key, file_name, mime_type, size_bytes, uploaded_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(documentId, expenseId || null, incomeId || null, documentType, storageKey, file.name.slice(0, 255), file.type, file.size, actorId),
            env.DB.prepare('INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), actorId, 'DOCUMENT', documentId, 'DOCUMENT_UPLOADED', null, JSON.stringify({ expenseId: expenseId || null, incomeId: incomeId || null, documentType, fileName: file.name, sizeBytes: file.size }), null, request.headers.get('cf-ray')),
            env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(storageReservationId)
          ])
        } catch (error) {
          // Preserve the database failure if best-effort R2 cleanup also fails.
          try {
            await env.GALLERY.delete(storageKey)
            await env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(storageReservationId).run()
          } catch (cleanupError) {
            console.error('Finance document cleanup failed after metadata/audit batch error', {
              documentId,
              storageReservationId,
              cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            })
          }
          throw error
        }
        return financeJson({ ok: true, documentId, fileName: file.name, sizeBytes: file.size }, 201)
      }

      const documentDownload = url.pathname.match(/^\/api\/finance\/documents\/([a-f0-9-]+)$/i)
      if (documentDownload && request.method === 'GET') {
        const record = await env.DB.prepare('SELECT storage_key, file_name, mime_type FROM finance_documents WHERE id = ?').bind(documentDownload[1]).first<{ storage_key: string | null; file_name: string; mime_type: string | null }>()
        if (!record?.storage_key) return financeJson({ error: 'Document not found.' }, 404)
        const object = await env.GALLERY.get(record.storage_key)
        if (!object) return financeJson({ error: 'Stored document not found.' }, 404)
        const headers = new Headers()
        headers.set('content-type', record.mime_type || 'application/octet-stream')
        const downloadName = record.file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'document'
        headers.set('content-disposition', `attachment; filename="${downloadName}"`)
        headers.set('cache-control', 'private, no-store')
        headers.set('x-content-type-options', 'nosniff')
        return new Response(object.body, { headers })
      }

      if (url.pathname === '/api/finance/dashboard' && request.method === 'GET') {
        const [income, paid, pending, unpaid, categories, expenses, incomes, budgets, documents] = await Promise.all([
          env.DB.prepare('SELECT COALESCE(SUM(amount_paise), 0) AS total FROM finance_income').first<{ total: number }>(),
          env.DB.prepare('SELECT COALESCE(SUM(amount_paise), 0) AS total FROM finance_payments').first<{ total: number }>(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM finance_expenses WHERE approval_status = 'PENDING'").first<{ total: number }>(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM finance_expenses WHERE approval_status = 'APPROVED' AND payment_status <> 'PAID'").first<{ total: number }>(),
          env.DB.prepare('SELECT id, name, category_type FROM finance_categories WHERE is_active = 1 ORDER BY category_type, name').all(),
          env.DB.prepare(`
            SELECT e.id, e.expense_no, c.name AS category_name, e.vendor_name, e.description,
              e.requested_amount_paise, e.approved_amount_paise, e.expense_date,
              e.approval_status, e.payment_status,
              COALESCE((SELECT SUM(p.amount_paise) FROM finance_payments p WHERE p.expense_id = e.id), 0) AS paid_amount_paise
            FROM finance_expenses e JOIN finance_categories c ON c.id = e.category_id
            ORDER BY e.created_at DESC LIMIT 500
          `).all(),
          env.DB.prepare('SELECT id, income_no, income_type, received_from, amount_paise, received_at, payment_mode, receipt_no FROM finance_income ORDER BY received_at DESC LIMIT 200').all(),
          env.DB.prepare(`SELECT b.id, b.budget_period, b.approved_amount_paise, b.revision_no, b.status, c.name AS category_name FROM finance_budgets b JOIN finance_categories c ON c.id = b.category_id ORDER BY b.created_at DESC LIMIT 200`).all(),
          env.DB.prepare(`SELECT d.id, d.expense_id, d.income_id, d.document_type, d.file_name, d.mime_type, d.size_bytes, d.uploaded_at, e.expense_no, i.income_no FROM finance_documents d LEFT JOIN finance_expenses e ON e.id = d.expense_id LEFT JOIN finance_income i ON i.id = d.income_id ORDER BY d.uploaded_at DESC LIMIT 500`).all()
        ])
        return financeJson({
          totalIncomePaise: Number(income?.total ?? 0),
          totalPaidPaise: Number(paid?.total ?? 0),
          pendingApprovalCount: Number(pending?.total ?? 0),
          unpaidCount: Number(unpaid?.total ?? 0),
          categories: categories.results ?? [],
          expenses: expenses.results ?? [],
          incomes: incomes.results ?? [],
          budgets: budgets.results ?? [],
          documents: documents.results ?? []
        })
      }

      if (url.pathname === '/api/finance/budgets' && request.method === 'POST') {
        let body: { categoryId?: string; amountPaise?: number; budgetPeriod?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const categoryId = String(body.categoryId ?? '')
        const amountPaise = Number(body.amountPaise)
        const budgetPeriod = String(body.budgetPeriod ?? 'NHYM2026').trim().slice(0, 40)
        if (!categoryId || !budgetPeriod || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) return financeJson({ error: 'Category, period and valid budget amount are required.' }, 400)
        const category = await env.DB.prepare("SELECT id FROM finance_categories WHERE id = ? AND category_type = 'EXPENSE' AND is_active = 1").bind(categoryId).first()
        if (!category) return financeJson({ error: 'Invalid expense category.' }, 400)
        const id = crypto.randomUUID()
        await env.DB.batch([
          env.DB.prepare("INSERT INTO finance_budgets (id, category_id, budget_period, approved_amount_paise, status, created_by) VALUES (?, ?, ?, ?, 'DRAFT', ?)").bind(id, categoryId, budgetPeriod, amountPaise, actorId),
          env.DB.prepare('INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), actorId, 'BUDGET', id, 'BUDGET_CREATED', null, JSON.stringify({ categoryId, budgetPeriod, amountPaise, status: 'DRAFT' }), null, request.headers.get('cf-ray'))
        ])
        return financeJson({ ok: true, id, status: 'DRAFT' }, 201)
      }

      const budgetDecision = url.pathname.match(/^\/api\/finance\/budgets\/([a-f0-9-]+)\/decision$/i)
      if (budgetDecision && request.method === 'POST') {
        let body: { decision?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        if (!['APPROVED', 'CLOSED'].includes(String(body.decision))) return financeJson({ error: 'Budget decision must be APPROVED or CLOSED.' }, 400)
        const current = await env.DB.prepare('SELECT * FROM finance_budgets WHERE id = ?').bind(budgetDecision[1]).first<any>()
        if (!current) return financeJson({ error: 'Budget not found.' }, 404)
        if (current.status !== 'DRAFT' && !(current.status === 'APPROVED' && body.decision === 'CLOSED')) return financeJson({ error: 'Only draft budgets can be approved, and only approved budgets can be closed.' }, 409)
        if (body.decision === 'APPROVED' && current.created_by === actorId) return financeJson({ error: 'Maker-checker rule: the person who created a budget cannot approve it.' }, 403)
        const budgetBatch = await env.DB.batch([
          env.DB.prepare('UPDATE finance_budgets SET status = ?, approved_by = ?, revision_no = revision_no + 1 WHERE id = ? AND status = ?')
            .bind(body.decision, actorId, current.id, current.status),
          env.DB.prepare(`INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, request_id)
            SELECT ?, ?, 'BUDGET', ?, ?, ?, ?, ? WHERE changes() = 1`)
            .bind(crypto.randomUUID(), actorId, current.id, String(body.decision), JSON.stringify({ status: current.status }), JSON.stringify({ status: body.decision, amountPaise: current.approved_amount_paise }), request.headers.get('cf-ray'))
        ])
        if (Number(budgetBatch[0]?.meta?.changes ?? 0) !== 1) return financeJson({ error: 'This budget changed in another request. Refresh and try again.' }, 409)
        return financeJson({ ok: true, status: body.decision })
      }

      if (url.pathname === '/api/finance/expenses' && request.method === 'POST') {
        let body: { categoryId?: string; vendorName?: string; description?: string; amountPaise?: number; expenseDate?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const categoryId = String(body.categoryId ?? '')
        const vendorName = String(body.vendorName ?? '').trim()
        const description = String(body.description ?? '').trim()
        const amountPaise = Number(body.amountPaise)
        const expenseDate = String(body.expenseDate ?? '')
        if (!categoryId || !vendorName || !description || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !isValidFinanceDate(expenseDate)) {
          return financeJson({ error: 'Category, vendor, purpose, valid amount and date are required.' }, 400)
        }
        const category = await env.DB.prepare("SELECT id FROM finance_categories WHERE id = ? AND category_type = 'EXPENSE' AND is_active = 1").bind(categoryId).first()
        if (!category) return financeJson({ error: 'Invalid expense category.' }, 400)
        const id = crypto.randomUUID()
        const expenseNo = `NHYM-EXP-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO finance_expenses (id, expense_no, category_id, vendor_name, description, requested_amount_paise, expense_date, approval_status, payment_status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'UNPAID', ?)
          `).bind(id, expenseNo, categoryId, vendorName, description, amountPaise, expenseDate, actorId),
          env.DB.prepare('INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), actorId, 'EXPENSE', id, 'SUBMITTED_FOR_APPROVAL', null, JSON.stringify({ expenseNo, categoryId, vendorName, description, amountPaise, expenseDate }), null, request.headers.get('cf-ray'))
        ])
        return financeJson({ ok: true, id, expenseNo, approvalStatus: 'PENDING' }, 201)
      }

      const decisionMatch = url.pathname.match(/^\/api\/finance\/expenses\/([a-f0-9-]+)\/decision$/i)
      if (decisionMatch && request.method === 'POST') {
        let body: { decision?: string; remarks?: string; approvedAmountPaise?: number }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const decision = String(body.decision ?? '')
        const remarks = String(body.remarks ?? '').trim()
        if (!['APPROVED', 'REJECTED'].includes(decision)) return financeJson({ error: 'Invalid decision.' }, 400)
        if (decision === 'REJECTED' && !remarks) return financeJson({ error: 'Rejection reason is required.' }, 400)
        const expense = await env.DB.prepare('SELECT * FROM finance_expenses WHERE id = ?').bind(decisionMatch[1]).first<any>()
        if (!expense) return financeJson({ error: 'Expense not found.' }, 404)
        if (expense.approval_status !== 'PENDING') return financeJson({ error: 'Only pending expenses can be decided.' }, 409)
        if (expense.created_by === actorId) return financeJson({ error: 'Maker-checker rule: the person who submitted an expense cannot approve or reject it.' }, 403)
        const approvedAmount = decision === 'APPROVED' ? Number(body.approvedAmountPaise) : 0
        if (decision === 'APPROVED' && (!Number.isSafeInteger(approvedAmount) || approvedAmount <= 0 || approvedAmount > Number(expense.requested_amount_paise))) {
          return financeJson({ error: 'Approved amount must be positive and cannot exceed the requested amount.' }, 400)
        }
        const approvalId = crypto.randomUUID()
        // D1 batch is transactional: state change, approval history and audit row commit together.
        // changes() makes both history inserts conditional on this request winning the pending-state update.
        const decisionBatch = await env.DB.batch([
          env.DB.prepare(`UPDATE finance_expenses SET approval_status = ?, approved_amount_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND approval_status = 'PENDING'`)
            .bind(decision, decision === 'APPROVED' ? approvedAmount : null, expense.id),
          env.DB.prepare(`INSERT INTO finance_approvals (id, expense_id, decision, approved_amount_paise, remarks, decided_by)
            SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
            .bind(approvalId, expense.id, decision, decision === 'APPROVED' ? approvedAmount : null, remarks || null, actorId),
          env.DB.prepare(`INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id)
            SELECT ?, ?, 'EXPENSE', ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
            .bind(crypto.randomUUID(), actorId, expense.id, decision, JSON.stringify({ approvalStatus: expense.approval_status }), JSON.stringify({ approvalStatus: decision, approvedAmountPaise: decision === 'APPROVED' ? approvedAmount : null }), remarks || null, request.headers.get('cf-ray'))
        ])
        if (Number(decisionBatch[0]?.meta?.changes ?? 0) !== 1) return financeJson({ error: 'This expense was already decided by another request. Refresh and try again.' }, 409)
        return financeJson({ ok: true, decision })
      }

      const paymentMatch = url.pathname.match(/^\/api\/finance\/expenses\/([a-f0-9-]+)\/payments$/i)
      if (paymentMatch && request.method === 'POST') {
        let body: { paymentMode?: string; amountPaise?: number; paidAt?: string; referenceNo?: string; remarks?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const paymentMode = String(body.paymentMode ?? '')
        const amountPaise = Number(body.amountPaise)
        const paidAt = String(body.paidAt ?? '')
        const referenceNo = String(body.referenceNo ?? '').trim()
        const remarks = String(body.remarks ?? '').trim()
        if (!['UPI','BANK_TRANSFER','CASH'].includes(paymentMode) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !isValidFinanceDate(paidAt)) return financeJson({ error: 'Valid payment mode, amount and date are required.' }, 400)
        if (paymentMode !== 'CASH' && !referenceNo) return financeJson({ error: 'UPI/bank reference number is required.' }, 400)
        const expense = await env.DB.prepare('SELECT * FROM finance_expenses WHERE id = ?').bind(paymentMatch[1]).first<any>()
        if (!expense) return financeJson({ error: 'Expense not found.' }, 404)
        if (expense.approval_status !== 'APPROVED') return financeJson({ error: 'Payment can only be recorded after approval.' }, 409)
        const paymentId = crypto.randomUUID()
        const paymentNo = `NHYM-PAY-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        let paymentResults
        try {
          // Guard the INSERT itself, not only a preceding SELECT: this keeps the approved
          // balance check and insert in one D1 transaction even when requests race.
          paymentResults = await env.DB.batch([
            env.DB.prepare(`INSERT INTO finance_payments
              (id, expense_id, payment_no, payment_mode, amount_paise, paid_at, reference_no, paid_by, remarks)
              SELECT ?, e.id, ?, ?, ?, ?, ?, ?, ?
              FROM finance_expenses e
              WHERE e.id = ? AND e.approval_status = 'APPROVED'
                AND COALESCE((SELECT SUM(p.amount_paise) FROM finance_payments p WHERE p.expense_id = e.id), 0) + ? <= e.approved_amount_paise`)
              .bind(paymentId, paymentNo, paymentMode, amountPaise, paidAt, referenceNo || null, actorId, remarks || null, expense.id, amountPaise),
            // Explicitly maintain summary values so preview databases remain correct even if
            // a trigger has not yet been installed. If present, the DB trigger remains a guard.
            env.DB.prepare(`UPDATE finance_expenses
              SET final_amount_paise = (SELECT COALESCE(SUM(amount_paise), 0) FROM finance_payments WHERE expense_id = ?),
                  payment_status = CASE
                    WHEN (SELECT COALESCE(SUM(amount_paise), 0) FROM finance_payments WHERE expense_id = ?) >= approved_amount_paise THEN 'PAID'
                    WHEN (SELECT COALESCE(SUM(amount_paise), 0) FROM finance_payments WHERE expense_id = ?) > 0 THEN 'PARTIAL'
                    ELSE 'UNPAID'
                  END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND EXISTS (SELECT 1 FROM finance_payments WHERE id = ?)`)
              .bind(expense.id, expense.id, expense.id, expense.id, paymentId),
            env.DB.prepare(`INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, new_values_json, request_id)
              SELECT ?, ?, 'PAYMENT', ?, 'PAYMENT_RECORDED', ?, ?
              WHERE EXISTS (SELECT 1 FROM finance_payments WHERE id = ?)`)
              .bind(crypto.randomUUID(), actorId, paymentId, JSON.stringify({ paymentNo, expenseId: expense.id, paymentMode, amountPaise, paidAt, referenceNo }), request.headers.get('cf-ray'), paymentId)
          ])
        } catch (e) {
          const message = e instanceof Error ? e.message : ''
          if (/payment exceeds approved amount|expense is not approved/i.test(message)) {
            return financeJson({ error: 'The expense was changed or its approved balance is insufficient. Refresh and try again.' }, 409)
          }
          if (/uq_finance_payment_reference_normalized|finance_payments\.reference_no/i.test(message)) {
            return financeJson({ error: 'This payment reference has already been recorded.' }, 409)
          }
          if (/unique constraint|constraint failed|foreign key constraint/i.test(message)) {
            return financeJson({ error: 'Payment could not be recorded because it conflicts with existing finance data. Refresh and try again.' }, 409)
          }
          throw e
        }
        if (Number(paymentResults[0]?.meta?.changes ?? 0) !== 1) {
          const latest = await env.DB.prepare('SELECT approval_status, approved_amount_paise, COALESCE((SELECT SUM(amount_paise) FROM finance_payments WHERE expense_id = finance_expenses.id), 0) AS paid_amount_paise FROM finance_expenses WHERE id = ?')
            .bind(expense.id).first<{ approval_status: string; approved_amount_paise: number | null; paid_amount_paise: number }>()
          if (!latest) return financeJson({ error: 'Expense not found.' }, 404)
          if (latest.approval_status !== 'APPROVED') return financeJson({ error: 'Payment can only be recorded after approval.' }, 409)
          return financeJson({ error: 'Payment total cannot exceed the approved amount.' }, 409)
        }
        const updatedExpense = await env.DB.prepare('SELECT payment_status FROM finance_expenses WHERE id = ?').bind(expense.id).first<{ payment_status: string }>()
        const paymentStatus = String(updatedExpense?.payment_status ?? 'PARTIAL')
        return financeJson({ ok: true, paymentNo, paymentStatus }, 201)
      }

      if (url.pathname === '/api/finance/income' && request.method === 'POST') {
        let body: { incomeType?: string; receivedFrom?: string; amountPaise?: number; receivedAt?: string; paymentMode?: string; referenceNo?: string; receiptNo?: string; remarks?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const incomeType = String(body.incomeType ?? '').trim()
        const receivedFrom = String(body.receivedFrom ?? '').trim()
        const amountPaise = Number(body.amountPaise)
        const receivedAt = String(body.receivedAt ?? '')
        const paymentMode = String(body.paymentMode ?? '')
        const referenceNo = String(body.referenceNo ?? '').trim()
        const receiptNo = String(body.receiptNo ?? '').trim()
        if (!incomeType || !receivedFrom || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !isValidFinanceDate(receivedAt) || !['UPI','BANK_TRANSFER','CASH'].includes(paymentMode)) return financeJson({ error: 'Income type, source, valid amount, date and payment mode are required.' }, 400)
        if (paymentMode !== 'CASH' && !referenceNo) return financeJson({ error: 'UPI/bank reference number is required.' }, 400)
        const id = crypto.randomUUID()
        const incomeNo = `NHYM-INC-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        try {
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO finance_income (id, income_no, income_type, received_from, amount_paise, received_at, payment_mode, reference_no, receipt_no, remarks, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .bind(id, incomeNo, incomeType, receivedFrom, amountPaise, receivedAt, paymentMode, referenceNo || null, receiptNo || null, String(body.remarks ?? '').trim() || null, actorId),
            env.DB.prepare('INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), actorId, 'INCOME', id, 'INCOME_RECORDED', null, JSON.stringify({ incomeNo, incomeType, receivedFrom, amountPaise, receivedAt, paymentMode, referenceNo, receiptNo }), null, request.headers.get('cf-ray'))
          ])
        } catch (e) {
          const message = e instanceof Error ? e.message : ''
          if (/finance_income\.receipt_no/i.test(message)) {
            return financeJson({ error: 'Receipt number has already been used.' }, 409)
          }
          if (/unique constraint|constraint failed|foreign key constraint/i.test(message)) {
            return financeJson({ error: 'Income could not be recorded because it conflicts with existing finance data. Refresh and try again.' }, 409)
          }
          throw e
        }
        return financeJson({ ok: true, incomeNo }, 201)
      }

      return financeJson({ error: 'Finance endpoint not found.' }, 404)
    }

    if (url.pathname === '/api/admin/registrations' && request.method === 'GET') {
  if (!authorised(request, env)) {
    return financeJson({ error: 'Unauthorized' }, 401)
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

  return financeJson({ registrations })
}
    const match = url.pathname.match(/^\/api\/admin\/registrations\/(\d+)$/)

    if (match && request.method === 'PATCH') {
      if (!authorised(request, env)) {
        return financeJson({ error: 'Unauthorised' }, 401)
      }

      const body = await request.json() as { status?: string }

      const allowed = [
        'PENDING',
        'PAYMENT_VERIFIED',
        'APPROVED',
        'REJECTED'
      ]

      if (!body.status || !allowed.includes(body.status)) {
        return financeJson({ error: 'Invalid status.' }, 400)
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
          approval_email_sent_at,
          rejection_email_sent_at
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
          rejection_email_sent_at: string | null
        }>()

      if (!registration) {
        return financeJson({ error: 'Registration not found.' }, 404)
      }

      if (
        body.status === 'APPROVED' &&
        registration.status !== 'PAYMENT_VERIFIED'
      ) {
        return financeJson(
          { error: 'Payment must be verified before approval.' },
          400
        )
      }

      const shouldSendApprovalEmail =
        body.status === 'APPROVED' &&
        !registration.approval_email_sent_at

      const shouldSendRejectionEmail =
        body.status === 'REJECTED' &&
        !registration.rejection_email_sent_at

      const shouldSendEmail =
        shouldSendApprovalEmail || shouldSendRejectionEmail

      if (shouldSendEmail) {
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
          return financeJson(
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
              status: body.status,
              email: registration.email.toLowerCase(),
              registrationId: registration.registration_id,
              participants: participantNames,
              totalAmount: registration.total_amount,
              paymentMode: registration.payment_mode,
              paymentReference: registration.payment_reference
            })
          })

          if (!emailResponse.ok) {
            return financeJson(
              {
                error: shouldSendApprovalEmail
                  ? 'Approval email could not be sent.'
                  : 'Rejection email could not be sent.'
              },
              502
            )
          }

          const emailResult = await emailResponse.json() as {
            ok?: boolean
            error?: string
          }

          if (!emailResult.ok) {
            return financeJson(
              {
                error:
                  emailResult.error ||
                  (shouldSendApprovalEmail
                    ? 'Approval email could not be sent.'
                    : 'Rejection email could not be sent.')
              },
              502
            )
          }
        } catch {
          return financeJson(
            { error: 'Unable to contact the email service.' },
            502
          )
        }
      }

      const updatedAt = new Date().toISOString()

      if (shouldSendApprovalEmail) {
        await env.DB.prepare(`
          UPDATE registrations
          SET status = ?,
              updated_at = ?,
              approval_email_sent_at = ?
          WHERE id = ?
        `)
          .bind(body.status, updatedAt, updatedAt, id)
          .run()
      } else if (shouldSendRejectionEmail) {
        await env.DB.prepare(`
          UPDATE registrations
          SET status = ?,
              updated_at = ?,
              rejection_email_sent_at = ?,
              payment_reference = ''
          WHERE id = ?
        `)
          .bind(body.status, updatedAt, updatedAt, id)
          .run()
      } else {
        await env.DB.prepare(`
          UPDATE registrations
          SET status = ?,
              updated_at = ?,
              payment_reference = CASE WHEN ? = 'REJECTED' THEN '' ELSE payment_reference END
          WHERE id = ?
        `)
          .bind(body.status, updatedAt, body.status, id)
          .run()
      }

      return financeJson({
        ok: true,
        status: body.status,
        emailSent: shouldSendEmail,
        emailType: shouldSendApprovalEmail
          ? 'APPROVED'
          : shouldSendRejectionEmail
            ? 'REJECTED'
            : null
      })
    }

    return env.ASSETS.fetch(request)
  },
}
