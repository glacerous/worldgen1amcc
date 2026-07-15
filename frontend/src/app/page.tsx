import Link from "next/link";
import Navbar from "@/components/Navbar";
import CardMarquee from "@/components/CardMarquee";
import Footer from "@/components/Footer";

const categories = [
  {
    num: "01",
    title: "Mobilitas",
    desc: "Aksesibilitas fisik untuk pengguna kursi roda, kruk, atau keterbatasan motorik. Fokus pada kelandaian ramp, lebar pintu, toilet khusus, dan ketiadaan undakan penghalang.",
  },
  {
    num: "02",
    title: "Netra",
    desc: "Kemudahan navigasi mandiri bagi penyandang tuna netra atau low-vision. Mencakup ubin pengarah (guiding block), huruf Braille pada lift, penunjuk arah kontras tinggi, dan asistensi audio.",
  },
  {
    num: "03",
    title: "Rungu",
    desc: "Kemandirian informasi bagi penyandang tuna rungu atau gangguan pendengaran. Menyoroti alarm visual lampu strobo, media petunjuk berbasis teks, dan tata letak ruang yang berorientasi visual.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-bg relative overflow-x-hidden">
      {/* Background Noise Texture */}
      <div 
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <Navbar />
      
      <main className="flex-1 flex flex-col w-full">
        
        {/* Section 1: Hero */}
        <section className="w-full bg-bg px-6 py-12 md:py-20 flex items-center justify-center">
          <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
            
            {/* Left Column: Headline and CTAs */}
            <div className="flex flex-col text-left">
              <span className="font-sans text-xs tracking-widest text-accent bg-accent/10 px-3 py-1 rounded-full mb-6 w-fit lowercase font-normal">
                sistem audit aksesibilitas gedung
              </span>
              
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-normal text-ink tracking-tight mb-4">
                Audit aksesibilitas <br className="hidden md:inline" />
                ruang publik Anda
              </h1>
              
              <p className="font-display italic text-lg md:text-xl text-ink-muted mb-6 leading-relaxed">
                Analisis cerdas fasilitas gedung, ramah disabilitas untuk semua.
              </p>
              
              {/* Pull Quote */}
              <div className="mb-8 border-l border-line pl-6 py-1">
                <div className="font-display text-5xl md:text-6xl font-normal text-accent leading-none tracking-tight mb-2">
                  12 kriteria
                </div>
                <div className="font-sans text-[10px] tracking-wider text-ink-muted uppercase">
                  berdasarkan SNI 8201:2015 & PP 42/2020
                </div>
              </div>
              
              {/* CTA Buttons */}
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/buildings/submit"
                  className="inline-flex items-center justify-center bg-accent text-white font-sans text-sm font-semibold px-6 py-3 rounded transition-all duration-150 ease-in-out hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(15,92,92,0.15)] hover:bg-accent/95 hover:opacity-100 cursor-pointer active:scale-[0.98]"
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
        </section>

        {/* Section 2: Disability Categories */}
        <section className="w-full bg-surface border-t border-line py-16 md:py-24 px-6 flex items-center justify-center">
          <div className="max-w-6xl w-full">
            <div className="mb-12 text-left">
              <span className="font-sans text-xs tracking-widest text-accent uppercase font-semibold">
                Kategori Fokus Audit
              </span>
              <h2 className="font-display text-3xl md:text-4xl font-normal text-ink mt-2">
                Standar Aksesibilitas Disabilitas
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-12">
              {categories.map((cat) => (
                <div key={cat.num} className="relative group py-2">
                  {/* Big Editorial Number behind text - shifted slightly so it doesn't crop */}
                  <div className="absolute -left-2 -top-8 font-display text-8xl md:text-9xl font-bold text-ink-muted/10 select-none pointer-events-none group-hover:text-accent/10 transition-colors duration-300">
                    {cat.num}
                  </div>
                  
                  {/* Text content offset slightly to look premium */}
                  <div className="relative pt-8 pl-4">
                    <h3 className="font-display text-xl md:text-2xl font-semibold text-ink group-hover:text-accent transition-colors duration-300 mb-3">
                      {cat.title}
                    </h3>
                    <p className="font-sans text-sm text-ink-muted leading-relaxed">
                      {cat.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      
      <Footer />
    </div>
  );
}
