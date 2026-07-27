# ICT-Lab

Lab management platform for ICT organization.

## Setup

1. Create a Supabase project at https://supabase.com
2. Replace the placeholder credentials in `src/lib/supabase.js`
3. Run the SQL schema from `supabase/schema.sql` in the Supabase SQL editor
4. `npm install`
5. `npm run dev`

## Build & Deploy (GitHub Pages → AWS S3/CloudFront)

```bash
npm run build   # outputs to docs/
```

Push to GitHub. Configure S3 bucket to serve from `docs/`.

## Modules

- Supply Inventory (weekly inspection & export)
- Project Workspace (material inventory)  
- Reserve Equipment (booking calendar)
