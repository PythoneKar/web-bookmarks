# Web Resource Library

A lightweight, responsive, Persian RTL directory for useful websites and online tools.

## Live website

[Open Web Resource Library](https://pythonekar.github.io/web-bookmarks/)

## Features
- Responsive layout for desktop, tablet and mobile
- Persian and Arabic character normalization
- Search across titles, descriptions, URLs and tags
- Typo-tolerant matching for short search phrases
- Category filters and live resource counts
- Light and dark themes (saved locally in the browser)
- Pagination and alphabetical sorting
- Data separated from the interface in `data/resources.json`
- No backend, account system, analytics, tracking scripts or personal profile content

## Run locally
Open `index.html` through a local static web server so the JSON data can be loaded with Fetch. For example, use the Live Server extension in Visual Studio Code.

## Add a resource
Add an object to the `resources` array in `data/resources.json`:

```json
{
  "title": "Example",
  "category": "development",
  "description": "A short description.",
  "url": "https://example.com",
  "tags": ["example", "tools"]
}
```

Use one of the category IDs already listed in the `categories` array.

## Publish with GitHub Pages
1. Open repository Settings.
2. Select Pages.
3. Choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`.
5. Save and wait for deployment.

The project is static and does not require a build step.

## Privacy
The site source contains no personal name, personal email address, personal domain, social profile, or author biography. Git hosting platforms may still display repository ownership and commit metadata according to the account settings.
