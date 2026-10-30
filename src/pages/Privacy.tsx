import { useState, type FormEvent } from 'react'
import { Meta } from '@/components/Meta'
import { Brand } from '@/components/Brand'
import { DeveloperCredit } from '@/components/DeveloperCredit'
import { Button } from '@/components/ui/button'

export default function Privacy() {
  const [requestType, setRequestType] = useState('ACCESS')
  const [email, setEmail] = useState('')
  const [registrationId, setRegistrationId] = useState('')
  const [participantNo, setParticipantNo] = useState('')
  const [details, setDetails] = useState('')
  const [acknowledgement, setAcknowledgement] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestError, setRequestError] = useState(false)

  async function submitPrivacyRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setRequestMessage('')
    setRequestError(false)
    try {
      const response = await fetch('/api/privacy-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestType, email, registrationId, participantNo, details, acknowledgement }),
      })
      const result = await response.json() as { ok?: boolean; requestId?: string; message?: string; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Request could not be submitted. Please try again.')
      setRequestMessage(`Request received. Reference: ${result.requestId}. The LOC will review it manually; no data is changed automatically.`)
      setEmail('')
      setRegistrationId('')
      setParticipantNo('')
      setDetails('')
      setAcknowledgement(false)
    } catch (error) {
      setRequestError(true)
      setRequestMessage(error instanceof Error ? error.message : 'Request could not be submitted. Please email nhym2026jsr@gmail.com.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <Meta title="Privacy Policy | National Ho Youth Meet 2026" description="Privacy notice in English and Hindi for personal data processed by the NHYM 2026 Local Organizing Committee." />
      <header className="border-b px-gutter py-6">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4">
          <Brand />
          <Button asChild variant="outline"><a href="/">Home / मुखपृष्ठ</a></Button>
        </div>
      </header>
      <main className="mx-auto max-w-content px-gutter py-section">
        <article className="max-w-3xl space-y-4">
          <p className="text-sm text-muted-foreground">Last updated / अंतिम अद्यतन: 28 October 2026 / 28 अक्टूबर 2026</p>
          <h1 className="text-3xl font-bold">Privacy Policy / गोपनीयता नीति</h1>
          <p>This notice explains how the NHYM 2026 Local Organizing Committee (LOC) collects and uses personal data for the National Ho Youth Meet 2026 in Jamshedpur.</p>
          <p lang="hi">यह सूचना बताती है कि जमशेदपुर में आयोजित राष्ट्रीय हो युवा मिलन 2026 के लिए NHYM 2026 की स्थानीय आयोजन समिति (LOC) व्यक्तिगत जानकारी कैसे एकत्र और उपयोग करती है।</p>

          <h2 className="pt-4 text-xl font-semibold">1. Information we collect / हम कौन-सी जानकारी लेते हैं</h2>
          <p>Depending on the form or service you use, we may collect participant name, date of birth, age, gender, postal address, district/city, state, PIN code, participation interests, cultural and sports participation choices, travel and accommodation needs, contact email, registration details, payment mode and payment/transaction reference. Public feedback may include the name, district/city, category and message you submit. The homepage visitor counter uses a random browser cookie identifier to count returning browsers; the Worker stores a SHA-256 hash of that identifier rather than the cookie value itself. The cookie is marked Secure, HttpOnly and SameSite=Lax, and is configured to expire after one year. To limit spam on public feedback, the feedback endpoint also uses the connecting IP address to derive a hash and stores that hash with a rate-limit count and time window; it does not intentionally store the raw IP address in that rate-limit table. The hosting provider may separately process connection metadata under its own terms. Expired feedback rate-limit hash records older than 24 hours are cleaned up when a subsequent feedback submission is processed; this cleanup is request-triggered rather than a guaranteed scheduled job.</p>
          <p lang="hi">आपके द्वारा उपयोग किए गए फॉर्म या सेवा के अनुसार, हम प्रतिभागी का नाम, जन्मतिथि, आयु, लिंग, डाक-पता, जिला/शहर, राज्य, पिन कोड, भागीदारी की रुचियाँ, सांस्कृतिक एवं खेल गतिविधियों के विकल्प, यात्रा/आवास की आवश्यकता, ईमेल, पंजीकरण विवरण, भुगतान का माध्यम और भुगतान/लेन-देन संदर्भ एकत्र कर सकते हैं। सार्वजनिक प्रतिक्रिया में आपका नाम, जिला/शहर, श्रेणी और संदेश शामिल हो सकता है। मुखपृष्ठ का विज़िटर काउंटर लौटकर आने वाले ब्राउज़र गिनने के लिए एक यादृच्छिक कुकी पहचान का उपयोग करता है; Worker उस पहचान का SHA-256 हैश रखता है, मूल कुकी मान नहीं। कुकी Secure, HttpOnly और SameSite=Lax सेटिंग के साथ एक वर्ष में समाप्त होने के लिए निर्धारित है। सार्वजनिक प्रतिक्रिया में स्पैम रोकने के लिए प्रतिक्रिया वाला endpoint कनेक्शन के IP पते से एक हैश बनाता है और उस हैश के साथ अनुरोधों की गिनती तथा समय-अवधि रखता है; इस rate-limit तालिका में मूल IP पता जानबूझकर संग्रहित नहीं किया जाता। होस्टिंग सेवा प्रदाता अपनी शर्तों के अनुसार कनेक्शन संबंधी मेटाडेटा अलग से संसाधित कर सकता है। प्रतिक्रिया भेजे जाने पर 24 घंटे से पुराने rate-limit हैश रिकॉर्ड हटाए जाते हैं; यह सफाई नए अनुरोध के आने पर होती है, किसी निश्चित समय पर चलने वाली स्वचालित scheduled प्रक्रिया नहीं है।</p>

          <h2 className="pt-4 text-xl font-semibold">2. Why we use it / जानकारी का उपयोग क्यों होता है</h2>
          <p>We use this information to receive and manage registrations, check eligibility, plan the event and accommodation, verify payments, communicate registration status, maintain necessary event and financial records, respond to queries, prevent misuse and spam (including feedback rate limiting), and administer feedback that you choose to publish.</p>
          <p lang="hi">इस जानकारी का उपयोग पंजीकरण प्राप्त करने और प्रबंधित करने, पात्रता जाँचने, कार्यक्रम एवं आवास की योजना बनाने, भुगतान सत्यापित करने, पंजीकरण की स्थिति बताने, आवश्यक कार्यक्रम/वित्तीय रिकॉर्ड रखने, प्रश्नों का उत्तर देने, दुरुपयोग और स्पैम रोकने (जिसमें प्रतिक्रिया भेजने की दर सीमित करना शामिल है) तथा आपके द्वारा प्रकाशित करने के लिए चुनी गई प्रतिक्रिया का प्रबंधन करने में किया जाता है।</p>

          <h2 className="pt-4 text-xl font-semibold">3. Public feedback / सार्वजनिक प्रतिक्रिया</h2>
          <p>Feedback is intended for public display. If you submit feedback, the name, district/city (if provided), category and message may be visible to website visitors. Do not include phone numbers, email addresses, financial details or other information you do not want published. The LOC may remove feedback that violates the site's rules. You may request removal by emailing the contact below and identifying the feedback.</p>
          <p lang="hi">प्रतिक्रिया सार्वजनिक रूप से दिखाने के लिए है। प्रतिक्रिया भेजने पर आपका नाम, दिया गया जिला/शहर, श्रेणी और संदेश वेबसाइट देखने वाले लोगों को दिखाई दे सकता है। ऐसा फोन नंबर, ईमेल, वित्तीय विवरण या अन्य निजी जानकारी न लिखें जिसे आप सार्वजनिक नहीं करना चाहते। नियमों का उल्लंघन करने वाली प्रतिक्रिया LOC हटा सकती है। प्रतिक्रिया हटाने के लिए नीचे दिए गए ईमेल पर उसका विवरण भेजकर अनुरोध कर सकते हैं।</p>

          <h2 className="pt-4 text-xl font-semibold">4. Sharing and service providers / जानकारी साझा करना</h2>
          <p>Access is limited to authorised LOC members who need the information for event administration. Data may be processed by hosting, database, file-storage and email-delivery service providers supporting the website. We do not state that every provider or system is operated by the LOC itself. We do not sell personal data.</p>
          <p lang="hi">जानकारी तक पहुँच केवल उन अधिकृत LOC सदस्यों तक सीमित है जिन्हें कार्यक्रम के प्रबंधन के लिए इसकी आवश्यकता है। वेबसाइट को चलाने वाली होस्टिंग, डेटाबेस, फ़ाइल-स्टोरेज और ईमेल सेवाएँ भी जानकारी संसाधित कर सकती हैं। ये सभी सेवाएँ LOC द्वारा स्वयं संचालित होने का दावा नहीं किया जाता। हम व्यक्तिगत जानकारी बेचते नहीं हैं।</p>

          <h2 className="pt-4 text-xl font-semibold">5. Retention / जानकारी कितने समय तक रखी जाएगी</h2>
          <p>The LOC's current policy is to retain registration and event records until 31 December 2030, subject to review. Data may be deleted earlier when it is no longer needed, and records may be retained longer where required by applicable law, accounting requirements, dispute resolution or a legal claim. Public feedback may be removed earlier on a valid request or under site moderation rules. The LOC should review and document retention exceptions before deletion.</p>
          <p lang="hi">LOC की वर्तमान नीति के अनुसार पंजीकरण और कार्यक्रम के रिकॉर्ड 31 दिसंबर 2030 तक रखे जाने का लक्ष्य है; इस अवधि की समीक्षा की जानी है। आवश्यकता समाप्त होने पर जानकारी पहले भी हटाई जा सकती है। लागू कानून, लेखांकन, विवाद समाधान या कानूनी दावे के कारण कुछ रिकॉर्ड अधिक समय तक रखने पड़ सकते हैं। वैध अनुरोध या वेबसाइट के नियमों के अनुसार सार्वजनिक प्रतिक्रिया पहले हटाई जा सकती है। जानकारी हटाने से पहले LOC को लागू अपवादों की समीक्षा और उनका रिकॉर्ड रखना चाहिए।</p>

          <h2 className="pt-4 text-xl font-semibold">6. Your requests and complaints / आपके अनुरोध और शिकायतें</h2>
          <p>You may contact the LOC to request access to, correction of, or deletion of personal data, or to withdraw consent where processing is based on consent. Some records may need to be retained for legal or accounting reasons. We may need enough information to verify your request before acting on it.</p>
          <p lang="hi">आप अपनी व्यक्तिगत जानकारी देखने, उसमें सुधार कराने या उसे हटाने का अनुरोध कर सकते हैं। जहाँ जानकारी सहमति के आधार पर संसाधित होती है, वहाँ सहमति वापस लेने या गोपनीयता संबंधी शिकायत करने के लिए भी संपर्क कर सकते हैं। कानूनी या लेखांकन कारणों से कुछ रिकॉर्ड रखना आवश्यक हो सकता है। कार्रवाई से पहले आपके अनुरोध की पुष्टि के लिए उचित जानकारी माँगी जा सकती है।</p>
          <p>Privacy requests are reviewed manually by the LOC; submitting an email does not automatically change or delete a record. The LOC may ask for proportionate information to verify that the request concerns you, and will consider applicable retention duties before acting. Please do not email identity documents or other sensitive material unless the LOC specifically requests it through an appropriate channel.</p>
          <p lang="hi">गोपनीयता संबंधी अनुरोधों की LOC द्वारा मैन्युअल समीक्षा की जाती है; केवल ईमेल भेजने से रिकॉर्ड अपने-आप बदला या हटाया नहीं जाता। अनुरोध आपसे संबंधित है, इसकी पुष्टि के लिए LOC आवश्यक और उचित जानकारी माँग सकती है तथा कार्रवाई से पहले रिकॉर्ड रखने की लागू कानूनी/लेखांकन आवश्यकताओं पर विचार करेगी। जब तक LOC किसी उचित माध्यम से विशेष रूप से न माँगे, पहचान-पत्र या अन्य संवेदनशील सामग्री ईमेल न करें।</p>
          <p>Privacy and grievance contact / गोपनीयता एवं शिकायत संपर्क: <a className="underline underline-offset-4" href="mailto:nhym2026jsr@gmail.com">nhym2026jsr@gmail.com</a>. Please use the subject “Privacy Request” and avoid sending sensitive documents unless the LOC asks for them through an appropriate channel.</p>
          <p lang="hi">ईमेल का विषय “Privacy Request” रखें। जब तक LOC किसी उचित माध्यम से न माँगे, संवेदनशील दस्तावेज़ ईमेल से न भेजें।</p>
          <form onSubmit={submitPrivacyRequest} className="mt-4 space-y-4 rounded-xl border p-4" aria-label="Privacy request form">
            <h3 className="text-lg font-semibold">Submit a privacy request / गोपनीयता अनुरोध भेजें</h3>
            <p className="text-sm text-muted-foreground">Use this form to request access, correction, deletion, consent withdrawal, or submit a privacy complaint. Do not enter passwords, identity-document numbers, bank details, or other sensitive information. The LOC will verify the request before taking action.</p>
            <div className="space-y-1">
              <label htmlFor="privacy-request-type" className="text-sm font-medium">Request type / अनुरोध का प्रकार</label>
              <select id="privacy-request-type" value={requestType} onChange={(event) => setRequestType(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" required>
                <option value="ACCESS">Access my data / जानकारी देखना</option>
                <option value="CORRECT">Correct my data / जानकारी सुधारना</option>
                <option value="DELETE">Delete my data / जानकारी हटाना</option>
                <option value="WITHDRAW_CONSENT">Withdraw consent / सहमति वापस लेना</option>
                <option value="COMPLAINT">Privacy complaint / गोपनीयता शिकायत</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="privacy-request-email" className="text-sm font-medium">Contact email / संपर्क ईमेल</label>
              <input id="privacy-request-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" required />
            </div>
            <div className="space-y-1">
              <label htmlFor="privacy-request-registration" className="text-sm font-medium">Registration ID (required) / अनिवार्य</label>
              <input id="privacy-request-registration" type="text" maxLength={32} value={registrationId} onChange={(event) => setRegistrationId(event.target.value.toUpperCase())} required pattern="NHYM26-[0-9]{6}" title="Enter a Registration ID such as NHYM26-000123" className="w-full rounded-md border bg-background px-3 py-2" placeholder="e.g. NHYM26-000123" />
            </div>
            <div className="space-y-1">
              <label htmlFor="privacy-request-participant" className="text-sm font-medium">Participant number / प्रतिभागी क्रमांक (required / अनिवार्य)</label>
              <input id="privacy-request-participant" type="number" min={1} max={100} step={1} value={participantNo} onChange={(event) => setParticipantNo(event.target.value)} required className="w-full rounded-md border bg-background px-3 py-2" placeholder="e.g. 2" />
              <p className="text-xs text-muted-foreground">Enter the participant number shown in this registration. This helps the LOC identify the correct participant for every request; no data is changed automatically.</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="privacy-request-details" className="text-sm font-medium">Details (optional; max 1000 characters) / विवरण (वैकल्पिक)</label>
              <textarea id="privacy-request-details" maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} className="min-h-24 w-full rounded-md border bg-background px-3 py-2" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acknowledgement} onChange={(event) => setAcknowledgement(event.target.checked)} required className="mt-1" />
              <span>I understand the LOC will review and verify this request manually, and submitting it does not automatically access, change, withdraw, or delete data. / मैं समझता/समझती हूँ कि LOC अनुरोध की मैन्युअल समीक्षा और पुष्टि करेगी; फॉर्म भेजने से डेटा अपने-आप नहीं बदलेगा या हटेगा।</span>
            </label>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting… / भेजा जा रहा है' : 'Submit privacy request / अनुरोध भेजें'}</Button>
            {requestMessage && <p role="status" aria-live="polite" className={requestError ? 'text-sm text-destructive' : 'text-sm'}>{requestMessage}</p>}
          </form>

          <h2 className="pt-4 text-xl font-semibold">7. Security and incidents / सुरक्षा और घटनाएँ</h2>
          <p>The LOC uses access controls and technical measures intended to protect personal data. No internet service can guarantee absolute security. If a personal-data incident occurs, the LOC will assess it and take steps required by applicable law.</p>
          <p lang="hi">LOC व्यक्तिगत जानकारी की सुरक्षा के लिए पहुँच-नियंत्रण और तकनीकी उपाय अपनाती है। इंटरनेट पर पूर्ण सुरक्षा की गारंटी नहीं दी जा सकती। व्यक्तिगत जानकारी से जुड़ी सुरक्षा घटना होने पर LOC उसका आकलन करेगी और लागू कानून के अनुसार आवश्यक कदम उठाएगी।</p>

          <h2 className="pt-4 text-xl font-semibold">8. Adults only / केवल 18 वर्ष या उससे अधिक आयु</h2>
          <p>Online registration is intended only for people aged 18 or older. The form asks for date of birth to check this requirement. If you believe a person under 18 has submitted personal data, contact the LOC so the matter can be reviewed.</p>
          <p lang="hi">ऑनलाइन पंजीकरण केवल 18 वर्ष या उससे अधिक आयु के लोगों के लिए है। आयु जाँचने के लिए फॉर्म में जन्मतिथि पूछी जाती है। यदि आपको लगता है कि 18 वर्ष से कम आयु के व्यक्ति ने व्यक्तिगत जानकारी भेजी है, तो समीक्षा के लिए LOC से संपर्क करें।</p>

          <h2 className="pt-4 text-xl font-semibold">9. Changes to this policy / नीति में बदलाव</h2>
          <p>This policy may be updated to reflect changes to the event, website or applicable law. The latest update date appears at the top of this page.</p>
          <p lang="hi">कार्यक्रम, वेबसाइट या लागू कानून में बदलाव के अनुसार इस नीति को अद्यतन किया जा सकता है। नवीनतम अद्यतन की तारीख इस पृष्ठ के शीर्ष पर दी गई है।</p>

          <p className="pt-4 text-sm text-muted-foreground">This policy is intended as a practical privacy notice and does not replace review by a qualified legal professional.</p>
          <p lang="hi" className="text-sm text-muted-foreground">यह एक व्यावहारिक गोपनीयता सूचना है; इसे योग्य कानूनी विशेषज्ञ की समीक्षा का विकल्प न माना जाए।</p>
        </article>
      </main>
      <DeveloperCredit />
    </div>
  )
}
