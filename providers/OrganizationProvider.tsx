"use client";

import { createContext, useContext, useState } from "react";
import { Organization } from "@/types/organization";

interface OrganizationContextValue {
  organization: Organization | null;
  setOrganization: (org: Organization | null) => void;
}

const OrganizationContext = createContext<OrganizationContextValue>({
  organization: null,
  setOrganization: () => {},
});

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [organization, setOrganization] = useState<Organization | null>(null);

  return (
    <OrganizationContext.Provider value={{ organization, setOrganization }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
