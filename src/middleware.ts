import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // This middleware is intentionally left empty.
  // It exists solely to force Next.js to generate a middleware manifest,
  // which resolves a "Cannot find module" build error.
  return NextResponse.next()
}

// The matcher is empty, so this middleware will not run on any requests.
export const config = {
  matcher: [],
}
