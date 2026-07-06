import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Retrieve token from cookies
  const tokenCookie = request.cookies.get("admin_token");
  const token = tokenCookie?.value;
  
  let isAuthenticated = false;
  if (token) {
    try {
      // Decode JWT payload without external library (atob is available in Next.js Edge runtime)
      const parts = token.split(".");
      if (parts.length === 3) {
        // Base64URL to Base64
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = atob(base64);
        const payload = JSON.parse(jsonPayload);
        
        const isExpired = payload.exp && payload.exp * 1000 < Date.now();
        if (!isExpired) {
          isAuthenticated = true;
        }
      }
    } catch (e) {
      console.error("Error decoding admin token in middleware:", e);
    }
  }

  const isAdminRoute = path.startsWith("/admin");
  const isLoginRoute = path === "/login";

  if (isAdminRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    // Clear cookie if it existed but was invalid/expired
    const response = NextResponse.redirect(loginUrl);
    if (token) {
      response.cookies.delete("admin_token");
    }
    return response;
  }

  if (isLoginRoute && isAuthenticated) {
    const adminUrl = new URL("/admin", request.url);
    return NextResponse.redirect(adminUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
