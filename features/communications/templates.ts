// ─────────────────────────────────────────────────────────────────────────
// Lightweight quick SMS templates (in-code, V1). No DB / no builder yet —
// the LO picks one to drop into the compose box and edits placeholders.
// renderTemplate substitutes {var} from a data map; unknown vars stay literal.
// ─────────────────────────────────────────────────────────────────────────

export type QuickTemplate = {
  id: string
  name: string
  body: string
}

export const SMS_TEMPLATES: QuickTemplate[] = [
  { id: 'follow-up', name: 'Follow-up', body: "Hi {first_name}, just checking in on your mortgage — any questions I can help with?" },
  { id: 'preapproval', name: 'Preapproval check-in', body: "Hi {first_name}, your preapproval is active — want to lock in while rates are good? Happy to chat." },
  { id: 'docs', name: 'Document reminder', body: "Hi {first_name}, we still need a couple documents to keep things moving. Can you send them over today?" },
  { id: 'partner-touch', name: 'Partner touch', body: "Hey {first_name}, hope business is good! Anyone you're working with who needs financing? I've got you covered." },
  { id: 'anniversary', name: 'Anniversary', body: "Hi {first_name}, congrats on another year in your home! If you ever want a rate review, I'm here." },
]

/** Substitute {var} tokens from data; leave unknown tokens as-is. */
export function renderTemplate(body: string, data: Record<string, string | number | null | undefined> = {}): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => {
    const v = data[key]
    return v == null || v === '' ? `{${key}}` : String(v)
  })
}
