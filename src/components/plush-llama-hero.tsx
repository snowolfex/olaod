"use client";

import { useEffect, useMemo, useState } from "react";

import { parseAppTheme, type AppThemeId } from "@/lib/theme";

type PlushLlamaHeroProps = {
  badge: string;
  title: string;
  description: string;
  summary: string;
  detailLeftTitle: string;
  detailLeftBody: string;
  detailRightTitle: string;
  detailRightBody: string;
  compact?: boolean;
};

const paletteByTheme: Record<AppThemeId, {
  badgeText: string;
  cardBorder: string;
  stageBackground: string;
  innerGlow: string;
  wool: string;
  woolShadow: string;
  face: string;
  nose: string;
  eye: string;
  highlight: string;
  blush: string;
  accent: string;
  innerArmShadow: string;
}> = {
  light: {
    badgeText: "Premium cream",
    cardBorder: "border-white/45",
    stageBackground: "linear-gradient(180deg,#fbf3e8 0%,#f0e2d2 58%,#e8d6c3 100%)",
    innerGlow: "rgba(255,255,255,0.45)",
    wool: "#F2E3CF",
    woolShadow: "#CDB198",
    face: "#D6BC9A",
    nose: "#6A4A38",
    eye: "#241A16",
    highlight: "#FFF8EF",
    blush: "#EFCBB7",
    accent: "#557F7A",
    innerArmShadow: "#CDB198",
  },
  tech: {
    badgeText: "Tech plush",
    cardBorder: "border-cyan-200/25",
    stageBackground: "linear-gradient(180deg,#18283a 0%,#102133 55%,#0f1b28 100%)",
    innerGlow: "rgba(116,241,255,0.1)",
    wool: "#E7DCCB",
    woolShadow: "#B6A48C",
    face: "#D3BEA4",
    nose: "#5A4136",
    eye: "#0E141A",
    highlight: "#EFFFFF",
    blush: "#C9B39E",
    accent: "#59D0D4",
    innerArmShadow: "#8A837D",
  },
  dark: {
    badgeText: "Midnight plush",
    cardBorder: "border-white/10",
    stageBackground: "linear-gradient(180deg,#2a2527 0%,#1d171b 55%,#140f13 100%)",
    innerGlow: "rgba(255,255,255,0.06)",
    wool: "#66524C",
    woolShadow: "#443532",
    face: "#B59B84",
    nose: "#2D1F1C",
    eye: "#120E0D",
    highlight: "#F7E5D6",
    blush: "#C59A8C",
    accent: "#D06A52",
    innerArmShadow: "#362B29",
  },
};

export function PlushLlamaHero({
  badge,
  title,
  description,
  summary,
  detailLeftTitle,
  detailLeftBody,
  detailRightTitle,
  detailRightBody,
  compact = false,
}: PlushLlamaHeroProps) {
  const [theme, setTheme] = useState<AppThemeId>("light");
  const isExpandedLayout = !compact;

  useEffect(() => {
    setTheme(parseAppTheme(document.documentElement.dataset.theme));
  }, []);

  const palette = useMemo(() => paletteByTheme[theme], [theme]);

  return (
    <div className={`theme-surface-soft rounded-[24px] border ${palette.cardBorder} ${isExpandedLayout ? "px-5 py-5" : "px-4 py-4"} shadow-[0_18px_45px_rgba(77,56,38,0.12)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className={isExpandedLayout ? "max-w-[30rem]" : ""}>
          <p className="eyebrow text-muted">{badge}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
          <p className={`mt-2 text-muted ${isExpandedLayout ? "text-sm leading-6" : "text-xs leading-5"}`}>{description}</p>
        </div>
        <span className="ui-pill ui-pill-label">{palette.badgeText}</span>
      </div>

      <div className={`mt-4 grid gap-4 ${compact ? "lg:grid-cols-[148px_minmax(0,1fr)] lg:items-center" : "sm:grid-cols-[176px_minmax(0,1fr)] sm:items-start xl:grid-cols-[188px_minmax(0,1fr)]"}`}>
        <div
          className={`relative overflow-hidden rounded-[22px] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${isExpandedLayout ? "min-h-[188px]" : ""}`}
          style={{
            background: palette.stageBackground,
            boxShadow: `inset 0 1px 0 ${palette.innerGlow}`,
          }}
        >
          <svg viewBox="0 0 180 180" role="img" aria-label="Plush llama mascot preview" className="h-auto w-full">
            <ellipse cx="90" cy="154" rx="38" ry="9" fill="rgba(91,69,58,0.12)" />
            <g>
              <ellipse cx="63" cy="47" rx="12" ry="28" fill={palette.wool} transform="rotate(-14 63 47)" />
              <ellipse cx="117" cy="47" rx="12" ry="28" fill={palette.wool} transform="rotate(14 117 47)" />
              <ellipse cx="66" cy="49" rx="5" ry="16" fill={palette.face} transform="rotate(-14 66 49)" />
              <ellipse cx="114" cy="49" rx="5" ry="16" fill={palette.face} transform="rotate(14 114 49)" />
              <circle cx="90" cy="78" r="42" fill={palette.wool} />
              <ellipse cx="90" cy="122" rx="30" ry="22" fill={palette.wool} />
              <path d="M77 103c4 7 10 10 19 11c10 1 20-1 28-7c7 6 15 8 23 7c-4 8-11 14-20 16c-15 4-35 2-47-6c-7-4-11-12-3-21z" fill={palette.wool} />
              <ellipse cx="90" cy="84" rx="27" ry="21" fill={palette.face} />
              <path d="M76 42c4-11 10-16 15-17c1 7 4 13 10 18" fill={palette.wool} />
              <path d="M88 31c5-4 9-6 13-7c1 5 5 10 11 16" fill={palette.wool} />
              <path d="M101 36c5-3 8-4 11-5c0 4 2 8 6 12" fill={palette.wool} />
              <ellipse cx="78" cy="74" rx="4.5" ry="5.5" fill={palette.eye} />
              <ellipse cx="104" cy="74" rx="4.5" ry="5.5" fill={palette.eye} />
              <circle cx="76.5" cy="72.5" r="1.4" fill={palette.highlight} />
              <circle cx="102.5" cy="72.5" r="1.4" fill={palette.highlight} />
              <ellipse cx="88" cy="88" rx="5.5" ry="4.5" fill={palette.nose} />
              <path d="M77 102c4 5 9 7 14 7c5 0 10-2 14-7" fill="none" stroke={palette.nose} strokeWidth="3.5" strokeLinecap="round" />
              <ellipse cx="75" cy="93" rx="6" ry="3.2" fill={palette.blush} opacity="0.28" />
              <ellipse cx="108" cy="93" rx="6" ry="3.2" fill={palette.blush} opacity="0.28" />
              <path d="M59 104c-10 7-17 18-20 34c-1 7 2 13 8 14c7 1 13-3 19-9c6-8 10-18 13-31c2-9 1-15-3-20z" fill={palette.wool} />
              <path d="M74 107c-5 6-8 13-10 22c-2 8-2 15 0 22c-4-1-7-4-9-7c-2-4-2-9 0-15c3-10 9-18 19-27c1 2 1 3 0 5z" fill={palette.innerArmShadow} opacity="0.42" />
              <path d="M49 143c4-4 9-6 15-6c4 0 8 1 10 4c-2 7-7 13-15 18c-5 3-10 4-14 2c-3-2-5-4-4-8c1-4 4-7 8-10z" fill={palette.accent} opacity="0.9" />
              <path d="M121 104c10 7 17 18 20 34c1 7-2 13-8 14c-7 1-13-3-19-9c-6-8-10-18-13-31c-2-9-1-15 3-20z" fill={palette.wool} />
              <path d="M106 107c5 6 8 13 10 22c2 8 2 15 0 22c4-1 7-4 9-7c2-4 2-9 0-15c-3-10-9-18-19-27c-1 2-1 3 0 5z" fill={palette.innerArmShadow} opacity="0.42" />
              <path d="M131 143c-4-4-9-6-15-6c-4 0-8 1-10 4c2 7 7 13 15 18c5 3 10 4 14 2c3-2 5-4 4-8c-1-4-4-7-8-10z" fill={palette.accent} opacity="0.9" />
              {theme === "tech" ? <rect x="98" y="68" width="24" height="5" rx="2.5" fill={palette.accent} opacity="0.9" /> : null}
              {theme === "dark" ? <rect x="93" y="100" width="28" height="5" rx="2.5" fill={palette.accent} opacity="0.8" /> : null}
            </g>
          </svg>
        </div>

        <div className={`grid text-muted ${isExpandedLayout ? "gap-3 text-[13px] leading-6 sm:text-sm" : "gap-2 text-xs sm:text-[13px]"}`}>
          <div className={`rounded-[16px] border border-white/20 bg-white/55 px-3 dark:bg-white/5 ${isExpandedLayout ? "py-3" : "py-2"}`}>
            {summary}
          </div>
          <div className={`grid gap-2 ${isExpandedLayout ? "xl:grid-cols-2" : "sm:grid-cols-2"}`}>
            <div className={`rounded-[16px] border border-white/20 bg-white/55 px-3 dark:bg-white/5 ${isExpandedLayout ? "min-h-[116px] py-3" : "py-2"}`}>
              <p className="font-semibold text-foreground">{detailLeftTitle}</p>
              <p className="mt-1">{detailLeftBody}</p>
            </div>
            <div className={`rounded-[16px] border border-white/20 bg-white/55 px-3 dark:bg-white/5 ${isExpandedLayout ? "min-h-[116px] py-3" : "py-2"}`}>
              <p className="font-semibold text-foreground">{detailRightTitle}</p>
              <p className="mt-1">{detailRightBody}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}