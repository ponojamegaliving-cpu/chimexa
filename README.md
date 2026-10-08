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
- Separate administrator sign-in at `/admin`
- Admin dashboard shows all records
- Referrer dashboard shows only records assigned to that referrer phone number
- Realtor dashboard shows only their own record
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

## Public deployment

This project is ready to deploy to a public host such as Render, Railway, Fly.io, Azure, or any VPS.

Recommended deployment steps:

1. Set the environment variables in your host dashboard:
   - `PORT`
   - `HOST=0.0.0.0`
   - `ADMIN_NAME`
   - `ADMIN_PASSWORD`
   - Optional Google Sheets variables: `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
   - `FORM_VISION_API_KEY` for the separate registration-form screening page
2. Use the included `render.yaml`, `Dockerfile`, or `Procfile` for deployment.
3. Point your domain or public URL to the deployed service.
4. Keep the app behind HTTPS and do not store secrets in source control.

The app will bind to `0.0.0.0` on deployment so it can accept external traffic.
Photo text recognition uses the OCR engine and English language model served by this app. Images are processed in the browser and are not sent to an external AI service.
For local vision AI, install Ollama and run `ollama pull qwen2.5vl:3b`; keep Ollama running while using photo intake. The app calls the local Ollama service at `http://127.0.0.1:11434` and falls back to browser OCR if it is unavailable. Optional server variables are `OLLAMA_HOST` and `OLLAMA_VISION_MODEL`.

## Separate registration-form screening

The admin Realtor page links to a separate front-and-back registration-form screening page. This feature uses its own OpenAI-compatible vision endpoint; it does not call the existing Ollama or browser OCR flow and does not send existing Realtor records as AI context. The AI uses only the existing field names and their order as the output format. It suggests values for an editable review table; saving a record is a separate, explicit action.

Configure the screening service on the server with `FORM_VISION_API_KEY`, `FORM_VISION_MODEL`, and `FORM_VISION_API_URL`. The API URL defaults to OpenAI's chat-completions endpoint; use a different compatible HTTPS endpoint to use another service. Keep the key on the server and out of source control. Both screening and screened-record saving verify the administrator's credentials. The photos are sent to the configured vision provider only when an administrator clicks **Analyze both sides**; the app does not store the uploaded form images. Review the provider's privacy and retention terms before processing personal or financial information. The screening endpoint is limited to five requests per IP address per minute.

## Notes

This is a working starter app using sample in-memory data. For production, replace the sample data file with your real Microsoft Access data or connect this to SQL Server/PostgreSQL.
