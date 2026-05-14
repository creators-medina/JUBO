'use client'

import { useEffect, useState } from 'react'
import { X, Clock, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  recordId: string
  groups: any[]
  boardId: string
  onClose: () => void
}

export function RecordDetailDrawer({ recordId, groups, onClose }: Props) {
  const [record, setRecord] = useState<any>(null)
  const [fieldValues, setFieldValues] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const [rRes, fvRes, aRes, mRes] = await Promise.all([
        supabase.from('records').select('*').eq('id', recordId).single(),
        supabase.from('field_values').select('*, fields(name, field_type)').eq('record_id', recordId),
        supabase.from('activities').select('*').eq('record_id', recordId).order('created_at', { ascending: false }).limit(20),
        supabase.from('record_movements')
          .select('*, from_group:from_group_id(name), to_group:to_group_id(name)')
          .eq('record_id', recordId)
          .order('created_at', { ascending: false }),
      ])
      setRecord(rRes.data)
      setFieldValues(fvRes.data ?? [])
      setActivities(aRes.data ?? [])
      setMovements(mRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [recordId])

  const groupName = (id: string | null) => groups.find(g => g.id === id)?.name ?? '—'

  const getFieldDisplayValue = (fv: any) => {
    if (fv.value_text != null) return fv.value_text
    if (fv.value_number != null) return String(fv.value_number)
    if (fv.value_boolean != null) return fv.value_boolean ? 'Yes' : 'No'
    if (fv.value_date != null) return new Date(fv.value_date).toLocaleDateString()
    if (fv.value_json != null) return JSON.stringify(fv.value_json)
    return '—'
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-l border-border flex flex-col h-full shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {loading ? 'Loading…' : record?.title}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!loading && record && (
          <div className="flex-1 overflow-y-auto">
            {/* Meta */}
            <div className="px-5 py-4 border-b border-border space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Group</span>
                <span className="text-xs text-foreground">{groupName(record.group_id)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Status</span>
                <span className="text-xs text-foreground capitalize">{record.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Priority</span>
                <span className="text-xs text-foreground capitalize">{record.priority}</span>
              </div>
              {record.value != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Value</span>
                  <span className="text-xs text-foreground">${Number(record.value).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Created</span>
                <span className="text-xs text-foreground">{new Date(record.created_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Field values */}
            {fieldValues.length > 0 && (
              <div className="px-5 py-4 border-b border-border space-y-2">
                <p className="text-xs font-semibold text-foreground mb-3">Fields</p>
                {fieldValues.map(fv => (
                  <div key={fv.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{fv.fields?.name}</span>
                    <span className="text-xs text-foreground">{getFieldDisplayValue(fv)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Movement history */}
            {movements.length > 0 && (
              <div className="px-5 py-4 border-b border-border">
                <p className="text-xs font-semibold text-foreground mb-3">Movement history</p>
                <div className="space-y-2">
                  {movements.map(m => (
                    <div key={m.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{m.from_group?.name ?? 'Unknown'}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-foreground">{m.to_group?.name ?? 'Unknown'}</span>
                      <span className="ml-auto flex-shrink-0">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity */}
            {activities.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-foreground mb-3">Activity</p>
                <div className="space-y-3">
                  {activities.map(a => (
                    <div key={a.id} className="flex gap-2.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-foreground capitalize">{a.activity_type.replace(/_/g, ' ')}</p>
                        {a.content && <p className="text-xs text-muted-foreground">{a.content}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
