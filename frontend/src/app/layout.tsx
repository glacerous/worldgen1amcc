import type { Metadata } from "next";
import { Inter, Newsreader, IBM_Plex_Mono, Lexend } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aksesibilitas Audit",
  description: "Sistem Audit Aksesibilitas Gedung Multi-Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${newsreader.variable} ${ibmPlexMono.variable} ${lexend.variable} h-full antialiased`}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // 1. Base Font Size
                const savedSize = localStorage.getItem("aksesibel-text-size");
                if (savedSize) {
                  const sizeMap = {
                    normal: "16px",
                    besar: "18px",
                    "sangat-besar": "20px"
                  };
                  if (sizeMap[savedSize]) {
                    document.documentElement.style.setProperty("--base-font-size", sizeMap[savedSize]);
                  }
                }
                
                // 2. High Contrast
                if (localStorage.getItem("aksesibel_high_contrast") === "true") {
                  document.documentElement.classList.add("high-contrast");
                }
                
                // 3. Reduce Motion
                if (localStorage.getItem("aksesibel_reduce_motion") === "true") {
                  document.documentElement.classList.add("reduce-motion");
                }
                
                // 4. Dyslexia Font
                if (localStorage.getItem("aksesibel_dyslexia_font") === "true") {
                  document.documentElement.classList.add("dyslexia-font");
                }
                
                // 5. Large Targets
                if (localStorage.getItem("aksesibel_large_targets") === "true") {
                  document.documentElement.classList.add("large-targets");
                }
                
                // 6. Underline Links
                if (localStorage.getItem("aksesibel_underline_links") === "true") {
                  document.documentElement.classList.add("underline-links");
                }
                
                // 7. Line Spacing
                const savedSpacing = localStorage.getItem("aksesibel_line_spacing");
                const spacingMap = {
                  normal: "1.5",
                  lega: "1.8",
                  "sangat-lega": "2.2"
                };
                if (savedSpacing && spacingMap[savedSpacing]) {
                  document.documentElement.style.setProperty("--base-line-height", spacingMap[savedSpacing]);
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
