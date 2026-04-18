/**
 * Decorative SVG glyphs for the site — hand-drawn-feeling sprouts, stars, leaves.
 * Painted strokes, not geometric icons. Used as accents, never as functional UI.
 */

type DecoProps = {
  className?: string;
  color?: string;
  style?: React.CSSProperties;
};

export function Sprout({ className, color = "currentColor", style }: DecoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M32 58 C 32 44 32 36 32 30"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M32 34 C 22 30 14 26 10 18 C 20 18 28 22 32 32"
        fill={color}
        opacity="0.9"
      />
      <path
        d="M32 28 C 42 24 50 22 56 14 C 48 12 40 16 34 26"
        fill={color}
        opacity="0.75"
      />
    </svg>
  );
}

export function LeafSpray({ className, color = "currentColor", style }: DecoProps) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M10 70 Q 40 30 110 14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M35 48 Q 48 38 52 28 Q 42 32 35 48Z" fill={color} opacity="0.85" />
      <path d="M62 32 Q 76 24 82 14 Q 70 18 62 32Z" fill={color} opacity="0.75" />
      <path d="M88 22 Q 100 16 108 8 Q 98 10 88 22Z" fill={color} opacity="0.6" />
    </svg>
  );
}

export function Sparkle({ className, color = "currentColor", style }: DecoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M12 2 L 13.4 9 L 20 10 L 13.4 11.2 L 12 18 L 10.6 11.2 L 4 10 L 10.6 9 Z"
        fill={color}
      />
    </svg>
  );
}

export function SunDrawing({ className, color = "currentColor", style }: DecoProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <circle
        cx="40"
        cy="40"
        r="14"
        stroke={color}
        strokeWidth="2.4"
        fill="none"
        strokeDasharray="3 3"
      />
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * Math.PI * 2) / 8;
        const x1 = 40 + Math.cos(angle) * 22;
        const y1 = 40 + Math.sin(angle) * 22;
        const x2 = 40 + Math.cos(angle) * 32;
        const y2 = 40 + Math.sin(angle) * 32;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/**
 * Soft painted "blob" backgrounds for atmospheric depth.
 * Blur applied via CSS utility `watercolor-blob`.
 */
export function Blob({
  className,
  color = "currentColor",
  style,
  variant = "a",
}: DecoProps & { variant?: "a" | "b" | "c" }) {
  const paths = {
    a: "M48.5,-62.3C61.5,-52.2,69.7,-34.8,72.8,-17.1C75.8,0.6,73.7,18.5,64.9,32.4C56.1,46.4,40.6,56.3,24.1,62.2C7.7,68.1,-9.8,70,-26.6,65.3C-43.4,60.7,-59.5,49.6,-66.5,34.6C-73.6,19.6,-71.6,0.8,-65.7,-15.6C-59.8,-32,-50,-46.1,-37.1,-56.4C-24.2,-66.7,-8.3,-73.3,6.4,-71.4C21.2,-69.4,35.4,-72.5,48.5,-62.3Z",
    b: "M41.4,-57.2C52.5,-50.1,59.2,-35.7,63.4,-21.3C67.5,-6.9,69.2,7.5,65.3,20.3C61.4,33.1,51.9,44.3,40.2,52.1C28.5,59.9,14.3,64.3,-0.9,65.6C-16.1,66.8,-32.2,65,-43.8,56.8C-55.4,48.7,-62.5,34.3,-65.8,19.4C-69.1,4.4,-68.6,-11.1,-62.5,-23.7C-56.4,-36.3,-44.7,-46,-32,-53.4C-19.3,-60.8,-5.6,-65.8,9.3,-67.7C24.2,-69.5,30.3,-64.3,41.4,-57.2Z",
    c: "M37.9,-48.7C49.6,-41.8,60.3,-31.5,64.4,-19.1C68.5,-6.7,66,7.8,60,20.9C54,34,44.5,45.8,32.5,54C20.6,62.3,6.2,67.1,-8.5,66.1C-23.2,65.2,-38.3,58.5,-48.8,47.6C-59.3,36.8,-65.3,21.7,-66.6,6.1C-68,-9.6,-64.8,-25.8,-56.1,-37.6C-47.5,-49.3,-33.5,-56.5,-19.8,-60.5C-6,-64.5,7.6,-65.2,19.6,-62.3C31.6,-59.4,41.3,-52.8,37.9,-48.7Z",
  };
  return (
    <svg
      viewBox="-80 -80 160 160"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[variant]} fill={color} />
    </svg>
  );
}
