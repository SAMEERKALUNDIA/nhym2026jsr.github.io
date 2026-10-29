// Release trigger: Daily Updates integration has passed Preview and Finance security checks.
export interface Env {
  DB: D1Database
  GALLERY: R2Bucket
  ASSETS: Fetcher
  ADMIN_TOKEN: string
  EMAIL_SERVICE_URL: string
  NHYM_EMAIL_SECRET: string
  FINANCE_PREVIEW_MODE?: string
}

type RegistrationPayload = {
  email: string
  total: number
  paymentMode: string
  paymentReference: string
  declarations: Record<string, boolean>
  privacyConsent?: boolean
  participants: Array<Record<string, unknown> & { name?: string; category?: string; fee?: number }>
}

// Apply consistent defensive headers to every JSON API response, including errors.
const API_SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...API_SECURITY_HEADERS, 'cache-control': 'no-store' },
  })

// Read JSON with a streaming byte cap so public API requests cannot force an
// unbounded request-body allocation. Callers should use the endpoint-specific cap.
async function readJsonLimited<T>(request: Request, maxBytes: number): Promise<
  { ok: true; value: T } | { ok: false; status: 400 | 413 }
> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    try { await request.body?.cancel() } catch {}
    return { ok: false, status: 413 }
  }
  if (!request.body) return { ok: false, status: 400 }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        try { await reader.cancel() } catch {}
        return { ok: false, status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400 }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as T }
  } catch {
    return { ok: false, status: 400 }
  }
}

// Finance responses contain private accounting/user data and must not be cached.
const financeJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...API_SECURITY_HEADERS, 'cache-control': 'private, no-store' },
  })

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
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  // Normalize accidental surrounding whitespace in deployment secrets while retaining
  // an exact token comparison.
  const configuredToken = env.ADMIN_TOKEN?.trim()
  return Boolean(configuredToken && token && token === configuredToken)
}

async function financeDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function financePasswordHash(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256)
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')
}

function financeRandomHex(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function getDailyUpdateMember(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token) return null
  const tokenHash = await financeDigest(token)
  return env.DB.prepare(`
    SELECT u.id, u.display_name, u.login_id
    FROM daily_update_sessions s
    JOIN daily_update_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1
  `).bind(tokenHash).first<{ id: string; display_name: string; login_id: string }>()
}

async function logDailyUpdate(env: Env, actorUserId: string | null, actorName: string, action: string, updateId: string | null, details?: unknown) {
  await env.DB.prepare(`
    INSERT INTO daily_update_audit_log (id, actor_user_id, actor_name, action, update_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), actorUserId, actorName, action, updateId, details === undefined ? null : JSON.stringify(details), new Date().toISOString()).run()
}

const DAILY_UPDATE_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

async function storeDailyUpdatePhotos(env: Env, updateId: string, files: File[]) {
  if (files.length > 5) throw new Error('एक अपडेट में अधिकतम 5 फोटो अपलोड की जा सकती हैं।')
  const totalBytes = files.reduce((total, file) => total + file.size, 0)
  if (totalBytes > 50 * 1024 * 1024) throw new Error('एक अपडेट की सभी फोटो का कुल आकार 50 MB से अधिक नहीं होना चाहिए।')
  for (const file of files) {
    if (!(file.type in DAILY_UPDATE_IMAGE_TYPES)) throw new Error('केवल JPG, PNG और WebP फोटो अपलोड की जा सकती हैं।')
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('हर फोटो का आकार 20 MB तक होना चाहिए।')
  }

  const storedKeys: string[] = []
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
      const detectedType =
        bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
        : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'image/png'
        : bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 ? 'image/webp'
        : ''
      if (detectedType !== file.type) throw new Error('फोटो की वास्तविक फ़ाइल सामग्री और प्रकार मेल नहीं खाते।')

      const id = crypto.randomUUID()
      const key = `daily-updates/${updateId}/${id}.${DAILY_UPDATE_IMAGE_TYPES[file.type]}`
      const reservationId = crypto.randomUUID()
      const maxSharedStorageBytes = 10 * 1024 * 1024 * 1024
      const reservationBatch = await env.DB.batch([
        env.DB.prepare("DELETE FROM finance_storage_reservations WHERE expires_at <= CURRENT_TIMESTAMP"),
        env.DB.prepare(`
          INSERT INTO finance_storage_reservations (id, size_bytes, expires_at)
          SELECT ?, ?, datetime('now', '+1 hour')
          WHERE
            (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
            (SELECT COALESCE(SUM(file_size), 0) FROM daily_update_photos) +
            (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
            (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) +
            ? <= ?
        `).bind(reservationId, file.size, file.size, maxSharedStorageBytes),
      ])
      if (Number(reservationBatch[1]?.meta?.changes ?? 0) !== 1) {
        const usage = await env.DB.prepare(`
          SELECT
            (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
            (SELECT COALESCE(SUM(file_size), 0) FROM daily_update_photos) +
            (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
            (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) AS total_bytes
        `).first<{ total_bytes: number }>()
        const usedBytes = Number(usage?.total_bytes ?? 0)
        throw new Error(`साझा 10 GB स्टोरेज सीमा के कारण फोटो अपलोड नहीं हो सकी। उपलब्ध स्थान: ${Math.max(0, maxSharedStorageBytes - usedBytes)} bytes.`)
      }
      try {
        await env.GALLERY.put(key, file.stream(), { httpMetadata: { contentType: file.type } })
        storedKeys.push(key)
        await env.DB.prepare(`
          INSERT INTO daily_update_photos (id, update_id, r2_key, original_name, content_type, file_size, caption, display_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
        `).bind(id, updateId, key, file.name.slice(0, 255), file.type, file.size, index, new Date().toISOString()).run()
      } catch (error) {
        await env.GALLERY.delete(key).catch(() => undefined)
        throw error
      } finally {
        await env.DB.prepare('DELETE FROM finance_storage_reservations WHERE id = ?').bind(reservationId).run().catch(() => undefined)
      }
    }
  } catch (error) {
    await Promise.all(storedKeys.map(key => env.GALLERY.delete(key).catch(() => undefined)))
    await env.DB.prepare('DELETE FROM daily_update_photos WHERE update_id = ?').bind(updateId).run().catch(() => undefined)
    throw error
  }
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

    // Public homepage visitor counter: one anonymous, cookie-based browser record.
    // Store only a SHA-256 hash; never store the visitor cookie itself.
    if (url.pathname === '/api/visitor-count' && request.method === 'GET') {
      const cookieHeader = request.headers.get('cookie') ?? ''
      const cookieMatch = cookieHeader.match(/(?:^|;\s*)nhym_visitor_id=([a-f0-9-]{36})(?:;|$)/i)
      const visitorId = cookieMatch?.[1] ?? crypto.randomUUID()
      const visitorHash = await financeDigest(visitorId)
      await env.DB.prepare('INSERT OR IGNORE INTO homepage_visitors (visitor_hash) VALUES (?)').bind(visitorHash).run()
      const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM homepage_visitors').first<{ total: number }>()
      const headers = new Headers({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      })
      if (!cookieMatch) {
        headers.append('set-cookie', `nhym_visitor_id=${visitorId}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`)
      }
      return new Response(JSON.stringify({ totalVisitors: Number(count?.total ?? 0) }), { status: 200, headers })
    }


    // HOMEPAGE SECTION VISIBILITY — public read; Main Admin-only updates.
    if (url.pathname === '/api/homepage-sections' && request.method === 'GET') {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS homepage_section_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        important_notice INTEGER NOT NULL DEFAULT 1,
        public_feedback INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run()
      await env.DB.prepare('INSERT OR IGNORE INTO homepage_section_settings (id, important_notice, public_feedback) VALUES (1, 1, 1)').run()
      const settings = await env.DB.prepare('SELECT important_notice, public_feedback FROM homepage_section_settings WHERE id = 1').first<{ important_notice: number; public_feedback: number }>()
      return json({ importantNotice: Number(settings?.important_notice ?? 1) === 1, publicFeedback: Number(settings?.public_feedback ?? 1) === 1 }, 200)
    }

    if (url.pathname === '/api/admin/homepage-sections' && request.method === 'PUT') {
      if (!authorised(request, env)) return json({ error: 'Admin access key सही नहीं है।' }, 401)
      let body: { importantNotice?: unknown; publicFeedback?: unknown }
      try { body = await request.json() } catch { return json({ error: 'सेटिंग का प्रारूप सही नहीं है।' }, 400) }
      if (typeof body.importantNotice !== 'boolean' || typeof body.publicFeedback !== 'boolean') {
        return json({ error: 'दोनों सेक्शन की स्थिति चुनें।' }, 400)
      }
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS homepage_section_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        important_notice INTEGER NOT NULL DEFAULT 1,
        public_feedback INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run()
      await env.DB.prepare(`
        INSERT INTO homepage_section_settings (id, important_notice, public_feedback, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET important_notice = excluded.important_notice,
          public_feedback = excluded.public_feedback, updated_at = excluded.updated_at
      `).bind(body.importantNotice ? 1 : 0, body.publicFeedback ? 1 : 0, new Date().toISOString()).run()
      return json({ ok: true, importantNotice: body.importantNotice, publicFeedback: body.publicFeedback }, 200)
    }

    // PUBLIC FEEDBACK — public list and immediate publication.
    if (url.pathname === '/api/public-feedback' && request.method === 'GET') {
      const result = await env.DB.prepare(`
        SELECT id, name, city, category, message, created_at
        FROM public_feedback
        ORDER BY created_at DESC
        LIMIT 200
      `).all()
      return json({ feedback: (result.results ?? []).map((row: any) => ({
        id: row.id, name: row.name, city: row.city, category: row.category,
        message: row.message, createdAt: row.created_at
      })) }, 200)
    }

    if (url.pathname === '/api/public-feedback' && request.method === 'POST') {
      const parsedFeedback = await readJsonLimited<{ name?: unknown; city?: unknown; category?: unknown; message?: unknown; publicConsent?: unknown }>(request, 64 * 1024)
      if (!parsedFeedback.ok) {
        return json({ error: parsedFeedback.status === 413 ? 'संदेश बहुत बड़ा है। कृपया छोटा संदेश भेजें।' : 'संदेश का प्रारूप सही नहीं है।' }, parsedFeedback.status)
      }
      const body = parsedFeedback.value
      const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
      const name = clean(body.name, 80)
      const city = clean(body.city, 80)
      const message = clean(body.message, 1500)
      const category = String(body.category ?? '')
      if (name.length < 2 || message.length < 3) return json({ error: 'कृपया अपना नाम और कम-से-कम 3 अक्षरों का संदेश दर्ज करें।' }, 400)
      if (body.publicConsent !== true) return json({ error: 'सार्वजनिक प्रकाशन की सहमति आवश्यक है।' }, 400)
      if (!['Support', 'Opposition', 'Suggestion', 'Other'].includes(category)) return json({ error: 'प्रतिक्रिया का प्रकार चुनें।' }, 400)
      if (/https?:\/\/|www\./i.test(message)) return json({ error: 'कृपया संदेश में बाहरी लिंक न डालें।' }, 400)

      // Feedback is published immediately, so reject obvious contact details in every public text field.
      // This is a guardrail, not a guarantee that every form of personal information is detected.
      const publicText = `${name} ${city} ${message}`
      const containsEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(publicText)
      const containsIndianMobile = /(?:\+?91[\s-]?)?[6-9]\d(?:[\s-]?\d){8}/.test(publicText)
      if (containsEmail || containsIndianMobile) {
        return json({ error: 'सार्वजनिक प्रतिक्रिया में ईमेल या मोबाइल नंबर न लिखें। कृपया निजी संपर्क जानकारी हटाकर दोबारा भेजें।' }, 400)
      }

      // Remove expired feedback rate-limit digests opportunistically. This table contains
      // only hashes and is used for the one-hour anti-spam window, not long-term analytics.
      await env.DB.prepare("DELETE FROM public_feedback_rate_limits WHERE datetime(window_started_at) <= datetime('now', '-24 hours')").run()
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const ipHash = await financeDigest(`public-feedback|2026|${ip}`)
      await env.DB.prepare(`
        INSERT INTO public_feedback_rate_limits (ip_hash, window_started_at, request_count)
        VALUES (?, CURRENT_TIMESTAMP, 1)
        ON CONFLICT(ip_hash) DO UPDATE SET
          window_started_at = CASE WHEN datetime(public_feedback_rate_limits.window_started_at) <= datetime('now', '-1 hour') THEN CURRENT_TIMESTAMP ELSE public_feedback_rate_limits.window_started_at END,
          request_count = CASE WHEN datetime(public_feedback_rate_limits.window_started_at) <= datetime('now', '-1 hour') THEN 1 ELSE public_feedback_rate_limits.request_count + 1 END
      `).bind(ipHash).run()
      const limit = await env.DB.prepare('SELECT request_count FROM public_feedback_rate_limits WHERE ip_hash = ?').bind(ipHash).first<{ request_count: number }>()
      if (Number(limit?.request_count ?? 0) > 5) return json({ error: 'इस नेटवर्क से एक घंटे में अधिकतम 5 प्रतिक्रियाएँ भेजी जा सकती हैं। कृपया बाद में प्रयास करें।' }, 429)

      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      await env.DB.prepare('INSERT INTO public_feedback (id, name, city, category, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, name, city, category, message, createdAt).run()
      return json({ feedback: { id, name, city, category, message, createdAt } }, 201)
    }

    const publicFeedbackDelete = url.pathname.match(/^\/api\/public-feedback\/([a-f0-9-]+)$/i)
    if (publicFeedbackDelete && request.method === 'DELETE') {
      if (!authorised(request, env)) return financeJson({ error: 'Admin access key सही नहीं है।' }, 401)
      const result = await env.DB.prepare('DELETE FROM public_feedback WHERE id = ?').bind(publicFeedbackDelete[1]).run()
      if (Number(result.meta?.changes ?? 0) === 0) return json({ error: 'संदेश नहीं मिला या पहले ही हटाया जा चुका है।' }, 404)
      return json({ ok: true })
    }

    // PRIVACY REQUESTS — public submission; private, admin-authorized review.
    // Store only a hashed IP for short-window abuse prevention; never log raw IP here.
    const ensurePrivacyRequestTables = async () => {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS privacy_requests (
        id TEXT PRIMARY KEY,
        request_type TEXT NOT NULL CHECK (request_type IN ('ACCESS','CORRECT','DELETE','WITHDRAW_CONSENT','COMPLAINT')),
        email TEXT NOT NULL,
        registration_id TEXT,
        details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','IN_REVIEW','NEEDS_VERIFICATION','COMPLETED','DECLINED')),
        resolution_note TEXT NOT NULL DEFAULT '',
        verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','FAILED')),
        verification_method TEXT NOT NULL DEFAULT '',
        verified_at TEXT,
        verified_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`).run()
      // Backward-compatible additive migration for existing D1 databases.
      const requestColumns = await env.DB.prepare('PRAGMA table_info(privacy_requests)').all<{ name: string }>()
      const columnNames = new Set((requestColumns.results ?? []).map((column) => column.name))
      if (!columnNames.has('verification_status')) { try { await env.DB.prepare("ALTER TABLE privacy_requests ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'").run() } catch (error) { if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error } }
      if (!columnNames.has('verification_method')) { try { await env.DB.prepare("ALTER TABLE privacy_requests ADD COLUMN verification_method TEXT NOT NULL DEFAULT ''").run() } catch (error) { if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error } }
      if (!columnNames.has('verified_at')) { try { await env.DB.prepare('ALTER TABLE privacy_requests ADD COLUMN verified_at TEXT').run() } catch (error) { if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error } }
      if (!columnNames.has('verified_by')) { try { await env.DB.prepare('ALTER TABLE privacy_requests ADD COLUMN verified_by TEXT').run() } catch (error) { if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error } }
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS privacy_request_rate_limits (
        ip_hash TEXT PRIMARY KEY,
        window_started_at TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0
      )`).run()
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS privacy_request_audit (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        note TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'admin-token',
        created_at TEXT NOT NULL
      )`).run()

      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS privacy_access_audit (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        outcome TEXT NOT NULL,
        ip_hash TEXT NOT NULL DEFAULT '',
        request_trace TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`).run()
    }

    if (url.pathname === '/api/privacy-requests' && request.method === 'POST') {
      const parsed = await readJsonLimited<{
        requestType?: unknown; email?: unknown; registrationId?: unknown;
        details?: unknown; acknowledgement?: unknown
      }>(request, 8 * 1024)
      if (!parsed.ok) return json({ error: parsed.status === 413 ? 'Request is too large.' : 'Invalid request.' }, parsed.status)
      const body = parsed.value
      const requestType = String(body.requestType ?? '')
      const email = String(body.email ?? '').trim().toLowerCase()
      const registrationId = String(body.registrationId ?? '').trim().slice(0, 32)
      const rawDetails = String(body.details ?? '')
      if (rawDetails.length > 1000) return json({ error: 'Details must be 1000 characters or fewer.' }, 400)
      const details = rawDetails.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
      if (!['ACCESS','CORRECT','DELETE','WITHDRAW_CONSENT','COMPLAINT'].includes(requestType)) {
        return json({ error: 'Choose a valid privacy request type.' }, 400)
      }
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return json({ error: 'Enter a valid email address.' }, 400)
      }
      if (body.acknowledgement !== true) return json({ error: 'Please acknowledge the privacy request handling notice.' }, 400)
      if (details.length > 1000) return json({ error: 'Details must be 1000 characters or fewer.' }, 400)

      await ensurePrivacyRequestTables()
      await env.DB.prepare("DELETE FROM privacy_request_rate_limits WHERE datetime(window_started_at) <= datetime('now', '-24 hours')").run()
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const ipHash = await financeDigest(`privacy-request|2026|${ip}`)
      await env.DB.prepare(`
        INSERT INTO privacy_request_rate_limits (ip_hash, window_started_at, request_count)
        VALUES (?, CURRENT_TIMESTAMP, 1)
        ON CONFLICT(ip_hash) DO UPDATE SET
          window_started_at = CASE WHEN datetime(privacy_request_rate_limits.window_started_at) <= datetime('now', '-1 hour') THEN CURRENT_TIMESTAMP ELSE privacy_request_rate_limits.window_started_at END,
          request_count = CASE WHEN datetime(privacy_request_rate_limits.window_started_at) <= datetime('now', '-1 hour') THEN 1 ELSE privacy_request_rate_limits.request_count + 1 END
      `).bind(ipHash).run()
      const limit = await env.DB.prepare('SELECT request_count FROM privacy_request_rate_limits WHERE ip_hash = ?').bind(ipHash).first<{ request_count: number }>()
      if (Number(limit?.request_count ?? 0) > 5) return json({ error: 'Too many requests from this network. Please try again later.' }, 429)

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await env.DB.prepare(`
        INSERT INTO privacy_requests (id, request_type, email, registration_id, details, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'RECEIVED', ?, ?)
      `).bind(id, requestType, email, registrationId || null, details, now, now).run()
      await env.DB.prepare(`
        INSERT INTO privacy_request_audit (id, request_id, action, new_status, note, created_at)
        VALUES (?, ?, 'SUBMITTED', 'RECEIVED', '', ?)
      `).bind(crypto.randomUUID(), id, now).run()
      return json({ ok: true, requestId: id, status: 'RECEIVED', message: 'Your request has been received for manual review. Submission does not automatically change or delete records.' }, 201)
    }

    if (url.pathname === '/api/admin/privacy-requests' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      await ensurePrivacyRequestTables()
      const result = await env.DB.prepare(`
        SELECT id, request_type, email, registration_id, details, status, resolution_note,
          verification_status, verification_method, verified_at, verified_by, created_at, updated_at
        FROM privacy_requests ORDER BY created_at DESC LIMIT 200
      `).all()
      return financeJson({ requests: result.results ?? [] })
    }

    const privacyRequestMatch = url.pathname.match(new RegExp('^/api/admin/privacy-requests/([a-f0-9-]+)$', 'i'))
    if (privacyRequestMatch && request.method === 'PATCH') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const parsed = await readJsonLimited<{
        status?: unknown; resolutionNote?: unknown; verificationStatus?: unknown; verificationMethod?: unknown
      }>(request, 4 * 1024)
      if (!parsed.ok) return financeJson({ error: parsed.status === 413 ? 'Request is too large.' : 'Invalid request.' }, parsed.status)
      const nextStatus = String(parsed.value.status ?? '')
      const allowedStatuses = ['RECEIVED','IN_REVIEW','NEEDS_VERIFICATION','COMPLETED','DECLINED']
      if (!allowedStatuses.includes(nextStatus)) return financeJson({ error: 'Invalid privacy request status.' }, 400)
      const resolutionNote = String(parsed.value.resolutionNote ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 1000)
      const verificationStatus = String(parsed.value.verificationStatus ?? 'UNVERIFIED')
      const verificationMethod = String(parsed.value.verificationMethod ?? '').trim()
      const allowedVerificationStatuses = ['UNVERIFIED','PENDING','VERIFIED','FAILED']
      const allowedVerificationMethods = ['REGISTRATION_DETAILS','CALLBACK_KNOWN_CONTACT','IN_PERSON','OTHER']
      if (!allowedVerificationStatuses.includes(verificationStatus)) return financeJson({ error: 'Invalid identity verification status.' }, 400)
      if (verificationStatus === 'VERIFIED' && !allowedVerificationMethods.includes(verificationMethod)) {
        return financeJson({ error: 'Choose a valid verification method before marking identity as verified.' }, 400)
      }
      if (verificationStatus !== 'VERIFIED' && verificationMethod) {
        return financeJson({ error: 'A verification method can only be recorded when verification status is VERIFIED.' }, 400)
      }
      if ((nextStatus === 'COMPLETED' || nextStatus === 'DECLINED') && resolutionNote.length < 10) {
        return financeJson({ error: 'Add a concise outcome/reason note (at least 10 characters) before completing or declining a request.' }, 400)
      }
      await ensurePrivacyRequestTables()
      const id = privacyRequestMatch[1]
      const current = await env.DB.prepare('SELECT status, request_type, email, registration_id, details, verification_status, verification_method FROM privacy_requests WHERE id = ?')
        .bind(id).first<{ status: string; request_type: string; email: string; registration_id: string | null; details: string; verification_status: string; verification_method: string }>()
      if (!current) return financeJson({ error: 'Privacy request not found.' }, 404)
      if (nextStatus === 'COMPLETED' && current.verification_status !== 'VERIFIED') {
        return financeJson({ error: 'Save identity verification as VERIFIED in a separate review step before completing this request.' }, 409)
      }
      if (nextStatus === 'COMPLETED' && verificationStatus !== 'VERIFIED') {
        return financeJson({ error: 'Identity must remain VERIFIED before a privacy request can be marked completed.' }, 409)
      }
      let deletionTargetIds: number[] = []
      let deletionReason = ''
      if (nextStatus === 'COMPLETED' && current.request_type === 'DELETE') {
        const deletionDisposition = resolutionNote.match(/^DISPOSITION:\s*(DELETED|RETAINED_EXCEPTION)\s*\nREASON:\s*(.{10,})$/i)
        if (!deletionDisposition) {
          return financeJson({ error: 'For DELETE requests, use two lines: DISPOSITION: DELETED or DISPOSITION: RETAINED_EXCEPTION, then REASON: followed by at least 10 characters.' }, 400)
        }
        deletionReason = deletionDisposition[2].trim()
        if (deletionDisposition[1].toUpperCase() === 'RETAINED_EXCEPTION' && !/retention|legal|law|obligation|exception/i.test(deletionReason)) {
          return financeJson({ error: 'A retained-data exception must explain the applicable retention/legal obligation.' }, 400)
        }
        if (deletionDisposition[1].toUpperCase() === 'DELETED') {
          const targetRows = await env.DB.prepare(`
            SELECT id, registration_id FROM registrations
            WHERE lower(email) = lower(?)
              AND (? IS NULL OR registration_id = ?)
            ORDER BY id
          `).bind(current.email, current.registration_id || null, current.registration_id || null).all<{ id: number; registration_id: string | null }>()
          deletionTargetIds = (targetRows.results ?? []).map(row => Number(row.id)).filter(Number.isFinite)
          if (deletionTargetIds.length === 0) {
            return financeJson({ error: 'No matching registration was found for this verified email/registration ID. Nothing was deleted; check the request details before retrying.' }, 404)
          }
          // Never guess which registration to erase when an email has multiple
          // registrations and the verified request does not specify an exact ID.
          if (!current.registration_id && deletionTargetIds.length > 1) {
            return financeJson({ error: 'This email matches multiple registrations. Add the exact registration ID to the verified request before deleting anything; no records were changed.' }, 409)
          }
          await env.DB.prepare('CREATE TABLE IF NOT EXISTS participant_change_audit (id TEXT PRIMARY KEY, participant_id INTEGER NOT NULL, registration_id INTEGER NOT NULL, action TEXT NOT NULL, old_values_json TEXT NOT NULL, new_values_json TEXT NOT NULL, reason TEXT NOT NULL, privacy_request_id TEXT, actor TEXT NOT NULL, request_trace TEXT, created_at TEXT NOT NULL)').run()
          const placeholders = deletionTargetIds.map(() => '?').join(', ')
          const nowForDeletion = new Date().toISOString()
          // Remove participant personal details and correction snapshots, but retain
          // a minimal anonymized registration shell for accounting/statistical history.
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM participant_change_audit WHERE registration_id IN (${placeholders})`).bind(...deletionTargetIds),
            env.DB.prepare(`DELETE FROM participants WHERE registration_id IN (${placeholders})`).bind(...deletionTargetIds),
            env.DB.prepare(`UPDATE registrations
              SET email = 'deleted+' || id || '@privacy.invalid',
                  payment_reference = 'REDACTED-' || id,
                  declarations_json = '{}',
                  updated_at = ?
              WHERE id IN (${placeholders})`).bind(nowForDeletion, ...deletionTargetIds),
            env.DB.prepare('DELETE FROM privacy_request_audit WHERE request_id = ?').bind(id),
            env.DB.prepare(`UPDATE privacy_requests
              SET email = ?, registration_id = NULL, details = '', resolution_note = ?, updated_at = ?
              WHERE id = ?`).bind(`deleted+${id}@privacy.invalid`, `DISPOSITION: DELETED\nREASON: ${deletionReason.slice(0, 300)}`, nowForDeletion, id),
            env.DB.prepare(`INSERT INTO privacy_request_audit (id, request_id, action, old_status, new_status, note, actor, created_at)
              VALUES (?, ?, 'PERSONAL_DATA_DELETED', ?, 'COMPLETED', 'Participant personal details and correction snapshots deleted; minimal anonymized registration/accounting record retained.', 'main-admin-token', ?)`)
              .bind(crypto.randomUUID(), id, current.status, nowForDeletion)          ])
        }
      }
      if (nextStatus === 'COMPLETED' && current.request_type === 'CORRECT') {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS participant_change_audit (id TEXT PRIMARY KEY, participant_id INTEGER NOT NULL, registration_id INTEGER NOT NULL, action TEXT NOT NULL, old_values_json TEXT NOT NULL, new_values_json TEXT NOT NULL, reason TEXT NOT NULL, privacy_request_id TEXT, actor TEXT NOT NULL, request_trace TEXT, created_at TEXT NOT NULL)').run()
        const correction = await env.DB.prepare('SELECT id FROM participant_change_audit WHERE privacy_request_id = ? LIMIT 1').bind(id).first()
        if (!correction) return financeJson({ error: 'Complete the verified participant correction through Manage Participants and save its linked audit entry before completing this request.' }, 409)
      }
      const now = new Date().toISOString()
      const verificationChanged = current.verification_status !== verificationStatus || current.verification_method !== verificationMethod
      const verifiedAt = verificationStatus === 'VERIFIED' ? (verificationChanged ? now : null) : null
      const verifiedBy = verificationStatus === 'VERIFIED' ? 'main-admin-token' : null
      await env.DB.prepare(`
        UPDATE privacy_requests
        SET status = ?, resolution_note = ?, verification_status = ?, verification_method = ?,
            verified_at = CASE WHEN ? = 'VERIFIED' AND ? IS NOT NULL THEN ? WHEN ? <> 'VERIFIED' THEN NULL ELSE verified_at END,
            verified_by = CASE WHEN ? = 'VERIFIED' THEN ? ELSE NULL END,
            updated_at = ?
        WHERE id = ?
      `).bind(
        nextStatus, deletionTargetIds.length > 0 ? 'DISPOSITION: DELETED\\nREASON: Participant personal data removed; anonymized registration/accounting shell retained.' : resolutionNote, verificationStatus, verificationMethod,
        verificationStatus, verifiedAt, now, verificationStatus, verificationStatus, verifiedBy, now, id
      ).run()
      if (current.status !== nextStatus || resolutionNote) {
        const isCompletedDeletion = nextStatus === 'COMPLETED' && current.request_type === 'DELETE' && deletionTargetIds.length > 0
        if (!isCompletedDeletion) {
          await env.DB.prepare(`
            INSERT INTO privacy_request_audit (id, request_id, action, old_status, new_status, note, actor, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'main-admin-token', ?)
          `).bind(crypto.randomUUID(), id, current.status === nextStatus ? 'REVIEW_NOTE_UPDATED' : 'STATUS_CHANGED', current.status, nextStatus, resolutionNote, now).run()
        }
      }
      if (verificationChanged) {
        await env.DB.prepare(`
          INSERT INTO privacy_request_audit (id, request_id, action, old_status, new_status, note, actor, created_at)
          VALUES (?, ?, 'IDENTITY_VERIFICATION_CHANGED', ?, ?, ?, 'main-admin-token', ?)
        `).bind(crypto.randomUUID(), id, current.verification_status, verificationStatus, verificationStatus === 'VERIFIED' ? `Method: ${verificationMethod}` : 'Verification status updated; no identity document stored.', now).run()
      }
      return financeJson({ ok: true, status: nextStatus, verificationStatus, verificationMethod, verifiedAt: verificationStatus === 'VERIFIED' ? (verifiedAt ?? now) : null, updatedAt: now })
    }

    if (url.pathname.match(new RegExp('^/api/admin/privacy-requests/([a-f0-9-]+)/audit$', 'i')) && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      await ensurePrivacyRequestTables()
      const auditMatch = url.pathname.match(new RegExp('^/api/admin/privacy-requests/([a-f0-9-]+)/audit$', 'i'))!
      const result = await env.DB.prepare(`
        SELECT action, old_status, new_status, note, actor, created_at
        FROM privacy_request_audit WHERE request_id = ? ORDER BY created_at ASC LIMIT 200
      `).bind(auditMatch[1]).all()
      return financeJson({ audit: result.results ?? [] })
    }

    // Admin-only audit trail for privileged reads that can feed participant reports/exports.
    if (url.pathname === '/api/admin/privacy-access-audit' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      await ensurePrivacyRequestTables()
      const result = await env.DB.prepare(`
        SELECT actor, action, endpoint, outcome, ip_hash, request_trace, created_at
        FROM privacy_access_audit ORDER BY created_at DESC LIMIT 200
      `).all()
      return financeJson({ entries: result.results ?? [] })
    }

    // DAILY UPDATES — public list exposes only Admin-approved publications.
    if (url.pathname === '/api/daily-updates' && request.method === 'GET') {
      const result = await env.DB.prepare(`
        SELECT id, title, body, category, event_date, published_at, created_at
        FROM daily_updates
        WHERE status = 'PUBLISHED'
        ORDER BY event_date DESC, published_at DESC
        LIMIT 100
      `).all()
      const updates = await Promise.all((result.results ?? []).map(async (row: any) => {
        const photos = await env.DB.prepare(`
          SELECT id, caption, file_size FROM daily_update_photos WHERE update_id = ? ORDER BY display_order, created_at
        `).bind(row.id).all()
        return {
          id: row.id, title: row.title, body: row.body, category: row.category,
          eventDate: row.event_date, publishedAt: row.published_at, createdAt: row.created_at,
          photos: (photos.results ?? []).map((photo: any) => ({
            id: photo.id, caption: photo.caption, fileSize: photo.file_size,
            imageUrl: `/api/daily-updates/images/${encodeURIComponent(photo.id)}`
          }))
        }
      }))
      return json({ updates }, 200)
    }

    // DAILY UPDATES — public image route only serves photos belonging to published updates.
    const dailyPublicImage = url.pathname.match(/^\/api\/daily-updates\/images\/([a-f0-9-]+)$/i)
    if (dailyPublicImage && request.method === 'GET') {
      const photo = await env.DB.prepare(`
        SELECT p.r2_key, p.content_type
        FROM daily_update_photos p JOIN daily_updates u ON u.id = p.update_id
        WHERE p.id = ? AND u.status = 'PUBLISHED'
      `).bind(dailyPublicImage[1]).first<{ r2_key: string; content_type: string }>()
      if (!photo) return json({ error: 'Image not found' }, 404)
      const object = await env.GALLERY.get(photo.r2_key)
      if (!object) return json({ error: 'Image not found' }, 404)
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('content-type', photo.content_type)
      headers.set('x-content-type-options', 'nosniff')
      headers.set('cache-control', 'public, max-age=86400')
      headers.set('etag', object.httpEtag)
      return new Response(object.body, { headers })
    }

    // DAILY UPDATES — authorized committee member login with rate limiting.
    if (url.pathname === '/api/daily-updates/login' && request.method === 'POST') {
      let body: { loginId?: string; password?: string }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      const loginId = String(body.loginId ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (!/^[a-z0-9._-]{3,80}$/.test(loginId) || !password || password.length > 200) {
        return financeJson({ error: 'Valid Login ID and password are required.' }, 400)
      }
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const attemptKey = await financeDigest(`daily-updates|${loginId}|${ip}`)
      const now = Date.now()
      const limit = await env.DB.prepare('SELECT failures, window_started_at, locked_until FROM daily_update_login_limits WHERE attempt_key = ?')
        .bind(attemptKey).first<{ failures: number; window_started_at: string; locked_until: string | null }>()
      if (limit?.locked_until && new Date(limit.locked_until).getTime() > now) {
        return financeJson({ error: 'Too many failed attempts. Please try again after 15 minutes.' }, 429)
      }
      const user = await env.DB.prepare('SELECT id, display_name, login_id, password_salt, password_hash FROM daily_update_users WHERE login_id = ? COLLATE NOCASE AND is_active = 1')
        .bind(loginId).first<{ id: string; display_name: string; login_id: string; password_salt: string; password_hash: string }>()
      const passwordHash = user ? await financePasswordHash(password, user.password_salt) : ''
      if (!user || passwordHash !== user.password_hash) {
        const windowExpired = !limit || now - new Date(limit.window_started_at).getTime() > 15 * 60 * 1000
        const failures = windowExpired ? 1 : Number(limit.failures) + 1
        const windowStarted = windowExpired ? new Date(now).toISOString() : limit.window_started_at
        const lockedUntil = failures >= 8 ? new Date(now + 15 * 60 * 1000).toISOString() : null
        await env.DB.prepare(`
          INSERT INTO daily_update_login_limits (id, attempt_key, failures, window_started_at, locked_until)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(attempt_key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, locked_until = excluded.locked_until
        `).bind(crypto.randomUUID(), attemptKey, failures, windowStarted, lockedUntil).run()
        return financeJson({ error: 'Login ID या password सही नहीं है।' }, 401)
      }
      await env.DB.prepare('DELETE FROM daily_update_login_limits WHERE attempt_key = ?').bind(attemptKey).run()
      const token = financeRandomHex(32)
      const tokenHash = await financeDigest(token)
      const expiresAt = new Date(now + 12 * 60 * 60 * 1000).toISOString()
      await env.DB.prepare('INSERT INTO daily_update_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, new Date(now).toISOString()).run()
      await env.DB.prepare('UPDATE daily_update_users SET last_login_at = ? WHERE id = ?').bind(new Date(now).toISOString(), user.id).run()
      return financeJson({ ok: true, token, expiresAt, user: { id: user.id, displayName: user.display_name, loginId: user.login_id } })
    }

    if (url.pathname === '/api/daily-updates/me' && request.method === 'GET') {
      const actor = await getDailyUpdateMember(request, env)
      if (!actor) return financeJson({ error: 'Sign in with an authorized committee account.' }, 401)
      return financeJson({ user: { id: actor.id, displayName: actor.display_name, loginId: actor.login_id } })
    }

    // DAILY UPDATES — committee members can submit drafts, but never publish them.
    if (url.pathname === '/api/daily-updates/submissions' && request.method === 'POST') {
      const actor = await getDailyUpdateMember(request, env)
      if (!actor) return financeJson({ error: 'Your session has expired. Please sign in again.' }, 401)
      const form = await request.formData()
      const title = String(form.get('title') ?? '').trim()
      const body = String(form.get('body') ?? '').trim()
      const category = String(form.get('category') ?? 'General').trim().slice(0, 80) || 'General'
      const eventDate = String(form.get('eventDate') ?? '').trim()
      if (!title || title.length > 160 || !body || body.length > 10000 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !isValidFinanceDate(eventDate)) {
        return financeJson({ error: 'शीर्षक, विवरण और सही तारीख दर्ज करें।' }, 400)
      }
      const files = form.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0)
      const id = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      try {
        await env.DB.prepare(`
          INSERT INTO daily_updates (id, title, body, category, event_date, status, created_by_user_id, created_by_name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
        `).bind(id, title, body, category, eventDate, actor.id, actor.display_name, nowIso, nowIso).run()
        await storeDailyUpdatePhotos(env, id, files)
        await logDailyUpdate(env, actor.id, actor.display_name, 'SUBMITTED_FOR_APPROVAL', id, { photoCount: files.length })
        return financeJson({ ok: true, status: 'PENDING', message: 'Update submitted for Admin approval.' }, 201)
      } catch (error) {
        await env.DB.prepare('DELETE FROM daily_updates WHERE id = ?').bind(id).run().catch(() => undefined)
        const message = error instanceof Error ? error.message : ''
        return financeJson({ error: message || 'Update could not be saved.' }, 400)
      }
    }

    // Preview-only schema bootstrap for isolated integration tests; production always returns 404.
    if (url.pathname === '/api/admin/daily-updates/ci-prepare' && request.method === 'POST') {
      if (env.FINANCE_PREVIEW_MODE !== 'true') return json({ error: 'Not found' }, 404)
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS gallery_photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          r2_key TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          caption TEXT,
          category TEXT NOT NULL DEFAULT 'NHYM Events',
          content_type TEXT NOT NULL,
          file_size INTEGER,
          is_published INTEGER NOT NULL DEFAULT 1,
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_gallery_photos_published ON gallery_photos(is_published, display_order, created_at)'),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS homepage_visitors (
          visitor_hash TEXT PRIMARY KEY,
          first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`)
      ])
      return financeJson({ ok: true, gallerySchemaReady: true })
    }

    // Preview-only seed of one temporary Finance Head when Preview already has real finance users.
    // The seeded account is CI-prefixed, requires Main Admin auth, and is removed by ci-cleanup.
    if (url.pathname === '/api/admin/daily-updates/ci-finance-prepare' && request.method === 'POST') {
      if (env.FINANCE_PREVIEW_MODE !== 'true') return json({ error: 'Not found' }, 404)
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let payload: { loginId?: unknown; password?: unknown }
      try { payload = await request.json() as { loginId?: unknown; password?: unknown } } catch { return financeJson({ error: 'Invalid JSON' }, 400) }
      const loginId = typeof payload.loginId === 'string' ? payload.loginId : ''
      const password = typeof payload.password === 'string' ? payload.password : ''
      if (!/^ci-finance-head-[0-9a-f]{12}$/.test(loginId) || password.length < 12 || password.length > 200) {
        return financeJson({ error: 'Invalid Preview Finance test credentials' }, 400)
      }
      const existing = await env.DB.prepare('SELECT id FROM finance_users WHERE login_id = ?').bind(loginId).first<{ id: string }>()
      if (existing) return financeJson({ error: 'Preview Finance test login already exists' }, 409)
      const salt = financeRandomHex(16)
      const passwordHash = await financePasswordHash(password, salt)
      await env.DB.prepare("INSERT INTO finance_users (id, display_name, login_id, role, password_salt, password_hash) VALUES (?, 'CI Finance Head', ?, 'FINANCE_HEAD', ?, ?)").bind(crypto.randomUUID(), loginId, salt, passwordHash).run()
      return financeJson({ ok: true, created: true }, 201)
    }

    // Preview-only CI cleanup. Never available on production; preserves audit history.
    if (url.pathname === '/api/admin/daily-updates/ci-cleanup' && request.method === 'POST') {
      if (env.FINANCE_PREVIEW_MODE !== 'true') return json({ error: 'Not found' }, 404)
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let payload: { loginId?: unknown; marker?: unknown; financeLoginIds?: unknown }
      try { payload = await request.json() as { loginId?: unknown; marker?: unknown } } catch { return financeJson({ error: 'Invalid JSON' }, 400) }
      const loginId = typeof payload.loginId === 'string' ? payload.loginId : ''
      const marker = typeof payload.marker === 'string' ? payload.marker : ''
      if (!/^ci[0-9a-f]{16}$/.test(loginId) || !/^CI Functional Test [0-9a-f]{12}$/.test(marker)) {
        return financeJson({ error: 'Invalid Preview test identifiers' }, 400)
      }
      const updates = await env.DB.prepare("SELECT id FROM daily_updates WHERE title LIKE 'CI Functional Test %'").all<{ id: string }>()
      const updateIds = (updates.results ?? []).map(row => row.id)
      for (const updateId of updateIds) {
        const photos = await env.DB.prepare('SELECT r2_key FROM daily_update_photos WHERE update_id = ?').bind(updateId).all<{ r2_key: string }>()
        await Promise.all((photos.results ?? []).map(photo => env.GALLERY.delete(photo.r2_key).catch(() => undefined)))
        await env.DB.prepare('DELETE FROM daily_update_photos WHERE update_id = ?').bind(updateId).run()
      }
      for (const updateId of updateIds) {
        await env.DB.prepare('DELETE FROM daily_updates WHERE id = ?').bind(updateId).run()
      }
      const users = await env.DB.prepare("SELECT id FROM daily_update_users WHERE display_name = 'Automated Preview Test Member' AND login_id GLOB 'ci????????????????'").all<{ id: string }>()
      for (const user of users.results ?? []) {
        if (!/^ci[0-9a-f]{16}$/.test(String((await env.DB.prepare('SELECT login_id FROM daily_update_users WHERE id = ?').bind(user.id).first<{ login_id: string }>())?.login_id ?? ''))) continue
        await env.DB.prepare('DELETE FROM daily_update_sessions WHERE user_id = ?').bind(user.id).run()
        await env.DB.prepare('DELETE FROM daily_update_users WHERE id = ?').bind(user.id).run()
      }
      const financeLoginIds = payload.financeLoginIds === undefined ? [] : payload.financeLoginIds
      if (!Array.isArray(financeLoginIds) || financeLoginIds.some(value => typeof value !== 'string' || !/^ci-finance-(head|operator|approver|auditor)-[0-9a-f]{12}$/.test(value))) {
        return financeJson({ error: 'Invalid Preview finance test identifiers' }, 400)
      }
      let deletedFinanceTestUsers = 0
      for (const financeLoginId of financeLoginIds as string[]) {
        const financeUser = await env.DB.prepare('SELECT id FROM finance_users WHERE login_id = ?').bind(financeLoginId).first<{ id: string }>()
        if (!financeUser) continue
        await env.DB.prepare('DELETE FROM finance_audit_logs WHERE actor_user_id = ? OR entity_id = ?').bind(financeUser.id, financeUser.id).run()
        await env.DB.prepare('DELETE FROM finance_sessions WHERE user_id = ?').bind(financeUser.id).run()
        await env.DB.prepare('DELETE FROM finance_users WHERE id = ?').bind(financeUser.id).run()
        deletedFinanceTestUsers++
      }
      return financeJson({ ok: true, deletedUpdates: updateIds.length, deletedTestAccounts: (users.results ?? []).length, deletedFinanceTestUsers, auditHistoryPreserved: true })
    }

    // DAILY UPDATES — admin-only list, including unpublished content for review.
    if (url.pathname === '/api/admin/daily-updates' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const result = await env.DB.prepare('SELECT * FROM daily_updates ORDER BY CASE status WHEN \'PENDING\' THEN 0 WHEN \'DRAFT\' THEN 1 WHEN \'REJECTED\' THEN 2 ELSE 3 END, updated_at DESC').all()
      const updates = await Promise.all((result.results ?? []).map(async (row: any) => {
        const photoResult = await env.DB.prepare('SELECT id, original_name, caption FROM daily_update_photos WHERE update_id = ? ORDER BY display_order, created_at').bind(row.id).all()
        return {
          id: row.id, title: row.title, body: row.body, category: row.category, eventDate: row.event_date,
          status: row.status, createdByName: row.created_by_name, createdAt: row.created_at,
          publishedAt: row.published_at, rejectionNote: row.rejection_note,
          photos: (photoResult.results ?? []).map((photo: any) => ({
            id: photo.id, caption: photo.caption, originalName: photo.original_name,
            imageUrl: `/api/admin/daily-updates/images/${encodeURIComponent(photo.id)}`
          }))
        }
      }))
      return financeJson({ updates })
    }

    // DAILY UPDATES — admin-only audit history, bounded to the newest 200 records.
    if (url.pathname === '/api/admin/daily-updates/audit' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const requestedLimit = Number(url.searchParams.get('limit') ?? 100)
      const limit = Number.isFinite(requestedLimit) ? Math.min(200, Math.max(1, Math.floor(requestedLimit))) : 100
      const updateId = url.searchParams.get('updateId')
      const result = updateId
        ? await env.DB.prepare('SELECT id, actor_user_id, actor_name, action, update_id, details_json, created_at FROM daily_update_audit_log WHERE update_id = ? ORDER BY created_at DESC LIMIT ?').bind(updateId, limit).all()
        : await env.DB.prepare('SELECT id, actor_user_id, actor_name, action, update_id, details_json, created_at FROM daily_update_audit_log ORDER BY created_at DESC LIMIT ?').bind(limit).all()
      return financeJson({ logs: (result.results ?? []).map((row: any) => ({
        id: row.id, actorUserId: row.actor_user_id, actorName: row.actor_name, action: row.action,
        updateId: row.update_id, details: row.details_json, createdAt: row.created_at
      })) })
    }

    // DAILY UPDATES — admin-only photo preview for pending submissions.
    const dailyAdminImage = url.pathname.match(/^\/api\/admin\/daily-updates\/images\/([a-f0-9-]+)$/i)
    if (dailyAdminImage && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const photo = await env.DB.prepare('SELECT r2_key, content_type FROM daily_update_photos WHERE id = ?').bind(dailyAdminImage[1]).first<{ r2_key: string; content_type: string }>()
      if (!photo) return json({ error: 'Image not found' }, 404)
      const object = await env.GALLERY.get(photo.r2_key)
      if (!object) return json({ error: 'Image not found' }, 404)
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('content-type', photo.content_type)
      headers.set('x-content-type-options', 'nosniff')
      headers.set('cache-control', 'private, no-store')
      return new Response(object.body, { headers })
    }

    // DAILY UPDATES — Admin creates content; publishing is an explicit Admin action.
    if (url.pathname === '/api/admin/daily-updates' && request.method === 'POST') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const form = await request.formData()
      const title = String(form.get('title') ?? '').trim()
      const body = String(form.get('body') ?? '').trim()
      const category = String(form.get('category') ?? 'General').trim().slice(0, 80) || 'General'
      const eventDate = String(form.get('eventDate') ?? '').trim()
      const publishNow = String(form.get('publishNow') ?? 'true') === 'true'
      if (!title || title.length > 160 || !body || body.length > 10000 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !isValidFinanceDate(eventDate)) {
        return financeJson({ error: 'शीर्षक, विवरण और सही तारीख दर्ज करें।' }, 400)
      }
      const files = form.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0)
      const id = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const status = publishNow ? 'PUBLISHED' : 'DRAFT'
      try {
        await env.DB.prepare(`
          INSERT INTO daily_updates (id, title, body, category, event_date, status, created_by_name, approved_by, approved_at, published_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'Admin', ?, ?, ?, ?, ?)
        `).bind(id, title, body, category, eventDate, status, publishNow ? 'Admin' : null, publishNow ? nowIso : null, publishNow ? nowIso : null, nowIso, nowIso).run()
        await storeDailyUpdatePhotos(env, id, files)
        await logDailyUpdate(env, null, 'Admin', publishNow ? 'CREATED_AND_PUBLISHED' : 'CREATED_DRAFT', id, { photoCount: files.length })
        return financeJson({ ok: true, status, message: publishNow ? 'Update published.' : 'Draft saved.' }, 201)
      } catch (error) {
        await env.DB.prepare('DELETE FROM daily_updates WHERE id = ?').bind(id).run().catch(() => undefined)
        const message = error instanceof Error ? error.message : ''
        return financeJson({ error: message || 'Update could not be saved.' }, 400)
      }
    }

    // DAILY UPDATES — Admin edits existing updates and attached photos.
    const dailyUpdateEdit = url.pathname.match(/^\/api\/admin\/daily-updates\/([a-f0-9-]+)\/edit$/i)
    if (dailyUpdateEdit && request.method === 'POST') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const id = dailyUpdateEdit[1]
      const existing = await env.DB.prepare('SELECT id, title, body, category, event_date, status FROM daily_updates WHERE id = ?').bind(id).first<any>()
      if (!existing) return financeJson({ error: 'Update not found.' }, 404)
      const form = await request.formData()
      const title = String(form.get('title') ?? '').trim()
      const body = String(form.get('body') ?? '').trim()
      const category = String(form.get('category') ?? 'General').trim().slice(0, 80) || 'General'
      const eventDate = String(form.get('eventDate') ?? '').trim()
      if (!title || title.length > 160 || !body || body.length > 10000 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !isValidFinanceDate(eventDate)) {
        return financeJson({ error: 'शीर्षक, विवरण और सही तारीख दर्ज करें।' }, 400)
      }
      let removePhotoIds: string[]
      try {
        const parsed = JSON.parse(String(form.get('removePhotoIds') ?? '[]'))
        if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string')) throw new Error('Invalid photo list')
        removePhotoIds = [...new Set(parsed as string[])]
      } catch { return financeJson({ error: 'फोटो हटाने की सूची सही नहीं है।' }, 400) }
      const newFiles = form.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0)
      const photoResult = await env.DB.prepare('SELECT id, r2_key, file_size FROM daily_update_photos WHERE update_id = ?').bind(id).all<{ id: string; r2_key: string; file_size: number }>()
      const current = photoResult.results ?? []
      if (removePhotoIds.some(photoId => !current.some(photo => photo.id === photoId))) return financeJson({ error: 'फोटो सूची अपडेट से मेल नहीं खाती। Refresh करके दोबारा प्रयास करें।' }, 400)
      const remaining = current.filter(photo => !removePhotoIds.includes(photo.id))
      if (remaining.length + newFiles.length > 5) return financeJson({ error: 'एक अपडेट में अधिकतम 5 फोटो रखी जा सकती हैं।' }, 400)
      if (remaining.reduce((sum, photo) => sum + Number(photo.file_size || 0), 0) + newFiles.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
        return financeJson({ error: 'एक अपडेट की सभी फोटो का कुल आकार 50 MB से अधिक नहीं होना चाहिए।' }, 400)
      }
      try {
        if (newFiles.length) await storeDailyUpdatePhotos(env, id, newFiles)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        return financeJson({ error: message || 'नई फोटो सेव नहीं हो सकीं।' }, 400)
      }
      const removed = current.filter(photo => removePhotoIds.includes(photo.id))
      const deleteResults = await Promise.allSettled(removed.map(photo => env.GALLERY.delete(photo.r2_key)))
      const failedDeletes = deleteResults.filter(result => result.status === 'rejected').length
      if (failedDeletes) {
        await logDailyUpdate(env, null, 'Admin', 'EDIT_STORAGE_CLEANUP_FAILED', id, { failedDeletes, requestedPhotoRemovals: removePhotoIds.length })
        return financeJson({ error: 'कुछ फोटो स्टोरेज से नहीं हट सकीं। अपडेट रिफ्रेश करके जाँचें और दोबारा प्रयास करें।' }, 503)
      }
      if (removePhotoIds.length) {
        const placeholders = removePhotoIds.map(() => '?').join(', ')
        await env.DB.prepare(`DELETE FROM daily_update_photos WHERE update_id = ? AND id IN (${placeholders})`).bind(id, ...removePhotoIds).run()
      }
      const nowIso = new Date().toISOString()
      await env.DB.prepare('UPDATE daily_updates SET title = ?, body = ?, category = ?, event_date = ?, updated_at = ? WHERE id = ?')
        .bind(title, body, category, eventDate, nowIso, id).run()
      await logDailyUpdate(env, null, 'Admin', 'EDITED', id, {
        previous: { title: existing.title, category: existing.category, eventDate: existing.event_date, status: existing.status, photoCount: current.length },
        updated: { title, category, eventDate, photoCount: remaining.length + newFiles.length },
        removedPhotoCount: removePhotoIds.length, addedPhotoCount: newFiles.length,
      })
      return financeJson({ ok: true, status: existing.status, message: 'Update saved.', addedPhotoCount: newFiles.length, removedPhotoCount: removePhotoIds.length })
    }

    // DAILY UPDATES — Admin approval / rejection.
    const dailyUpdateAction = url.pathname.match(/^\/api\/admin\/daily-updates\/([a-f0-9-]+)$/i)
    // Admin deletion removes photo objects and metadata while preserving audit history.
    const dailyUpdateDelete = url.pathname.match(/^\/api\/admin\/daily-updates\/([a-f0-9-]+)$/i)
    if (dailyUpdateDelete && request.method === 'DELETE') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const id = dailyUpdateDelete[1]
      const existing = await env.DB.prepare('SELECT id, title, status FROM daily_updates WHERE id = ?').bind(id).first<{ id: string; title: string; status: string }>()
      if (!existing) return financeJson({ error: 'Update not found.' }, 404)
      const photos = await env.DB.prepare('SELECT r2_key FROM daily_update_photos WHERE update_id = ?').bind(id).all<{ r2_key: string }>()
      const keys = (photos.results ?? []).map(photo => photo.r2_key)
      const deletionResults = await Promise.allSettled(keys.map(key => env.GALLERY.delete(key)))
      const failedDeletes = deletionResults.filter(result => result.status === 'rejected').length
      if (failedDeletes > 0) {
        await logDailyUpdate(env, null, 'Admin', 'DELETE_STORAGE_CLEANUP_FAILED', id, { photoCount: keys.length, failedDeletes })
        return financeJson({ error: 'Deletion paused because photo storage cleanup could not be confirmed. Please retry.' }, 503)
      }
      await env.DB.prepare('DELETE FROM daily_update_photos WHERE update_id = ?').bind(id).run()
      await env.DB.prepare('DELETE FROM daily_updates WHERE id = ?').bind(id).run()
      await logDailyUpdate(env, null, 'Admin', 'DELETED', id, { title: existing.title, previousStatus: existing.status, deletedPhotoCount: keys.length })
      return financeJson({ ok: true, deleted: true, deletedPhotoCount: keys.length })
    }

    if (dailyUpdateAction && request.method === 'PATCH') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let body: { action?: string; note?: string }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      const id = dailyUpdateAction[1]
      const existing = await env.DB.prepare('SELECT id, status, title FROM daily_updates WHERE id = ?').bind(id).first<{ id: string; status: string; title: string }>()
      if (!existing) return financeJson({ error: 'Update not found.' }, 404)
      const nowIso = new Date().toISOString()
      if (body.action === 'approve' || body.action === 'publish') {
        await env.DB.prepare("UPDATE daily_updates SET status = 'PUBLISHED', approved_by = 'Admin', approved_at = ?, published_at = ?, rejection_note = NULL, updated_at = ? WHERE id = ?")
          .bind(nowIso, nowIso, nowIso, id).run()
        await logDailyUpdate(env, null, 'Admin', 'APPROVED_AND_PUBLISHED', id, { previousStatus: existing.status })
        return financeJson({ ok: true, status: 'PUBLISHED', message: 'Update approved and published.' })
      }
      if (body.action === 'reject') {
        const note = String(body.note ?? '').trim().slice(0, 1000) || 'Please review and resubmit this update.'
        const photos = await env.DB.prepare('SELECT r2_key FROM daily_update_photos WHERE update_id = ?').bind(id).all<{ r2_key: string }>()
        const keys = (photos.results ?? []).map(photo => photo.r2_key)
        const deletionResults = await Promise.allSettled(keys.map(key => env.GALLERY.delete(key)))
        const failedDeletes = deletionResults.filter(result => result.status === 'rejected').length
        if (failedDeletes > 0) {
          await logDailyUpdate(env, null, 'Admin', 'REJECTION_STORAGE_CLEANUP_FAILED', id, { photoCount: keys.length, failedDeletes })
          return financeJson({ error: 'Rejection paused because photo storage cleanup could not be confirmed. Please retry.' }, 503)
        }
        await env.DB.prepare('DELETE FROM daily_update_photos WHERE update_id = ?').bind(id).run()
        await env.DB.prepare("UPDATE daily_updates SET status = 'REJECTED', rejection_note = ?, approved_by = 'Admin', approved_at = ?, updated_at = ? WHERE id = ?")
          .bind(note, nowIso, nowIso, id).run()
        await logDailyUpdate(env, null, 'Admin', 'REJECTED', id, { note, previousStatus: existing.status, deletedPhotoCount: keys.length })
        return financeJson({ ok: true, status: 'REJECTED', message: 'Update rejected; attached photos removed from storage.', deletedPhotoCount: keys.length })
      }
      return financeJson({ error: 'Action must be approve, publish, or reject.' }, 400)
    }

    // DAILY UPDATES — admin manages authorized committee member accounts.
    if (url.pathname === '/api/admin/daily-updates/users' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const result = await env.DB.prepare('SELECT id, display_name, login_id, is_active, created_at, last_login_at FROM daily_update_users ORDER BY created_at DESC').all()
      return financeJson({ users: (result.results ?? []).map((row: any) => ({ id: row.id, displayName: row.display_name, loginId: row.login_id, isActive: Boolean(row.is_active), createdAt: row.created_at, lastLoginAt: row.last_login_at })) })
    }

    if (url.pathname === '/api/admin/daily-updates/users' && request.method === 'POST') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let body: { displayName?: string; loginId?: string; password?: string }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      const displayName = String(body.displayName ?? '').trim().slice(0, 100)
      const loginId = String(body.loginId ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (displayName.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 200) {
        return financeJson({ error: 'नाम, सही Login ID और कम-से-कम 12 अक्षर का password आवश्यक है।' }, 400)
      }
      const id = crypto.randomUUID()
      const salt = financeRandomHex(16)
      const passwordHash = await financePasswordHash(password, salt)
      try {
        await env.DB.prepare('INSERT INTO daily_update_users (id, display_name, login_id, password_salt, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
          .bind(id, displayName, loginId, salt, passwordHash, new Date().toISOString()).run()
      } catch (error) {
        if (/unique constraint/i.test(error instanceof Error ? error.message : '')) return financeJson({ error: 'यह Login ID पहले से उपयोग में है।' }, 409)
        throw error
      }
      await logDailyUpdate(env, null, 'Admin', 'MEMBER_CREATED', null, { userId: id, loginId })
      return financeJson({ ok: true, message: 'Authorized member account created.' }, 201)
    }

    const dailyUpdateUserAction = url.pathname.match(/^\/api\/admin\/daily-updates\/users\/([a-f0-9-]+)$/i)
    if (dailyUpdateUserAction && request.method === 'PATCH') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let body: { active?: boolean }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      if (typeof body.active !== 'boolean') return financeJson({ error: 'active must be true or false.' }, 400)
      const userId = dailyUpdateUserAction[1]
      const result = await env.DB.prepare('UPDATE daily_update_users SET is_active = ? WHERE id = ?').bind(body.active ? 1 : 0, userId).run()
      if (Number(result.meta.changes ?? 0) !== 1) return financeJson({ error: 'Member account not found.' }, 404)
      if (!body.active) await env.DB.prepare('DELETE FROM daily_update_sessions WHERE user_id = ?').bind(userId).run()
      await logDailyUpdate(env, null, 'Admin', body.active ? 'MEMBER_ENABLED' : 'MEMBER_DISABLED', null, { userId })
      return financeJson({ ok: true, active: body.active })
    }

    const dailyUpdatePasswordReset = url.pathname.match(/^\/api\/admin\/daily-updates\/users\/([a-f0-9-]+)\/reset-password$/i)
    if (dailyUpdatePasswordReset && request.method === 'POST') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let body: { password?: string }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      const password = String(body.password ?? '')
      if (password.length < 12 || password.length > 200) return financeJson({ error: 'Password must be at least 12 characters.' }, 400)
      const userId = dailyUpdatePasswordReset[1]
      const user = await env.DB.prepare('SELECT id, login_id FROM daily_update_users WHERE id = ?').bind(userId).first<{ id: string; login_id: string }>()
      if (!user) return financeJson({ error: 'Member account not found.' }, 404)
      const salt = financeRandomHex(16)
      const passwordHash = await financePasswordHash(password, salt)
      await env.DB.batch([
        env.DB.prepare('UPDATE daily_update_users SET password_salt = ?, password_hash = ? WHERE id = ?').bind(salt, passwordHash, userId),
        env.DB.prepare('DELETE FROM daily_update_sessions WHERE user_id = ?').bind(userId),
      ])
      await logDailyUpdate(env, null, 'Admin', 'MEMBER_PASSWORD_RESET', null, { userId, loginId: user.login_id })
      return financeJson({ ok: true, message: 'Password reset. Existing sessions were revoked.' })
    }


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

  // Public access is limited to images explicitly published in the Gallery.
  // Daily Updates and unpublished uploads share the same private R2 bucket.
  const publishedPhoto = await env.DB.prepare(
    'SELECT id FROM gallery_photos WHERE r2_key = ? AND is_published = 1 LIMIT 1'
  ).bind(key).first<{ id: number }>()

  if (!publishedPhoto) {
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

    // REGISTRATION OPEN/CLOSED CONTROL — persisted in D1; admin-only writes.
    if (url.pathname === '/api/registration-status' && request.method === 'GET') {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS registration_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_open INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run()
      await env.DB.prepare('INSERT OR IGNORE INTO registration_settings (id, is_open) VALUES (1, 1)').run()
      const setting = await env.DB.prepare('SELECT is_open FROM registration_settings WHERE id = 1').first<{ is_open: number }>()
      return json({ open: Number(setting?.is_open ?? 1) === 1 }, 200)
    }

    if (url.pathname === '/api/admin/registration-status' && request.method === 'PUT') {
      if (!authorised(request, env)) return json({ error: 'Admin access key सही नहीं है।' }, 401)
      let body: { open?: unknown }
      try { body = await request.json() } catch { return json({ error: 'स्थिति का प्रारूप सही नहीं है।' }, 400) }
      if (typeof body.open !== 'boolean') return json({ error: 'open true या false होना चाहिए।' }, 400)
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS registration_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_open INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run()
      await env.DB.prepare(`
        INSERT INTO registration_settings (id, is_open, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET is_open = excluded.is_open, updated_at = excluded.updated_at
      `).bind(body.open ? 1 : 0, new Date().toISOString()).run()
      return json({ open: body.open }, 200)
    }

    if (url.pathname === '/api/registrations' && request.method === 'POST') {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS registration_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_open INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run()
      await env.DB.prepare('INSERT OR IGNORE INTO registration_settings (id, is_open) VALUES (1, 1)').run()
      const registrationSetting = await env.DB.prepare('SELECT is_open FROM registration_settings WHERE id = 1').first<{ is_open: number }>()
      if (Number(registrationSetting?.is_open ?? 1) !== 1) {
        return json({ error: 'NHYM 2026 के लिए registration बंद हो चुका है। कृपया आयोजन समिति से संपर्क करें।' }, 403)
      }
      const parsedBody = await readJsonLimited<RegistrationPayload>(request, 1024 * 1024)
      if (!parsedBody.ok) {
        return json({ error: parsedBody.status === 413 ? 'Registration request is too large. Please reduce the submitted data and try again.' : 'Invalid request.' }, parsedBody.status)
      }
      let body: RegistrationPayload = parsedBody.value
      body = uppercaseRegistrationValues(body) as RegistrationPayload
      if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email.trim())) return json({ error: 'A valid email address is required.' }, 400)
      if (!Array.isArray(body.participants) || body.participants.length < 1 || body.participants.length > 100) return json({ error: 'Add between 1 and 100 participants per registration.' }, 400)
      if (!['UPI', 'BANK', 'CASH', 'OTHER'].includes(body.paymentMode) || !body.paymentReference || body.paymentReference.trim().length < 2 || body.paymentReference.length > 200) return json({ error: 'A valid payment method and transaction/reference number are required.' }, 400)
      if (!body.declarations || !['INFO', 'PAYMENT', 'FINAL'].every((key) => body.declarations[key.toLowerCase()] === true)) return json({ error: 'All declarations are required.' }, 400)
      if (body.privacyConsent !== true) return json({ error: 'Please acknowledge the Privacy Notice before submitting.' }, 400)

      // Recalculate each fee from the server's approved fee schedule. Never trust
      // the amount or fee values supplied by the browser.
      const expectedFees: number[] = []
      for (const participant of body.participants) {
        const dob = String(participant.dob ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json({ error: 'A valid date of birth is required for each participant.' }, 400)
        const birthDate = new Date(dob + 'T00:00:00Z')
        if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dob) return json({ error: 'A valid date of birth is required for each participant.' }, 400)
        const indiaDateParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
        const currentYear = Number(indiaDateParts.find((part) => part.type === 'year')?.value)
        const currentMonth = Number(indiaDateParts.find((part) => part.type === 'month')?.value)
        const currentDay = Number(indiaDateParts.find((part) => part.type === 'day')?.value)
        let age = currentYear - birthDate.getUTCFullYear()
        const monthDifference = currentMonth - (birthDate.getUTCMonth() + 1)
        if (monthDifference < 0 || (monthDifference === 0 && currentDay < birthDate.getUTCDate())) age--
        if (age < 18) return json({ error: 'Registration is available only to participants aged 18 or older.' }, 400)
        const category = String(participant.category ?? '')
        let expectedFee: number
        if (category === 'STUDENT') expectedFee = 500
        else if (category === 'NOT-EARNING') expectedFee = 1000
        else if (category === 'EARNING') expectedFee = 1500
        else if (category === 'VISITOR') {
          const contribution = String(participant.contribution ?? '')
          if (contribution === 'AMOUNT-100') expectedFee = 100
          else if (contribution === 'AMOUNT-200') expectedFee = 200
          else if (contribution === 'AMOUNT-500') expectedFee = 500
          else if (contribution === 'OTHER') {
            const otherAmount = Number(String(participant.other ?? '').trim())
            if (!Number.isSafeInteger(otherAmount) || otherAmount < 100) return json({ error: 'Visitor contribution must be at least ₹100.' }, 400)
            expectedFee = otherAmount
          } else return json({ error: 'Invalid participant category or visitor contribution.' }, 400)
        } else return json({ error: 'Invalid participant category.' }, 400)

        const submittedFee = Number(participant.fee)
        if (!Number.isSafeInteger(submittedFee) || submittedFee !== expectedFee) {
          return json({ error: 'Participant fee does not match the approved fee schedule.' }, 400)
        }
        expectedFees.push(expectedFee)
      }
      const expectedTotal = expectedFees.reduce((sum, fee) => sum + fee, 0)
      if (!Number.isSafeInteger(expectedTotal) || !Number.isSafeInteger(Number(body.total)) || Number(body.total) !== expectedTotal) {
        return json({ error: 'Registration total does not match the participant fees.' }, 400)
      }

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
          .bind(body.email.trim().toUpperCase(), Math.round(Number(body.total) || 0), body.paymentMode, normalizedReference, JSON.stringify({ ...body.declarations, privacyConsent: true, privacyNoticeVersion: '2026-10-28', privacyAcknowledgedAt: createdAt }), createdAt)
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
      try {
        await env.DB.prepare('UPDATE registrations SET registration_id = ? WHERE id = ?').bind(registrationId, id).run()

        const statements = body.participants.map((p, i) => env.DB.prepare(`INSERT INTO participants
          (registration_id, participant_no, name, dob, gender, address, district, state, pin, age, category, fee, activities_json, cultural, sports, from_outside, accommodation, note, details_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, i + 1, String(p.name ?? '').trim().toUpperCase(), String(p.dob ?? ''), String(p.gender ?? ''), String(p.address ?? ''), String(p.district ?? ''), String(p.state ?? ''), String(p.pin ?? ''), String(p.age ?? ''), String(p.category ?? ''), Math.round(Number(p.fee) || 0), JSON.stringify(p.activities ?? []), String(p.cultural ?? ''), String(p.sports ?? ''), String(p.fromOutside ?? ''), String(p.accommodation ?? ''), String(p.note ?? ''), JSON.stringify({ ...p, name: String(p.name ?? '').trim().toUpperCase() })))
        if (statements.length) await env.DB.batch(statements)
      } catch (error) {
        // D1 cannot wrap the initial ID-generating insert and subsequent participant
        // batch in one transaction here. Best-effort cleanup prevents an orphaned
        // pending registration if the follow-up write fails.
        try {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM participants WHERE registration_id = ?').bind(id),
            env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(id),
          ])
        } catch (cleanupError) {
          console.error('Registration follow-up write and cleanup failed', {
            registrationRowId: id,
            error: error instanceof Error ? error.message : String(error),
            cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          })
        }
        throw error
      }
      return json({ ok: true, registrationId, status: 'PENDING' }, 201)
    }

    // Participant Portal — look up one registration using
    // Registration ID + the email used during registration.
    if (
      url.pathname === '/api/participant/lookup' &&
      request.method === 'POST'
    ) {
      const parsedLookup = await readJsonLimited<{ registrationId?: string; email?: string }>(request, 8 * 1024)
      if (!parsedLookup.ok) {
        return json({ error: parsedLookup.status === 413 ? 'Request too large.' : 'Invalid request.' }, parsedLookup.status)
      }
      const body = parsedLookup.value

      const registrationId =
        String(body.registrationId ?? '')
          .trim()
          .toUpperCase()

      const email =
        String(body.email ?? '')
          .trim()
          .toLowerCase()

      if (!registrationId || !email || email.length > 254 || registrationId.length > 32) {
        return json(
          {
            error:
              'Registration ID and registered email address are required.'
          },
          400
        )
      }

      // Apply a per-client-IP failure limit to the public lookup endpoint.
      // Reuse the existing D1 rate-limit table with a namespaced, hashed key.
      const lookupIp = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const lookupAttemptKey = await financeDigest(`participant-lookup:${lookupIp}`)
      const lookupLimit = await env.DB.prepare(
        "SELECT locked_until FROM finance_login_limits WHERE attempt_key = ? AND datetime(locked_until) > datetime('now')"
      ).bind(lookupAttemptKey).first<{ locked_until: string }>()
      if (lookupLimit) return financeJson({ error: 'Too many lookup attempts. Please try again after 15 minutes.' }, 429)

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
        await env.DB.prepare(`
          INSERT INTO finance_login_limits (attempt_key, failed_attempts, window_started_at, locked_until, updated_at)
          VALUES (?, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
          ON CONFLICT(attempt_key) DO UPDATE SET
            failed_attempts = CASE WHEN datetime(finance_login_limits.window_started_at) <= datetime('now', '-15 minutes') THEN 1 ELSE finance_login_limits.failed_attempts + 1 END,
            window_started_at = CASE WHEN datetime(finance_login_limits.window_started_at) <= datetime('now', '-15 minutes') THEN CURRENT_TIMESTAMP ELSE finance_login_limits.window_started_at END,
            locked_until = CASE WHEN datetime(finance_login_limits.window_started_at) <= datetime('now', '-15 minutes') THEN NULL ELSE finance_login_limits.locked_until END,
            updated_at = CURRENT_TIMESTAMP
        `).bind(lookupAttemptKey).run()
        await env.DB.prepare(`
          UPDATE finance_login_limits SET locked_until = datetime('now', '+15 minutes'), updated_at = CURRENT_TIMESTAMP
          WHERE attempt_key = ? AND failed_attempts >= 5
            AND datetime(window_started_at) > datetime('now', '-15 minutes')
            AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))
        `).bind(lookupAttemptKey).run()
        await ensurePrivacyRequestTables()
        await env.DB.prepare(`
          INSERT INTO privacy_access_audit (id, actor, action, endpoint, outcome, ip_hash, request_trace, created_at)
          VALUES (?, 'participant-portal', 'PARTICIPANT_LOOKUP_NO_MATCH', '/api/participant/lookup', 'NO_MATCH', ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          await financeDigest(`privacy-access|2026|${lookupIp}`),
          (request.headers.get('cf-ray') ?? '').slice(0, 100),
          new Date().toISOString()
        ).run()
        return json(
          {
            error:
              'Registration not found. Check your Registration ID and registered email address.'
          },
          404
        )
      }

      await env.DB.prepare('DELETE FROM finance_login_limits WHERE attempt_key = ?').bind(lookupAttemptKey).run()

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

      // Audit self-service access without storing the registration ID, email, or raw IP.
      await ensurePrivacyRequestTables()
      await env.DB.prepare(`
        INSERT INTO privacy_access_audit (id, actor, action, endpoint, outcome, ip_hash, request_trace, created_at)
        VALUES (?, 'participant-portal', 'PARTICIPANT_SELF_SERVICE_LOOKUP', '/api/participant/lookup', 'SUCCESS', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        await financeDigest(`privacy-access|2026|${lookupIp}`),
        (request.headers.get('cf-ray') ?? '').slice(0, 100),
        new Date().toISOString()
      ).run()

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
      (SELECT COALESCE(SUM(file_size), 0) FROM daily_update_photos) +
      (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
      (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) +
      ? <= ?
  `).bind(storageReservationId, file.size, file.size, MAX_SHARED_STORAGE),
])
if (Number(reservationBatch[1]?.meta?.changes ?? 0) !== 1) {
  const storageResult = await env.DB.prepare(`
    SELECT
      (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
      (SELECT COALESCE(SUM(file_size), 0) FROM daily_update_photos) +
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

    // Main Admin login verification for the isolated preview dashboard.
    // This validates the ADMIN_TOKEN without querying registration tables, which are
    // intentionally not present in the finance-only preview database.
    if (url.pathname === '/api/admin/auth-check' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      return financeJson({ ok: true })
    }

    // MAIN ADMIN ONLY — finance account listing and password recovery.
    // Finance sessions cannot use these endpoints; they require the website ADMIN_TOKEN.
    if (url.pathname === '/api/admin/finance-users' && request.method === 'GET') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      const users = await env.DB.prepare(
        'SELECT id, display_name, login_id, role, is_active, created_at, last_login_at FROM finance_users ORDER BY created_at'
      ).all()
      return financeJson({ users: users.results ?? [] })
    }

    const adminFinancePasswordReset = url.pathname.match(/^\/api\/admin\/finance-users\/([a-f0-9-]+)\/reset-password$/i)
    if (adminFinancePasswordReset && request.method === 'POST') {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      let body: { password?: string }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      const password = String(body.password ?? '')
      if (password.length < 12 || password.length > 200) {
        return financeJson({ error: 'Set a temporary password of at least 12 characters.' }, 400)
      }
      const target = await env.DB.prepare('SELECT id, login_id FROM finance_users WHERE id = ?')
        .bind(adminFinancePasswordReset[1]).first<{ id: string; login_id: string }>()
      if (!target) return financeJson({ error: 'Finance user not found.' }, 404)
      const salt = financeRandomHex(16)
      const passwordHash = await financePasswordHash(password, salt)
      await env.DB.batch([
        env.DB.prepare('UPDATE finance_users SET password_salt = ?, password_hash = ?, must_change_password = 1 WHERE id = ?')
          .bind(salt, passwordHash, target.id),
        env.DB.prepare('DELETE FROM finance_sessions WHERE user_id = ?').bind(target.id),
        env.DB.prepare(`INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id)
          VALUES (?, NULL, 'FINANCE_USER', ?, 'ADMIN_PASSWORD_RESET', NULL, ?, 'Authorized by Main Admin using ADMIN_TOKEN; password value is never logged.', ?)`)
          .bind(crypto.randomUUID(), target.id, JSON.stringify({ mustChangePassword: true, sessionsRevoked: true }), request.headers.get('cf-ray')),
      ])
      return financeJson({ ok: true, message: 'Password reset. The user must set a new password at next login; all existing sessions have been revoked.' })
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
        const displayName = String(body.displayName ?? '').trim().slice(0, 100)
        const loginId = String(body.loginId ?? '').trim().toLowerCase().slice(0, 80)
        const password = String(body.password ?? '')
        if (displayName.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 200) return financeJson({ error: 'Name, login ID (3–80 letters/numbers/._-) and a password of at least 12 characters are required.' }, 400)
        try {
          const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM finance_users').first<{ total: number }>()
          if (Number(count?.total ?? 0) !== 0) return financeJson({ error: 'Finance setup is already complete. Ask a Finance Head to create accounts.' }, 409)
          const salt = financeRandomHex(16)
          const passwordHash = await financePasswordHash(password, salt)
          const id = crypto.randomUUID()
          const created = await env.DB.prepare("INSERT INTO finance_users (id, display_name, login_id, role, password_salt, password_hash) SELECT ?, ?, ?, 'FINANCE_HEAD', ?, ? WHERE NOT EXISTS (SELECT 1 FROM finance_users)").bind(id, displayName, loginId, salt, passwordHash).run()
          if (Number(created.meta?.changes ?? 0) !== 1) return financeJson({ error: 'Finance setup was completed by another request. Please sign in.' }, 409)
          return financeJson({ ok: true, message: 'Finance Head account created. Sign in using your individual credentials.' }, 201)
        } catch (error) {
          console.error('Finance Head bootstrap failed', error)
          return financeJson({ error: 'Finance Head account could not be created due to a server/database error. No success was reported; check Worker logs before retrying.' }, 500)
        }
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
        const user = await env.DB.prepare('SELECT id, display_name, login_id, role, password_salt, password_hash, must_change_password FROM finance_users WHERE login_id = ? AND is_active = 1').bind(loginId).first<{ id: string; display_name: string; login_id: string; role: string; password_salt: string; password_hash: string; must_change_password: number }>()
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
        return financeJson({ ok: true, token, expiresAt, mustChangePassword: Boolean(user.must_change_password), user: { id: user.id, displayName: user.display_name, loginId: user.login_id, role: user.role } })
      }

      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
      if (!bearer) return financeJson({ error: 'Sign in to access Finance Management.' }, 401)
      const tokenHash = await financeDigest(bearer)
      const actor = await env.DB.prepare("SELECT u.id, u.display_name, u.login_id, u.role, u.must_change_password, u.password_salt, u.password_hash FROM finance_sessions s JOIN finance_users u ON u.id = s.user_id WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1").bind(tokenHash).first<{ id: string; display_name: string; login_id: string; role: 'FINANCE_HEAD' | 'OPERATOR' | 'APPROVER' | 'AUDITOR'; must_change_password: number; password_salt: string; password_hash: string }>()
      if (!actor) return financeJson({ error: 'Finance session expired. Please sign in again.' }, 401)
      if (url.pathname === '/api/finance/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM finance_sessions WHERE token_hash = ?').bind(tokenHash).run()
        return financeJson({ ok: true })
      }
      if (url.pathname === '/api/finance/change-password' && request.method === 'POST') {
        if (Number(actor.must_change_password) !== 1) return financeJson({ error: 'A temporary password change is not pending for this account.' }, 409)
        let body: { currentPassword?: string; newPassword?: string }
        try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
        const currentPassword = String(body.currentPassword ?? '')
        const newPassword = String(body.newPassword ?? '')
        if (newPassword.length < 12 || newPassword.length > 200) return financeJson({ error: 'New password must be at least 12 characters.' }, 400)
        const currentHash = await financePasswordHash(currentPassword, actor.password_salt)
        if (!currentPassword || currentHash !== actor.password_hash) return financeJson({ error: 'Current password is incorrect.' }, 401)
        if (currentPassword === newPassword) return financeJson({ error: 'Choose a new password different from the temporary password.' }, 400)
        const newSalt = financeRandomHex(16)
        const newHash = await financePasswordHash(newPassword, newSalt)
        const updated = await env.DB.batch([
          env.DB.prepare('UPDATE finance_users SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ? AND must_change_password = 1').bind(newSalt, newHash, actor.id),
          env.DB.prepare(`INSERT INTO finance_audit_logs (id, actor_user_id, entity_type, entity_id, action, old_values_json, new_values_json, reason, request_id)
            SELECT ?, ?, 'FINANCE_USER', ?, 'PASSWORD_CHANGED_AFTER_RESET', ?, ?, 'User replaced temporary password.', ? WHERE changes() = 1`).bind(crypto.randomUUID(), actor.id, actor.id, JSON.stringify({ mustChangePassword: true }), JSON.stringify({ mustChangePassword: false }), request.headers.get('cf-ray')),
          env.DB.prepare('DELETE FROM finance_sessions WHERE user_id = ? AND token_hash <> ?').bind(actor.id, tokenHash),
        ])
        if (Number(updated[0]?.meta?.changes ?? 0) !== 1) return financeJson({ error: 'Password-change state has changed. Sign in again.' }, 409)
        return financeJson({ ok: true, message: 'Password changed successfully. You can now access Finance Management.' })
      }
      if (Number(actor.must_change_password) === 1) return financeJson({ error: 'You must change your temporary password before using Finance Management.', mustChangePassword: true }, 403)
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
              (SELECT COALESCE(SUM(file_size), 0) FROM daily_update_photos) +
              (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_documents) +
              (SELECT COALESCE(SUM(size_bytes), 0) FROM finance_storage_reservations WHERE expires_at > CURRENT_TIMESTAMP) +
              ? <= ?
          `).bind(storageReservationId, file.size, file.size, maxSharedStorageBytes),
        ])
        if (Number(reservationBatch[1]?.meta?.changes ?? 0) !== 1) {
          const storageUsage = await env.DB.prepare(`
            SELECT
              (SELECT COALESCE(SUM(file_size), 0) FROM gallery_photos) +
              (SELECT COALESCE(SUM(file_size), 0) FROM daily_update_photos) +
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
        let paymentInserted = false
        try {
          // Guard the INSERT itself, not only a preceding SELECT: this keeps the approved
          // balance check and insert in one D1 transaction even when requests race.
          const paymentResults = await env.DB.batch([
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
          paymentInserted = Number(paymentResults[0]?.meta?.changes ?? 0) === 1
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
        if (!paymentInserted) {
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

    // PARTICIPANT CORRECTION — Main Admin only; never expose this through Finance sessions.
    const participantCorrectionMatch = url.pathname.match(/^\/api\/admin\/participants\/(\d+)(?:\/audit)?$/)
    if (participantCorrectionMatch && request.method === 'GET' && url.pathname.endsWith('/audit')) {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      if (env.FINANCE_PREVIEW_MODE === 'true') return financeJson({ entries: [] })
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS participant_change_audit (id TEXT PRIMARY KEY, participant_id INTEGER NOT NULL, registration_id INTEGER NOT NULL, action TEXT NOT NULL, old_values_json TEXT NOT NULL, new_values_json TEXT NOT NULL, reason TEXT NOT NULL, privacy_request_id TEXT, actor TEXT NOT NULL, request_trace TEXT, created_at TEXT NOT NULL)').run()
      const auditId = Number(participantCorrectionMatch[1])
      const participant = await env.DB.prepare('SELECT id FROM participants WHERE id = ?').bind(auditId).first()
      if (!participant) return financeJson({ error: 'Participant not found.' }, 404)
      const result = await env.DB.prepare('SELECT action, old_values_json, new_values_json, reason, privacy_request_id, actor, request_trace, created_at FROM participant_change_audit WHERE participant_id = ? ORDER BY created_at DESC LIMIT 50').bind(auditId).all()
      return financeJson({ entries: result.results ?? [] })
    }

    if (participantCorrectionMatch && request.method === 'PATCH' && !url.pathname.endsWith('/audit')) {
      if (!authorised(request, env)) return financeJson({ error: 'Unauthorized' }, 401)
      if (env.FINANCE_PREVIEW_MODE === 'true') return financeJson({ error: 'Participant editing is unavailable in Finance Preview.' }, 403)

      let body: {
        name?: unknown; dob?: unknown; gender?: unknown; address?: unknown;
        district?: unknown; state?: unknown; pin?: unknown; activities?: unknown;
        cultural?: unknown; sports?: unknown; fromOutside?: unknown;
        accommodation?: unknown; note?: unknown; reason?: unknown;
        privacyRequestId?: unknown
      }
      try { body = await request.json() } catch { return financeJson({ error: 'Invalid JSON body.' }, 400) }
      const reason = String(body.reason ?? '').trim().slice(0, 500)
      if (reason.length < 5) return financeJson({ error: 'Correction reason is required (at least 5 characters).' }, 400)

      const id = Number(participantCorrectionMatch[1])
      const current = await env.DB.prepare(`
        SELECT id, registration_id, participant_no, name, dob, gender, address, district, state, pin,
          age, activities_json, cultural, sports, from_outside, accommodation, note
        FROM participants WHERE id = ?
      `).bind(id).first<any>()
      if (!current) return financeJson({ error: 'Participant not found.' }, 404)

      const fields: Record<string, unknown> = {
        name: body.name, dob: body.dob, gender: body.gender, address: body.address,
        district: body.district, state: body.state, pin: body.pin,
        activities_json: body.activities, cultural: body.cultural, sports: body.sports,
        from_outside: body.fromOutside, accommodation: body.accommodation, note: body.note
      }
      const limits: Record<string, number> = {
        name: 150, dob: 10, gender: 40, address: 500, district: 100, state: 100,
        pin: 10, activities_json: 2000, cultural: 200, sports: 200,
        from_outside: 20, accommodation: 100, note: 1000
      }
      const updated: Record<string, string> = {}
      for (const [field, value] of Object.entries(fields)) {
        if (value === undefined) continue
        const normalized = String(value ?? '').trim()
        if (normalized.length > limits[field]) return financeJson({ error: `Field ${field} exceeds the allowed length.` }, 400)
        if (field === 'name' && normalized.length < 2) return financeJson({ error: 'Participant name must contain at least 2 characters.' }, 400)
        if (field === 'dob' && normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return financeJson({ error: 'Date of birth must use YYYY-MM-DD format.' }, 400)
        if (field === 'pin' && normalized && !/^\d{4,10}$/.test(normalized)) return financeJson({ error: 'PIN must contain 4–10 digits.' }, 400)
        if (field === 'activities_json' && normalized) {
          try { if (!Array.isArray(JSON.parse(normalized))) throw new Error() } catch { return financeJson({ error: 'Activities must be a JSON array.' }, 400) }
        }
        updated[field] = normalized
      }
      if (Object.keys(updated).length === 0) return financeJson({ error: 'No participant fields were supplied for correction.' }, 400)

      const nextDob = updated.dob ?? String(current.dob ?? '')
      let nextAge = String(current.age ?? '')
      if (nextDob) {
        const dobDate = new Date(`${nextDob}T00:00:00.000Z`)
        if (Number.isNaN(dobDate.getTime()) || dobDate.toISOString().slice(0, 10) !== nextDob || dobDate.getTime() > Date.now()) return financeJson({ error: 'Date of birth is invalid or in the future.' }, 400)
        const now = new Date()
        let age = now.getUTCFullYear() - dobDate.getUTCFullYear()
        if (now.getUTCMonth() < dobDate.getUTCMonth() || (now.getUTCMonth() === dobDate.getUTCMonth() && now.getUTCDate() < dobDate.getUTCDate())) age--
        if (age < 18) return financeJson({ error: 'Participant must be at least 18 years old under the current registration policy.' }, 400)
        nextAge = String(age)
      }

      const privacyRequestId = String(body.privacyRequestId ?? '').trim().slice(0, 100)
      if (privacyRequestId) {
        const linkedRequest = await env.DB.prepare(`
          SELECT pr.id, pr.request_type, pr.email, pr.status, pr.verification_status, r.email AS registration_email
          FROM privacy_requests pr
          JOIN registrations r ON lower(r.email) = lower(pr.email)
          WHERE pr.id = ? AND r.id = ?
        `).bind(privacyRequestId, current.registration_id).first<{ id: string; request_type: string; email: string; status: string; verification_status: string; registration_email: string }>()
        if (!linkedRequest || linkedRequest.request_type !== 'CORRECT' || linkedRequest.verification_status !== 'VERIFIED' || ['COMPLETED','DECLINED'].includes(linkedRequest.status)) {
          return financeJson({ error: 'Linked privacy request must be an open CORRECT request with verified identity for this registration.' }, 409)
        }
      }

      const oldValues: Record<string, unknown> = {}
      const newValues: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(updated)) {
        oldValues[field] = current[field]
        newValues[field] = value
      }
      if (updated.dob !== undefined) {
        oldValues.age = current.age
        newValues.age = nextAge
      }

      const setParts = Object.keys(updated).map(field => `${field} = ?`)
      const bindValues: Array<string | number | null> = Object.values(updated)
      if (updated.dob !== undefined) { setParts.push('age = ?'); bindValues.push(nextAge) }
      bindValues.push(id)
      const nowIso = new Date().toISOString()

      await env.DB.prepare('CREATE TABLE IF NOT EXISTS participant_change_audit (id TEXT PRIMARY KEY, participant_id INTEGER NOT NULL, registration_id INTEGER NOT NULL, action TEXT NOT NULL, old_values_json TEXT NOT NULL, new_values_json TEXT NOT NULL, reason TEXT NOT NULL, privacy_request_id TEXT, actor TEXT NOT NULL, request_trace TEXT, created_at TEXT NOT NULL)').run()
      await env.DB.batch([
        env.DB.prepare(`UPDATE participants SET ${setParts.join(', ')} WHERE id = ?`).bind(...bindValues),
        env.DB.prepare(`INSERT INTO participant_change_audit (id, participant_id, registration_id, action, old_values_json, new_values_json, reason, privacy_request_id, actor, request_trace, created_at)
          VALUES (?, ?, ?, 'PARTICIPANT_DATA_CORRECTED', ?, ?, ?, ?, 'main-admin-token', ?, ?)`).bind(
            crypto.randomUUID(), id, current.registration_id, JSON.stringify(oldValues), JSON.stringify(newValues),
            reason, privacyRequestId || null,
            (request.headers.get('cf-ray') ?? '').slice(0, 100), nowIso
          )
      ])
      return financeJson({ ok: true, participantId: id, updatedFields: Object.keys(updated), age: nextAge, updatedAt: nowIso })
    }

    if (url.pathname === '/api/admin/registrations' && request.method === 'GET') {
      if (!authorised(request, env)) {
        return financeJson({ error: 'Unauthorized' }, 401)
      }

      // Log privileged reads that can feed CSV/PDF reports. Only a hashed IP is
      // stored; the shared Admin token cannot attribute an individual person.
      await ensurePrivacyRequestTables()
      await env.DB.prepare(`
        INSERT INTO privacy_access_audit (id, actor, action, endpoint, outcome, ip_hash, request_trace, created_at)
        VALUES (?, 'main-admin-token', 'REGISTRATION_REPORT_DATA_READ', '/api/admin/registrations', 'SUCCESS', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        await financeDigest(`privacy-access|2026|${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`),
        (request.headers.get('cf-ray') ?? '').slice(0, 100),
        new Date().toISOString()
      ).run()

      // Finance preview uses an isolated database without NHYM registration tables.
      // Return an empty, correctly-shaped result rather than throwing a D1 error.
      if (env.FINANCE_PREVIEW_MODE === 'true') {
        return financeJson({ registrations: [] })
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
