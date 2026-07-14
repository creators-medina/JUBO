// ─────────────────────────────────────────────────────────────────────────
// Pure board-classification util — SERVER-SAFE. No 'use client', no client-only
// imports, so both the client sidebar (DynamicBoardsSidebarSection / BoardsClient)
// and server-side code (dashboard overview queries) can share one definition.
//
// Extracted from DynamicBoardsSidebarSection (a 'use client' module) because
// importing a function out of a client module and calling it on the server
// throws: "Attempted to call isWorkLoansBoard() from the server, but it's on the
// client." Keeping the classifier here keeps the dashboard server-rendered.
// ─────────────────────────────────────────────────────────────────────────

// Work Loans = the active loan pipeline. Primary signal is the STORED board_type
// ('pipeline'); the name matchers only catch journey boards created under
// another type. Everything else reads as Generate.
export const WORK_LOAN_NAME_MATCHERS = [
  'phase', 'lead capture', 'post closing', 'post-closing', 'in process', 'underwrit', 'initial consult',
]

export function isWorkLoansBoard(b: { name: string; board_type: string }): boolean {
  if (b.board_type === 'pipeline') return true
  const n = b.name.toLowerCase()
  return WORK_LOAN_NAME_MATCHERS.some((m) => n.includes(m))
}
