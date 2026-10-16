# Add the Elachee chatbot to a website

Elachee's public site is WordPress-based. The chatbot loader also works on other website platforms; it does not require React or a specific theme.

## The snippet

Use this same snippet for WordPress and other sites:

```html
<script async src="https://elachee-chatbot.vercel.app/widget-loader.js"></script>
```

It adds the floating **Ask Elachee** launcher at the bottom-left of the page. No API key or other chatbot configuration belongs on the host website.

## WordPress

Add the code site-wide so the launcher appears across the website:

1. Sign in to the WordPress dashboard.
2. If **WPCode** is already installed, open **Code Snippets > Header & Footer**. Otherwise, install and activate the WPCode plugin if your account and hosting plan allow plugins.
3. Paste the snippet above in the **Footer** field and save the changes. WPCode places it in the site's shared footer, so you do not need to edit the theme files.
4. Clear any WordPress, hosting, or CDN cache, then reload the site and test the launcher.

If you cannot install plugins or do not see the Header & Footer screen, ask the WordPress administrator or site developer to add the snippet to the site's global footer using their approved code-injection method. Avoid adding it to an ordinary page or post: it may only show on that page, and WordPress can remove script tags for accounts without the required capability.

References: [WPCode's Header & Footer instructions](https://wpcode.com/docs/using-the-global-header-footer-settings/) and [WordPress Custom HTML block documentation](https://wordpress.org/documentation/article/custom-html/).

## Other website platforms

Use the platform's **site-wide custom code**, **footer scripts**, or **global footer** setting and paste the snippet there. If the site is maintained in code, add it to the shared layout/template immediately before `</body>`. Publish the change and clear any site or CDN cache.

If the platform's page editor strips `<script>` tags, do not keep trying to paste it into page content. Use its global code-injection feature or ask the site administrator to add it to the shared layout.

## Check or remove the widget

After publishing, reload a page in a private/incognito window and check that **Ask Elachee** appears bottom-left, opens the chatbot, and can send a message. If it does not appear, check the published source/footer for the script and clear caches. To remove the widget, delete that script tag from the site-wide footer and publish again.
