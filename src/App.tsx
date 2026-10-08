import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import Home from '@/pages/Home'
import { Meta } from '@/components/Meta'
import Gallery from './pages/Gallery'

// Routes are code-split so the first paint carries only the landing page.
const NotFound = lazy(() => import('@/pages/NotFound'))
const Admin = lazy(() => import('@/pages/Admin'))
const Participant = lazy(() => import('@/pages/Participant'))
const Register = lazy(() => import('@/pages/Register'))

/* This is a one-page site with one action, so there is no site-wide header or
   footer above the routes: the page owns its own shell, its own main and its
   own footer, and the 404 carries just the mark. */
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="px-gutter py-24 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <Routes>
        <Route
          index
          element={
            <>
              <Meta
                title="Register for National Ho Youth Meet 2026, Jamshedpur"
                description="Register a family, school group or delegation for the National Ho Youth Meet 2026 at Birsa Munda Town Hall, Jamshedpur on 28 and 29 November. Four categories, ₹100 to ₹1,500."
              />
              <Home />
            </>
          }
        />

        <Route path="register" element={<Register />} />

        <Route path="participant" element={<Participant />} />

        {/* Admin dashboard */}
        <Route path="admin" element={<Admin />} />

        {/* Separate admin management pages */}
        <Route path="admin/participants" element={<Admin />} />
        <Route path="admin/gallery" element={<Admin />} />

        {/* Public gallery */}
        <Route path="/gallery" element={<Gallery />} />

        <Route
          path="*"
          element={
            <>
              <Meta
                title="Page not found — National Ho Youth Meet 2026"
                description="That address does not exist. The registration form, venue, programme and fees for the National Ho Youth Meet 2026 are on the main page."
              />
              <NotFound />
            </>
          }
        />
      </Routes>
    </Suspense>
  )
}
