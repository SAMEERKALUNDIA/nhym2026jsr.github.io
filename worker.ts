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

// Maximum total gallery storage: 10 GB
const MAX_GALLERY_STORAGE = 10 * 1024 * 1024 * 1024

const storageResult = await env.DB.prepare(`
  SELECT COALESCE(SUM(file_size), 0) AS total_bytes
  FROM gallery_photos
`).first<{ total_bytes: number }>()

const currentStorageBytes = Number(storageResult?.total_bytes ?? 0)
const newTotalStorageBytes = currentStorageBytes + file.size

if (newTotalStorageBytes > MAX_GALLERY_STORAGE) {
  const availableBytes = Math.max(
    0,
    MAX_GALLERY_STORAGE - currentStorageBytes
  )

  return json(
    {
      error: 'Gallery storage limit reached.',
      message: 'This upload would exceed the maximum 10 GB gallery storage limit.',
      currentStorageBytes,
      availableBytes,
      fileSize: file.size,
      maxStorageBytes: MAX_GALLERY_STORAGE,
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
    // NHYM FINANCE PANEL — individually authenticated finance users.
    if (url.pathname.startsWith('/api/finance/')) {
      if (url.pathname === '/api/finance/setup-status' && request.method === 'GET') {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM finance_users').first<{ total: number }>()
        return json({ setupComplete: Number(count?.total ?? 0) > 0 })
      }
      if (url.pathname === '/api/finance/bootstrap' && request.method === 'POST') {
        if (!authorised(request, env)) return json({ error: 'Unauthorized' }, 401)
        let body: { displayName?: string; loginId?: string; password?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM finance_users').first<{ total: number }>()
        if (Number(count?.total ?? 0) !== 0) return json({ error: 'Finance setup is already complete. Ask a Finance Head to create accounts.' }, 409)
        const displayName = String(body.displayName ?? '').trim().slice(0, 100)
        const loginId = String(body.loginId ?? '').trim().toLowerCase().slice(0, 80)
        const password = String(body.password ?? '')
        if (displayName.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 200) return json({ error: 'Name, login ID (3–80 letters/numbers/._-) and a password of at least 12 characters are required.' }, 400)
        const salt = financeRandomHex(16)
        const passwordHash = await financePasswordHash(password, salt)
        const id = crypto.randomUUID()
        await env.DB.prepare("INSERT INTO finance_users (id, display_name, login_id, role, password_salt, password_hash) VALUES (?, ?, ?, 'FINANCE_HEAD', ?, ?)").bind(id, displayName, loginId, salt, passwordHash).run()
        return json({ ok: true, message: 'Finance Head account created. Sign in using your individual credentials.' }, 201)
      }

      if (url.pathname === '/api/finance/login' && request.method === 'POST') {
        let body: { loginId?: string; password?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const loginId = String(body.loginId ?? '').trim().toLowerCase()
        const password = String(body.password ?? '')
        if (!loginId || !password || password.length > 200) return json({ error: 'Login ID and password are required.' }, 400)
        const user = await env.DB.prepare('SELECT id, display_name, login_id, role, password_salt, password_hash FROM finance_users WHERE login_id = ? AND is_active = 1').bind(loginId).first<{ id: string; display_name: string; login_id: string; role: string; password_salt: string; password_hash: string }>()
        const candidate = user ? await financePasswordHash(password, user.password_salt) : ''
        if (!user || candidate !== user.password_hash) return json({ error: 'Login ID or password is incorrect.' }, 401)
        const token = financeRandomHex(32)
        const tokenHash = await financeDigest(token)
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
        await env.DB.prepare('INSERT INTO finance_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run()
        await env.DB.prepare('UPDATE finance_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run()
        return json({ ok: true, token, expiresAt, user: { id: user.id, displayName: user.display_name, loginId: user.login_id, role: user.role } })
      }

      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
      if (!bearer) return json({ error: 'Sign in to access Finance Management.' }, 401)
      const tokenHash = await financeDigest(bearer)
      const actor = await env.DB.prepare("SELECT u.id, u.display_name, u.login_id, u.role FROM finance_sessions s JOIN finance_users u ON u.id = s.user_id WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1").bind(tokenHash).first<{ id: string; display_name: string; login_id: string; role: 'FINANCE_HEAD' | 'OPERATOR' | 'APPROVER' | 'AUDITOR' }>()
      if (!actor) return json({ error: 'Finance session expired. Please sign in again.' }, 401)
      const actorId = actor.id
      const role = actor.role
      const method = request.method
      const pathname = url.pathname
      const isDashboard = pathname === '/api/finance/dashboard' && method === 'GET'
      const isUserAdmin = pathname === '/api/finance/users' && (method === 'GET' || method === 'POST')
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
        (role === 'AUDITOR' && (isDashboard || isDocumentDownload))
      if (!allowed && !isUserAdmin) return json({ error: 'Your finance role does not permit this action.' }, 403)
      if (isUserAdmin && role !== 'FINANCE_HEAD') return json({ error: 'Only the Finance Head can manage finance accounts.' }, 403)

      const audit = async (entityType: string, entityId: string, action: string, oldValues?: unknown, newValues?: unknown, reason?: string) => {
        await env.DB.prepare('INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), actorId, entityType, entityId, action, oldValues == null ? null : JSON.stringify(oldValues), newValues == null ? null : JSON.stringify(newValues), reason ?? null, request.headers.get('cf-ray')).run()
      }

      if (pathname === '/api/finance/users' && method === 'GET') {
        const users = await env.DB.prepare('SELECT id, display_name, login_id, role, is_active, created_at, last_login_at FROM finance_users ORDER BY created_at').all()
        return json({ users: users.results ?? [] })
      }
      if (pathname === '/api/finance/users' && method === 'POST') {
        let body: { displayName?: string; loginId?: string; password?: string; role?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const displayName = String(body.displayName ?? '').trim().slice(0, 100)
        const loginId = String(body.loginId ?? '').trim().toLowerCase().slice(0, 80)
        const password = String(body.password ?? '')
        const newRole = String(body.role ?? '')
        if (displayName.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 200 || !['FINANCE_HEAD','OPERATOR','APPROVER','AUDITOR'].includes(newRole)) return json({ error: 'Enter a valid name, login ID, password (at least 12 characters) and role.' }, 400)
        const salt = financeRandomHex(16)
        const passwordHash = await financePasswordHash(password, salt)
        const id = crypto.randomUUID()
        try {
          await env.DB.prepare('INSERT INTO finance_users (id, display_name, login_id, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(id, displayName, loginId, newRole, salt, passwordHash).run()
        } catch (error) {
          if (/unique constraint|constraint failed/i.test(error instanceof Error ? error.message : '')) return json({ error: 'This login ID is already in use.' }, 409)
          throw error
        }
        await audit('FINANCE_USER', id, 'USER_CREATED', null, { displayName, loginId, role: newRole })
        return json({ ok: true, user: { id, displayName, loginId, role: newRole } }, 201)
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
        try { form = await request.formData() } catch { return json({ error: 'Invalid multipart form.' }, 400) }
        const file = form.get('file')
        const expenseId = String(form.get('expenseId') ?? '').trim()
        const incomeId = String(form.get('incomeId') ?? '').trim()
        const documentType = String(form.get('documentType') ?? '').trim().toUpperCase()
        const allowedTypes = ['BILL', 'RECEIPT', 'PAYMENT_PROOF', 'APPROVAL', 'VOUCHER', 'OTHER']
        if (!(file instanceof File)) return json({ error: 'Choose a document file.' }, 400)
        if (Boolean(expenseId) === Boolean(incomeId)) return json({ error: 'Select exactly one expense or income record.' }, 400)
        if (!allowedTypes.includes(documentType)) return json({ error: 'Invalid document type.' }, 400)
        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
        if (!allowedMimeTypes.includes(file.type)) return json({ error: 'Only PDF, JPG, PNG and WebP files are allowed.' }, 400)
        const maxDocumentBytes = 20 * 1024 * 1024
        if (file.size <= 0 || file.size > maxDocumentBytes) return json({ error: 'Document must be between 1 byte and 20 MB.' }, 400)
        // Gallery photos and finance documents share the same R2 bucket and 10 GB storage allowance.
        const maxSharedStorageBytes = 10 * 1024 * 1024 * 1024
        const storageUsage = await env.DB.prepare(`
          SELECT
            (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
            (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) AS total_bytes
        `).first<{ total_bytes: number }>()
        const usedBytes = Number(storageUsage?.total_bytes ?? 0)
        if (usedBytes + file.size > maxSharedStorageBytes) {
          return json({ error: 'Shared R2 storage limit reached. Delete unused gallery photos or documents before uploading more.', usedBytes, availableBytes: Math.max(0, maxSharedStorageBytes - usedBytes), fileSize: file.size, maxStorageBytes: maxSharedStorageBytes }, 400)
        }
        if (expenseId) {
          const row = await env.DB.prepare('SELECT id FROM finance_expenses WHERE id = ?').bind(expenseId).first()
          if (!row) return json({ error: 'Expense record not found.' }, 404)
        }
        if (incomeId) {
          const row = await env.DB.prepare('SELECT id FROM finance_income WHERE id = ?').bind(incomeId).first()
          if (!row) return json({ error: 'Income record not found.' }, 404)
        }
        const documentId = crypto.randomUUID()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document'
        const storageKey = `finance-documents/${expenseId ? 'expenses' : 'income'}/${documentId}-${safeName}`
        await env.GALLERY.put(storageKey, file.stream(), {
          httpMetadata: { contentType: file.type },
          customMetadata: { documentId, documentType, uploadedBy: actorId }
        })
        try {
          await env.DB.prepare(`
            INSERT INTO finance_documents
              (id, expense_id, income_id, document_type, storage_key, file_name, mime_type, size_bytes, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(documentId, expenseId || null, incomeId || null, documentType, storageKey, file.name.slice(0, 255), file.type, file.size, actorId).run()
        } catch (error) {
          await env.GALLERY.delete(storageKey)
          throw error
        }
        await audit('DOCUMENT', documentId, 'DOCUMENT_UPLOADED', null, { expenseId: expenseId || null, incomeId: incomeId || null, documentType, fileName: file.name, sizeBytes: file.size })
        return json({ ok: true, documentId, fileName: file.name, sizeBytes: file.size }, 201)
      }

      const documentDownload = url.pathname.match(/^\/api\/finance\/documents\/([a-f0-9-]+)$/i)
      if (documentDownload && request.method === 'GET') {
        const record = await env.DB.prepare('SELECT storage_key, file_name, mime_type FROM finance_documents WHERE id = ?').bind(documentDownload[1]).first<{ storage_key: string | null; file_name: string; mime_type: string | null }>()
        if (!record?.storage_key) return json({ error: 'Document not found.' }, 404)
        const object = await env.GALLERY.get(record.storage_key)
        if (!object) return json({ error: 'Stored document not found.' }, 404)
        const headers = new Headers()
        headers.set('content-type', record.mime_type || 'application/octet-stream')
        headers.set('content-disposition', `attachment; filename="${record.file_name.replace(/["\\\\\\r\\n]/g, '_')}"`)
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
        return json({
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
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const categoryId = String(body.categoryId ?? '')
        const amountPaise = Number(body.amountPaise)
        const budgetPeriod = String(body.budgetPeriod ?? 'NHYM2026').trim().slice(0, 40)
        if (!categoryId || !budgetPeriod || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) return json({ error: 'Category, period and valid budget amount are required.' }, 400)
        const category = await env.DB.prepare("SELECT id FROM finance_categories WHERE id = ? AND category_type = 'EXPENSE' AND is_active = 1").bind(categoryId).first()
        if (!category) return json({ error: 'Invalid expense category.' }, 400)
        const id = crypto.randomUUID()
        await env.DB.prepare("INSERT INTO finance_budgets (id, category_id, budget_period, approved_amount_paise, status, created_by) VALUES (?, ?, ?, ?, 'DRAFT', ?)").bind(id, categoryId, budgetPeriod, amountPaise, actorId).run()
        await audit('BUDGET', id, 'BUDGET_CREATED', null, { categoryId, budgetPeriod, amountPaise, status: 'DRAFT' })
        return json({ ok: true, id, status: 'DRAFT' }, 201)
      }

      const budgetDecision = url.pathname.match(/^\/api\/finance\/budgets\/([a-f0-9-]+)\/decision$/i)
      if (budgetDecision && request.method === 'POST') {
        let body: { decision?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        if (!['APPROVED', 'CLOSED'].includes(String(body.decision))) return json({ error: 'Budget decision must be APPROVED or CLOSED.' }, 400)
        const current = await env.DB.prepare('SELECT * FROM finance_budgets WHERE id = ?').bind(budgetDecision[1]).first<any>()
        if (!current) return json({ error: 'Budget not found.' }, 404)
        if (current.status !== 'DRAFT' && !(current.status === 'APPROVED' && body.decision === 'CLOSED')) return json({ error: 'Only draft budgets can be approved, and only approved budgets can be closed.' }, 409)
        if (body.decision === 'APPROVED' && current.created_by === actorId) return json({ error: 'Maker-checker rule: the person who created a budget cannot approve it.' }, 403)
        await env.DB.prepare('UPDATE finance_budgets SET status = ?, approved_by = ?, revision_no = revision_no + 1 WHERE id = ? AND status = ?').bind(body.decision, actorId, current.id, current.status).run()
        await audit('BUDGET', current.id, String(body.decision), { status: current.status }, { status: body.decision, amountPaise: current.approved_amount_paise })
        return json({ ok: true, status: body.decision })
      }

      if (url.pathname === '/api/finance/expenses' && request.method === 'POST') {
        let body: { categoryId?: string; vendorName?: string; description?: string; amountPaise?: number; expenseDate?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const categoryId = String(body.categoryId ?? '')
        const vendorName = String(body.vendorName ?? '').trim()
        const description = String(body.description ?? '').trim()
        const amountPaise = Number(body.amountPaise)
        const expenseDate = String(body.expenseDate ?? '')
        if (!categoryId || !vendorName || !description || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
          return json({ error: 'Category, vendor, purpose, valid amount and date are required.' }, 400)
        }
        const category = await env.DB.prepare("SELECT id FROM finance_categories WHERE id = ? AND category_type = 'EXPENSE' AND is_active = 1").bind(categoryId).first()
        if (!category) return json({ error: 'Invalid expense category.' }, 400)
        const id = crypto.randomUUID()
        const expenseNo = `NHYM-EXP-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        await env.DB.prepare(`
          INSERT INTO finance_expenses (id, expense_no, category_id, vendor_name, description, requested_amount_paise, expense_date, approval_status, payment_status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'UNPAID', ?)
        `).bind(id, expenseNo, categoryId, vendorName, description, amountPaise, expenseDate, actorId).run()
        await audit('EXPENSE', id, 'SUBMITTED_FOR_APPROVAL', null, { expenseNo, categoryId, vendorName, description, amountPaise, expenseDate })
        return json({ ok: true, id, expenseNo, approvalStatus: 'PENDING' }, 201)
      }

      const decisionMatch = url.pathname.match(/^\/api\/finance\/expenses\/([a-f0-9-]+)\/decision$/i)
      if (decisionMatch && request.method === 'POST') {
        let body: { decision?: string; remarks?: string; approvedAmountPaise?: number }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const decision = String(body.decision ?? '')
        const remarks = String(body.remarks ?? '').trim()
        if (!['APPROVED', 'REJECTED'].includes(decision)) return json({ error: 'Invalid decision.' }, 400)
        if (decision === 'REJECTED' && !remarks) return json({ error: 'Rejection reason is required.' }, 400)
        const expense = await env.DB.prepare('SELECT * FROM finance_expenses WHERE id = ?').bind(decisionMatch[1]).first<any>()
        if (!expense) return json({ error: 'Expense not found.' }, 404)
        if (expense.approval_status !== 'PENDING') return json({ error: 'Only pending expenses can be decided.' }, 409)
        if (expense.created_by === actorId) return json({ error: 'Maker-checker rule: the person who submitted an expense cannot approve or reject it.' }, 403)
        const approvedAmount = decision === 'APPROVED' ? Number(body.approvedAmountPaise) : 0
        if (decision === 'APPROVED' && (!Number.isSafeInteger(approvedAmount) || approvedAmount <= 0 || approvedAmount > Number(expense.requested_amount_paise))) {
          return json({ error: 'Approved amount must be positive and cannot exceed the requested amount.' }, 400)
        }
        const approvalId = crypto.randomUUID()
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO finance_approvals (id, expense_id, decision, approved_amount_paise, remarks, decided_by) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(approvalId, expense.id, decision, decision === 'APPROVED' ? approvedAmount : null, remarks || null, actorId),
          env.DB.prepare(`UPDATE finance_expenses SET approval_status = ?, approved_amount_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND approval_status = 'PENDING'`)
            .bind(decision, decision === 'APPROVED' ? approvedAmount : null, expense.id)
        ])
        await audit('EXPENSE', expense.id, decision, { approvalStatus: expense.approval_status }, { approvalStatus: decision, approvedAmountPaise: decision === 'APPROVED' ? approvedAmount : null }, remarks)
        return json({ ok: true, decision })
      }

      const paymentMatch = url.pathname.match(/^\/api\/finance\/expenses\/([a-f0-9-]+)\/payments$/i)
      if (paymentMatch && request.method === 'POST') {
        let body: { paymentMode?: string; amountPaise?: number; paidAt?: string; referenceNo?: string; remarks?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const paymentMode = String(body.paymentMode ?? '')
        const amountPaise = Number(body.amountPaise)
        const paidAt = String(body.paidAt ?? '')
        const referenceNo = String(body.referenceNo ?? '').trim()
        const remarks = String(body.remarks ?? '').trim()
        if (!['UPI','BANK_TRANSFER','CASH'].includes(paymentMode) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return json({ error: 'Valid payment mode, amount and date are required.' }, 400)
        if (paymentMode !== 'CASH' && !referenceNo) return json({ error: 'UPI/bank reference number is required.' }, 400)
        const expense = await env.DB.prepare('SELECT * FROM finance_expenses WHERE id = ?').bind(paymentMatch[1]).first<any>()
        if (!expense) return json({ error: 'Expense not found.' }, 404)
        if (expense.approval_status !== 'APPROVED') return json({ error: 'Payment can only be recorded after approval.' }, 409)
        const paid = await env.DB.prepare('SELECT COALESCE(SUM(amount_paise),0) AS total FROM finance_payments WHERE expense_id = ?').bind(expense.id).first<{ total: number }>()
        const paidSoFar = Number(paid?.total ?? 0)
        if (paidSoFar + amountPaise > Number(expense.approved_amount_paise)) return json({ error: 'Payment total cannot exceed the approved amount.' }, 409)
        const paymentId = crypto.randomUUID()
        const paymentNo = `NHYM-PAY-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        try {
          await env.DB.prepare(`INSERT INTO finance_payments (id, expense_id, payment_no, payment_mode, amount_paise, paid_at, reference_no, paid_by, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(paymentId, expense.id, paymentNo, paymentMode, amountPaise, paidAt, referenceNo || null, actorId, remarks || null).run()
        } catch (e) {
          if (/unique constraint|constraint failed/i.test(e instanceof Error ? e.message : '')) return json({ error: 'This payment reference has already been recorded.' }, 409)
          throw e
        }
        const totalPaid = paidSoFar + amountPaise
        const paymentStatus = totalPaid >= Number(expense.approved_amount_paise) ? 'PAID' : 'PARTIAL'
        await env.DB.prepare('UPDATE finance_expenses SET payment_status = ?, final_amount_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(paymentStatus, totalPaid, expense.id).run()
        await audit('PAYMENT', paymentId, 'PAYMENT_RECORDED', null, { paymentNo, expenseId: expense.id, paymentMode, amountPaise, paidAt, referenceNo })
        return json({ ok: true, paymentNo, paymentStatus }, 201)
      }

      if (url.pathname === '/api/finance/income' && request.method === 'POST') {
        let body: { incomeType?: string; receivedFrom?: string; amountPaise?: number; receivedAt?: string; paymentMode?: string; referenceNo?: string; receiptNo?: string; remarks?: string }
        try { body = await request.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
        const incomeType = String(body.incomeType ?? '').trim()
        const receivedFrom = String(body.receivedFrom ?? '').trim()
        const amountPaise = Number(body.amountPaise)
        const receivedAt = String(body.receivedAt ?? '')
        const paymentMode = String(body.paymentMode ?? '')
        const referenceNo = String(body.referenceNo ?? '').trim()
        const receiptNo = String(body.receiptNo ?? '').trim()
        if (!incomeType || !receivedFrom || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) || !['UPI','BANK_TRANSFER','CASH'].includes(paymentMode)) return json({ error: 'Income type, source, valid amount, date and payment mode are required.' }, 400)
        if (paymentMode !== 'CASH' && !referenceNo) return json({ error: 'UPI/bank reference number is required.' }, 400)
        const id = crypto.randomUUID()
        const incomeNo = `NHYM-INC-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        try {
          await env.DB.prepare(`INSERT INTO finance_income (id, income_no, income_type, received_from, amount_paise, received_at, payment_mode, reference_no, receipt_no, remarks, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, incomeNo, incomeType, receivedFrom, amountPaise, receivedAt, paymentMode, referenceNo || null, receiptNo || null, String(body.remarks ?? '').trim() || null, actorId).run()
        } catch (e) {
          if (/unique constraint|constraint failed/i.test(e instanceof Error ? e.message : '')) return json({ error: 'Receipt number has already been used.' }, 409)
          throw e
        }
        await audit('INCOME', id, 'INCOME_RECORDED', null, { incomeNo, incomeType, receivedFrom, amountPaise, receivedAt, paymentMode, referenceNo, receiptNo })
        return json({ ok: true, incomeNo }, 201)
      }

      return json({ error: 'Finance endpoint not found.' }, 404)
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
        return json({ error: 'Registration not found.' }, 404)
      }

      if (
        body.status === 'APPROVED' &&
        registration.status !== 'PAYMENT_VERIFIED'
      ) {
        return json(
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
            return json(
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
            return json(
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
          return json(
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

      return json({
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
