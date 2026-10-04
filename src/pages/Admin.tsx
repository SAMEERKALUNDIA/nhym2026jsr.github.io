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
  const [success, setSuccess] = useState('')
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

      setSelected(current => {
        if (!current) return null

        const updated = (j.registrations || []).find(
          row => row.id === current.id
        )

        return updated || null
      })
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

  async function changeStatus(
    row: Row,
    value: 'PAYMENT_VERIFIED' | 'APPROVED' | 'REJECTED'
  ) {
    let message = ''

    if (value === 'PAYMENT_VERIFIED') {
      message =
        `Confirm payment verification for ${row.registration_id}?\n\n` +
        `Payment: ${row.payment_mode}\n` +
        `Reference: ${row.payment_reference}\n` +
        `Amount: ₹${row.total_amount.toLocaleString('en-IN')}`
    }

    if (value === 'APPROVED') {
      message =
        `Approve ${row.registration_id}?\n\n` +
        `The registration will be approved and the participant's ` +
        `approval email will be sent automatically if it has not already been sent.`
    }

    if (value === 'REJECTED') {
      message =
        `Reject ${row.registration_id}?\n\n` +
        `Please confirm that you want to mark this registration as REJECTED.`
    }

    if (!window.confirm(message)) {
      return
    }

    setUpdatingId(row.id)
    setError('')
    setSuccess('')

    try {
      const r = await fetch(
        `/api/admin/registrations/${row.id}`,
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
        status?: string
        emailSent?: boolean
        error?: string
      }

      if (!r.ok) {
        throw new Error(
          j.error || 'Could not update registration.'
        )
      }

      if (value === 'PAYMENT_VERIFIED') {
        setSuccess(
          `${row.registration_id}: Payment successfully verified.`
        )
      }

      if (value === 'APPROVED') {
        setSuccess(
          j.emailSent
            ? `${row.registration_id}: Registration approved and approval email sent.`
            : `${row.registration_id}: Registration approved. No duplicate approval email was sent.`
        )
      }

      if (value === 'REJECTED') {
        setSuccess(
          `${row.registration_id}: Registration marked as rejected.`
        )
      }

      await load()
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

  const stats = useMemo(() => {
    const totalRegistrations = rows.length

    const totalParticipants = rows.reduce(
      (sum, row) => sum + Number(row.participant_count || 0),
      0
    )

    const pending = rows.filter(
      row => row.status === 'PENDING'
    ).length

    const paymentVerified = rows.filter(
      row => row.status === 'PAYMENT_VERIFIED'
    ).length

    const approved = rows.filter(
      row => row.status === 'APPROVED'
    ).length

    const rejected = rows.filter(
      row => row.status === 'REJECTED'
    ).length

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    )

    return {
      totalRegistrations,
      totalParticipants,
      pending,
      paymentVerified,
      approved,
      rejected,
      totalAmount,
    }
  }, [rows])

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

  function statusBadge(status: string) {
    const common =
      'inline-flex rounded-full border px-3 py-1 text-xs font-semibold'

    if (status === 'APPROVED') {
      return (
        <span className={`${common} bg-green-50 text-green-700`}>
          ✓ APPROVED
        </span>
      )
    }

    if (status === 'PAYMENT_VERIFIED') {
      return (
        <span className={`${common} bg-blue-50 text-blue-700`}>
          PAYMENT VERIFIED
        </span>
      )
    }

    if (status === 'REJECTED') {
      return (
        <span className={`${common} bg-red-50 text-red-700`}>
          REJECTED
        </span>
      )
    }

    return (
      <span className={`${common} bg-yellow-50 text-yellow-700`}>
        PENDING
      </span>
    )
  }

  function actionButtons(row: Row) {
    const busy = updatingId === row.id

    if (row.status === 'PENDING') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'PAYMENT_VERIFIED')
            }
          >
            {busy ? 'Updating…' : 'Verify Payment'}
          </Button>

          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'REJECTED')
            }
          >
            Reject
          </Button>
        </div>
      )
    }

    if (row.status === 'PAYMENT_VERIFIED') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'APPROVED')
            }
          >
            {busy ? 'Updating…' : 'Approve Registration'}
          </Button>

          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'REJECTED')
            }
          >
            Reject
          </Button>
        </div>
      )
    }

    if (row.status === 'APPROVED') {
      return (
        <div className="text-sm font-medium">
          ✓ Registration complete
        </div>
      )
    }

    if (row.status === 'REJECTED') {
      return (
        <div className="text-sm font-medium">
          Registration rejected
        </div>
      )
    }

    return null
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
            {loading ? 'Loading…' : 'Load registrations'}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive p-4 text-destructive">
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-lg border bg-card p-4">
            ✓ {success}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Total Registrations
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.totalRegistrations}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Total Participants
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.totalParticipants}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Pending
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.pending}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Payment Verified
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.paymentVerified}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Approved
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.approved}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Rejected
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.rejected}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5 sm:col-span-2">
                <div className="text-sm text-muted-foreground">
                  Total Registration Amount
                </div>

                <div className="mt-2 text-3xl font-semibold">
                  ₹{stats.totalAmount.toLocaleString('en-IN')}
                </div>
              </div>

            </div>

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
  <table className="w-full min-w-[850px] text-sm">

    <thead>
      <tr className="border-b text-left">
        <th className="p-3">Registration ID</th>
        <th className="p-3">Name</th>
        <th className="p-3 text-center">Participants</th>
        <th className="p-3">Amount</th>
        <th className="p-3">Status</th>
        <th className="p-3">Action</th>
        <th className="p-3">Details</th>
      </tr>
    </thead>

    <tbody>
      {filteredRows.map(row => (
        <tr
          key={row.id}
          className="border-b align-middle"
        >
          <td className="p-3 font-mono whitespace-nowrap">
            {row.registration_id}
          </td>

          <td className="p-3 font-medium">
            {row.participants?.[0]?.name || '—'}

            {row.participant_count > 1 && (
              <div className="mt-1 text-xs text-muted-foreground">
                +{row.participant_count - 1} more participant
                {row.participant_count > 2 ? 's' : ''}
              </div>
            )}
          </td>

          <td className="p-3 text-center">
            {row.participant_count}
          </td>

          <td className="p-3 whitespace-nowrap font-medium">
            ₹{row.total_amount.toLocaleString('en-IN')}
          </td>

          <td className="p-3">
            {statusBadge(row.status)}
          </td>

          <td className="p-3">
            {actionButtons(row)}
          </td>

          <td className="p-3">
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
                <div className="mt-1">
                  {statusBadge(selected.status)}
                </div>
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

              <div>
                <strong>Approval Email</strong>
                <div>
                  {selected.approval_email_sent_at
                    ? '✓ Sent'
                    : 'Not sent'}
                </div>
              </div>

            </div>

            <div className="mt-6 rounded-lg border p-4">
              <div className="mb-3 font-semibold">
                Registration Actions
              </div>

              {actionButtons(selected)}
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
