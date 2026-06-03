import { ChatWidget } from '@/components/ai/chat-widget'
import { SuperAdminSidebar, SuperAdminMobileNav } from './superadmin-sidebar'

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="min-h-screen bg-background pt-16">
        <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-4 md:px-6 md:py-6">
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-20">
              <SuperAdminSidebar />
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <SuperAdminMobileNav />
            {children}
          </main>
        </div>
      </div>

      <ChatWidget />
    </>
  )
}
