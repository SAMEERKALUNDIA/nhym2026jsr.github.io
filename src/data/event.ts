/* The event's own vocabulary, kept in one place so the copy, the form and the
   fee table cannot drift apart. The four fees are the ones the organiser gave,
   in rupees. The organising committee is the list the organiser gave, in their
   order, with the numbers exactly as written on it. */

export type CategoryId = 'student' | 'not-earning' | 'earning' | 'visitor'

/* One office bearer. `phones` is every number the committee gave for that
   post — a vice president and the general secretary carry two each, so the list
   is a list rather than a single string. */
export type Bearer = {
  role: string
  name: string
  phones: string[]
}

/* A core participant category always carries its one fee. An audience ticket
   does not: the visitor chooses one of the contributions below before the form
   will accept the entry, so `fee` is null until they do. */
export type Category = {
  id: CategoryId
  name: string
  blurb: string
  fee: number | null
}

export const EVENT = {
  name: 'National Ho Youth Meet 2026',
  place: 'Jamshedpur',
  shortName: 'National Ho Youth Meet 2026',
  datesLabel: '28 & 29 November 2026',
  venue: 'Birsa Munda Town Hall, Jamshedpur',
  helpLine: 'Call the organising committee for anything the form does not cover.',
  address: 'Office - Adivasi Ho Samaj Bhawan, Golmuri',
  email: 'nhym2026jsr@gmail.com',
  /* Four contributions: three fixed amounts, each with the band of giving it
     stands for, and one open amount with a floor of its own. */
  contributions: [
    { id: 'amount-100', kind: 'fixed', label: '₹100', from: 100, to: 299 },
    { id: 'amount-200', kind: 'fixed', label: '₹200', from: 200, to: 399 },
    { id: 'amount-500', kind: 'fixed', label: '₹500', from: 500, to: 700 },
    { id: 'other', kind: 'open', label: 'Other amount', from: 100 },
  ],
  /* The floor for an "other amount". */
  contributionFloor: 100,
  account: {
    name: 'RAVI SAWAIYAN',
    number: '45447017069',
    ifsc: 'SBIN0000096',
    branch: 'JAMSHEDPUR',
  },
  /* The UPI the committee gave with this turn's QR code: the number and the
     VPA it is registered to. Both go on the page, because a visitor who cannot
     scan still has to be able to type one of them. */
  upiId: 'RAVISAWAIYAN8@OKSBI',
  upiName: 'Ravi Sawaiyan',
  /* The form's own wording, so the page, the stub and the confirmation cannot
     disagree about who is who. */
  terms: {
    student: 'Student Participant',
    'not-earning': 'Non-Earning Participant',
    earning: 'Earning Participant',
    visitor: 'Audience / Visitor',
    core: 'Core Participant',
    audience: 'Audience / Visitor',
  },
  /* The two registration types a person is filed under on the desk's sheet. A
     core participant picks one of the three core categories; the visitor gives a
     contribution instead of a fee. */
  types: {
    core: {
      name: 'Core Participant',
      blurb: 'Takes part in the sessions and the programme. Choose the category that fits.',
    },
    audience: {
      name: 'Audience / Visitor',
      blurb: 'Attends to watch. No kit and no sessions — you choose the contribution.',
    },
  },
  greeting: 'JOHAR',
  subject: 'Registration is subject to payment verification and organiser approval.',
  /* What happens after the desk checks the payment. The event has no sender of
     its own, so the message is sent by the registration department from the
     committee's own address, and the visitor sends their details there first. */
  verification: {
    heading: 'After the payment is verified',
    lead:
      'The registration department checks your payment against the reference you gave. Once it is verified, they send the approval message to your email address — the one on this form — from the committee\u2019s own address, nhym2026jsr@gmail.com. Look for it in your inbox and in your spam folder, because an approval you have not read is not an approval you can show at the desk.',
    steps: [
      'Your email address goes on the form, so the message has somewhere to arrive.',
      'The desk keeps the payment reference and receipt number you entered with it.',
      'The registration department verifies the payment under that reference.',
      'The approval message is sent to the address you gave, from nhym2026jsr@gmail.com.',
      'Bring the approval message, or the reference number in it, to the desk on 28 November.',
    ],
    waiting:
      'If no approval message has arrived three days after you paid, call the treasurer on the number below and ask the desk to check the reference.',
    subject: 'Registration approval',
  },
}

/* The office bearers of the meet, in the order the committee gave them. The
   president heads the list; the rest follow in the order the committee put them
   on the sheet. One number each. */
export const COMMITTEE: Bearer[] = [
  { role: 'President', name: 'Sushmita Birua', phones: ['8674943899'] },
  { role: 'Vice president', name: 'Nikita Soy', phones: ['8340445659'] },
  {
    role: 'General secretary',
    name: 'Shanti Sidhu',
    phones: ['8292155494'],
  },
  { role: 'Secretary', name: 'Bina Diggi', phones: ['8260776731'] },
  { role: 'Secretary', name: 'Roshni Boipai', phones: ['6206786097'] },
  { role: 'Treasurer', name: 'Saraswati Sawaiyan', phones: ['8271160823'] },
]

/* The posts a delegated fee payment is asked to be sent to. */
export const TREASURER = COMMITTEE.find((person) => person.role === 'Treasurer')!
export const PRESIDENT = COMMITTEE[0]
export const GENERAL_SECRETARY = COMMITTEE.find(
  (person) => person.role === 'General secretary',
)!

/* Sorted longest label first so that "General secretary" is not swallowed by the
   "Secretary" rule. */
export const ROLE_ORDER = [
  'President',
  'Vice president',
  'General secretary',
  'Secretary',
  'Treasurer',
]

/* Every number given, in the order the posts are listed — the order the numbers
   are printed in on the visitor's screen. */
export const COMMITTEE_PHONES = COMMITTEE.flatMap((person) => person.phones)

/* Displayed with spacing for reading: +91 86749 43899. The tel: link strips
  everything but the digits, so the number dials from a phone either way. */
export function displayPhone(phone: string) {
  if (phone.length !== 10) return phone
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
}

export function telHref(phone: string) {
  return `tel:+91${phone.replace(/\D/g, '')}`
}


export const CATEGORIES: Category[] = [
  {
    id: 'student',
    name: 'Student Participant',
    blurb: 'In school, college or a training course. Bring your ID card.',
    fee: 500,
  },
  {
    id: 'not-earning',
    name: 'Non-Earning Participant',
    blurb: 'Taking part, without an income of your own. Includes the participant kit.',
    fee: 1000,
  },
  {
    id: 'earning',
    name: 'Earning Participant',
    blurb: 'Taking part and earning. Includes the participant kit.',
    fee: 1500,
  },
  {
    id: 'visitor',
    name: 'Audience / Visitor',
    blurb: 'Attending to watch, no kit and no sessions. You choose the contribution.',
    fee: null,
  },
]

export const CORE_CATEGORIES = CATEGORIES.filter(
  (category): category is Category & { fee: number } => category.fee !== null,
)

/* The same three categories set as a line item rather than a sentence: the fee
   schedule prints these on the left of the amount, and "Non-Earning" reads as
   one word where the full name would wrap it. */
export const CATEGORY_SHORT: Record<string, string> = {
  student: 'Student',
  'not-earning': 'Non-Earning',
  earning: 'Earning',
  visitor: 'Audience / Visitor',
}

export const CATEGORY_BY_ID: Record<CategoryId, Category> = CATEGORIES.reduce(
  (map, category) => {
    map[category.id] = category
    return map
  },
  {} as Record<CategoryId, Category>,
)

/* The four core fees alone, and the audience choice as its families. */
export const CORE_FEES = CORE_CATEGORIES.map((category) => category.fee)
export const CONTRIBUTIONS = EVENT.contributions

/* The audience contribution amounts alone, for the form's radio group. */
export const CONTRIBUTION_AMOUNTS = EVENT.contributions.filter(
  (choice) => choice.kind === 'fixed',
)

/* What happens after the payment is checked, in the order it happens, for the
   confirmation panel. */
export const VERIFICATION = EVENT.verification

/* The payment destinations alone, so the closed section, the form's stub and any
   later face of the page cannot print a different number. */
export const ACCOUNT = EVENT.account
export const UPI = { vpa: EVENT.upiId, name: EVENT.upiName }

export function inr(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}
