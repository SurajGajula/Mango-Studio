import { type NextRequest } from 'next/server'
import { updateSession } from '@/app/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/media/upload (multipart uploads; avoid middleware touching the body)
     * - api/media/asset/ (byte-range video/audio; avoid middleware + streaming issues)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/media/upload|api/media/asset/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
