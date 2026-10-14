# Edge cache

The official Cleitext plugin for a cache in front of the site: **Varnish** or **Cloudflare** keep the public pages, and Cleitext purges them as soon as they change. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-edge-cache-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## How it works

- Cleitext labels every page with **tags**: `site`, `entry:<id>`, `type:article`, `menus:it`, `term:<id>`… With the plugin active, the pages kept by Cleitext's own page cache also tell the cache in front how long to keep them (`Cache-Control: s-maxage`, `CDN-Cache-Control` for Cloudflare) and carry their tags (`x-cleitext-tags` for Varnish, `Cache-Tag` for Cloudflare).
- When something changes, Cleitext knows which tags changed and the plugin purges **only those pages**: a `BAN` to Varnish, a purge by tag through the Cloudflare API (every Cloudflare plan since 2025). Changes made close together go out as one purge, a moment after they are saved.
- The admin, the API, previews and signed-in visitors are never cached. Browsers still check every page (`max-age=0`) and get a quick `304` when nothing changed.
- **Edge cache** in the admin shows the addresses of the site, the latest purges with their errors, a **Purge the whole site** button, a check of the headers of the home page, and the rules to give to whoever manages the server.

## Settings

**Settings → Edge cache**: how long the caches keep a page, Varnish and its address (reachable from the Cleitext server, e.g. `http://10.0.0.200:6081`), Cloudflare and its Zone ID. The Cloudflare **API token** goes in **Edge cache**: a token with only the permission _Zone → Cache Purge → Purge_ for the zone; it is checked when saved and kept encrypted.

## Varnish

The VCL used by the site needs these rules (they leave other sites alone: they only apply to responses with `x-cleitext-tags`). `purge_allowed` is the ACL of the addresses allowed to purge, which must include the Cleitext server.

```vcl
# vcl_recv — Cleitext: never cache the admin, the API, previews and signed-in users
if (req.url ~ "^/(api/|admin|__preview)" || req.http.Cookie ~ "cleitext_session=") {
    return (pass);
}
if (req.method == "BAN") {
    if (!client.ip ~ purge_allowed) { return (synth(403, "Not allowed")); }
    if (req.http.x-cleitext-ban) {
        ban("obj.http.x-cleitext-host == " + req.http.host +
            " && obj.http.x-cleitext-tags ~ " + req.http.x-cleitext-ban);
    } else {
        ban("obj.http.x-cleitext-host == " + req.http.host);
    }
    return (synth(200, "Banned"));
}

# vcl_backend_response — Cleitext pages: keep the tags, respect s-maxage and Set-Cookie
if (beresp.http.x-cleitext-tags) {
    set beresp.http.x-cleitext-host = bereq.http.host;
    if (beresp.http.Set-Cookie ~ "cleitext_" || beresp.http.Cache-Control ~ "(private|no-cache|no-store)") {
        set beresp.uncacheable = true;
        set beresp.ttl = 120s;
        return (deliver);
    }
    return (deliver);
}

# vcl_deliver — only for Varnish
unset resp.http.x-cleitext-tags;
unset resp.http.x-cleitext-host;
```

Do not remove the `cleitext_session` and `cleitext_csrf` cookies, and do not cache `/api/` or `/admin`: the login and the admin would stop working.

## Cloudflare

Cloudflare does not cache HTML by default. In **Caching → Cache Rules** create a rule with the expression shown in **Edge cache** (the site's hosts, without `/api/`, `/admin`, `/__preview` and signed-in visitors), then **Eligible for cache**, Edge TTL **Use cache-control header if present**, Browser TTL **Respect origin**.

Plugin API 1.9: the `cache.headers` filter (`theme:hooks`) and the `cache.invalidated` action; settings and the encrypted token (`settings:own`); the Edge cache page (`routes:admin`).
