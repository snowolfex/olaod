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
  ringStart: string;
  ringEnd: string;
  ringStroke: string;
  lStart: string;
  lEnd: string;
  gloss: string;
  shadow: string;
}> = {
  light: {
    badgeText: "Warm monogram",
    cardBorder: "border-white/45",
    stageBackground: "linear-gradient(180deg,#fbf3e8 0%,#f0e2d2 58%,#e8d6c3 100%)",
    innerGlow: "rgba(255,255,255,0.45)",
    ringStart: "#FFE0B4",
    ringEnd: "#B05C25",
    ringStroke: "#6F3714",
    lStart: "#7F3F1B",
    lEnd: "#F2B06C",
    gloss: "#FFF6E5",
    shadow: "rgba(77,56,38,0.18)",
  },
  tech: {
    badgeText: "Signal monogram",
    cardBorder: "border-cyan-200/25",
    stageBackground: "linear-gradient(180deg,#18283a 0%,#102133 55%,#0f1b28 100%)",
    innerGlow: "rgba(116,241,255,0.1)",
    ringStart: "#FFD196",
    ringEnd: "#B7642A",
    ringStroke: "#85E6F6",
    lStart: "#8B431B",
    lEnd: "#FFD28C",
    gloss: "#DDFCFF",
    shadow: "rgba(2,14,20,0.34)",
  },
  dark: {
    badgeText: "Midnight monogram",
    cardBorder: "border-white/10",
    stageBackground: "linear-gradient(180deg,#2a2527 0%,#1d171b 55%,#140f13 100%)",
    innerGlow: "rgba(255,255,255,0.06)",
    ringStart: "#F6C88D",
    ringEnd: "#B15928",
    ringStroke: "#F2E0CB",
    lStart: "#7D3519",
    lEnd: "#EFA45A",
    gloss: "#FFE8CF",
    shadow: "rgba(0,0,0,0.34)",
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
          <svg viewBox="0 0 180 180" role="img" aria-label="OL brand icon preview" className="h-auto w-full">
            <defs>
              <linearGradient id={`ring-${theme}`} x1="24" y1="24" x2="132" y2="132" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={palette.ringStart} />
                <stop offset="100%" stopColor={palette.ringEnd} />
              </linearGradient>
              <linearGradient id={`letter-${theme}`} x1="96" y1="40" x2="96" y2="128" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={palette.lEnd} />
                <stop offset="100%" stopColor={palette.lStart} />
              </linearGradient>
            </defs>
            <ellipse cx="90" cy="152" rx="40" ry="11" fill={palette.shadow} />
            <g transform="translate(16 14)">
              <circle cx="72" cy="72" r="50" fill={`url(#ring-${theme})`} />
              <circle cx="72" cy="72" r="27" fill="rgba(255,255,255,0.94)" />
              <path d="M72 22a50 50 0 0 1 48 37" fill="none" stroke={palette.gloss} strokeWidth="8" strokeLinecap="round" opacity="0.72" />
              <path d="M100 44h16v50h29v16H100z" fill={`url(#letter-${theme})`} />
              <circle cx="72" cy="72" r="50" fill="none" stroke={palette.ringStroke} strokeWidth="3.5" opacity="0.5" />
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