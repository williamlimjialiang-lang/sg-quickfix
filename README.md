# SG QuickFix

Instant home repair estimates for Singapore, a quote assistant that refines the price as the homeowner answers questions, links to book the job, and native partner listings for contractors.

## What's in the folder

```
sg-quickfix/
├── netlify.toml               Build settings and security headers
├── package.json               ES modules, plus @netlify/blobs for the stats
├── netlify/
│   ├── functions/
│   │   ├── chat.js            The quote assistant (POST /api/chat)
│   │   ├── track.js           Records anonymous visits and actions (POST /api/track)
│   │   └── stats.js           Sign-in and numbers for the dashboard (/api/stats)
│   └── lib/stats-core.js      Shared stats logic
└── public/                    Everything that gets published
    ├── index.html             Estimator, results, chat and booking
    ├── suppliers.html         Contractor sign-up (Netlify Forms)
    ├── supplier-thanks.html   Fallback confirmation if JavaScript is off
    ├── privacy.html, terms.html, 404.html
    ├── stats/index.html       Password-protected dashboard at /stats
    ├── assets/
    │   ├── rates.js           All prices and the estimate engine (shared with the chat function)
    │   ├── app.js             Front-end logic
    │   ├── suppliers.js       Sign-up form validation
    │   ├── track.js           Sends anonymous page views and actions
    │   ├── stats.js, stats.css  The dashboard
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

The chat calls Claude Haiku 5.5 through Netlify AI Gateway, Netlify's built-in access to Claude.

1. In Netlify, open your team settings and check that **AI features** are enabled. With them on, Netlify gives the chat function its own key automatically and bills usage to your Netlify credits. There's no key to copy.
2. Deploy, then send a test message in the chat.
3. If the chat says it's unavailable, open **Logs > Functions > chat**. A model error means the gateway doesn't offer Haiku 5.5 yet. Set `CHAT_MODEL` to a Claude model listed in Netlify's AI Gateway docs and redeploy.

If you'd rather use your own Anthropic account, add `ANTHROPIC_API_KEY` under **Project configuration > Environment variables**. Netlify never overrides a key you set yourself.

Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAT_MODEL` | `claude-haiku-5-5` | Model for the assistant |
| `CHAT_EFFORT` | `low` | `low`, `medium` or `high`. Higher is slower and costs more. `off` leaves it out |
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

## Visitor statistics at /stats

Open `https://your-site/stats` and sign in with the password **`admin!@#`**.

The dashboard shows, for today or the last 7, 30 or 90 days:

- visitors to the estimator and how many got an estimate, used the chat, got a sharper price and clicked to book, as a funnel
- a daily chart of visitors against visitors who got an estimate
- where visitors came from, devices, countries and pages
- estimates by category and job, and how they started (typed description, typical prices list or category suggestion)
- booking clicks by destination, partner listing clicks, shared job summaries and chat problems
- supplier sign-up page visitors and applications
- a day-by-day table you can download as CSV

**How it works.** Each visit and action is saved as its own entry in Netlify Blobs, Netlify's built-in storage, so there's no database to set up. Netlify installs the `@netlify/blobs` package automatically when it deploys. Visitors get an anonymous ID that changes daily, made from a one-way hash of IP address and browser. The IP is never stored and no cookies are set. Search engine bots are ignored. Deploy previews write to a separate store, so testing a preview never touches your real numbers.

**Your own visits.** On the dashboard, tick "Don't count visits from this browser". Do it on each browser and phone you test with. Adding `?notrack=1` to any page URL does the same.

**Changing the password.** The default is `admin!@#`. That's easy to guess, so before you share the site widely, add `STATS_PASSWORD` under **Project configuration > Environment variables** with something longer, then redeploy. Everyone signed in is signed out when it changes. Sign-in attempts are limited to 30 a minute per IP address, and a session lasts 12 hours.

**Tracking campaigns.** Add `?utm_source=` to links you share, such as `https://your-site/?utm_source=carousell`. Those visits show under that name in "Where visitors come from".

**Scale.** This setup suits up to a few thousand events a day. Days older than yesterday are summarised once and cached, so the 90-day view stays quick after its first load. If traffic grows well beyond that, move events to Netlify DB.

## Update prices

All prices live in `public/assets/rates.js`. Each job has a low–high range for the first unit, an add-on range for extra units, keywords for matching descriptions, and the first question the assistant asks. The chat function imports the same file, so a price change updates both the page and the assistant. Change `RATES_UPDATED` when you revise them. A quarterly review is about right.

Ranges were compiled in October 2026 from town council rate cards, MoneySmart, SingSaver, MissLobang, Homejourney, Helpling, Urban Company and current Carousell listings. Jobs marked `indicative` had fewer published prices, and the page tells homeowners so.

## Before you launch

- [ ] Replace `[COMPANY NAME]`, `[UEN]` and `[CONTACT EMAIL]` in `privacy.html` and `terms.html`. Find them with `grep -rn "\[" public/*.html`.
- [ ] Have the privacy notice and terms reviewed by a lawyer. Confirm the overseas-transfer statement matches your agreements with Netlify and Anthropic.
- [ ] Check AI features are on for your Netlify team, then test a chat on the live site.
- [ ] Set `STATS_PASSWORD` to something stronger than the default, sign in at `/stats`, and tick "Don't count visits from this browser" on your own devices.
- [ ] Turn on form detection and email notifications, then submit a test application.
- [ ] Connect your custom domain under **Domain management**. HTTPS is automatic.
- [ ] Google AdSense, if you add it later, needs the Content-Security-Policy in `netlify.toml` widened.

## Run it locally

```
npm install -g netlify-cli
netlify dev
```

This serves the site and all three functions at http://localhost:8888. Run `npm install` first so the stats functions can find `@netlify/blobs`. Locally, stats go to a sandboxed store, not your live numbers. AI Gateway works locally once the site has been deployed at least once.
