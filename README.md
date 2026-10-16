# Food Tracker

Snap a photo of your meal → Claude estimates calories and macros → it's logged and tracked over time → one click gives personalized advice from your logs.

## Setup

```bash
npm install
cp .env.example .env   # then put your ANTHROPIC_API_KEY in .env
npm start
```

Open http://localhost:3000.

## Use on your phone

With your phone on the same Wi-Fi, open `http://<your-computer-ip>:3000`. The photo button opens the camera. Use "Add to Home Screen" for an app-like experience.

## Deploy on Vercel

1. Import this repo at https://vercel.com/new (Framework Preset: Other).
2. Add environment variables: `ANTHROPIC_API_KEY` and `APP_PASSWORD` (required on Vercel; the API refuses requests without it). `CLAUDE_MODEL` is optional.
3. Deploy. The app asks for the password the first time you take a photo or request advice, then remembers it on that device.

## Notes

- Meal logs and goals are stored in the browser (localStorage) on each device. Use Settings → Export/Import to move data.
- The API key stays on the server; the browser only talks to `/api/analyze` and `/api/advice`.
- Model defaults to `claude-sonnet-5-5`; override with `CLAUDE_MODEL` in `.env`.
- Estimates are approximate and not medical advice.
