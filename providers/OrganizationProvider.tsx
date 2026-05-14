'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import type { Organization } from '@/types/organization'

interface OrgWithRole extends Organization {
  role: string
}

interface OrganizationContextValue {
  organizations: OrgWithRole[]
  currentOrganization: OrgWithRole | null
  isLoading: boolean
  setCurrentOrganization: (org: OrgWithRole | null) => void
  refreshOrganizations: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextValue>({
  organizations: [],
  currentOrganization: null,
  isLoading: true,
  setCurrentOrganization: () => {},
  refreshOrganizations: async () => {},
})

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [organizations, setOrganizations] = useState<OrgWithRole[]>([])
  const [currentOrganization, setCurrentOrganization] = useState<OrgWithRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchOrganizations = useCallback(async () => {
    if (!user) {
      setOrganizations([])
      setCurrentOrganization(null)
      setIsLoading(false)
      return
    }
    const supabase = createClient()
    const { data } = await supabase
      .from('organization_members')
      .select('role, organizations(id, name, slug, owner_user_id, created_at, updated_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    const orgs: OrgWithRole[] = (data ?? []).map((m: any) => ({
      ...m.organizations,
      role: m.role,
    }))
    setOrganizations(orgs)
    if (orgs.length > 0 && !currentOrganization) {
      setCurrentOrganization(orgs[0])
    }
    setIsLoading(false)
  }, [user])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  return (
    <OrganizationContext.Provider value={{
      organizations,
      currentOrganization,
      isLoading,
      setCurrentOrganization,
      refreshOrganizations: fetchOrganizations,
    }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  return useContext(OrganizationContext)
}

export type { OrgWithRole }
