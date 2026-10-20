# Realtor Referral App

This project is a starter web app based on the field names from the Access file:

- [REALTORS NAME]
- [DATE OF REG]
- [REALTOR ID NO]
- [GENDER]
- [DATE OF BIRTH]
- [ADDRESS OF REALTOR]
- [REALTOR PHONE NO]
- [REALTOR EMAIL ADDRESS]
- [COUNTRY OF LOCATION]
- [PLACE OF REG]
- [STATE CODE]
- [STATIONED CITY/LGA]
- [REG PAYMENT]
- [BANK A/C NO]
- [BANK A/C NAME]
- [BANK]
- [REALTOR NEXT OF KIN NAME]
- [NEXT OF KIN ADDRESS]
- [NEXT OF KIN PHONE NO]
- [REFEREE NAME]
- [REFEREE ID NO]
- [REFEREE PHONE NO]
- [REFEREE BANK NAME]
- [REFEREE BANK A/C NO]
- [REFEREE A/C NAME]
- [INCENTIVE PAYMENT (YES/NO)]

## Features

- Login by phone number or email
- Public realtor registration at `/register.html`
- Property marketplace at `/properties.html` with search, favorites, maps, and realtor contact links
- Realtor property submissions with administrator approval at `/properties/manage`
- Separate administrator sign-in at `/admin`
- Admin dashboard shows all records
- Referrer dashboard shows only records assigned to that referrer phone number
- Realtor dashboard shows only their own record
- Admin AI assistant uses a local Ollama model by default
- Frontend is served by the same Express server
- Realtor photo intake uses local Ollama vision AI with browser OCR fallback; no cloud API key is required
- Admin registration-form screening runs on a separate vision API and reviews the front and back together

## Run it

1. Install Node.js and npm.
2. Open the project folder.
3. Run:

```bash
npm install
npm start
```

4. Open:

```text
http://localhost:5000
```

## Run it in Expo Go

The `mobile/` folder contains an Expo app that opens the existing web app in a mobile WebView.
The app and its API continue to run on the Node.js server; the mobile app does not start its own
backend.

1. Start the backend from the project root:

   ```bash
   npm start
   ```

2. In another terminal, start Expo:

   ```bash
   cd mobile
   npm install
   npx expo start
   ```

3. Install Expo Go on your phone and scan the QR code.
4. When prompted, enter the server address. For a local computer, use its Wi-Fi IP address and
   port, for example `http://192.168.1.25:5000` (not `localhost`). Keep the phone and computer on
   the same Wi-Fi network and allow Node.js through the computer's firewall. For a deployed server,
   use its HTTPS URL.

The server address is saved on the device. Tap **Server** in the app header to change it. Local
HTTP is enabled to support development on a trusted local network; use HTTPS for public deployments.

## Public deployment

This project is ready to deploy to a public host such as Render, Railway, Fly.io, Azure, or any VPS.

Recommended deployment steps:

1. Set the environment variables in your host dashboard:
   - `PORT`
   - `HOST=0.0.0.0`
   - `ADMIN_NAME`
   - `ADMIN_PASSWORD`
   - Optional Google Sheets variables: `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
   - `FORM_VISION_API_KEY` if using the external form-screening provider on a hosted deployment
2. Use the included `render.yaml`, `Dockerfile`, or `Procfile` for deployment.
3. Point your domain or public URL to the deployed service.
4. Keep the app behind HTTPS and do not store secrets in source control.

The app will bind to `0.0.0.0` on deployment so it can accept external traffic.
The admin AI assistant uses `qwen2.5vl:3b` through Ollama by default; set `OLLAMA_CHAT_MODEL` to another installed chat-capable model if desired. To use OpenAI instead, set `AI_CHAT_PROVIDER=openai` and configure `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`). The assistant sends up to 50 realtor records with each prompt to the selected provider.
Photo text recognition uses the OCR engine and English language model served by this app. Images are processed in the browser and are not sent to an external AI service.
For local vision AI, install Ollama and run `ollama pull qwen2.5vl:3b`; keep Ollama running while using photo intake. The app calls the local Ollama service at `http://127.0.0.1:11434` and falls back to browser OCR if it is unavailable. Optional server variables are `OLLAMA_HOST` and `OLLAMA_VISION_MODEL`.

## Property marketplace

Open `/properties.html` to browse and filter Nigerian sale, rent, and shortlet listings. Visitors can save favorites on their device, view property photos and details, open the property's address in Google Maps, and contact the listing realtor by phone or WhatsApp. The Expo Go app opens this marketplace directly; the existing realtor portal remains available at `/`.

Clearly labeled demo listings are included to explore the marketplace; their property details and locations are fictional and they have no contactable agent. Registered realtors can submit listings from the bottom of the marketplace page using their registered phone number. Submissions remain private until an administrator approves them at `/properties/manage`. Administrators can also publish listings directly. The management page requires `ADMIN_NAME` and `ADMIN_PASSWORD`; set a strong, unique password before deploying.

Property records are stored in `server/properties.json` by default and are created when the first listing is added. Set `PROPERTIES_FILE_PATH` to a writable persistent location when deploying; ephemeral hosting filesystems may otherwise lose listings on restart. Property photos are supplied as HTTPS image URLs, not uploaded to this server. Public deployment should use HTTPS.

## Registration-form screening

The admin Realtor page links to a front-and-back registration-form screening page. It runs Tesseract OCR locally in the browser, then sends the recognized front/back text to the local Ollama model by default (`qwen2.5vl:3b`) for structuring. It does not send existing Realtor records as AI context. The AI uses only the existing field names and their order as the output format. It suggests values for an editable review table; saving a record is a separate, explicit action. Form photos are not forwarded to an external vision provider by default.

Keep Ollama running and install the model with `ollama pull qwen2.5vl:3b`; set `OLLAMA_CHAT_MODEL` to use another installed chat-capable model. To opt into the external OpenAI-compatible vision provider instead, set `FORM_VISION_PROVIDER=openai`, `FORM_VISION_API_KEY`, and optionally `FORM_VISION_API_URL` and `FORM_VISION_MODEL`. The included Render configuration selects this external mode because Ollama is not installed in the hosted service by default. In external mode, form images are sent to the configured service; review its privacy and retention terms first. Both screening and screened-record saving verify the administrator's credentials. Images are not stored by this page. The screening endpoint is limited to five requests per IP address per minute.

## Notes

This is a working starter app using sample in-memory data. For production, replace the sample data file with your real Microsoft Access data or connect this to SQL Server/PostgreSQL.
