# K-FOX background notifications

Calendar events and Training sessions can each schedule a Push reminder. Reminders are saved to the signed-in account and sent at the selected local time, even when the site is closed, provided at least one device has an active Push subscription.

The browser must never contain the Supabase service-role key or the VAPID private key.

## 1. Generate VAPID keys

On a computer with Node.js, run:

```bash
npx web-push generate-vapid-keys
```

Keep both values ready. First create the database objects below so the Vault extension and lookup function are installed.

## 2. Create the database objects

Run `supabase/gym-push-reminders.sql` in **Supabase → SQL Editor**. It creates the private notification queue, the service-role-only Push subscription table, a due-notification index and the Vault-backed VAPID lookup function. It does not create or use daily calorie/protein logs.

## 3. Store the VAPID keys

In **Supabase → Database → Vault**, create these secrets using the generated values:

- `kfox_vapid_public_key`
- `kfox_vapid_private_key`

Keep the private key secret. Add `VAPID_SUBJECT` as an Edge Function secret, using a contact URI such as `mailto:your-email@example.com`.

## 4. Deploy the Edge Function

The project ref is `mbpqalbhdcikvruyadte`.

```bash
npx supabase login
npx supabase link --project-ref mbpqalbhdcikvruyadte
npx supabase functions deploy gym-reminders
```

Keep JWT verification enabled. Browser actions require the signed-in user's JWT; the scheduled worker requires the service-role JWT.

## 5. Store the scheduler credential in Vault

In **Supabase → Database → Vault**, create or update:

- Name: `kfox_gym_push_service_role_key`
- Secret: the project's service-role key from **Project Settings → API**

This key belongs only in Vault. Never put it in the website, GitHub source, or a chat.

## 6. Start the one-minute scheduler

Run `supabase/gym-push-scheduler.sql` after the Vault secret exists. The scheduler calls the Edge Function every minute and sends due Calendar, Training and other scheduled notifications. Reminders stay pending until an active device subscription exists.

## 7. Enable Push on each device

Open K-FOX over HTTPS, sign in through Personal Archive, go to Calendar and press **ENABLE BACKGROUND NOTIFICATIONS**. Allow browser notifications. Repeat this on every device where reminders should appear.

Android Chrome supports web Push. On iPhone/iPad, web Push generally requires adding the site to the Home Screen first.
