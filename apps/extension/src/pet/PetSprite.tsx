import type { PetState } from '@pet/shared';

/**
 * The built-in "mocha" skin, drawn as inline SVG.
 *
 * This is one implementation behind the renderer boundary (§10): a sprite-sheet
 * or Lottie skin becomes a sibling component, not a rewrite of the pet system.
 *
 * The group class names are the contract with pet.css — every animation, from
 * the tail flick to the ears flattening when Mocha sulks, is keyed off them.
 * Redrawing the cat means changing paths, never the group structure.
 */
export function PetSprite({ state }: { state: PetState }) {
  return (
    <svg className={`pet-svg is-${state}`} viewBox="0 0 130 130" aria-hidden="true">
      <ellipse className="pet-shadow" cx="65" cy="118" rx="31" ry="5.5" />
      <g className="g-all">
        {/* A cat's tail is the loud part: long, high, and curled at the tip. */}
        <g className="g-tail">
          <path
            d="M92 92 C 112 90, 120 70, 112 52 C 109 45, 103 43, 100 47"
            stroke="var(--fur)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M112 62 C 116 70, 115 78, 111 83"
            stroke="var(--cream)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            opacity="0.8"
          />
        </g>

        <g className="g-legB"><rect className="fur-d" x="74" y="94" width="13" height="20" rx="6.5" /></g>
        <g className="g-legF"><rect className="fur" x="44" y="94" width="13" height="20" rx="6.5" /></g>

        <g className="g-body">
          <rect className="fur" x="39" y="68" width="52" height="45" rx="22" />
          <ellipse className="cream" cx="65" cy="100" rx="16" ry="12" />
        </g>

        <g className="g-head">
          {/* Ears: tall triangles set wide, with the inner pink showing. */}
          <g className="g-earL">
            <path className="fur" d="M36 42 L34 8 L61 27 Z" />
            <path className="blush-solid" d="M41 38 L40 18 L54 28 Z" />
          </g>
          <g className="g-earR">
            <path className="fur" d="M94 42 L96 8 L69 27 Z" />
            <path className="blush-solid" d="M89 38 L90 18 L76 28 Z" />
          </g>

          <ellipse className="fur" cx="65" cy="54" rx="32" ry="27" />
          {/* The muzzle is two cheeks meeting under the nose — the cat shape. */}
          <path
            className="cream"
            d="M65 44 C 52 44, 43 52, 44 62 C 45 73, 55 79, 65 79 C 75 79, 85 73, 86 62 C 87 52, 78 44, 65 44 Z"
          />
          <ellipse className="blush" cx="43" cy="63" rx="7" ry="4.4" />
          <ellipse className="blush" cx="87" cy="63" rx="7" ry="4.4" />

          <g className="g-eyes">
            <g className="eyes-open">
              <ellipse className="coal" cx="53" cy="53" rx="5" ry="6.4" />
              <ellipse className="coal" cx="77" cy="53" rx="5" ry="6.4" />
              {/* A vertical slit, the way a cat's pupil catches light. */}
              <ellipse cx="53" cy="53" rx="1.5" ry="4.6" fill="var(--fur)" opacity="0.55" />
              <ellipse cx="77" cy="53" rx="1.5" ry="4.6" fill="var(--fur)" opacity="0.55" />
              <circle cx="54.8" cy="50.4" r="1.7" fill="#fff" />
              <circle cx="78.8" cy="50.4" r="1.7" fill="#fff" />
            </g>
            <g className="eyes-closed">
              <path d="M47.5 54 Q53 47.5 58.5 54" stroke="var(--coal)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
              <path d="M71.5 54 Q77 47.5 82.5 54" stroke="var(--coal)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            </g>
          </g>

          {/* Whiskers: three a side, and the single clearest "this is a cat" cue. */}
          <g className="whiskers" stroke="var(--coal)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" fill="none">
            <path d="M42 62 L23 58" />
            <path d="M42 65 L22 66" />
            <path d="M42 68 L24 73" />
            <path d="M88 62 L107 58" />
            <path d="M88 65 L108 66" />
            <path d="M88 68 L106 73" />
          </g>

          <path className="coal" d="M61.5 63 L68.5 63 L65 67.5 Z" />
          <path
            className="mouth-line"
            d="M65 67.5 L65 70 M65 70 Q60.5 75 57 70 M65 70 Q69.5 75 73 70"
            stroke="var(--coal)"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            className="mouth-open coal"
            cx="65"
            cy="73"
            rx="5.5"
            ry="4.6"
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
