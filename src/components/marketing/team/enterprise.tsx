/** "Security": four cards about how data is handled, and a link to the security docs. */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Download, EyeOff, KeyRound, ServerCog, type LucideIcon } from "lucide-react";
import { Section, SectionHeading } from "./section";

function icon(Icon: LucideIcon): ReactNode {
  return <Icon aria-hidden size={22} strokeWidth={1.6} color="#1A1A1A" className="shrink-0" />;
}

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "No browser access to the database",
    body: "Only the server talks to the database, and it checks your session on every request.",
    icon: icon(ServerCog),
  },
  {
    title: "Keys encrypted on disk",
    body: "Your Orgo key and any connector keys are sealed with AES-256-GCM before they are saved.",
    icon: icon(KeyRound),
  },
  {
    title: "Take it with you, or wipe it",
    body: "Settings lets you download everything as a zip or erase it.",
    icon: icon(Download),
  },
  {
    title: "Nothing public unless you say so",
    body: "A task is only visible to others once you create a share link, and shared pages mask anything that looks like a secret.",
    icon: icon(EyeOff),
  },
];

export function EnterpriseReady() {
  return (
    <Section className="flex flex-col gap-[28px] pt-16 md:pt-[110px]">
      <SectionHeading>Security</SectionHeading>
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="flex flex-col gap-[8px] rounded-[14px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[22px]"
          >
            {feature.icon}
            <h3 className="pt-[20px] text-[15px] leading-[18px] font-semibold text-[var(--om-text-1)]">{feature.title}</h3>
            <p className="text-[13.5px] leading-[19px] text-[var(--om-text-3)]">{feature.body}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <Link
          href="/docs/security"
          className="flex h-[35px] items-center gap-[4px] rounded-full border border-[var(--om-btn-border)] px-[14px] text-[14px] leading-[18px] font-medium text-[var(--om-text-1)] transition-colors hover:bg-[var(--om-fill-subtle)]"
        >
          How your data is handled
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      </div>
    </Section>
  );
}
