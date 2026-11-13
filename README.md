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

### Movies & TV Shows (`extensions/movies-tvshows/`)

| Extension | Version | Status | Description |
|:---|:---:|:---:|:---|
| **Bingr** | `v1.0.0` | `Active` | Multi-mirror movies, TV shows, and series streaming across Bingr domains (`bingr.one`, `bingr.st`, etc.) with Orion HLS and Vidly direct stream playback. |
| **Cinejoy** | `v1.0.8` | `Active` | Movies and TV shows streaming with multiple video servers, subtitle tracks, and search. |
| **DramaCool** | `v1.0.5` | `Active` | Asian dramas, Kdramas, and movies from dramacool9. Plays Vidbasic and Vidmoly HLS streams. Includes strict title search. |
| **HDHub4u** | `v1.0.3` | `Active` | Bollywood, Hollywood, South Indian movies, and web series in Hindi Dubbed and Dual Audio from hdhub4u. Supports PlayDrive, Play4U, and HDStream4u multi-quality HLS streams with multi-language audio tracks and subtitles. |
| **Kaidrama** | `v1.0.2` | `Active` | Korean, Chinese, Japanese, and Thai dramas and movies from kaidrama.com. Plays Vidmoly HLS (`.m3u8`) with MixDrop MP4 fallback. Strict search matching and English subtitles. |

---

### Anime Streams (`extensions/Anime/`)

| Extension | Version | Status | Description |
|:---|:---:|:---:|:---|
| **AnimeSalt** | `v1.0.2` | `Active` | Anime with audio dubbed in Hindi, Tamil, Telugu, Malayalam, English, and Japanese. |
| **1HAnime** | `v1.0.7` | `Active` | Hentai anime video streaming with multi-server and tag search. |
| **HentaiTV** | `v1.0.7` | `Active` | Hentai anime video streaming with subtitle tracks. |
| **HanimeTV** | `v1.0.4` | `Disabled` | Legacy hentai video scraper (disabled in marketplace). |

---

### Manga & Doujinshi Readers (`extensions/Manga/`)

| Extension | Version | Status | Description |
|:---|:---:|:---:|:---|
| **AsmHentai** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader. |
| **Hentai2Read** | `v1.0.4` | `Active` | Serialized hentai manga and comic reader. |
| **HentaiEra** | `v1.0.3` | `Active` | Hentai manga reader with thumbnail previews. |
| **HentaiForce** | `v1.0.4` | `Active` | Hentai manga and doujinshi reader. |
| **HentaiFox** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader with tag search. |
| **HentaiRox** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader. |
| **Hitomi** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader with tag search. |
| **ImHentai** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader with gallery search. |
| **NHentai.net** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader with tag filtering. |
| **NHentai.xxx** | `v1.0.3` | `Active` | Hentai manga and doujinshi reader mirror. |
| **SimplyHentai** | `v1.0.3` | `Active` | Hentai doujinshi and manga reader. |

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
