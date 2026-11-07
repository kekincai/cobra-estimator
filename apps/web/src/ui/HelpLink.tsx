import { Link } from 'react-router';
import { GUIDE_SECTIONS, guideHref, type GuideSectionId } from '../features/guide/sections';

/** 「?」ボタン。解説ページの該当節（/guide#<id>）を開く */
export function HelpLink({ section, className }: { section: GuideSectionId; className?: string }) {
  const title = GUIDE_SECTIONS.find((s) => s.id === section)?.title ?? '解説';
  return (
    <Link
      to={guideHref(section)}
      aria-label={`解説: ${title}`}
      title={`解説: ${title}`}
      className={`btn inline-flex size-7 items-center justify-center rounded-full border border-line bg-card text-[12px] font-bold text-sub no-underline hover:text-text ${className ?? ''}`}
    >
      ?
    </Link>
  );
}
