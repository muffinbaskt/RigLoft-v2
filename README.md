# WareHub — standalone version

This is your job-site inventory tracker, set up to run as its own website
instead of inside Claude. It uses Supabase (a free hosted database) instead
of Claude's storage, so your data will be reliably the same everywhere —
phone, desktop, any browser.

## What's already done
- The app code (`src/App.jsx`) — same features you've been using
- Connected to your Supabase project (URL + key already filled in in
  `src/supabaseClient.js`)
- The database table (`app_storage`) — already created if you ran the SQL
  Claude gave you earlier

## What's left: getting it live

You don't need to understand any of the code below — just follow these
steps in order.

### 1. Put this code on GitHub
1. Go to github.com, click the "+" in the top right, choose **New repository**
2. Name it anything (e.g. `warehub`), leave everything else default, click
   **Create repository**
3. On the next page, look for **uploading an existing file** — click it
4. Drag in every file and folder from this project (everything except
   `node_modules`, which shouldn't exist yet anyway)
5. Scroll down, click **Commit changes**

### 2. Deploy it with Vercel
1. Go to vercel.com, sign in with GitHub if you haven't already
2. Click **Add New... → Project**
3. Find the repository you just created and click **Import**
4. Leave all settings as their defaults — Vercel will auto-detect this is a
   Vite project
5. Click **Deploy**

That's it. After a minute or two, Vercel gives you a live link
(something like `warehub-yourname.vercel.app`) that works exactly like the
Claude artifact did, except now it's reliably yours.

## Getting future updates from Claude

When you come back to Claude to add a feature or fix something:
1. Claude gives you an updated `src/App.jsx` file
2. Go to your GitHub repository, open `src/App.jsx`, click the pencil
   (edit) icon
3. Delete everything, paste in the new version, click **Commit changes**
4. Vercel automatically redeploys your site with the update — usually
   live within a minute, no other steps needed
