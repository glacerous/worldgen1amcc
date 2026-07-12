"use client";

const sampleCards = [
  {
    code: "SNI-8201-M1",
    description: "Ramp dengan kemiringan wajar (maksimal 8 derajat) dan dilengkapi dengan handrail.",
    statusLabel: "Terpenuhi",
    statusBg: "rgba(47,111,78,0.10)",
    statusColor: "#2F6F4E",
    statusBorder: "rgba(47,111,78,0.25)",
    agent: "visual_agent",
  },
  {
    code: "SNI-8201-M2",
    description: "Lebar pintu masuk utama bersih minimal 90 cm tanpa anak tangga menghalangi.",
    statusLabel: "Terpenuhi",
    statusBg: "rgba(47,111,78,0.10)",
    statusColor: "#2F6F4E",
    statusBorder: "rgba(47,111,78,0.25)",
    agent: "visual_agent",
  },
  {
    code: "SNI-8201-M4",
    description: "Toilet khusus dengan ruang putar kursi roda, pintu geser, dan grab bars.",
    statusLabel: "Tidak Terpenuhi",
    statusBg: "rgba(179,70,50,0.10)",
    statusColor: "#B34632",
    statusBorder: "rgba(179,70,50,0.25)",
    agent: "visual_agent",
  },
  {
    code: "SNI-8201-N1",
    description: "Ubin pengarah dan ubin peringatan terpasang menerus dari luar hingga lobby utama.",
    statusLabel: "Terpenuhi",
    statusBg: "rgba(47,111,78,0.10)",
    statusColor: "#2F6F4E",
    statusBorder: "rgba(47,111,78,0.25)",
    agent: "text_agent",
  },
  {
    code: "SNI-8201-N3",
    description: "Tombol kontrol lift dilengkapi huruf Braille timbul dan sistem pandu suara aktif.",
    statusLabel: "Tidak Diketahui",
    statusBg: "rgba(138,133,120,0.10)",
    statusColor: "#8A8578",
    statusBorder: "rgba(138,133,120,0.25)",
    agent: "resolver_agent",
  },
  {
    code: "SNI-8201-R1",
    description: "Terdapat sistem alarm kebakaran visual berupa lampu strobo di area toilet.",
    statusLabel: "Tidak Relevan",
    statusBg: "rgba(74,111,165,0.10)",
    statusColor: "#4A6FA5",
    statusBorder: "rgba(74,111,165,0.25)",
    agent: "text_agent",
  },
];

// Duplicate the list for seamless infinite loop
const doubledCards = [...sampleCards, ...sampleCards];

export default function CardMarquee() {
  return (
    <div
      style={{
        position: "relative",
        height: "640px",
        overflow: "hidden",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, white 14%, white 86%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, white 14%, white 86%, transparent 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          animation: "marquee-down 30s linear infinite",
          willChange: "transform",
        }}
      >
        {doubledCards.map((card, idx) => (
          <div
            key={idx}
            className="staggered-card"
            style={{
              background: "#FFFFFF",
              border: "1px solid #DFD9CD",
              borderRadius: "6px",
              padding: "18px 20px",
              transition: "border-color 0.2s",
              animationDelay: `${idx * 0.15}s`,
            }}
          >
            {/* Card header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "10px",
                paddingBottom: "10px",
                borderBottom: "1px solid rgba(223,217,205,0.5)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: "10px",
                  color: "#6B665F",
                  letterSpacing: "0.08em",
                }}
              >
                {card.code}
              </span>
              <span
                style={{
                  background: card.statusBg,
                  color: card.statusColor,
                  border: `1px solid ${card.statusBorder}`,
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                {card.statusLabel}
              </span>
            </div>

            {/* Card body */}
            <p
              style={{
                fontFamily: "var(--font-newsreader), serif",
                fontSize: "15px",
                color: "#2C2B29",
                lineHeight: 1.55,
                margin: "0 0 12px 0",
              }}
            >
              "{card.description}"
            </p>

            {/* Card footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "10px",
                fontFamily: "var(--font-inter), sans-serif",
                color: "#6B665F",
              }}
            >
              <span>Evaluasi Agen</span>
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontWeight: 600,
                  color: "#0F5C5C",
                }}
              >
                {card.agent}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
