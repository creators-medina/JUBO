import { cn } from '@/lib/utils'
import { Check, ExternalLink } from 'lucide-react'
import { parseOptions, isColoredStatus } from '@/features/fields/status'

interface Props {
  field: any
  fieldValue: any | null
}

export function FieldValueCell({ field, fieldValue }: Props) {
  if (!fieldValue) return <span className="text-muted-foreground">—</span>

  const ft = field.field_type

  if (ft === 'boolean') {
    return fieldValue.value_boolean
      ? <Check className="w-3.5 h-3.5 text-emerald-400" />
      : <span className="text-muted-foreground">—</span>
  }

  if (ft === 'currency' && fieldValue.value_number != null) {
    return <span className="tabular-nums">${Number(fieldValue.value_number).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
  }

  if (ft === 'number' && fieldValue.value_number != null) {
    return <span className="tabular-nums">{Number(fieldValue.value_number).toLocaleString()}</span>
  }

  if ((ft === 'date' || ft === 'datetime') && fieldValue.value_date) {
    return <span>{new Date(fieldValue.value_date).toLocaleDateString()}</span>
  }

  if ((ft === 'select' || ft === 'status') && fieldValue.value_text) {
    const opts = parseOptions(field.config)
    const colored = isColoredStatus(opts) || ft === 'status'
    const opt = opts.find((o) => o.label === fieldValue.value_text)
    if (colored && opt?.color) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium text-white" style={{ backgroundColor: opt.color }}>
          {fieldValue.value_text}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-surface-3 text-foreground border border-border">
        {fieldValue.value_text}
      </span>
    )
  }

  if (ft === 'multiselect' && fieldValue.value_json) {
    const vals = Array.isArray(fieldValue.value_json) ? fieldValue.value_json as string[] : []
    return (
      <div className="flex flex-wrap gap-1">
        {vals.map((v: string) => (
          <span key={v} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs bg-surface-3 text-foreground border border-border">{v}</span>
        ))}
      </div>
    )
  }

  if (ft === 'email' && fieldValue.value_text) {
    return <a href={`mailto:${fieldValue.value_text}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{fieldValue.value_text}</a>
  }

  if (ft === 'url' && fieldValue.value_text) {
    return (
      <a href={fieldValue.value_text} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline" onClick={e => e.stopPropagation()}>
        <ExternalLink className="w-3 h-3" />
        <span className="truncate max-w-[120px]">{fieldValue.value_text}</span>
      </a>
    )
  }

  if (fieldValue.value_text) {
    return <span className="truncate block max-w-[180px]">{fieldValue.value_text}</span>
  }

  return <span className="text-muted-foreground">—</span>
}
