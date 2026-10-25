const PETAL_ANGLES = [0, 72, 144, 216, 288];

function Flower({ x, y, rx, ry, r }: { x: number; y: number; rx: number; ry: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {PETAL_ANGLES.map((angle) => (
        <ellipse key={angle} cx="0" cy={-ry - 1} rx={rx} ry={ry} transform={`rotate(${angle})`} />
      ))}
      <circle cx="0" cy="0" r={r} />
    </g>
  );
}

/** Line-art spray drawn from the corner it is placed in. `full={false}` is the shorter variant. */
export function Floral({ full = true, className = "" }: { full?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="190"
      height="190"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      className={`decor pointer-events-none text-decor ${className}`}
    >
      <path d="M200 18 C150 40 120 70 96 120 C80 152 60 172 26 194" />
      <path d="M150 42 C140 30 128 26 110 28 C122 41 134 46 150 42 Z" />
      <path d="M118 82 C102 78 90 82 78 93 C94 99 106 95 118 82 Z" />
      <path d="M96 120 C108 106 122 102 140 104 C128 118 112 124 96 120 Z" />
      {full && <path d="M70 158 C56 150 44 150 30 156 C44 167 58 166 70 158 Z" />}
      <Flower x={168} y={80} rx={6} ry={11} r={3.5} />
      {full && <Flower x={58} y={128} rx={4} ry={7} r={2.5} />}
    </svg>
  );
}
