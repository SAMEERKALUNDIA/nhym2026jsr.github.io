import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { MessageCircle, Send, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Feedback = {
  id: string
  name: string
  city: string
  category: 'Support' | 'Opposition' | 'Suggestion' | 'Other'
  message: string
  createdAt: string
}

const categories = [
  { value: 'Support', label: 'मैं NHYM जमशेदपुर का समर्थन करता/करती हूँ और जमशेदपुर से Hosting Rights वापस लेने के Governing Body के निर्णय का विरोध करता/करती हूँ।', shortLabel: 'जमशेदपुर के समर्थन में' },
  { value: 'Opposition', label: 'मैं NHYM जमशेदपुर का समर्थन नहीं करता/करती हूँ और जमशेदपुर से Hosting Rights वापस लेने के Governing Body के निर्णय का समर्थन करता/करती हूँ।', shortLabel: 'निर्णय के समर्थन में' },
  { value: 'Suggestion', label: 'मेरा सुझाव / समाधान', shortLabel: 'सुझाव / समाधान' },
  { value: 'Other', label: 'अन्य राय / टिप्पणी', shortLabel: 'अन्य राय / टिप्पणी' },
] as const

function feedbackCategoryLabel(category: Feedback['category']) {
  return categories.find(option => option.value === category)?.label ?? 'अन्य राय / टिप्पणी'
}

export default function FeedbackCampaign() {
  const [items, setItems] = useState<Feedback[]>([])
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState<Feedback['category']>('Support')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [expandedMessages, setExpandedMessages] = useState<string[]>([])
  const [showAllFeedback, setShowAllFeedback] = useState(false)

  async function loadFeedback() {
    try {
      const response = await fetch('/api/public-feedback', { cache: 'no-store' })
      const data = await response.json() as { feedback?: Feedback[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'प्रतिक्रियाएँ लोड नहीं हो सकीं।')
      setItems(Array.isArray(data.feedback) ? data.feedback : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'प्रतिक्रियाएँ लोड नहीं हो सकीं।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadFeedback() }, [])

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/public-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, city, category, message }),
      })
      const data = await response.json() as { feedback?: Feedback; error?: string }
      if (!response.ok) throw new Error(data.error || 'प्रतिक्रिया भेजी नहीं जा सकी।')
      if (data.feedback) setItems(current => [data.feedback!, ...current].slice(0, 200))
      setName('')
      setCity('')
      setCategory('Support')
      setMessage('')
      setNotice('आपकी प्रतिक्रिया सार्वजनिक रूप से प्रकाशित कर दी गई है।')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'प्रतिक्रिया भेजी नहीं जा सकी।')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteFeedback(id: string) {
    const adminToken = window.prompt('इस संदेश को हटाने के लिए Admin access key दर्ज करें:')
    if (!adminToken) return
    if (!window.confirm('क्या आप इस सार्वजनिक प्रतिक्रिया को हटाना चाहते हैं?')) return
    setError('')
    try {
      const response = await fetch(`/api/public-feedback/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` },
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error || 'संदेश हटाया नहीं जा सका।')
      setItems(current => current.filter(item => item.id !== id))
      setNotice('संदेश हटा दिया गया है।')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'संदेश हटाया नहीं जा सका।')
    }
  }

  function toggleMessage(id: string) {
    setExpandedMessages(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }

  const visibleItems = showAllFeedback ? items : items.slice(0, 3)
  const hiddenFeedbackCount = Math.max(0, items.length - 3)

  const categoryCounts = categories.map(option => ({
    ...option,
    count: items.filter(item => item.category === option.value).length,
  }))

  return (
    <section id="public-feedback" className="border-y border-border bg-card px-gutter py-section">
      <div className="mx-auto grid max-w-content gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-label text-xs font-bold tracking-[0.16em] text-brand uppercase">NHYM 2026 · SIRJON</p>
          <h2 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">📢 महत्वपूर्ण सूचना</h2>
          <h3 className="mt-4 text-xl font-bold text-primary">NHYM 2026 कार्यक्रम रद्द नहीं हुआ है!</h3>
          <p className="mt-3 text-muted-foreground">
            Governing Body द्वारा Hosting Rights वापस लिए जाने के बावजूद, NHYM 2026 कार्यक्रम अपनी निर्धारित तिथि
            <strong className="text-foreground"> 28 और 29 नवंबर 2026 </strong>
            को जमशेदपुर में आयोजित हो रहा है। केवल Hosting Rights वापस लिए जाने के निर्णय के आधार पर कार्यक्रम को रद्द हुआ न समझें।
          </p>
          <h3 className="mt-6 text-xl font-bold">✊ Hosting Rights वापस लेने के निर्णय का विरोध</h3>
          <p className="mt-3 text-muted-foreground">
            जमशेदपुर टीम इस निर्णय का कड़ा विरोध करती है और निष्पक्ष विचार-विमर्श की माँग करती है।
            यदि आप भी इस निर्णय से असहमत हैं और NHYM 2026 को सफल बनाने के पक्ष में हैं, तो जमशेदपुर टीम के समर्थन में अपनी आवाज उठाएँ।
          </p>
          <p className="mt-4 font-semibold">📍 जमशेदपुर · 📅 28–29 नवंबर 2026</p>
          <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            <span>{items.length} सार्वजनिक प्रतिक्रियाएँ</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categoryCounts.map(option => (
              <div key={option.value} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">{option.shortLabel}</span>
                <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand" aria-label={`${option.shortLabel}: ${option.count} प्रतिक्रियाएँ`}>{option.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">गिनती नीचे दिखाई गई सार्वजनिक प्रतिक्रियाओं की है।</p>
        </div>

        <div className="space-y-8">
          <form onSubmit={submitFeedback} className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
            <h3 className="flex items-center gap-2 text-xl font-bold"><MessageCircle className="size-5" /> अपनी प्रतिक्रिया दें</h3>
            <p className="mt-2 text-sm text-muted-foreground">आपका संदेश सबमिट होते ही सार्वजनिक रूप से दिखाई देगा। ईमेल या मोबाइल नंबर न लिखें।</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">नाम
                <input required maxLength={80} value={name} onChange={e => setName(e.target.value)} className="min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 font-normal" placeholder="अपना नाम" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">जिला / शहर
                <input maxLength={80} value={city} onChange={e => setCity(e.target.value)} className="min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 font-normal" placeholder="जैसे जमशेदपुर" />
              </label>
              <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:col-span-2">प्रतिक्रिया का प्रकार
                <select value={category} onChange={e => setCategory(e.target.value as Feedback['category'])} className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal">
                  {categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">आपका संदेश
                <textarea required minLength={3} maxLength={1500} rows={4} value={message} onChange={e => setMessage(e.target.value)} className="resize-y rounded-lg border border-input bg-background px-3 py-2.5 font-normal" placeholder="अपने विचार, समर्थन या सुझाव लिखें…" />
              </label>
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</p>}
            <Button type="submit" disabled={submitting} className="mt-4 w-full sm:w-auto">
              <Send className="mr-2 size-4" /> {submitting ? 'भेजा जा रहा है…' : 'अपनी प्रतिक्रिया प्रकाशित करें'}
            </Button>
          </form>

          <div>
            <h3 className="text-xl font-bold">💬 लोगों की प्रतिक्रियाएँ</h3>
            <p className="mt-1 text-sm text-muted-foreground">लंबी प्रतिक्रियाएँ संक्षिप्त रूप में दिखाई जाएँगी। पूरा संदेश देखने के लिए “और पढ़ें” दबाएँ। नियमों का उल्लंघन करने वाले संदेश एडमिन हटा सकता है।</p>
            {loading ? <p className="mt-4 text-sm text-muted-foreground">प्रतिक्रियाएँ लोड हो रही हैं…</p> : items.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">अभी कोई प्रतिक्रिया नहीं है। सबसे पहले अपनी राय साझा करें।</p> : (
              <div className="mt-4 grid gap-3">
                {visibleItems.map(item => {
                  const expanded = expandedMessages.includes(item.id)
                  const isLong = item.message.length > 220
                  return (
                    <article key={item.id} className="min-w-0 rounded-xl border border-border bg-background p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold [overflow-wrap:anywhere]">{item.name}{item.city ? <span className="font-normal text-muted-foreground"> · {item.city}</span> : null}</p>
                          <p className="mt-1 break-words text-xs font-semibold text-brand [overflow-wrap:anywhere]">{feedbackCategoryLabel(item.category)}</p>
                        </div>
                        <button type="button" onClick={() => void deleteFeedback(item.id)} className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Admin: इस संदेश को हटाएँ" title="Admin: संदेश हटाएँ">
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <p className={`mt-3 break-words text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap ${isLong && !expanded ? 'line-clamp-3' : ''}`}>{item.message}</p>
                      {isLong && (
                        <button type="button" onClick={() => toggleMessage(item.id)} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                          {expanded ? <>कम दिखाएँ <ChevronUp className="size-4" /></> : <>और पढ़ें <ChevronDown className="size-4" /></>}
                        </button>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('hi-IN')}</p>
                    </article>
                  )
                })}
              </div>
            )}
            {!loading && items.length > 3 && (
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full sm:w-auto"
                onClick={() => setShowAllFeedback(current => !current)}
                aria-expanded={showAllFeedback}
              >
                {showAllFeedback ? 'केवल नवीनतम 3 प्रतिक्रियाएँ दिखाएँ' : `बाकी ${hiddenFeedbackCount} प्रतिक्रियाएँ देखें`}
                {showAllFeedback ? <ChevronUp className="ml-2 size-4" /> : <ChevronDown className="ml-2 size-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-content text-xs text-muted-foreground">आइए, मिलकर NHYM 2026 — SIRJON को सफल बनाएँ। कृपया संदेश में निजी जानकारी, धमकी या अपमानजनक भाषा साझा न करें।</p>
    </section>
  )
}
