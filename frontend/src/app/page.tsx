import Link from "next/link";
import Navbar from "@/components/Navbar";
import CardMarquee from "@/components/CardMarquee";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Navbar />
      
      <main className="flex-1 flex items-center justify-center px-6 py-12 md:py-20 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center w-full">
          
          {/* Left Column: Headline and CTAs */}
          <div className="flex flex-col text-left">
            <span className="font-sans text-xs tracking-widest text-accent bg-accent/10 px-3 py-1 rounded-full mb-6 w-fit lowercase font-normal">
              sistem audit aksesibilitas gedung
            </span>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-normal text-ink tracking-tight mb-4">
              Audit aksesibilitas <br className="hidden md:inline" />
              ruang publik Anda
            </h1>
            
            <p className="font-display italic text-lg md:text-xl text-ink-muted mb-8 leading-relaxed">
              Analisis cerdas fasilitas gedung, ramah disabilitas untuk semua.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 mb-10">
              <Link
                href="/buildings/submit"
                className="inline-flex items-center justify-center bg-accent text-white hover:opacity-90 font-sans text-sm font-semibold px-6 py-3 rounded transition-all cursor-pointer"
              >
                Mulai Audit Baru
              </Link>
              <Link
                href="/buildings"
                className="inline-flex items-center justify-center bg-surface text-ink hover:bg-bg border border-line font-sans text-sm font-semibold px-6 py-3 rounded transition-all cursor-pointer"
              >
                Lihat Daftar Gedung
              </Link>
            </div>


          </div>

          {/* Right Column: Animated Scrolling Cards Marquee */}
          <div className="flex justify-center lg:justify-end w-full">
            <div className="w-full max-w-sm">
              <CardMarquee />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
