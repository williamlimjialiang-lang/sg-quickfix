# SG QuickFix

Instant home repair estimates for Singapore, a quote assistant that refines the price as the homeowner answers questions, links to book the job, and native partner listings for contractors.

## What's in the folder

```
sg-quickfix/
├── netlify.toml               Build settings and security headers
├── package.json               Marks the project as ES modules (no dependencies)
├── netlify/functions/chat.js  The quote assistant (POST /api/chat)
└── public/                    Everything that gets published
    ├── index.html             Estimator, results, chat and booking
    ├── suppliers.html         Contractor sign-up (Netlify Forms)
    ├── supplier-thanks.html   Fallback confirmation if JavaScript is off
    ├── privacy.html, terms.html, 404.html
    ├── assets/
    │   ├── rates.js           All prices and the estimate engine (shared with the chat function)
    │   ├── app.js             Front-end logic
    │   ├── suppliers.js       Sign-up form validation
    │   └── styles.css
    └── data/
        ├── partners.json          Live partner listings (starts empty)
        └── partners.example.json  Two sample entries showing every field
```

## Deploy

Functions only deploy through Git or the Netlify CLI. **Drag-and-drop deploys skip them**, so the quote assistant would show as unavailable.

### Option 1: GitHub (recommended)

1. Create a new GitHub repository and push this folder to it.
2. In Netlify, choose **Add new project > Import an existing project** and pick the repository.
3. Leave the build command empty. Netlify reads the publish folder (`public`) and functions folder from `netlify.toml`.
4. Deploy. Every push to the main branch redeploys the site.

### Option 2: Netlify CLI

```
npm install -g netlify-cli
netlify login
netlify init        # first time only, links the folder to a new site
netlify deploy --prod
```

## Turn on the quote assistant

The chat calls Claude Haiku 5.5. Pick one of these.

**Your own Anthropic API key.** In Netlify, go to **Project configuration > Environment variables** (Site configuration on older dashboards) and add `ANTHROPIC_API_KEY` with a key from the Anthropic Console. Then redeploy. Set a monthly spend limit in the Console as a backstop.

**Netlify AI Gateway.** If AI features are enabled for your Netlify team, Netlify injects its own key and base URL automatically and bills usage to your Netlify credits. No key needed. If you see model errors in the function log, the gateway may not offer Haiku 5.5 yet: set `CHAT_MODEL` to a Claude model listed in Netlify's AI Gateway docs.

Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAT_MODEL` | `claude-haiku-5-5` | Model for the assistant |
| `CHAT_EFFORT` | `low` | `low`, `medium` or `high`. Higher is slower and costs more. `none` omits it |
| `ALLOWED_ORIGINS` | none | Extra origins allowed to call the endpoint, comma-separated |

**Cost.** Haiku 5.5 is priced from US$0.10 per million input tokens and US$0.50 per million output tokens. By my estimate, a five-message chat with a photo comes to roughly a fifth of a US cent.

**Safeguards already built in.** The key stays on the server. Each visitor is limited to 15 messages a minute (Netlify returns 429 above that), and the endpoint only accepts requests from your own domain. Conversations are capped at 12 messages, and photos are shrunk to 1024 px in the browser before upload.

To check it works after deploying: open the site, run an estimate, and send a chat message. If something fails, the reason is under **Logs > Functions > chat** in Netlify.

## Contractor sign-ups and native listings

1. In Netlify, open **Forms** and turn on form detection if it's off, then redeploy once. The `supplier-signup` form will appear.
2. Add an email notification for form submissions (under **Project configuration > Notifications**, called Site configuration on older dashboards) so you hear about every application.
3. For each application, verify the business before listing it:
   - UEN on ACRA's BizFile+ or the UEN search on data.gov.sg.
   - Electrical: EMA's register at https://elise.ema.gov.sg/elise/LEWs.jsp
   - Plumbing: PUB's licensed plumber listings, linked from https://www.pub.gov.sg/Professionals/Requirements/Licensed-Plumbers/Plumbing-Works
4. Add the approved business to `public/data/partners.json`, copying the shape from `partners.example.json`. Put logos in `public/data/logos/` and reference them as `/data/logos/name.png`. Commit and push.

Partner fields:

| Field | Notes |
| --- | --- |
| `name`, `categories` | Required. Categories must match: `Plumbing`, `Electrical`, `Aircon`, `Carpentry`, `General Handyman` |
| `jobs` | Optional job ids from `rates.js`. Matching partners rank higher for those jobs |
| `tagline`, `areas`, `fromPrice`, `priceUnit`, `licence` | Shown on the listing |
| `rating`, `reviews`, `reviewSource` | Only include figures you've checked |
| `verified` | Date you checked the business, e.g. `"20 Oct 2026"` |
| `whatsapp` | Digits with country code, e.g. `"6591234567"`. The button pre-fills the job summary |
| `phone`, `website`, `logo` | Optional. Website must start with `https://` |
| `sponsored` | `true` for paid placement. Shown first with a Sponsored label |
| `active` | Set `false` to hide a listing without deleting it |

Each estimate shows up to six partners for its category. Sponsored ones come first, then partners tagged for that exact job.

## Update prices

All prices live in `public/assets/rates.js`. Each job has a low–high range for the first unit, an add-on range for extra units, keywords for matching descriptions, and the first question the assistant asks. The chat function imports the same file, so a price change updates both the page and the assistant. Change `RATES_UPDATED` when you revise them. A quarterly review is about right.

Ranges were compiled in October 2026 from town council rate cards, MoneySmart, SingSaver, MissLobang, Homejourney, Helpling, Urban Company and current Carousell listings. Jobs marked `indicative` had fewer published prices, and the page tells homeowners so.

## Before you launch

- [ ] Replace `[COMPANY NAME]`, `[UEN]` and `[CONTACT EMAIL]` in `privacy.html` and `terms.html`. Find them with `grep -rn "\[" public/*.html`.
- [ ] Have the privacy notice and terms reviewed by a lawyer. Confirm the overseas-transfer statement matches your agreements with Netlify and Anthropic.
- [ ] Add your API key or enable AI Gateway, then test a chat on the live site.
- [ ] Turn on form detection and email notifications, then submit a test application.
- [ ] Connect your custom domain under **Domain management**. HTTPS is automatic.
- [ ] Optional: add Netlify Analytics or Plausible for traffic numbers. Both work with the current security headers. Google AdSense would need the Content-Security-Policy in `netlify.toml` widened.

## Run it locally

```
npm install -g netlify-cli
netlify dev
```

This serves the site and the chat function at http://localhost:8888. Put `ANTHROPIC_API_KEY=...` in a `.env` file for local chat. AI Gateway also works locally once the site has been deployed at least once.
