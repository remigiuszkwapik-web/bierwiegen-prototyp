
# BIERWIEGEN

Multiplayer-Trinkspiel bei dem Spieler versuchen, eine vorgegebene Menge Bier möglichst genau zu trinken. Der Host erstellt einen Raum, Mitspieler treten per Code bei.

Die App ist eine rein statische Seite ohne eigenen Server — jedes Gerät spricht direkt mit Supabase, dort liegt der gesamte Spielstand.

## Lokal starten

**Voraussetzungen:** Node.js

1. Abhängigkeiten installieren:
   `npm install`
2. `.env` anlegen (Vorlage: `.env.example`):
   ```
   VITE_SUPABASE_URL=https://dein-projekt.supabase.co
   VITE_SUPABASE_ANON_KEY=dein-anon-key
   ```
   Die Werte stehen im Supabase-Dashboard unter **Settings → API**. Ohne `.env` zeigt die App eine Hinweisseite statt zu starten.
3. App starten:
   `npm run dev`

Zum Ausprobieren ohne Datenbank: `npm run dev` und dann `http://localhost:3000/?dev=true` — lädt ein Demo-Spiel mit vier Spielern und einer Leiste zum Durchschalten der Perspektiven.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver auf Port 3000 |
| `npm run typecheck` | TypeScript prüfen (läuft auch im Deploy) |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run preview` | Gebauten Stand lokal ansehen |

## Datenbank

Supabase, eine Tabelle `games`. Die Spalten ergeben sich aus `repositories/GameRepository.ts`:
`game_code` (eindeutig), `host_id`, `status`, `players`, `rounds`, `current_round_index`,
`bottle_size`, `reactions`, `pending_initial_weights`, `mode`, `created_at`.

Damit Mitspieler Änderungen sofort sehen, muss `games` in der Realtime-Publikation stehen
(**Database → Replication**). Ohne das funktioniert das Spiel, aktualisiert sich aber erst beim Neuladen.

> **Hinweis zum Gratis-Tarif:** Supabase pausiert kostenlose Projekte nach etwa einer Woche
> ohne Zugriff. Dann im Dashboard auf **Restore project** — URL und Key bleiben dabei gleich.
>
> Damit es gar nicht so weit kommt, pingt `.github/workflows/supabase-keepalive.yml` die Datenbank
> alle drei Tage mit einer kleinen lesenden Abfrage an (nutzt dieselben Secrets wie der Deploy).
> Manuell starten: **Actions → Supabase Keep-Alive → Run workflow**. Schlägt der Ping fehl, wird der
> Lauf rot und GitHub schickt eine Mail. Achtung: GitHub schaltet geplante Workflows ab, wenn im Repo
> 60 Tage lang nichts passiert — dann im Actions-Tab wieder aktivieren.

## Deployment

Läuft automatisch über GitHub Actions (`.github/workflows/deploy.yml`) bei jedem Push nach `main`.

Einmalig einzurichten:
1. **Settings → Pages → Source:** `GitHub Actions`
2. **Settings → Secrets and variables → Actions:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` anlegen

Veröffentlicht unter `https://remigiuszkwapik-web.github.io/bierwiegen-prototyp/`.

> **Wichtig bei eigener Domain:** GitHub Pages liefert Projektseiten unter `/<repo>/` aus,
> deshalb steht in `vite.config.ts` ein `base` auf `/bierwiegen-prototyp/`. Kommt später eine
> eigene Domain dazu, die auf der Wurzel ausliefert, muss `base` zurück auf `/` — sonst laden
> JavaScript und CSS nicht.
>
> Die Schriftpfade in `index.html` sind bewusst relativ (`./fonts/…`) gehalten und funktionieren
> in beiden Fällen. Vite schreibt `url()`-Angaben in Inline-`<style>`-Blöcken nämlich *nicht* um,
> absolute Pfade würden dort unter einem Unterverzeichnis ins Leere laufen.

## Schriften

Bungee und Inter liegen unter `public/fonts/` im Repo statt von Google geladen zu werden — die App
funktioniert damit auch offline und stellt keine Verbindung zu Google her. Inter ist ein Variable
Font und deckt 400–800 in einer Datei ab. Beide stehen unter der SIL Open Font License 1.1, die
Lizenztexte liegen daneben.
