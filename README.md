# Geography Quiz Master

Slovenský geografický kvíz s lokálnym demom, účtami Supabase a globálnym rebríčkom. Aplikácia nevyžaduje AI API.

## Spustenie dema

Rozbaľ celý ZIP a otvor `site/index.html` v prehliadači. Demo začína profilom Geograf 🦁 s 80 bodmi a jedným ukážkovým kvízom s výsledkom 8/10. Stav sa ukladá v miestnom úložisku prehliadača. Na počítačoch, ktoré obmedzujú ukladanie pri otváraní lokálnych súborov, použi lokálny webový server.

Tri stránky majú vlastné odkazy `#hlavna`, `#rebricek` a `#profil`. Odpovede sa dajú meniť až do vyhodnotenia. Pri postupe na ďalší level sa zahodí aj prebytok bodov. Na leveli Majster sa body ďalej pripočítavajú. Globálny rebríček ukazuje prvých 100 online hráčov podľa levelu a bodov.

## Zapojenie Supabase

1. Vytvor projekt na pláne Free na [Supabase](https://supabase.com/).
2. V **SQL Editor → New query** spusti najprv `supabase/migrations/20261113000100_schema.sql`, potom `supabase/migrations/20261113000200_questions.sql`. Použi nový projekt alebo schému bez rovnomenných tabuliek.
3. V **Authentication → Providers → Email** povoľ prihlasovanie e-mailom a heslom. Pre verejnú registráciu s potvrdením e-mailu nastav vlastný SMTP a nechaj zapnuté **Confirm email**. Vstavaná služba Supabase doručuje iba na povolené adresy tímu. Na uzavretú skúšku môžeš namiesto toho vytvoriť potvrdené testovacie účty priamo v **Authentication → Users**. [Dokumentácia SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
4. V **Authentication → URL Configuration** nastav **Site URL** a pridaj **Redirect URL**, napríklad `https://UZIVATEL.github.io/geography-quiz-master/`. Pridaj aj presnú adresu lokálneho servera, ak ho používaš na testovanie. [Dokumentácia presmerovaní](https://supabase.com/docs/guides/auth/redirect-urls)
5. Z projektu skopíruj **Project URL** a verejný **Publishable key** začínajúci na `sb_publishable_`. Administrátorský kľúč patrí výlučne na server.

## Nasadenie na GitHub Pages

1. Vytvor verejný repozitár `geography-quiz-master`. Nahraj obsah rozbaleného priečinka vrátane skrytého priečinka `.github` a súboru `.gitignore` do vetvy `main`.
2. Otvor **Settings → Pages** a ako **Source** nastav **GitHub Actions**. [Dokumentácia GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. V **Settings → Secrets and variables → Actions → Variables** pridaj `SUPABASE_URL` a `SUPABASE_PUBLISHABLE_KEY`. Keď obe vynecháš, nasadí sa samostatné demo.
4. Otvor **Actions → Geography Quiz Master → Run workflow**. Po úspešnom behu nájdeš adresu v **Settings → Pages**.
5. Na publikovanej adrese sa prihlás novým účtom, skontroluj úvodný stav 0 bodov, dokonči kvíz a over výsledok v profile aj rebríčku. Pri testovaní registrácie skontroluj doručenie potvrdenia a presmerovanie späť na web.

Bezplatné nasadenie počíta s verejným repozitárom GitHub a s limitmi plánu Supabase Free. Doručovanie potvrdzovacích správ sa riadi podmienkami vybraného poskytovateľa SMTP.

## Otázky a zdroje

- 358 otázok o hlavných mestách, 194 o vlajkách, 398 o štátoch, 31 o ostrovoch a 19 o polostrovoch.
- Štáty, hlavné mestá, hranice a rozloha vychádzajú z [mledoze/countries](https://github.com/mledoze/countries). V kvíze sa používa geografické členenie tohto datasetu. Hlavné mestá s viacerými alebo spornými sídlami boli pri vybraných prípadoch vynechané. Názvy štátov používa slovenské rozhranie Unicode CLDR z Node.js.
- Ostrovy a polostrovy majú odkazy na jednotlivé heslá v Encyclopaedia Britannica. Pri vlajkách je k dispozícii obrazová sada [flag-icons 7.5.0](https://github.com/lipis/flag-icons/tree/v7.5.0) a jej licencia.
- Fotografia Zeme [Blue Marble](https://images.nasa.gov/details/as17-148-22727) pochádza z archívu NASA / Apollo 17.
- Každé vyhodnotenie odkazuje na zdroj. Integritný test kontroluje štruktúru celej banky a obrazové súbory. Zdrojové heslá neprešli individuálnou redakčnou kontrolou.

`node generate.mjs` regeneruje otázky, mapovanie obrázkov a druhú migráciu zo zdrojových dát. Ak zmeníš mapovanie vlajok, premenuj podľa neho aj súbory v `site/assets/flags/`.

## Overenie a bezpečnosť

- `node test.mjs` kontroluje počet, unikátnosť a formát otázok, možnosti, obrázky, všetky obtiažnosti a všetky prechody levelov.
- `node build.mjs` pripraví `dist/` pre GitHub Pages bez závislostí na balíkoch npm. Použi Node.js 24.
- Ak je dostupný [PGlite](https://pglite.dev/), nastav `PGLITE_MODULE` na absolútnu cestu k jeho súboru `dist/index.js` a spusti `node test.mjs`. Test vykoná obe migrácie v PostgreSQL s testovacími rolami a identitou napodobňujúcou Supabase.
- Server vyberá otázky, viaže kvíz na účet, kontroluje voľby a v jednej transakcii pripisuje skóre. Opakované odoslanie vráti pôvodný výsledok. RLS obmedzuje prístup k profilu a klient môže meniť iba meno a avatar. Rozhranie rebríčka vracia verejné meno, avatar, level a body.
- Lokálne demo obsahuje verejný kľúč odpovedí. Hráč si preto môže odpovede dohľadať v zdrojoch dema alebo verejného repozitára. Serverové hodnotenie chráni integritu pripísaných bodov a stav účtov. Odpovede z online rozhrania sa vracajú až po dokončení pokusu.
- Reálne doručenie e-mailu, API konkrétneho projektu Supabase a verejná adresa GitHub Pages sa overujú po nasadení.
