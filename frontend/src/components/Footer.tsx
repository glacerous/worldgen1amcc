"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full border-t border-line/45 py-8 mt-12 flex justify-center items-center bg-bg/50">
      <div className="max-w-6xl w-full px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-sans text-xs text-ink-muted">
          &copy; {new Date().getFullYear()} Aksesibel. Sistem Audit Aksesibilitas Gedung.
        </span>
        <Link 
          href="/developers" 
          className="font-sans text-xs font-semibold text-accent hover:text-accent/80 hover:underline transition-all cursor-pointer"
        >
          API untuk Developer
        </Link>
      </div>
    </footer>
  );
}
