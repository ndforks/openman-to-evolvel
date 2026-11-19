"use client";

import { CloudUpload, TrendingUp, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listWebsites } from "@/lib/websites/client";
import type { Website } from "@/lib/websites/types";
import { stashPrompt } from "@/components/composer/handoff";
import {
  WEBSITE_CATEGORIES,
  WEBSITE_FEATURES,
  WEBSITE_TEMPLATES,
  type WebsiteCategory,
  type WebsiteFeatureIcon,
} from "../data/websites";
import { NEW_TASK_HREF } from "../routes";
import { PageShell, PillTabs, PrimaryButton, type PillTab } from "../ui";
import { RecentSites, SitesList } from "./MySites";
import { SitePreview, templateThumb } from "./WebsiteArt";

type Filter = "All" | WebsiteCategory;

const TABS: PillTab<Filter>[] = [
  { id: "All", label: "All" },
  ...WEBSITE_CATEGORIES.map((c) => ({ id: c, label: c })),
];

const FEATURE_ICONS: Record<WebsiteFeatureIcon, ReactNode> = {
  build: <WandSparkles size={17} strokeWidth={1.7} aria-hidden />,
  publish: <CloudUpload size={17} strokeWidth={1.7} aria-hidden />,
  run: <TrendingUp size={17} strokeWidth={1.7} aria-hidden />,
};

export function WebsitesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const [showExplore, setShowExplore] = useState(true);
  const [sites, setSites] = useState<Website[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    listWebsites()
      .then(({ sites }) => setSites(sites))
      .catch(() => setSites([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const templates = useMemo(
    () =>
      filter === "All"
        ? WEBSITE_TEMPLATES
        : WEBSITE_TEMPLATES.filter((t) => t.category === filter),
    [filter],
  );
  /** Opens Home with the prompt waiting in the composer. */
  const start = (prompt = "Build a website for ") => {
    stashPrompt(prompt, "draft");
    router.push(NEW_TASK_HREF);
  };

  return (
    <PageShell title="Websites">
      {sites && sites.length > 0 ? (
        <section
          data-testid="websites-first-screen"
          className="flex w-[840px] max-w-full flex-col self-center pb-[8px] pt-[24px]"
        >
          <div className="grid grid-cols-1 gap-[24px] min-[1000px]:h-[296px] min-[1000px]:grid-cols-[340px_minmax(0,1fr)]">
            <div className="flex min-h-0 min-w-0 flex-col">
              <h2 className="font-serif text-[32px] leading-[1.15] tracking-[-0.04em] text-[var(--om-text-1)]">
                Your sites,
                <br />
                all in one place.
              </h2>
              <p className="mt-[8px] text-[15px] leading-[22px] text-[var(--om-text-2)]">
                Edit, publish and keep an eye on each one.
              </p>
              <div className="mt-[24px] min-[1000px]:mt-auto">
                <RecentSites
                  sites={sites}
                  onViewAll={() =>
                    listRef.current?.scrollIntoView({ behavior: "smooth" })
                  }
                />
              </div>
            </div>
            <div ref={listRef} className="min-h-[220px] min-w-0">
              <SitesList sites={sites} onChanged={load} />
            </div>
          </div>
          <PrimaryButton
            onClick={() => start()}
            className="mt-[20px] h-[33px] w-[160px] self-start rounded-[9px] leading-[20px]"
          >
            Build a new website
          </PrimaryButton>
        </section>
      ) : (
        <section className="flex w-[840px] max-w-full items-start justify-between gap-[49px] self-center pt-[40px]">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-serif text-[40px] font-normal leading-[40px] tracking-[-0.02em] text-[var(--om-text-1)]">
              Describe a site.
              <br />
              Watch it go live.
            </h2>
            <ul className="flex flex-col gap-[22px] pt-[36px]">
              {WEBSITE_FEATURES.map((feature) => (
                <li key={feature.id} className="flex items-start gap-[13px]">
                  <span className="mt-[4px] flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--om-border)] bg-[var(--om-surface)] text-[var(--om-icon-2)]">
                    {FEATURE_ICONS[feature.id]}
                  </span>
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">
                      {feature.title}
                    </span>
                    <span className="w-[300px] max-w-full text-[13px] leading-[17px] text-[var(--om-text-3)]">
                      {feature.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <PrimaryButton
              onClick={() => start()}
              className="mt-[30px] h-[33px] w-[134px] rounded-[9px] leading-[20px]"
            >
              Get started
            </PrimaryButton>
          </div>

          <div className="flex w-[384px] shrink-0 flex-col gap-[12px] rounded-[18px] border border-[var(--om-border-strong)] bg-[#222222] p-[12px] max-[900px]:hidden">
            <div className="w-[340px] max-w-full self-end rounded-[12px] bg-[#2E2E2E] px-[12px] py-[10px]">
              <p className="line-clamp-2 text-[13px] leading-[18px] text-[var(--om-text-1)]">
                Make a pre-order page for Fern &amp; Flour, our corner bakery,
                so regulars can reserve tomorrow&apos;s loaves before 8 pm.
              </p>
            </div>
            <SitePreview />
            <div className="h-px shrink-0 bg-[var(--om-border)]" />
            <div className="flex items-center justify-between px-[2px] pb-[2px]">
              <div className="flex h-[28px] items-center gap-[6px] rounded-[14px] bg-[#2E2E2E] px-[10px]">
                <span className="h-[6px] w-[6px] shrink-0 rounded-[3px] bg-[#3FBF5F]" />
                <span className="text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">
                  Live
                </span>
              </div>
              <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
                This week{" "}
                <span className="pl-[4px] font-semibold text-[var(--om-text-1)]">
                  1,384
                </span>{" "}
                visitors{" "}
                <span className="pl-[4px] font-medium text-[#3FBF5F]">
                  +18%
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {showExplore ? (
        <section
          aria-labelledby="websites-explore"
          className="flex w-[840px] max-w-full flex-col gap-[14px] self-center pb-[28px] pt-[56px]"
        >
          <div className="flex items-center justify-between">
            <h2
              id="websites-explore"
              className="text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]"
            >
              Example sites to start from
            </h2>
            <button
              type="button"
              onClick={() => setShowExplore(false)}
              aria-label="Hide examples"
              className="-m-[6px] flex cursor-pointer rounded-[8px] p-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]"
            >
              <X size={16} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <PillTabs
            tabs={TABS}
            value={filter}
            onChange={setFilter}
            height={30}
            label="Website categories"
            className="flex-wrap"
          />
          {templates.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-[8px] gap-y-[10px] md:grid-cols-4">
              {templates.map((template) => {
                const thumb = templateThumb(template.art);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => start(template.prompt)}
                    title={template.prompt}
                    style={{
                      backgroundImage: thumb.background,
                      backgroundOrigin: "border-box",
                    }}
                    className="flex h-[114px] min-w-0 cursor-pointer flex-col justify-between overflow-clip rounded-[10px] border border-[var(--om-border-strong)] p-[14px] text-left outline-none transition-[filter,border-color] hover:brightness-110 focus-visible:border-[var(--om-border-focus)]"
                  >
                    <span aria-hidden className="block">
                      {thumb.body}
                    </span>
                    <span className="truncate text-[14px] font-semibold leading-[20px] text-white">
                      {template.title}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-[24px] text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">
              Nothing here yet for this category.
            </p>
          )}
        </section>
      ) : null}
    </PageShell>
  );
}
