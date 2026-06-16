# Tourney Rater

Local web app for sequential PUBG-style player ratings.

## What it does

- First person enters IGN
- App walks through players one by one
- Each player gets 5 skills rated from 1 to 10 stars
- Progress bar updates as players are completed
- Ratings are saved into PostgreSQL
- Works with Neon or any other hosted Postgres provider

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`

Local development loads `.env` automatically, so put your `DATABASE_URL` there.

## Admin

Open `http://localhost:3000/admin.html` to review sessions and export data.

## Vercel Deploy

1. Push this repo to GitHub.
2. In Vercel, import the GitHub repo as a new project.
3. Add `DATABASE_URL` in Project Settings > Environment Variables.
4. Deploy the project.
5. Open `/` for the rater and `/admin` for the dashboard.

Vercel uses the `api/` folder for backend routes and `public/` for static files.
