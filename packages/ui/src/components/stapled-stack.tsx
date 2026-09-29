import { cn } from '../lib/utils';

export interface StapledStackProps {
  /** Accessible description of the whole picture. */
  label: string;
  photoCaption: string;
  videoCaption: string;
  videoDuration: string;
  /** Short file-type badge, e.g. "PDF". */
  documentKind: string;
  documentTitle: string;
  note: string;
  noteAuthor: string;
  className?: string;
}

const QR_MODULES =
  'M8 0h1v2H8zM10 1h2v1h-2zM9 3h2v2H9zM8 6h1v2H8zM11 6h2v1h-2zM10 8h3v1h-3zM0 8h2v1H0zM3 8h2v2H3zM6 9h2v1H6zM1 10h1v2H1zM4 11h3v1H4zM8 10h2v2H8zM11 10h1v3h-1zM13 9h2v2h-2zM16 8h2v1h-2zM19 8h2v2h-2zM15 11h3v1h-3zM19 11h1v2h-1zM9 13h2v1H9zM13 13h2v2h-2zM16 13h2v1h-2zM8 15h1v3H8zM10 15h2v2h-2zM17 15h2v2h-2zM14 16h2v1h-2zM10 18h1v3h-1zM12 18h3v1h-3zM16 18h1v3h-1zM18 18h3v1h-3zM13 20h2v1h-2zM19 20h2v1h-2z';

/**
 * The hero picture: guest moments (photo, video, programme PDF, a note) and a QR code,
 * clipped by one staple. Purely presentational; all text comes from the caller (i18n).
 */
function StapledStack({
  label,
  photoCaption,
  videoCaption,
  videoDuration,
  documentKind,
  documentTitle,
  note,
  noteAuthor,
  className,
}: StapledStackProps) {
  return (
    <div role="img" aria-label={label} className={cn('flex justify-center', className)}>
      <div className="st-stack" aria-hidden="true">
        <div className="st-stack-inner">
          <div className="st-tile st-photo">
            <div className="st-shot">
              <svg viewBox="0 0 100 110" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2=".5">
                    <stop offset="0" stopColor="#F6C891" />
                    <stop offset=".6" stopColor="#EE9A6E" />
                    <stop offset="1" stopColor="#C96E78" />
                  </linearGradient>
                  <radialGradient id="st-sun" cx=".66" cy=".36" r=".45">
                    <stop offset="0" stopColor="#FFF1CF" stopOpacity=".9" />
                    <stop offset="1" stopColor="#FFF1CF" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="100" height="110" fill="url(#st-sky)" />
                <rect width="100" height="110" fill="url(#st-sun)" />
                <circle cx="66" cy="40" r="8" fill="#FFE7B0" />
                <path d="M0 50 H100 V110 H0Z" fill="#5E4A78" />
                <g fill="#2A2034">
                  <circle cx="30" cy="38" r="5" />
                  <rect x="21" y="45" width="18" height="70" rx="8" />
                  <circle cx="45" cy="36.5" r="5.2" />
                  <rect x="36" y="44" width="19" height="70" rx="8" transform="rotate(-6 45 60)" />
                </g>
              </svg>
              <span className="st-veil" />
            </div>
            <span className="st-meta">{photoCaption}</span>
          </div>

          <div className="st-tile st-video">
            <svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice">
              <defs>
                <radialGradient id="st-lamp" cx=".5" cy=".5" r=".5">
                  <stop offset="0" stopColor="#FFC98A" stopOpacity=".95" />
                  <stop offset=".35" stopColor="#FFB066" stopOpacity=".45" />
                  <stop offset="1" stopColor="#FFB066" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="st-room" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2E2533" />
                  <stop offset="1" stopColor="#15121B" />
                </linearGradient>
              </defs>
              <rect width="160" height="110" fill="url(#st-room)" />
              <circle cx="34" cy="30" r="26" fill="url(#st-lamp)" />
              <circle cx="122" cy="22" r="20" fill="url(#st-lamp)" opacity=".8" />
              <circle cx="84" cy="40" r="14" fill="url(#st-lamp)" opacity=".55" />
              <path d="M0 92 H160 V110 H0Z" fill="#110E15" />
              <g fill="#0B090E">
                <circle cx="66" cy="50" r="6" />
                <path d="M58 92 q-2 -22 4 -32 q4 -4 8 0 q6 10 4 32z" />
                <circle cx="92" cy="47" r="6.4" />
                <path d="M83 92 q-1 -24 5 -34 q4 -4 8 0 q7 10 5 34z" />
              </g>
            </svg>
            <span className="st-veil" />
            <span className="st-play">
              <span>
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path d="M5 3.2v9.6L12.6 8z" fill="#1E1A24" />
                </svg>
              </span>
            </span>
            <span className="st-dur">{videoDuration}</span>
            <span className="st-meta">{videoCaption}</span>
          </div>

          <div className="st-tile st-doc">
            <span className="st-badge">{documentKind}</span>
            <p className="st-doc-name">{documentTitle}</p>
            <div className="st-line w-[92%]" />
            <div className="st-line w-[78%]" />
            <div className="st-line w-[86%]" />
          </div>

          <div className="st-tile st-note">
            <p>{note}</p>
            <small>{noteAuthor}</small>
          </div>

          <div className="st-tile st-qr">
            <svg viewBox="0 0 21 21" shapeRendering="crispEdges">
              <g fill="currentColor">
                <path d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2z" fillRule="evenodd" />
                <path d="M14 0h7v7h-7zm1 1v5h5V1zm1 1h3v3h-3z" fillRule="evenodd" />
                <path d="M0 14h7v7H0zm1 1v5h5v-5zm1 1h3v3H2z" fillRule="evenodd" />
                <path d={QR_MODULES} />
              </g>
              <rect x="8.5" y="8.5" width="4" height="4" rx=".8" fill="var(--accent-warm)" />
            </svg>
          </div>

          <svg className="st-staple" viewBox="0 0 120 34">
            <path
              d="M8 30 V8 a4 4 0 0 1 4-4 h96 a4 4 0 0 1 4 4 V30"
              fill="none"
              stroke="var(--staple)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 6.5 h92"
              stroke="var(--staple-shine)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export { StapledStack };
