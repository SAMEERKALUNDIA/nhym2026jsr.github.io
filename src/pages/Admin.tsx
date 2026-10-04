import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Participant = {
  id: number
  participant_no: number
  name: string
  dob: string
  gender: string
  address: string
  district: string
  state: string
  pin: string
  age: string
  category: string
  fee: number
  activities_json: string
  cultural: string
  sports: string
  from_outside: string
  accommodation: string
  note: string
  details_json: string
}

type Row = {
  id: number
  registration_id: string
  email: string
  total_amount: number
  payment_mode: string
  payment_reference: string
  status: string
  participant_count: number
  created_at: string
  updated_at?: string
  approval_email_sent_at?: string | null
  participants?: Participant[]
}

export default function Admin() {
  const [token, setToken] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)

  async function load() {
    setLoading(true)
    setError('')

    try {
      const r = await fetch('/api/admin/registrations', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      const j = await r.json() as {
        registrations?: Row[]
        error?: string
      }

      if (!r.ok) {
        throw new Error(j.error || 'Could not load registrations.')
      }

      setRows(j.registrations || [])
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load registrations.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(id: number, value: string) {
    setUpdatingId(id)
    setError('')

    try {
      const r = await fetch(
        `/api/admin/registrations/${id}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: value,
          }),
        }
      )

      const j = await r.json() as {
        ok?: boolean
        error?: string
      }

      if (!r.ok) {
        throw new Error(
          j.error || 'Could not update registration.'
        )
      }

      await load()

      setSelected(current => {
        if (!current || current.id !== id) {
          return current
        }

        return {
          ...current,
          status: value,
        }
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update registration.'
      )
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) {
      return rows
    }

    return rows.filter(row => {
      const participantNames =
        row.participants
          ?.map(p => p.name)
          .join(' ')
          .toLowerCase() || ''

      return (
        row.registration_id?.toLowerCase().includes(q) ||
        row.email?.toLowerCase().includes(q) ||
        row.payment_reference?.toLowerCase().includes(q) ||
        row.status?.toLowerCase().includes(q) ||
        participantNames.includes(q)
      )
    })
  }, [rows, search])

  function activities(value: string) {
    try {
      const parsed = JSON.parse(value || '[]')

      if (Array.isArray(parsed)) {
        return parsed.join(', ') || '—'
      }

      return String(parsed || '—')
    } catch {
      return value || '—'
    }
  }

  return (
    <main className="min-h-dvh bg-background px-gutter py-10">
      <div className="mx-auto max-w-content">

        <h1 className="text-4xl">
          NHYM 2026 Registration Admin
        </h1>

        <p className="mt-2 text-muted-foreground">
          Registration management and payment verification
        </p>

        <div className="mt-6 flex max-w-2xl gap-2">
          <Input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Admin token"
          />

          <Button
            onClick={load}
            disabled={loading || !token}
          >
            {loading
              ? 'Loading…'
              : 'Load registrations'}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded border border-destructive p-3 text-destructive">
            {error}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="mt-8 max-w-xl">
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ID, name, email, payment reference or status"
              />
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredRows.length} of {rows.length} registrations
            </div>
          </>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">

            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Registration ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Participants</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Details</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(row => (
                <tr
                  key={row.id}
                  className="border-b align-top"
                >
                  <td className="p-2 font-mono">
                    {row.registration_id}
                  </td>

                  <td>
                    {row.participants?.[0]?.name || '—'}
                  </td>

                  <td>
                    {row.email}
                  </td>

                  <td>
                    {row.participant_count}
                  </td>

                  <td>
                    ₹{row.total_amount.toLocaleString('en-IN')}
                  </td>

                  <td>
                    <div>{row.payment_mode}</div>

                    <div className="text-xs text-muted-foreground">
                      {row.payment_reference}
                    </div>
                  </td>

                  <td>
                    <select
                      className="rounded border bg-background p-2"
                      value={row.status}
                      disabled={updatingId === row.id}
                      onChange={e =>
                        changeStatus(
                          row.id,
                          e.target.value
                        )
                      }
                    >
                      <option value="PENDING">
                        PENDING
                      </option>

                      <option value="PAYMENT_VERIFIED">
                        PAYMENT VERIFIED
                      </option>

                      <option value="APPROVED">
                        APPROVED
                      </option>

                      <option value="REJECTED">
                        REJECTED
                      </option>
                    </select>
                  </td>

                  <td>
                    {new Date(
                      row.created_at
                    ).toLocaleString('en-IN')}
                  </td>

                  <td>
                    <Button
                      variant="outline"
                      onClick={() => setSelected(row)}
                    >
                      View Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>

        {selected && (
          <div className="mt-10 rounded-lg border p-6">

            <div className="flex flex-wrap items-center justify-between gap-4">

              <div>
                <h2 className="text-2xl font-semibold">
                  Registration Details
                </h2>

                <p className="font-mono text-sm">
                  {selected.registration_id}
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>

            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">

              <div>
                <strong>Email</strong>
                <div>{selected.email}</div>
              </div>

              <div>
                <strong>Total Amount</strong>
                <div>
                  ₹{selected.total_amount.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <strong>Status</strong>
                <div>{selected.status}</div>
              </div>

              <div>
                <strong>Payment Mode</strong>
                <div>{selected.payment_mode}</div>
              </div>

              <div>
                <strong>Payment Reference</strong>
                <div>{selected.payment_reference}</div>
              </div>

              <div>
                <strong>Submitted</strong>
                <div>
                  {new Date(
                    selected.created_at
                  ).toLocaleString('en-IN')}
                </div>
              </div>

            </div>

            <h3 className="mt-8 text-xl font-semibold">
              Participant Details
            </h3>

            <div className="mt-4 space-y-6">

              {selected.participants?.map(participant => (

                <div
                  key={participant.id}
                  className="rounded-lg border p-5"
                >

                  <div className="mb-4 text-lg font-semibold">
                    Participant {participant.participant_no}
                    {' — '}
                    {participant.name}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                    <div>
                      <strong>Name</strong>
                      <div>{participant.name || '—'}</div>
                    </div>

                    <div>
                      <strong>Date of Birth</strong>
                      <div>{participant.dob || '—'}</div>
                    </div>

                    <div>
                      <strong>Age</strong>
                      <div>{participant.age || '—'}</div>
                    </div>

                    <div>
                      <strong>Gender</strong>
                      <div>{participant.gender || '—'}</div>
                    </div>

                    <div>
                      <strong>Category</strong>
                      <div>{participant.category || '—'}</div>
                    </div>

                    <div>
                      <strong>Fee</strong>
                      <div>
                        ₹{Number(
                          participant.fee || 0
                        ).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div>
                      <strong>District</strong>
                      <div>{participant.district || '—'}</div>
                    </div>

                    <div>
                      <strong>State</strong>
                      <div>{participant.state || '—'}</div>
                    </div>

                    <div>
                      <strong>PIN</strong>
                      <div>{participant.pin || '—'}</div>
                    </div>

                    <div className="md:col-span-2">
                      <strong>Address</strong>
                      <div>{participant.address || '—'}</div>
                    </div>

                    <div>
                      <strong>Activities</strong>
                      <div>
                        {activities(
                          participant.activities_json
                        )}
                      </div>
                    </div>

                    <div>
                      <strong>Cultural</strong>
                      <div>{participant.cultural || '—'}</div>
                    </div>

                    <div>
                      <strong>Sports</strong>
                      <div>{participant.sports || '—'}</div>
                    </div>

                    <div>
                      <strong>From Outside</strong>
                      <div>{participant.from_outside || '—'}</div>
                    </div>

                    <div>
                      <strong>Accommodation</strong>
                      <div>{participant.accommodation || '—'}</div>
                    </div>

                    <div className="md:col-span-2">
                      <strong>Note</strong>
                      <div>{participant.note || '—'}</div>
                    </div>

                  </div>

                </div>
              ))}

            </div>

          </div>
        )}

      </div>
    </main>
  )
}
