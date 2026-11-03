# K-FOX GYM background reminders

The website code is prepared, but background push requires one-time setup in the Supabase project. The browser must never contain the Supabase service-role key or the VAPID private key.

## 1. Generate VAPID keys

On a computer with Node.js, run:

```bash
npx web-push generate-vapid-keys
```

Keep both values private. In Supabase Dashboard, open **Project Settings → Edge Functions → Secrets** (or the Edge Function secrets page) and add:

- `VAPID_PUBLIC_KEY` — the generated public key
- `VAPID_PRIVATE_KEY` — the generated private key
- `VAPID_SUBJECT` — a contact URI such as `mailto:your-email@example.com`

Do not commit the private key to GitHub.

## 2. Deploy the Edge Function

The project ref is `mbpqalbhdcikvruyadte`.

```bash
npx supabase login
npx supabase link --project-ref mbpqalbhdcikvruyadte
npx supabase functions deploy gym-reminders
```

The Supabase project automatically supplies its URL, anon key and service-role key to Edge Functions. The function is configured to require JWT verification for browser requests.

## 3. Create the database tables

Open **Supabase → SQL Editor** and run the complete file:

`supabase/gym-push-reminders.sql`

It creates the private nutrition log table, the push-subscription table and enables the required Supabase extensions. Existing GYM nutrition history is copied from this browser to the cloud the next time the account is signed in; subsequent entries sync automatically.

## 4. Store the scheduler credential in Vault

In **Supabase → Database → Vault**, create a secret with:

- Name: `kfox_gym_push_service_role_key`
- Secret: the project's `service_role` key from **Project Settings → API**

This key belongs only in Vault. Never paste it into the website, GitHub source, or a chat.

## 5. Start the one-minute scheduler

After the Vault secret exists, run:

`supabase/gym-push-scheduler.sql`

The scheduler calls the Edge Function every minute. It checks each device's saved IANA timezone and sends the 19:00 reminder. At 22:00 it checks the cloud nutrition table and sends the second message only when today's report is missing. A five-minute retry window protects against a single missed cron minute; each device receives each reminder at most once per local day.

## 6. Enable notifications on the device

Open K-FOX over HTTPS, sign in through **Personal Archive**, open **GYM & Nutrition**, and press **ENABLE BACKGROUND NOTIFICATIONS**. Allow browser notifications. Repeat this on each device where notifications should appear; the timezone is captured separately for each device.

Android Chrome supports web push. On iPhone/iPad, web push generally requires the site to be added to the Home Screen first.
