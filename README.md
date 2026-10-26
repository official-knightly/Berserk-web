# Berserk Web — Engine Lab

A chessboard.js website for playing against and testing the Berserk chess engine.

## Connect the Berserk API

The website is configured to use the hosted Berserk HTTP API through `engine.js`. It does not need a local WASM engine copy when using the API.

1. Deploy the API from the `official-knightly/Berserk` repository. Follow the **Optional HTTP API** instructions in that repository's `readme.md`.
2. After deployment, open the API's health endpoint: `https://YOUR-DEPLOYED-API-URL/health`. It should return JSON containing `"status":"ok"`.
3. In this repository's `index.html`, find the configuration line near the bottom:
   
   ```html
   <script>window.BERSERK_API_URL = "https://YOUR-DEPLOYED-API-URL";</script>
   ```

4. Replace `https://YOUR-DEPLOYED-API-URL` with your actual deployed service origin. Use only the base URL: no trailing slash and no `/api/analyze` suffix.
5. Commit the change to `main`. GitHub Pages will rebuild and deploy the site.

The website then checks `GET /health` and sends moves to `POST /api/analyze`. The API returns Berserk's best move and candidate lines. The API controls the maximum think time (100–10,000 ms). The Elo slider chooses among returned candidate moves and the attack slider biases tactical choices; these are approximate client-side controls, not a promise of an official Elo strength.

## API URL status

**A live public API URL has not been provisioned by this repository change.** The placeholder is intentional: a real URL exists only after you deploy the API to a host such as Render. Do not leave the placeholder in place and expect engine loading to succeed.

## Project files

- `index.html` — page and API URL setting
- `style.css` — styling
- `app.js` — chessboard/game UI
- `engine.js` — API-backed `BerserkEngine` adapter

The engine API implementation and Docker deployment files live in the separate Berserk engine repository under `api/`.
