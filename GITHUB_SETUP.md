# GitHub Actions — save scrape to WordPress DB (erbeaaustu)

## 1. Add repository secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Secret **names** must match exactly (case-sensitive):

| Secret name   | What to put in the value field |
|---------------|--------------------------------|
| `DB_HOST`     | **Public IP only** from Cloudways → WordPress staging app → Access Details. Example: `52.56.159.106` |
| `DB_PORT`     | `3306` |
| `DB_USER`     | MySQL username for **erbeaaustu** (from same Access Details page) |
| `DB_PASSWORD` | MySQL password for **erbeaaustu** |
| `DB_NAME`     | `erbeaaustu` |

### Common mistakes (cause `ENOTFOUND`)

| Wrong DB_HOST value | Why it fails |
|---------------------|--------------|
| `localhost` or `127.0.0.1` | Points to GitHub runner, not Cloudways |
| `erbeaaustu` | That is the **database name**, not the host — use `DB_NAME` for that |
| `https://52.56.159.106` | Remove `https://` — IP only |
| `52.56.159.106:3306` | Port goes in `DB_PORT`, not in `DB_HOST` |
| Empty / typo in secret name `DB_host` | GitHub won't inject it — must be `DB_HOST` |

Use the **WordPress staging app** credentials (`erbeaaustu`), not the old scraper app (`wftxhgbmuh`).

## 2. Run the workflow

**Actions → Competitor Scrape → WordPress DB → Run workflow**

Steps:

1. **Test MySQL connection** — must pass before scrape starts
2. **Run scraper** — all 6 sites, upserts into `wp_competitor_competitions`
3. **Upload backup JSON** — optional artifact download

Success log ends with:

```
Done. Found 150 competitions, saved 150 rows.
```

## 3. WordPress dashboard

- Tables must exist in `erbeaaustu` (`schema.sql` in this repo)
- **Remove** `dashboard/data/competitor-db.local.php` on staging if it points at the old Node API
- Dashboard reads the same DB via `$wpdb` — refresh Competitor Research tab

## 4. Verify in Adminer

```sql
SELECT site_name, COUNT(*) FROM wp_competitor_competitions GROUP BY site_name;
SELECT id, run_start, total_competitions_found, status FROM wp_scraper_runs ORDER BY id DESC LIMIT 3;
```

You should see all 6 sites and a new row in `wp_scraper_runs` after each workflow run.
