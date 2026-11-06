# StrawVerse Extensions (@cyber-winner)

Custom scraper extensions for [StrawVerse](https://github.com/TheYogMehta/StrawVerse).

Includes scrapers for Asian dramas, movies, multi-language dubbed anime, ecchi, and hentai manga/anime. Built with direct HLS (`.m3u8`) and MP4 streams, automatic headers for CDN bypass, and strict search filtering.

---

## How to Add This Repository to StrawVerse

1. Open **StrawVerse**.
2. Go to **Settings** > **Marketplace** (or **Extensions**).
3. Click **+ Add Repo**.
4. Paste the repository URL:
   ```text
   https://github.com/cyber-winner/strawverse-extentions
   ```
5. Click **Install** on any extension you want.

---

## Extensions

### Asian Dramas & Movies

| Extension | Category | Version | Status | Description |
|:---|:---:|:---:|:---:|:---|
| **Kaidrama** | Drama / Movies | `v1.0.1` | `Active` | Korean, Chinese, Japanese, and Thai dramas and movies from kaidrama.com. Plays Vidmoly HLS (`.m3u8`) with MixDrop MP4 fallback. Strict search matching and English subtitles. |
| **DramaCool** | Drama / Movies | `v1.0.4` | `Active` | Asian dramas, Kdramas, and movies from dramacool9. Plays Vidbasic and Vidmoly HLS streams. Includes strict title search. |

---

### Movies & TV Shows

| Extension | Category | Version | Status | Description |
|:---|:---:|:---:|:---:|:---|
| **Cinejoy** | Movies / TV | `v1.0.7` | `Active` | Movies and TV shows with multiple video servers, subtitle tracks, and search. |

---

### Regional Dubbed Anime

| Extension | Category | Version | Status | Description |
|:---|:---:|:---:|:---:|:---|
| **AnimeSalt** | Anime | `v1.0.1` | `Active` | Anime with audio dubbed in Hindi, Tamil, Telugu, Malayalam, English, and Japanese. |

---

### Hentai & Ecchi (18+)

> [!NOTE]
> Can be enabled or disabled individually in StrawVerse settings.

#### Hentai Anime Streams

| Extension | Version | Status | Description |
|:---|:---:|:---:|:---|
| **HentaiTV** | `v1.0.6` | `Active` | Hentai anime streams with subtitle tracks. |
| **1HAnime** | `v1.0.6` | `Active` | Hentai anime streams with tag search. |
| **HanimeTV** | `v1.0.3` | `Disabled` | Legacy hentai video scraper (disabled in marketplace). |

#### Hentai Manga & Doujinshi Readers

| Extension | Version | Status | Description |
|:---|:---:|:---:|:---|
| **Hitomi** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader. |
| **NHentai.net** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader with tag search. |
| **NHentai.xxx** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader mirror. |
| **AsmHentai** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader. |
| **ImHentai** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader with gallery search. |
| **HentaiFox** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader. |
| **HentaiEra** | `v1.0.2` | `Active` | Hentai manga reader with thumbnail previews. |
| **HentaiForce** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader. |
| **HentaiRox** | `v1.0.2` | `Active` | Hentai manga and doujinshi reader. |
| **Hentai2Read** | `v1.0.2` | `Active` | Serialized hentai manga and comic reader. |
| **SimplyHentai** | `v1.0.2` | `Active` | Hentai doujinshi and manga reader. |

---

## Technical Details

- **Direct HLS & MP4 Streams**: Extracts direct `.m3u8` playlists and `.mp4` video files so MPV plays without proxy buffering timeouts.
- **Strict Search Matching**: Filters out partial and stop-word matches so searching a title only returns what was queried.
- **Header Rules**: Attaches required `Referer`, `Origin`, and `User-Agent` headers to bypass CDN hotlink protections.

---

## Contributing

1. Fork this repository.
2. Create your branch (`git checkout -b feature/new-scraper`).
3. Follow the StrawVerse extension format (`SearchAnime`, `AnimeInfo`, `fetchEpisodeSources`, `headerRules`).
4. Commit and open a Pull Request.

---

## License

MIT
