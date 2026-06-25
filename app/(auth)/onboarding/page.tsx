'use client'

import { useState } from 'react'
import { Command } from 'lucide-react'
import { createOrganization } from '@/features/organizations/actions'
import { Button } from '@/components/ui/button'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function OnboardingPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameChange = (v: string) => {
    setName(v)
    setSlug(slugify(v))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setLoading(true)
    setError(null)
    try {
      await createOrganization(name.trim(), slug.trim())
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-jubo-navy flex items-center justify-center">
          <Command className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">Jubo</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h1 className="text-base font-semibold text-foreground mb-1">Create your workspace</h1>
        <p className="text-xs text-muted-foreground mb-5">
          Set up your organization to get started
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Organization name</label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
              placeholder="Medina Mortgage"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Workspace URL</label>
            <div className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface-1 border border-border rounded-md">
              <span className="text-muted-foreground">jubo.app/</span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(slugify(e.target.value))}
                className="flex-1 bg-transparent text-foreground focus:outline-none"
                placeholder="medina-mortgage"
                required
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
            {loading ? 'Creating workspace…' : 'Create workspace'}
          </Button>
        </form>
      </div>
    </div>
  )
}
