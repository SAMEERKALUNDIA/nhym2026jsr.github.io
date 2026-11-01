import { jsPDF } from 'jspdf'

export type PrintablePdfColumn = { label: string; width?: string; align?: 'left' | 'center' | 'right' }
export type PrintablePdfSection = { title: string; rows: string[][] }
export type PrintablePdfTable = { columns: PrintablePdfColumn[]; rows: string[][] }

type PdfOptions = {
  title: string
  subtitle?: string
  orientation?: 'portrait' | 'landscape'
  sections?: PrintablePdfSection[]
  tables?: PrintablePdfTable[]
  footer?: string
}

const GREEN: [number, number, number] = [23, 75, 53]
const PALE_GREEN: [number, number, number] = [221, 239, 227]
const MUTED: [number, number, number] = [82, 103, 90]
const BORDER: [number, number, number] = [183, 208, 191]
const FONT_FAMILY = 'NHYMDevanagari'

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

async function loadFont(pdf: jsPDF): Promise<boolean> {
  try {
    const response = await fetch('/NotoSansDevanagari-Regular.ttf', { cache: 'force-cache' })
    if (!response.ok) return false
    const base64 = toBase64(await response.arrayBuffer())
    pdf.addFileToVFS('NotoSansDevanagari-Regular.ttf', base64)
    pdf.addFont('NotoSansDevanagari-Regular.ttf', FONT_FAMILY, 'normal')
    return true
  } catch (error) {
    console.warn('Unable to embed the Devanagari PDF text font:', error)
    return false
  }
}

async function loadImage(path: string): Promise<string | null> {
  try {
    const response = await fetch(path, { cache: 'force-cache' })
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read'))
      reader.onerror = () => reject(reader.error || new Error('Image could not be read'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function imageFormat(data: string): 'PNG' | 'JPEG' {
  return data.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const normalized = String(text ?? '—').replace(/\r\n?/g, '\n')
  const result: string[] = []
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) {
      result.push('')
      continue
    }
    const words = paragraph.split(/\s+/)
    let line = ''
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word
      if (line && context.measureText(candidate).width > maxWidth) {
        result.push(line)
        line = word
      } else if (!line && context.measureText(word).width > maxWidth) {
        let part = ''
        for (const character of Array.from(word)) {
          const next = part + character
          if (part && context.measureText(next).width > maxWidth) {
            result.push(part)
            part = character
          } else {
            part = next
          }
        }
        line = part
      } else {
        line = candidate
      }
    }
    if (line) result.push(line)
  }
  return result.length ? result : ['—']
}

function renderShapedLine(
  pdf: jsPDF,
  text: string,
  x: number,
  baselineY: number,
  maxWidthMm: number,
  fontSizePt: number,
  color: [number, number, number],
  bold = false,
  searchable = false,
) {
  if (!text) return
  // Keep ordinary English as compact vector text; only Indic lines need Chromium shaping.
  if (!/[\u0900-\u097F]/.test(text)) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(fontSizePt)
    pdf.setTextColor(...color)
    pdf.text(text, x, baselineY, { maxWidth: maxWidthMm })
    return
  }
  const scale = 3
  const widthPx = Math.max(12, Math.ceil(maxWidthMm * 96 / 25.4 * scale))
  const heightPx = Math.ceil(fontSizePt * 96 / 72 * scale * 1.9)
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const context = canvas.getContext('2d')
  if (!context) return
  const pixelFontSize = fontSizePt * 96 / 72 * scale
  context.clearRect(0, 0, widthPx, heightPx)
  context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.font = `${bold ? '600' : '400'} ${pixelFontSize}px "${FONT_FAMILY}", "Noto Sans Devanagari", sans-serif`
  context.fillText(text, 0, pixelFontSize * 1.25, widthPx)
  const image = canvas.toDataURL('image/png')
  const imageWidthMm = widthPx * 25.4 / (96 * scale)
  const imageHeightMm = heightPx * 25.4 / (96 * scale)
  const topY = baselineY - fontSizePt * 25.4 / 72 * 0.92
  pdf.addImage(image, 'PNG', x, topY, Math.min(maxWidthMm, imageWidthMm), imageHeightMm, undefined, 'FAST')

  // The visible glyphs are rendered by Chromium's Indic text shaper. This invisible
  // Unicode layer keeps the original Hindi/English strings selectable and searchable.
  if (searchable) {
    try {
      pdf.setFont(FONT_FAMILY, 'normal')
      pdf.setFontSize(fontSizePt)
      pdf.setTextColor(0, 0, 0)
      pdf.text(text, x, baselineY, { renderingMode: 'invisible', baseline: 'alphabetic', charSpace: 0 })
    } catch (error) {
      console.warn('Could not add searchable text layer for one PDF line:', error)
    }
  }
}

export async function printSearchableHindiPdf(options: PdfOptions) {
  const {
    title,
    subtitle = '',
    orientation = 'portrait',
    sections = [],
    tables = [],
  } = options

  try {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true })
  pdf.setProperties({ title, subject: subtitle, creator: 'NHYM 2026 PDF Export' })
  const searchableFontReady = await loadFont(pdf)

  // Load and shape fonts before drawing. Canvas uses Chromium's full Indic shaping,
  // while the embedded font supplies Unicode text extraction/search in the PDF.
  try {
    const fontResponse = await fetch('/NotoSansDevanagari-Regular.ttf', { cache: 'force-cache' })
    if (fontResponse.ok) {
      const fontBlob = await fontResponse.blob()
      const fontUrl = URL.createObjectURL(fontBlob)
      const face = new FontFace(FONT_FAMILY, `url(${fontUrl})`)
      await face.load()
      document.fonts.add(face)
      await document.fonts.ready
      URL.revokeObjectURL(fontUrl)
    }
  } catch (error) {
    console.warn('Canvas Hindi font could not be loaded; using system fallback:', error)
  }

  const [hoLogo, nhymLogo, warangFont] = await Promise.all([
    loadImage('/ho-samaj-logo.jpg'),
    loadImage('/nhym-logo2.jpg'),
    fetch('/NotoSansWarangCiti-Regular.ttf', { cache: 'force-cache' }).then(async response => {
      if (!response.ok) return null
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const face = new FontFace('NHYMWarangCitiPdf', `url(${url})`)
      await face.load()
      document.fonts.add(face)
      URL.revokeObjectURL(url)
      return true
    }).catch(() => null),
  ])

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const left = 12
  const right = pageWidth - 12
  const contentWidth = right - left
  const footerY = pageHeight - 9.5
  const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })
  const bottomLimit = pageHeight - 18
  let y = 0
  let pageNumber = 0

  const addPageHeader = () => {
    pageNumber += 1
    if (pageNumber > 1) {
      // The full branded header is intentionally printed on page one only.
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.setTextColor(...GREEN)
      pdf.text(title, pageWidth / 2, 9, { align: 'center', maxWidth: contentWidth })
      pdf.setDrawColor(...BORDER)
      pdf.line(left, 13, right, 13)
      y = 18
      return
    }
    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')
    if (hoLogo) {
      const props = pdf.getImageProperties(hoLogo)
      const scale = Math.min(19 / props.width, 19 / props.height)
      pdf.addImage(hoLogo, imageFormat(hoLogo), left, 3, props.width * scale, props.height * scale)
    }
    if (nhymLogo) {
      const props = pdf.getImageProperties(nhymLogo)
      const scale = Math.min(19 / props.width, 19 / props.height)
      pdf.addImage(nhymLogo, imageFormat(nhymLogo), right - 19, 3, props.width * scale, props.height * scale)
    }

    const warang = '𑢴𑢢𑢴𑢣𑢶 𑢹𑢩𑢩 𑢮𑢣𑢡𑢳 𑢮𑢣𑢶𑢣𑢼 : 𑢽𑢢𑢼𑢮𑢩𑢳'
    if (warangFont) {
      const canvas = document.createElement('canvas')
      canvas.width = 1800
      canvas.height = 100
      const context = canvas.getContext('2d')
      if (context) {
        context.font = '64px NHYMWarangCitiPdf'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillStyle = '#174b35'
        context.fillText(warang, 900, 50)
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageWidth / 2 - 43, 2, 86, 4.8)
      }
    }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...GREEN)
    pdf.text('NATIONAL HO YOUTH MEET : SIRJON', pageWidth / 2, 10, { align: 'center' })
    pdf.text('2026', pageWidth / 2, 14, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.8)
    pdf.setTextColor(72, 30, 20)
    pdf.text('Organized By : Adivasi Ho Samaj Yuva Mahasabha · Jamshedpur · 28–29 November 2026', pageWidth / 2, 18.5, { align: 'center', maxWidth: contentWidth - 44 })
    pdf.setFillColor(...PALE_GREEN)
    pdf.setDrawColor(...GREEN)
    pdf.roundedRect(left, 25, contentWidth, 7, 1.2, 1.2, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...GREEN)
    pdf.text(title, pageWidth / 2, 29.7, { align: 'center', maxWidth: contentWidth - 12 })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...MUTED)
    if (subtitle) pdf.text(subtitle, pageWidth / 2, 36, { align: 'center', maxWidth: contentWidth - 8 })
    pdf.setDrawColor(...BORDER)
    pdf.line(left, 39, right, 39)
    y = 44
  }

  const addFooter = () => {
    pdf.setDrawColor(...BORDER)
    pdf.setLineWidth(0.35)
    pdf.line(left, pageHeight - 14, right, pageHeight - 14)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.3)
    pdf.setTextColor(...MUTED)
    pdf.text(`Address: Adivasi Ho Samaj Bhawan, Golmuri, Jamshedpur-831003 | Email: nhym2026jsr@gmail.com | Phone: 9931333025, 7870979751`, pageWidth / 2, footerY, { align: 'center', maxWidth: contentWidth })
    pdf.text(`Generated: ${generatedAt} IST`, left, pageHeight - 4, { align: 'left' })
  }

  const ensureSpace = (height: number) => {
    if (y + height <= bottomLimit) return
    addFooter()
    pdf.addPage()
    addPageHeader()
  }

  const drawSectionHeading = (text: string) => {
    ensureSpace(12)
    pdf.setFillColor(...PALE_GREEN)
    pdf.setDrawColor(...GREEN)
    pdf.roundedRect(left, y, contentWidth, 7, 1, 1, 'FD')
    renderShapedLine(pdf, text, left + 2, y + 4.8, contentWidth - 4, 9, GREEN, true, searchableFontReady)
    y += 10
  }

  const drawDetailRows = (rows: string[][]) => {
    const gap = 3
    const cellWidth = (contentWidth - gap) / 2
    const labelWidth = Math.min(31, Math.max(21, cellWidth * 0.35))
    const drawCell = (label: string, value: string, x: number, width: number, height: number, fill: [number, number, number], fixedLabelWidth?: number) => {
      pdf.setFillColor(...fill)
      pdf.setDrawColor(...BORDER)
      pdf.rect(x, y, width, height, 'FD')
      const labelW = fixedLabelWidth ?? labelWidth
      const labelCanvas = document.createElement('canvas')
      const labelContext = labelCanvas.getContext('2d')
      const valueCanvas = document.createElement('canvas')
      const valueContext = valueCanvas.getContext('2d')
      if (!labelContext || !valueContext) return
      labelContext.font = `600 6.2pt "${FONT_FAMILY}", sans-serif`
      valueContext.font = `400 7.7pt "${FONT_FAMILY}", sans-serif`
      const labelLines = wrapText(labelContext, label.toUpperCase(), (labelW - 3) * 96 / 25.4)
      const valueLines = wrapText(valueContext, value || '—', (width - labelW - 4) * 96 / 25.4)
      labelLines.forEach((line, i) => renderShapedLine(pdf, line, x + 2, y + 4.1 + i * 3.4, labelW - 3, 6.2, GREEN, true, searchableFontReady))
      valueLines.forEach((line, i) => renderShapedLine(pdf, line, x + labelW, y + 4.1 + i * 3.4, width - labelW - 4, 7.7, [29, 44, 35], false, searchableFontReady))
    }
    let index = 0
    while (index < rows.length) {
      const first = rows[index]
      const full = first[2] === 'full'
      const second = !full ? rows[index + 1] : undefined
      const values = [first, ...(second ? [second] : [])].map(row => {
        const labelCanvas = document.createElement('canvas')
        const labelContext = labelCanvas.getContext('2d')
        const valueCanvas = document.createElement('canvas')
        const valueContext = valueCanvas.getContext('2d')
        if (!labelContext || !valueContext) return { labelLines: ['—'], valueLines: ['—'] }
        labelContext.font = `600 6.2pt "${FONT_FAMILY}", sans-serif`
        valueContext.font = `400 7.7pt "${FONT_FAMILY}", sans-serif`
        const width = full ? contentWidth : cellWidth
        const labelW = full ? 34 : labelWidth
        return {
          labelLines: wrapText(labelContext, String(row[0] ?? '—').toUpperCase(), (labelW - 3) * 96 / 25.4),
          valueLines: wrapText(valueContext, String(row[1] ?? '—'), (width - labelW - 4) * 96 / 25.4),
        }
      })
      const maxLines = Math.max(1, ...values.map(v => Math.max(v.labelLines.length, v.valueLines.length)))
      const rowHeight = Math.max(9, maxLines * 3.4 + 4)
      ensureSpace(rowHeight)
      const fill: [number, number, number] = Math.floor(y) % 2 === 0 ? [245, 250, 246] : [255, 255, 255]
      if (full) {
        drawCell(String(first[0] ?? '—'), String(first[1] ?? '—'), left, contentWidth, rowHeight, fill, 34)
      } else {
        drawCell(String(first[0] ?? '—'), String(first[1] ?? '—'), left, cellWidth, rowHeight, fill)
        if (second) drawCell(String(second[0] ?? '—'), String(second[1] ?? '—'), left + cellWidth + gap, cellWidth, rowHeight, fill)
      }
      y += rowHeight
      index += full || !second ? 1 : 2
    }
  }

  const parseColumnWidths = (columns: PrintablePdfColumn[]) => {
    const raw = columns.map(column => {
      const value = String(column.width || '')
      if (value.endsWith('%')) return Math.max(1, Number.parseFloat(value) || 0)
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 1
    })
    const sum = raw.reduce((total, value) => total + value, 0) || columns.length || 1
    return raw.map(value => contentWidth * value / sum)
  }

  const drawTable = (table: PrintablePdfTable) => {
    if (!table.columns.length) return
    const widths = parseColumnWidths(table.columns)
    const cellPadding = 1.5
    const fontSize = orientation === 'landscape' ? 7 : 6.5
    const lineHeight = orientation === 'landscape' ? 3.6 : 3.4
    const drawTableHeader = () => {
      ensureSpace(9)
      pdf.setFillColor(...PALE_GREEN)
      pdf.setDrawColor(...BORDER)
      pdf.rect(left, y, contentWidth, 8, 'FD')
      let x = left
      table.columns.forEach((column, index) => {
        const cellWidth = widths[index]
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (context) {
          context.font = `600 ${fontSize * 96 / 72 * 2}px "${FONT_FAMILY}", "Noto Sans Devanagari", sans-serif`
          const lines = wrapText(context, column.label, (cellWidth - cellPadding * 2) * 96 / 25.4 * 2)
          lines.slice(0, 2).forEach((line, lineIndex) => {
            const measured = context.measureText(line).width * 25.4 / (96 * 2)
            const textX = column.align === 'right' ? x + cellWidth - cellPadding - measured : column.align === 'center' ? x + (cellWidth - measured) / 2 : x + cellPadding
            renderShapedLine(pdf, line, textX, y + 3.4 + lineIndex * lineHeight, cellWidth - cellPadding * 2, fontSize, GREEN, true, searchableFontReady)
          })
        }
        x += cellWidth
      })
      x = left
      widths.forEach(width => {
        x += width
        pdf.line(x, y, x, y + 8)
      })
      y += 8
    }

    drawTableHeader()
    table.rows.forEach((row, rowIndex) => {
      const cells = table.columns.map((_, index) => {
        const text = String(row[index] ?? '—')
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) return ['—']
        context.font = `400 ${fontSize * 96 / 72 * 2}px "${FONT_FAMILY}", "Noto Sans Devanagari", sans-serif`
        return wrapText(context, text, (widths[index] - cellPadding * 2) * 96 / 25.4 * 2)
      })
      const maxLines = Math.max(1, ...cells.map(lines => lines.length))
      const rowHeight = Math.max(6.2, maxLines * lineHeight + 2.2)
      if (y + rowHeight > bottomLimit) {
        addFooter()
        pdf.addPage()
        addPageHeader()
        drawTableHeader()
      }
      if (rowIndex % 2 === 1) {
        pdf.setFillColor(247, 250, 248)
        pdf.rect(left, y, contentWidth, rowHeight, 'F')
      }
      let x = left
      table.columns.forEach((column, index) => {
        const cellWidth = widths[index]
        cells[index].forEach((line, lineIndex) => {
          const measuredCanvas = document.createElement('canvas')
          const context = measuredCanvas.getContext('2d')
          if (!context) return
          context.font = `400 ${fontSize * 96 / 72 * 2}px "${FONT_FAMILY}", "Noto Sans Devanagari", sans-serif`
          const measured = context.measureText(line).width * 25.4 / (96 * 2)
          const textX = column.align === 'right' ? x + cellWidth - cellPadding - measured : column.align === 'center' ? x + (cellWidth - measured) / 2 : x + cellPadding
          renderShapedLine(pdf, line, textX, y + 3.5 + lineIndex * lineHeight, cellWidth - cellPadding * 2, fontSize, [29, 44, 35], false, searchableFontReady)
        })
        x += cellWidth
      })
      pdf.setDrawColor(...BORDER)
      pdf.rect(left, y, contentWidth, rowHeight)
      x = left
      widths.forEach(width => {
        x += width
        pdf.line(x, y, x, y + rowHeight)
      })
      y += rowHeight
    })
    y += 3
  }

  addPageHeader()
  sections.forEach(section => {
    drawSectionHeading(section.title)
    drawDetailRows(section.rows)
  })
  tables.forEach(drawTable)
  addFooter()
  const totalPages = pdf.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.3)
    pdf.setTextColor(...MUTED)
    pdf.text(`Page ${page} of ${totalPages}`, right, pageHeight - 4, { align: 'right' })
  }

  const safeName = title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'NHYM-2026-Report'
  pdf.save(`NHYM-2026-${safeName}.pdf`)
  } catch (error) {
    console.error('Direct PDF export failed:', error)
    window.alert('PDF डाउनलोड नहीं हो सका। कृपया दोबारा प्रयास करें।')
  }
}
