import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-surface border-b border-line py-4 px-6 md:px-12 flex items-center justify-between">
      {/* Left: Branding Wordmark */}
      <Link href="/" className="group">
        <span className="font-display text-2xl font-bold text-ink group-hover:text-accent transition-all">
          Aksesibel
        </span>
      </Link>

      {/* Center: Nav links */}
      <div className="hidden md:flex items-center space-x-8">
        <Link 
          href="/buildings" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Cari Gedung
        </Link>
        <Link 
          href="/audit" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Jelajahi
        </Link>
        <Link 
          href="/about" 
          className="font-sans text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Panduan
        </Link>
      </div>

      {/* Right: Action button */}
      <div className="flex items-center">
        <Link 
          href="/audit"
          className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-sm font-semibold px-4 py-2 rounded-md transition-all"
        >
          Mulai Audit
        </Link>
      </div>
    </nav>
  );
}
