"use client";

export default function Footer() {
  return (
    <footer className="w-full border-t border-line/45 py-8 mt-12 flex justify-center items-center bg-bg/50">
      <div className="max-w-6xl w-full px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-sans text-xs text-ink-muted">
          &copy; {new Date().getFullYear()} Aksesibel. Sistem Audit Aksesibilitas Gedung.
        </span>
      </div>
    </footer>
  );
}
