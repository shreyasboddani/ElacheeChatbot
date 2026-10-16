import {
  LearnAILogo,
  ElacheeLogo,
} from "@/components/branding/BrandLogos";
import { ArrowIcon, ShieldIcon } from "@/components/chatbot/Icons";
import { ChatWidget } from "@/components/chatbot/ChatWidget";

const serviceCards = [
  {
    number: "01",
    title: "Plan your visit",
    body: "Ask about visitor-center hours, admission, parking, directions, and what to bring.",
  },
  {
    number: "02",
    title: "Explore programs",
    body: "Find official information about camps, Nature Academy, Sprouts, homeschool programs, and field trips.",
  },
  {
    number: "03",
    title: "Find your trail",
    body: "Learn about hiking routes, trail access, exhibits, live-animal encounters, and upcoming events.",
  },
] as const;

export default function Home() {
  return (
    <main className="demo-page">
      <header className="demo-header">
        <a href="#top" className="demo-brand" aria-label="Elachee assistant prototype home">
          <ElacheeLogo className="demo-elachee-logo" priority />
          <span className="brand-product-name">Information Assistant</span>
        </a>
        <nav aria-label="Prototype navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#integration">Integration</a>
          <a
            className="header-contact"
            href="https://elachee.org/resources/contact-us/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Contact Elachee <ArrowIcon size={16} />
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-text">
          <p className="eyebrow eyebrow-credit">
            <LearnAILogo className="eyebrow-credit-logo" decorative />
            Technology prototype by LearnAI
          </p>
          <h1>
            A clearer path to
            <span> trusted information.</span>
          </h1>
          <p className="hero-lede">
            Elachee Nature Guide helps visitors navigate approved information
            about trails, exhibits, programs, events, and visiting the forest,
            with official sources attached to every supported answer.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#assistant-preview">
              Explore the assistant <ArrowIcon />
            </a>
            <a className="secondary-action" href="#how-it-works">
              See how grounding works
            </a>
          </div>
          <div className="trust-line">
            <ShieldIcon />
            <span>
              Answers come only from approved information from Elachee.
            </span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Assistant overview">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-card">
            <div className="hero-card-top">
              <span className="hero-card-brand">
                <ElacheeLogo className="hero-card-logo" decorative />
              </span>
              <span className="live-pill"><i /> Grounded answers</span>
            </div>
            <p className="hero-card-kicker">ONE TRUSTED TRAILHEAD TO START</p>
            <h2>Ask naturally. Verify easily.</h2>
            <p>
              Visitors get a concise response, a direct link to the supporting
              official page when available, and a clear contact path when the
              approved information is incomplete.
            </p>
            <div className="hero-card-tags" aria-label="Example topics">
              <span>Visitor hours</span>
              <span>Trails</span>
              <span>Camps</span>
              <span>Events</span>
            </div>
          </div>
          <div className="source-proof-card">
            <ShieldIcon size={20} />
            <span><strong>Source required</strong><small>No unsupported answer is shown</small></span>
          </div>
        </div>
      </section>

      <section className="context-section" id="assistant-preview">
        <div className="section-heading">
          <p className="eyebrow"><span /> Standalone demonstration</p>
          <h2>A welcoming layer for Elachee’s existing website.</h2>
          <p>
            This sample content shows how the floating assistant sits alongside
            the public site without replacing its navigation or content.
          </p>
        </div>
        <div className="service-grid">
          {serviceCards.map((card) => (
            <article key={card.number} className="service-card">
              <span className="service-number">{card.number}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <span className="service-link">Ask the assistant <ArrowIcon size={17} /></span>
            </article>
          ))}
        </div>
      </section>

      <section className="grounding-section" id="how-it-works">
        <div className="grounding-copy">
          <p className="eyebrow light"><span /> Designed for careful answers</p>
          <h2>Helpful when the source is clear. Honest when it is not.</h2>
          <p>
            The runtime searches only a prepared Gemini File Search store. It
            does not browse the web during visitor conversations, and it does
            not use general model knowledge to fill gaps in Elachee’s visitor guidance.
          </p>
        </div>
        <ol className="grounding-steps">
          <li><span>1</span><div><strong>Ask a question</strong><p>Visitors use everyday language.</p></div></li>
          <li><span>2</span><div><strong>Search approved material</strong><p>Only synced website and staff content is eligible.</p></div></li>
          <li><span>3</span><div><strong>Show proof or a contact path</strong><p>Mapped sources are required for a substantive answer.</p></div></li>
        </ol>
      </section>

      <section className="integration-section" id="integration">
        <div className="integration-copy">
          <p className="eyebrow"><span /> WordPress installation</p>
          <h2>Put Ask Elachee on Elachee.org.</h2>
          <p className="integration-intro">
            Elachee uses WordPress. You need dashboard access. Follow these
            steps to add the chatbot site-wide without theme edits or an API
            key.
          </p>
          <ol className="integration-steps">
            <li>
              <span aria-hidden="true">1</span>
              <div>
                <strong>Sign in to WordPress.</strong>
                <p>
                  Open{" "}
                  <a href="https://elachee.org/wp-admin/" target="_blank" rel="noreferrer">
                    Elachee&apos;s WordPress dashboard
                  </a>{" "}
                  and sign in with your site account.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">2</span>
              <div>
                <strong>Make sure WPCode is installed.</strong>
                <p>
                  If you already see <b>Code Snippets</b> in the left menu, skip
                  to step 3. Otherwise choose <b>Plugins &gt; Add New Plugin</b>,
                  search WPCode, then click <b>Install</b> and <b>Activate</b>.
                  You may need administrator access.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">3</span>
              <div>
                <strong>Open the shared footer settings.</strong>
                <p>
                  Choose <b>Code Snippets &gt; Header &amp; Footer</b> in the
                  dashboard menu.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">4</span>
              <div>
                <strong>Paste the code and save.</strong>
                <p>
                  Copy the complete script tag in the box, paste it into the{" "}
                  <b>Footer</b> field, then click <b>Save Changes</b>.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">5</span>
              <div>
                <strong>Check that it worked.</strong>
                <p>
                  Open Elachee.org privately and test the launcher. If missing,
                  clear the cache and retry.
                </p>
              </div>
            </li>
          </ol>
          <p className="integration-permissions">
            Don&apos;t see <b>Plugins</b> or <b>Code Snippets</b>? Your account may
            not have permission. Send these instructions and the code to the
            person who manages Elachee&apos;s website.
          </p>
        </div>
        <div className="integration-side">
          <div className="integration-code-card">
            <p className="integration-card-label">Copy this script tag</p>
            <pre aria-label="Elachee chatbot widget code"><code>{`<script async
  src="https://elachee-chatbot.vercel.app/widget-loader.js">
</script>`}</code></pre>
            <p className="integration-code-note">
              Add it once to the site-wide <b>Footer</b> field. The launcher
              appears on every page. Do not paste an API key here.
            </p>
            <div className="integration-resource-links">
              <a href="https://wordpress.org/plugins/insert-headers-and-footers/" target="_blank" rel="noreferrer">
                Find WPCode
              </a>
              <a href="https://wpcode.com/docs/using-the-global-header-footer-settings/" target="_blank" rel="noreferrer">
                WPCode footer-field help
              </a>
            </div>
          </div>
          <aside className="integration-other">
            <h3>Using a different website platform?</h3>
            <p>
              In Squarespace, Wix, or another builder, look in site settings
              for <b>Custom Code</b>, <b>Code Injection</b>, or <b>Footer
              Scripts</b>. Choose the site-wide footer, paste the same script
              tag, and publish.
            </p>
            <p>
              For a custom-coded site, ask the developer to add it to the shared
              page layout just before <code>&lt;/body&gt;</code>. Avoid a
              single-page text or HTML block; it may not load site-wide or may
              remove the script.
            </p>
          </aside>
        </div>
      </section>

      <footer className="demo-footer">
        <div className="footer-elachee-brand">
          <span className="footer-elachee-logo-wrap">
            <ElacheeLogo className="footer-elachee-logo" />
          </span>
          <span>Information Assistant</span>
        </div>
        <div className="footer-meta">
          <div className="learnai-credit">
            <LearnAILogo className="learnai-credit-logo" decorative />
            <span>Prototype technology by <strong>LearnAI</strong></span>
          </div>
          <p>
            Elachee Nature Guide provides general information from approved
            public sources. It cannot check personal program registrations or
            reservations.
          </p>
        </div>
      </footer>

      <ChatWidget />
    </main>
  );
}
