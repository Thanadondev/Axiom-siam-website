import { isSoon } from "../lib/launch";

/** "Coming soon" beside a link to a page that isn't open yet (lib/launch.ts); nothing otherwise. */
export default function SoonTag({ href }: { href: string }) {
  return isSoon(href) ? <em className="ax-soon">Coming soon</em> : null;
}
