# qiuliyang.github.io

Personal academic homepage of Liyang Qiu, built with [Astro](https://astro.build) and the
[as-folio](https://github.com/dadangnh/as-folio) theme. Deployed to GitHub Pages by the
workflow in `.github/workflows/deploy.yml` on every push to `main`.

## Editing content

| What | Where |
|---|---|
| Name, affiliation, social links, navigation, colours | `src/config/site.ts` |
| Bio on the front page | `src/data/about.mdx` |
| Publications (BibTeX; `selected = {true}` shows on the front page) | `src/data/papers.bib` |
| Journal abbreviations, co-author links | `src/data/venues.yml`, `src/data/coauthors.yml` |
| Talks | `src/data/talks.yml` |
| CV page | `src/data/cv.yml` (RenderCV format) |
| News items on the front page | `src/content/announcements/YYYY-MM-DD.md` |
| Profile photo | `public/assets/img/prof_pic.jpg` |

## Local development

Requires Node 24 and Yarn 4 (via Corepack).

```sh
corepack yarn install
corepack yarn dev        # http://localhost:4321
corepack yarn build      # static output in dist/
```

See `CUSTOMIZE.md` for the full list of theme options.
