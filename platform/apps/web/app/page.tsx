"use client";

import { useLang } from "../lib/i18n";
import StoreHeader from "../components/StoreHeader";
import FactoryHome from "../components/FactoryHome";
import "./app.css"; // UserMenu styles
import "./home.css";
import "./factory.css";

/** Home: the factory from above — each station is a button to a page (FactoryHome). */
export default function Home() {
  const [lang, setLang] = useLang();
  return (
    <div className="ax ax-factory" lang={lang}>
      <StoreHeader lang={lang} onLang={setLang} cta={false} plain />
      <main>
        <FactoryHome lang={lang} />
      </main>
    </div>
  );
}
