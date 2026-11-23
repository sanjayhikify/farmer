import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import DashboardLayout from '../../components/DashboardLayout'
import { useApp } from '../../context/AppContext'
import API from '../../api'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export default function Status() {
  const navigate = useNavigate()
  const { farmer, activeSlot } = useApp()
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState(
    activeSlot?.tokenNumber ? '' : 'No active booking was found.'
  )
  const [loading, setLoading] = useState(Boolean(activeSlot?.tokenNumber))
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    const tokenNumber = activeSlot?.tokenNumber
    if (!tokenNumber) return

    API.get(`/operations/quality/token/${encodeURIComponent(tokenNumber)}`)
      .then((response) => {
        setReceipt(response.data)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.response?.status === 404) {
          setError('Your batch is waiting for quality inspection. A receipt will appear here after it is recorded.')
          return
        }
        console.error('Could not load procurement receipt:', requestError)
        setError('Could not load your receipt from the database.')
      })
      .finally(() => setLoading(false))
  }, [activeSlot?.tokenNumber])

  const downloadReceipt = () => {
    if (!receipt) return
    const pdf = new jsPDF()
    pdf.setTextColor(13, 61, 52)
    pdf.setFontSize(22)
    pdf.text('AgriFlow Quality Receipt', 20, 24)
    pdf.setTextColor(80, 100, 94)
    pdf.setFontSize(11)
    pdf.text(`Receipt: ${receipt.receiptId}`, 20, 36)
    pdf.text(`Farmer: ${farmer?.name || 'Farmer'}   Token: ${receipt.tokenNumber}`, 20, 44)
    pdf.text(`Crop: ${receipt.crop}   Quantity: ${receipt.quantity} Qtl`, 20, 52)
    pdf.text(`Grade: ${receipt.grade}   Moisture: ${receipt.moisture}%`, 20, 60)
    pdf.line(20, 68, 190, 68)
    pdf.text(`Rate per quintal: ${currency.format(receipt.ratePerQuintal)}`, 20, 80)
    pdf.setFontSize(15)
    pdf.setTextColor(8, 145, 103)
    pdf.text(`Estimated payout: ${currency.format(receipt.totalAmount)}`, 20, 96)
    pdf.setTextColor(80, 100, 94)
    pdf.setFontSize(11)
    pdf.text('Payment settlement is not integrated; this is a quality/payout estimate.', 20, 110)
    pdf.save(`${receipt.receiptId}.pdf`)
    setDownloaded(true)
  }

  return (
    <DashboardLayout title="Payment Status" subtitle="Your saved quality record and payout estimate.">
      {loading && (
        <div className="rounded-xl border border-[#dfe8e5] bg-white p-6 text-sm text-[#71847f]">
          Loading your receipt...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-[#dfe8e5] bg-white p-6">
          <p role="status" className="text-sm font-semibold text-[#71847f]">{error}</p>
          <button
            onClick={() => navigate('/book-slot')}
            className="mt-5 rounded-lg bg-[#08a979] px-4 py-3 text-sm font-bold text-white hover:bg-[#078e67]"
          >
            Book another batch
          </button>
        </div>
      )}

      {!loading && receipt && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
            <section className="rounded-xl border border-[#dfe8e5] bg-white p-6 shadow-[0_5px_18px_rgba(25,55,48,0.04)] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0da678]">Quality receipt</p>
                  <h2 className="mt-2 text-2xl font-black text-[#142a24]">{receipt.receiptId}</h2>
                </div>
                <span className="rounded-full bg-[#e8f8f2] px-3 py-1.5 text-[10px] font-bold text-[#138b69]">● Quality recorded</span>
              </div>
              <dl className="mt-8 grid gap-5 border-t border-[#e7eeec] pt-6 sm:grid-cols-2">
                <div><dt className="text-xs text-[#8b9d9a]">Crop type</dt><dd className="mt-1 text-sm font-bold text-[#253a34]">{receipt.crop}</dd></div>
                <div><dt className="text-xs text-[#8b9d9a]">Quantity received</dt><dd className="mt-1 text-sm font-bold text-[#253a34]">{receipt.quantity} Quintals</dd></div>
                <div><dt className="text-xs text-[#8b9d9a]">Certified grade</dt><dd className="mt-1 text-sm font-bold text-[#253a34]">{receipt.grade}</dd></div>
                <div><dt className="text-xs text-[#8b9d9a]">Moisture reading</dt><dd className="mt-1 text-sm font-bold text-[#253a34]">{receipt.moisture}%</dd></div>
                <div><dt className="text-xs text-[#8b9d9a]">Rate per quintal</dt><dd className="mt-1 text-sm font-bold text-[#253a34]">{currency.format(receipt.ratePerQuintal)}</dd></div>
                <div><dt className="text-xs text-[#8b9d9a]">Recorded</dt><dd className="mt-1 text-sm font-bold text-[#253a34]">{new Date(receipt.createdAt).toLocaleString()}</dd></div>
              </dl>
              <div className="mt-7 rounded-lg bg-[#f6faf8] p-4 text-sm text-[#71847f]">
                This is a quality-based payout estimate. No payment settlement gateway is connected.
              </div>
              <div className="mt-5 flex items-end justify-between border-t border-[#e7eeec] pt-6">
                <span className="text-sm font-semibold text-[#71847f]">Estimated payout</span>
                <strong className="text-3xl font-black tracking-tight text-[#0d6c51]">{currency.format(receipt.totalAmount)}</strong>
              </div>
            </section>

            <section className="rounded-xl bg-[#0d3d34] p-6 text-white shadow-[0_12px_30px_rgba(13,61,52,0.16)] sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9bd7c7]">Settlement status</p>
              <h2 className="mt-4 text-xl font-black">Quality inspection complete</h2>
              <p className="mt-2 text-sm text-[#b8d5ce]">Payout remains pending until a settlement provider is configured.</p>
              <div className="mt-9 flex flex-col gap-2">
                <button onClick={downloadReceipt} className="rounded-lg bg-white px-4 py-3 text-xs font-bold text-[#145b4b] hover:bg-[#e6f5ef]">Download receipt</button>
                <button onClick={() => navigate('/book-slot')} className="rounded-lg border border-white/25 px-4 py-3 text-xs font-bold text-white hover:bg-white/10">Book another batch</button>
              </div>
              {downloaded && <p className="mt-3 text-xs font-semibold text-[#9bd7c7]">Receipt downloaded successfully.</p>}
            </section>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
