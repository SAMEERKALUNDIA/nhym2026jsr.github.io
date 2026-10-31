export type PrintablePdfColumn = { label: string; width?: string; align?: 'left' | 'center' | 'right' }
export type PrintablePdfSection = { title: string; rows: Array<[string, string]> }
export type PrintablePdfTable = { columns: PrintablePdfColumn[]; rows: string[][] }

const escapeHtml = (value: unknown) => String(value ?? '—')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function printSearchableHindiPdf(options: {
  title: string
  subtitle?: string
  orientation?: 'portrait' | 'landscape'
  sections?: PrintablePdfSection[]
  tables?: PrintablePdfTable[]
  footer?: string
}) {
  const { title, subtitle = '', orientation = 'portrait', sections = [], tables = [], footer = '' } = options
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    window.alert('PDF print window was blocked. Please allow pop-ups and try again.')
    return
  }
  const sectionHtml = sections.map(section => `
    <section class="report-section">
      <h2>${escapeHtml(section.title)}</h2>
      <dl>${section.rows.map(([label, value]) => `<div class="detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    </section>`).join('')
  const tableHtml = tables.map(table => `
    <table><thead><tr>${table.columns.map(column => `<th style="${column.width ? `width:${escapeHtml(column.width)}` : ''};text-align:${column.align || 'left'}">${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.map(row => `<tr>${row.map((cell, index) => `<td style="text-align:${table.columns[index]?.align || 'left'}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      @font-face{font-family:NHYMDevanagari;src:url('/NotoSansDevanagari-Regular.ttf') format('truetype');font-style:normal;font-weight:400;font-display:block}
      @page{size:A4 ${orientation};margin:14mm 12mm 16mm}
      *{box-sizing:border-box}body{font-family:NHYMDevanagari,'Noto Sans Devanagari',sans-serif;color:#1d2c23;font-size:10pt;line-height:1.45}
      header{text-align:center;border-bottom:1px solid #b7d0bf;padding-bottom:8px;margin-bottom:14px}
      h1{font-size:17pt;color:#174b35;margin:0 0 3px}header p{margin:0;color:#5b665e;font-size:9pt}
      h2{font-size:11pt;color:#174b35;background:#ddefe3;border:1px solid #174b35;border-radius:4px;padding:5px 8px;margin:14px 0 7px}
      dl{margin:0}.detail{display:grid;grid-template-columns:minmax(30mm,38mm) 1fr;border-bottom:1px solid #d8e2da;padding:5px 7px;break-inside:avoid}
      .detail:nth-child(even){background:#f5faf6}dt{font-weight:600;color:#174b35}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
      table{width:100%;border-collapse:collapse;font-size:8.5pt;margin:8px 0 14px}thead{display:table-header-group}tr{break-inside:avoid}
      th{background:#ddefe3;color:#174b35;font-weight:600}th,td{border:1px solid #b7d0bf;padding:5px 6px;vertical-align:top;overflow-wrap:anywhere}
      tbody tr:nth-child(even){background:#f7faf8}.footer{margin-top:18px;padding-top:6px;border-top:1px solid #b7d0bf;color:#52675a;font-size:8pt}
      @media screen{body{max-width:1100px;margin:24px auto;padding:20px} .screen-actions{display:flex;gap:8px;margin-bottom:16px}.screen-actions button{padding:8px 14px}}
      @media print{.screen-actions{display:none}body{margin:0}.report-section{break-inside:auto}}
    </style></head><body>
    <div class="screen-actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>
    <header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header>
    ${sectionHtml}${tableHtml}<div class="footer">${escapeHtml(footer)}</div>
    <script>document.fonts.ready.then(()=>{document.documentElement.dataset.fontReady='true'})</script>
    </body></html>`)
  printWindow.document.close()
  printWindow.focus()
}
