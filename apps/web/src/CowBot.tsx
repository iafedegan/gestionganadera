/** La vaca asistente (el mismo personaje de CONtexto Ganadero), en SVG animado con CSS. */
export function CowBot({ size = 40 }: { size?: number }) {
  return (
    <svg
      className="cow-bot"
      viewBox="14 14 212 190"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g className="cow-bob">
        {/* cuernos */}
        <path
          d="M62 78 C30 70 18 44 26 22 C40 40 58 48 78 56 Z"
          fill="#f6ecd2"
          stroke="#3b2a1a"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M178 78 C210 70 222 44 214 22 C200 40 182 48 162 56 Z"
          fill="#f6ecd2"
          stroke="#3b2a1a"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* orejas */}
        <g className="cow-ear-l">
          <path
            d="M70 92 C40 80 22 92 20 104 C34 118 56 116 74 108 Z"
            fill="#8a5a3b"
            stroke="#3b2a1a"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M64 98 C48 94 36 98 33 104 C42 110 54 109 66 104 Z" fill="#f2a5a0" />
        </g>
        <g className="cow-ear-r">
          <path
            d="M170 92 C200 80 218 92 220 104 C206 118 184 116 166 108 Z"
            fill="#8a5a3b"
            stroke="#3b2a1a"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M176 98 C192 94 204 98 207 104 C198 110 186 109 174 104 Z" fill="#f2a5a0" />
        </g>
        {/* cabeza */}
        <path
          d="M120 38 C78 38 56 62 56 100 C56 126 66 150 80 168 C92 184 104 190 120 190 C136 190 148 184 160 168 C174 150 184 126 184 100 C184 62 162 38 120 38 Z"
          fill="#a8693f"
          stroke="#3b2a1a"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        {/* mechón y mancha */}
        <path
          d="M104 40 C108 56 116 62 120 62 C124 62 132 56 136 40 C128 36 112 36 104 40 Z"
          fill="#f3e3c3"
          stroke="#3b2a1a"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M84 70 C74 78 72 92 80 98 C88 92 92 80 84 70 Z" fill="#f3e3c3" opacity="0.85" />
        {/* ojos */}
        <g>
          <ellipse
            cx="94"
            cy="100"
            rx="15"
            ry="17"
            fill="#fff"
            stroke="#3b2a1a"
            strokeWidth="3.5"
          />
          <ellipse
            cx="146"
            cy="100"
            rx="15"
            ry="17"
            fill="#fff"
            stroke="#3b2a1a"
            strokeWidth="3.5"
          />
          <g className="cow-blink">
            <g className="cow-pupila">
              <circle cx="97" cy="102" r="8" fill="#2a1a0e" />
              <circle cx="100" cy="98" r="2.8" fill="#fff" />
            </g>
          </g>
          <g className="cow-blink cow-ojo-d">
            <g className="cow-pupila">
              <circle cx="143" cy="102" r="8" fill="#2a1a0e" />
              <circle cx="146" cy="98" r="2.8" fill="#fff" />
            </g>
          </g>
        </g>
        <path
          d="M78 80 C86 74 98 74 108 80"
          fill="none"
          stroke="#3b2a1a"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M132 80 C142 74 154 74 162 80"
          fill="none"
          stroke="#3b2a1a"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {/* hocico */}
        <ellipse
          cx="120"
          cy="156"
          rx="44"
          ry="30"
          fill="#f2a5a0"
          stroke="#3b2a1a"
          strokeWidth="4.5"
        />
        <ellipse cx="104" cy="152" rx="7" ry="9" fill="#7a3b3b" />
        <ellipse cx="136" cy="152" rx="7" ry="9" fill="#7a3b3b" />
        <path
          d="M100 172 C110 182 130 182 140 172"
          fill="none"
          stroke="#3b2a1a"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M116 166 C118 172 122 172 124 166"
          fill="none"
          stroke="#3b2a1a"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* argolla dorada */}
        <g className="cow-ring">
          <circle cx="120" cy="188" r="9" fill="none" stroke="#e0b34a" strokeWidth="4.5" />
        </g>
        {/* vaho */}
        <circle className="cow-steam" cx="92" cy="130" r="4" fill="#fff" />
        <circle className="cow-steam b" cx="148" cy="130" r="4" fill="#fff" />
      </g>
    </svg>
  );
}
