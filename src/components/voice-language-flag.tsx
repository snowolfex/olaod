import type { ReactNode } from "react";

import type { VoiceTranscriptionLanguage } from "@/lib/voice-types";

type VoiceLanguageFlagProps = {
  language: VoiceTranscriptionLanguage;
  className?: string;
};

function FlagFrame({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="16" rx="3" fill="#ffffff" />
      {children}
      <rect width="24" height="16" rx="3" fill="none" stroke="rgba(15,23,42,0.14)" />
    </svg>
  );
}

export function VoiceLanguageFlag({ language, className = "h-4 w-6 shrink-0 rounded-[3px]" }: VoiceLanguageFlagProps) {
  switch (language) {
    case "auto":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#0f766e" />
          <circle cx="12" cy="8" r="4.2" fill="none" stroke="#ecfeff" strokeWidth="1.2" />
          <path d="M7.8 8h8.4M12 3.8c1.4 1.3 2.2 2.8 2.2 4.2S13.4 10.9 12 12.2c-1.4-1.3-2.2-2.8-2.2-4.2S10.6 5.1 12 3.8Z" fill="none" stroke="#ecfeff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </FlagFrame>
      );
    case "united-states":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#ffffff" />
          <rect width="24" height="1.23" y="0" fill="#b22234" />
          <rect width="24" height="1.23" y="2.46" fill="#b22234" />
          <rect width="24" height="1.23" y="4.92" fill="#b22234" />
          <rect width="24" height="1.23" y="7.38" fill="#b22234" />
          <rect width="24" height="1.23" y="9.84" fill="#b22234" />
          <rect width="24" height="1.23" y="12.3" fill="#b22234" />
          <rect width="10.5" height="8.6" rx="1.4" fill="#3c3b6e" />
          <circle cx="2.1" cy="1.7" r="0.34" fill="#ffffff" />
          <circle cx="4.1" cy="1.7" r="0.34" fill="#ffffff" />
          <circle cx="6.1" cy="1.7" r="0.34" fill="#ffffff" />
          <circle cx="8.1" cy="1.7" r="0.34" fill="#ffffff" />
          <circle cx="3.1" cy="3.2" r="0.34" fill="#ffffff" />
          <circle cx="5.1" cy="3.2" r="0.34" fill="#ffffff" />
          <circle cx="7.1" cy="3.2" r="0.34" fill="#ffffff" />
          <circle cx="2.1" cy="4.7" r="0.34" fill="#ffffff" />
          <circle cx="4.1" cy="4.7" r="0.34" fill="#ffffff" />
          <circle cx="6.1" cy="4.7" r="0.34" fill="#ffffff" />
          <circle cx="8.1" cy="4.7" r="0.34" fill="#ffffff" />
          <circle cx="3.1" cy="6.2" r="0.34" fill="#ffffff" />
          <circle cx="5.1" cy="6.2" r="0.34" fill="#ffffff" />
          <circle cx="7.1" cy="6.2" r="0.34" fill="#ffffff" />
        </FlagFrame>
      );
    case "arabic":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#0b7a3b" />
          <path d="M6 8.5h12" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="15.8" cy="10.8" r="0.8" fill="#ffffff" />
        </FlagFrame>
      );
    case "bengali":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#006a4e" />
          <circle cx="11" cy="8" r="4.1" fill="#f42a41" />
        </FlagFrame>
      );
    case "chinese":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#de2910" />
          <polygon points="6,3.2 6.8,5.3 9.1,5.3 7.2,6.6 8,8.8 6,7.4 4,8.8 4.8,6.6 2.9,5.3 5.2,5.3" fill="#ffde00" />
        </FlagFrame>
      );
    case "united-kingdom":
    case "english":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#1f4aa8" />
          <path d="M0 1.4 8.2 6.6M15.8 9.4 24 14.6M24 1.4 15.8 6.6M8.2 9.4 0 14.6" stroke="#ffffff" strokeWidth="3" />
          <path d="M0 1.4 8.2 6.6M15.8 9.4 24 14.6M24 1.4 15.8 6.6M8.2 9.4 0 14.6" stroke="#cf142b" strokeWidth="1.4" />
          <path d="M12 0v16M0 8h24" stroke="#ffffff" strokeWidth="4.6" />
          <path d="M12 0v16M0 8h24" stroke="#cf142b" strokeWidth="2.4" />
        </FlagFrame>
      );
    case "farsi":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="5.33" y="0" fill="#239f40" />
          <rect width="24" height="5.34" y="5.33" fill="#ffffff" />
          <rect width="24" height="5.33" y="10.67" fill="#da0000" />
          <circle cx="12" cy="8" r="1.2" fill="#da0000" />
        </FlagFrame>
      );
    case "french":
      return (
        <FlagFrame className={className}>
          <rect width="8" height="16" fill="#0055a4" />
          <rect x="8" width="8" height="16" fill="#ffffff" />
          <rect x="16" width="8" height="16" fill="#ef4135" />
        </FlagFrame>
      );
    case "hindi":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="5.33" y="0" fill="#ff9933" />
          <rect width="24" height="5.34" y="5.33" fill="#ffffff" />
          <rect width="24" height="5.33" y="10.67" fill="#138808" />
          <circle cx="12" cy="8" r="1.5" fill="none" stroke="#000080" strokeWidth="0.9" />
        </FlagFrame>
      );
    case "japanese":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#ffffff" />
          <circle cx="12" cy="8" r="4.2" fill="#bc002d" />
        </FlagFrame>
      );
    case "korean":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#ffffff" />
          <path d="M12 4.2a3.8 3.8 0 0 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" fill="#cd2e3a" />
          <path d="M12 11.8a3.8 3.8 0 0 1 0-7.6 3.8 3.8 0 0 1 0 7.6Z" fill="#0047a0" />
        </FlagFrame>
      );
    case "portuguese":
      return (
        <FlagFrame className={className}>
          <rect width="10" height="16" fill="#006600" />
          <rect x="10" width="14" height="16" fill="#ff0000" />
          <circle cx="10.5" cy="8" r="3.2" fill="#ffcc29" />
        </FlagFrame>
      );
    case "russian":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="5.33" y="0" fill="#ffffff" />
          <rect width="24" height="5.34" y="5.33" fill="#0039a6" />
          <rect width="24" height="5.33" y="10.67" fill="#d52b1e" />
        </FlagFrame>
      );
    case "spanish":
      return (
        <FlagFrame className={className}>
          <rect width="24" height="4" y="0" fill="#aa151b" />
          <rect width="24" height="8" y="4" fill="#f1bf00" />
          <rect width="24" height="4" y="12" fill="#aa151b" />
        </FlagFrame>
      );
    default:
      return (
        <FlagFrame className={className}>
          <rect width="24" height="16" rx="3" fill="#64748b" />
        </FlagFrame>
      );
  }
}
