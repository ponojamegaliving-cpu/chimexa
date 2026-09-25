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
- Admin dashboard shows all records
- Referrer dashboard shows only records assigned to that referrer phone number
- Realtor dashboard shows only their own record
- Frontend is served by the same Express server

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
2. Use the included `render.yaml`, `Dockerfile`, or `Procfile` for deployment.
3. Point your domain or public URL to the deployed service.
4. Keep the app behind HTTPS and do not store secrets in source control.

The app will bind to `0.0.0.0` on deployment so it can accept external traffic.

## Notes

This is a working starter app using sample in-memory data. For production, replace the sample data file with your real Microsoft Access data or connect this to SQL Server/PostgreSQL.
