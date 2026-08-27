import type { PetState } from '@pet/shared';

/**
 * The built-in "mochi" skin, drawn as inline SVG.
 *
 * This is one implementation behind the renderer boundary (§10): a sprite-sheet
 * or Lottie skin becomes a sibling component, not a rewrite of the pet system.
 */
export function PetSprite({ state }: { state: PetState }) {
  return (
    <svg className={`pet-svg is-${state}`} viewBox="0 0 130 130" aria-hidden="true">
      <ellipse className="pet-shadow" cx="65" cy="118" rx="31" ry="5.5" />
      <g className="g-all">
        <g className="g-tail">
          <path d="M92 88 C 108 86, 116 70, 106 56" stroke="var(--fur)" strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d="M104 62 C 110 68, 110 76, 106 80" stroke="var(--cream)" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.85" />
        </g>

        <g className="g-legB"><rect className="fur-d" x="74" y="92" width="14" height="22" rx="7" /></g>
        <g className="g-legF"><rect className="fur" x="43" y="92" width="14" height="22" rx="7" /></g>

        <g className="g-body">
          <rect className="fur" x="38" y="66" width="54" height="46" rx="23" />
          <ellipse className="cream" cx="65" cy="98" rx="17" ry="13" />
        </g>

        <g className="g-head">
          <g className="g-earL">
            <path className="fur" d="M38 40 L40 12 L62 30 Z" />
            <path className="cream" d="M43 36 L44 21 L55 31 Z" />
          </g>
          <g className="g-earR">
            <path className="fur" d="M92 40 L90 12 L68 30 Z" />
            <path className="cream" d="M87 36 L86 21 L75 31 Z" />
          </g>

          <ellipse className="fur" cx="65" cy="52" rx="31" ry="28" />
          <path className="cream" d="M65 32 C 50 32, 40 46, 42 60 C 44 74, 55 80, 65 80 C 75 80, 86 74, 88 60 C 90 46, 80 32, 65 32 Z" />
          <ellipse className="blush" cx="44" cy="63" rx="7" ry="4.6" />
          <ellipse className="blush" cx="86" cy="63" rx="7" ry="4.6" />

          <g className="g-eyes">
            <g className="eyes-open">
              <ellipse className="coal" cx="53" cy="53" rx="4.6" ry="5.4" />
              <ellipse className="coal" cx="77" cy="53" rx="4.6" ry="5.4" />
              <circle cx="54.8" cy="51" r="1.7" fill="#fff" />
              <circle cx="78.8" cy="51" r="1.7" fill="#fff" />
            </g>
            <g className="eyes-closed">
              <path d="M47.5 54 Q53 47.5 58.5 54" stroke="var(--coal)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
              <path d="M71.5 54 Q77 47.5 82.5 54" stroke="var(--coal)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            </g>
          </g>

          <path className="coal" d="M61 63 Q65 60.5 69 63 Q65 68 61 63 Z" />
          <path
            className="mouth-line"
            d="M65 67 L65 69 M65 69 Q60 74 56 69 M65 69 Q70 74 74 69"
            stroke="var(--coal)"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            className="mouth-open coal"
            cx="65"
            cy="73"
            rx="6"
            ry="5"
            style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}
          />
        </g>
      </g>

      <g className="zzz" fill="var(--brand)" fontWeight="700">
        <text x="96" y="30" fontSize="13">z</text>
        <text x="96" y="30" fontSize="15">z</text>
        <text x="96" y="30" fontSize="17">z</text>
      </g>
      <g className="bang">
        <circle cx="103" cy="20" r="14" fill="var(--brand)" />
        <text x="103" y="27" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--panel)">!</text>
      </g>
    </svg>
  );
}
