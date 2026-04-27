3:I[4707,[],""]
4:I[6423,[],""]
0:["-T4vmI9wLdUTv1-rKD1M_",[[["",{"children":["docs",{"children":["__PAGE__",{}]}]},"$undefined","$undefined",true],["",{"children":["docs",{"children":["__PAGE__",{},[["$L1","$L2",null],null],null]},[null,["$","$L3",null,{"parallelRouterKey":"children","segmentPath":["children","docs","children"],"error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L4",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","notFoundStyles":"$undefined"}]],null]},[[[["$","link","0",{"rel":"stylesheet","href":"/_next/static/css/bf9a547527b2c92a.css","precedence":"next","crossOrigin":"$undefined"}]],["$","html",null,{"lang":"en","className":"__variable_f367f3 __variable_3c557b","children":[["$","head",null,{"children":[["$","link",null,{"rel":"preconnect","href":"https://fonts.googleapis.com"}],["$","link",null,{"rel":"preconnect","href":"https://fonts.gstatic.com","crossOrigin":"anonymous"}]]}],["$","body",null,{"className":"font-sans bg-bg-base text-text-primary","children":[["$","a",null,{"href":"#main-content","className":"sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded","children":"Skip to content"}],["$","$L3",null,{"parallelRouterKey":"children","segmentPath":["children"],"error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L4",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":[["$","title",null,{"children":"404: This page could not be found."}],["$","div",null,{"style":{"fontFamily":"system-ui,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif,\"Apple Color Emoji\",\"Segoe UI Emoji\"","height":"100vh","textAlign":"center","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center"},"children":["$","div",null,{"children":[["$","style",null,{"dangerouslySetInnerHTML":{"__html":"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}"}}],["$","h1",null,{"className":"next-error-h1","style":{"display":"inline-block","margin":"0 20px 0 0","padding":"0 23px 0 0","fontSize":24,"fontWeight":500,"verticalAlign":"top","lineHeight":"49px"},"children":"404"}],["$","div",null,{"style":{"display":"inline-block"},"children":["$","h2",null,{"style":{"fontSize":14,"fontWeight":400,"lineHeight":"49px","margin":0},"children":"This page could not be found."}]}]]}]}]],"notFoundStyles":[]}]]}]]}]],null],null],["$L5",null]]]]
5:[["$","meta","0",{"name":"viewport","content":"width=device-width, initial-scale=1"}],["$","meta","1",{"charSet":"utf-8"}],["$","title","2",{"children":"Docs | Boop Agent"}],["$","meta","3",{"name":"description","content":"Full documentation for Boop Agent — architecture, integrations, contributing guide, and changelog."}],["$","link","4",{"rel":"author","href":"https://github.com/raroque"}],["$","meta","5",{"name":"author","content":"Chris Raroque"}],["$","meta","6",{"name":"keywords","content":"iMessage agent,Claude Agent SDK,AI agent,Composio,Convex,Sendblue,boop"}],["$","meta","7",{"name":"robots","content":"index, follow"}],["$","meta","8",{"property":"og:title","content":"Boop Agent — Your new best friend 🐶"}],["$","meta","9",{"property":"og:description","content":"A proactive iMessage-based personal agent built on the Claude Agent SDK."}],["$","meta","10",{"property":"og:url","content":"https://boop-agent.vercel.app"}],["$","meta","11",{"property":"og:image","content":"http://localhost:3000/og"}],["$","meta","12",{"property":"og:image:width","content":"1200"}],["$","meta","13",{"property":"og:image:height","content":"630"}],["$","meta","14",{"property":"og:type","content":"website"}],["$","meta","15",{"name":"twitter:card","content":"summary_large_image"}],["$","meta","16",{"name":"twitter:title","content":"Boop Agent"}],["$","meta","17",{"name":"twitter:description","content":"A proactive iMessage-based personal agent built on the Claude Agent SDK."}],["$","meta","18",{"name":"twitter:image","content":"http://localhost:3000/og"}]]
1:null
6:I[2611,["653","static/chunks/653-9f6712537f9a67cb.js","726","static/chunks/app/docs/page-18c777f221101964.js"],"Navbar"]
7:I[7604,["653","static/chunks/653-9f6712537f9a67cb.js","726","static/chunks/app/docs/page-18c777f221101964.js"],"DocsLayout"]
12:I[5878,["653","static/chunks/653-9f6712537f9a67cb.js","726","static/chunks/app/docs/page-18c777f221101964.js"],"Image"]
13:I[2972,["653","static/chunks/653-9f6712537f9a67cb.js","726","static/chunks/app/docs/page-18c777f221101964.js"],""]
8:Tb4d4,<p align="center">
  <img src="assets/boop.gif" alt="Boop" width="220" />
</p>
<h1>Boop</h1>
<p>An iMessage-based personal agent built on top of the <a href="https://docs.claude.com/en/api/agent-sdk/overview">Claude Agent SDK</a>.</p>
<p>📺 <strong>Watch the walkthrough:</strong> <a href="https://youtu.be/ZpmKjDDbqHs">YouTube — How I built Boop</a></p>
<p align="center">
  <img src="assets/imessage.jpg" alt="Boop replying inside iMessage" width="320" />
  <br>
  <sub><em>Boop in action — text it like a person, get back an answer with full context.</em></sub>
</p>
<blockquote>
<p><strong>This is a starting point, not a finished product.</strong>
It's the architecture I built for my own personal agent, opened up as a template so you can take it, text-enable your own Claude, and extend it however you want. Integrations are plugged in via <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a> — drop in an API key and connect Gmail, Slack, GitHub, Linear, Notion, and ~1000 others straight from the debug dashboard.</p>
</blockquote>
<pre><code> iMessage  →  Sendblue webhook  →  Interaction agent  →  Sub-agents (per task)
                                          │                    │
                                          ▼                    ▼
                                    Memory store  ←──  Integrations (your MCP tools)
</code></pre>
<p>Built on:</p>
<ul>
<li><a href="https://github.com/anthropics/claude-agent-sdk-typescript">Claude Agent SDK</a> — the loop, tool use, sub-agents, MCP</li>
<li><a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a> — integrations layer. One API key = Gmail, Slack, GitHub, Linear, Notion, Stripe, Supabase, + ~1000 more with hosted OAuth</li>
<li><a href="https://sendblue.com/?utm_source=raroque">Sendblue</a> — iMessage in/out (free on their agent plan)</li>
<li><a href="https://convex.link/chrisraroque">Convex</a> — real-time database for memory, agents, drafts</li>
<li>Your <a href="https://claude.com/code?ref=chrisraroque">Claude Code</a> subscription — no separate Anthropic API key required</li>
</ul>
<hr>
<h2>What you get</h2>
<ul>
<li><strong>iMessage in / iMessage out</strong> via Sendblue (with typing indicators and webhook dedup).</li>
<li><strong>Sendblue CLI integration</strong> — <code>npm run dev</code> auto-registers the inbound webhook for you every restart (no re-pasting into the dashboard when free ngrok rotates your URL).</li>
<li><strong>Dispatcher + workers</strong> pattern: a lean interaction agent decides what to do, spawns focused sub-agents that actually do the work.</li>
<li><strong>Pure dispatcher</strong> — the interaction agent has only memory + spawn + automation + draft tools. Web access, files, and integrations are explicitly denied to it; sub-agents get <code>WebSearch</code> / <code>WebFetch</code> / the integrations.</li>
<li><strong>Tiered memory</strong> (short / long / permanent) with post-turn extraction, decay, and cleaning.</li>
<li><strong>Vector search</strong> for recall when you add an embeddings key (Voyage or OpenAI) — falls back to substring.</li>
<li><strong>Memory consolidation</strong> — a daily 3-phase adversarial pipeline (proposer → adversary → judge) that merges duplicates, resolves contradictions, and prunes noise. Proposer and judge on Sonnet; adversary on Haiku for cheap skepticism. Runs every 24h by default, also triggerable manually via <code>POST /consolidate</code>.</li>
<li><strong>Automations</strong> — the agent can schedule recurring work from a text ("every morning at 8 summarize my calendar") and push results back to iMessage.</li>
<li><strong>Draft-and-send</strong> — any external action stages a draft first; the agent only commits when the user confirms.</li>
<li><strong>Heartbeat + retry</strong> — stuck agents auto-fail, debug dashboard can retry.</li>
<li><strong>Composio-powered integrations</strong> — one API key unlocks 1000+ toolkits. Connect Gmail, Slack, GitHub, Linear, Notion, Drive, HubSpot, etc. with a click from the debug dashboard. Composio handles OAuth + token refresh.</li>
<li><strong>Debug dashboard</strong> (React + Vite) with a Boop mascot — Dashboard (spend + tokens + agent status), Agents (timeline + integration logos), Automations, Memory (table + force-directed graph), Events, Connections.</li>
<li><strong>Convex</strong> for persistence — real-time, typed, free tier.</li>
<li><strong>Uses your Claude Code subscription</strong> — no separate Anthropic API key required.</li>
</ul>
<p align="center">
  <img src="assets/agents-view.jpg" alt="Agents view in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Agents tab — every spawned sub-agent with status, cost, tokens, turns, runtime, and the integrations it touched.</em></sub>
</p>
<p align="center">
  <img src="assets/automations.jpg" alt="Automations view in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Automations tab — schedule recurring jobs from a text ("every morning at 8 summarize my calendar") and watch them run.</em></sub>
</p>
<p align="center">
  <img src="assets/memory-graph.jpg" alt="Memory graph in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Memory tab — force-directed graph of clustered memories across short, long, and permanent tiers. Tabular view also available.</em></sub>
</p>
<p align="center">
  <img src="assets/connections.jpg" alt="Connections view in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Connections tab — Composio toolkits with OAuth handled for you. Click Connect and the agent can use it on the next message.</em></sub>
</p>
<hr>
<h2>Heads up before you use this</h2>
<ul>
<li><strong>This was never meant to be open-sourced.</strong> I built it for personal use and decided to share the architecture after enough people asked. It's not a product.</li>
<li><strong>Not optimized for cost or security.</strong> Use at your own risk. Review the code, set your own budgets, and don't trust it with anything you wouldn't trust yourself with.</li>
<li><strong>I'm open to PRs for optimizations</strong> — performance, bug fixes, DX improvements, new example integrations, better docs.</li>
</ul>
<hr>
<h2>Why is it named Boop?</h2>
<p align="center">
  <img src="assets/luna.jpeg" alt="Luna" width="220" />
  <br>
  <sub><em>Luna, the inspiration.</em></sub>
</p>
<p>Boop is meant to be a proactive agent — one that nudges you over iMessage with reminders, drafts, and little follow-ups. A small "boop" whenever it has something for you.</p>
<p>And it's named after my dog, Luna, who gives plenty of them.</p>
<hr>
<h2>A note on the native iOS app</h2>
<p>I'm working on open-sourcing the native iOS app I originally built for this. The rewrite is taking much longer to get right than I'd hoped, but it will happen. I don't personally use it anymore — but enough people have asked, and I want to make it happen.</p>
<p>If you want to see what it looked like before I transitioned to an iMessage-based agent, here's <a href="https://www.youtube.com/watch?v=_h2EnRfxMQE">the walkthrough on YouTube</a>.</p>
<hr>
<h2>Prerequisites</h2>
<p>You need accounts for these. Keep the tabs open — setup will ask for credentials from each.</p>
<blockquote>
<p><strong>You should be able to get away with the free plan for each service (except Claude Code), and I'm working to secure discounts for you guys on the pro plans. If you work at any of these companies, please reach out!</strong></p>
</blockquote>
<table>
<thead>
<tr>
<th>Service</th>
<th>Why</th>
<th>Free?</th>
<th>Discount code</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://claude.com/code?ref=chrisraroque">Claude Code</a></td>
<td>Powers the agent. Install it, sign in once, the SDK uses your session.</td>
<td>Subscription required</td>
<td>Working on getting one (if you work here, please reach out!)</td>
</tr>
<tr>
<td><a href="https://sendblue.com/?utm_source=raroque">Sendblue</a></td>
<td>iMessage bridge. Get a number, grab API keys.</td>
<td>Free on their agent plan</td>
<td><code>RAROQUE20</code> — 20% off for 6 months (helpful if you plan to commercialize)</td>
</tr>
<tr>
<td><a href="https://convex.link/chrisraroque">Convex</a></td>
<td>Database + realtime.</td>
<td>Free tier is plenty</td>
<td>Working on getting one (in touch with them 👀)</td>
</tr>
<tr>
<td><a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a></td>
<td>Integrations — one API key unlocks ~1000 toolkits. Optional if you just want chat + memory + automations without third-party access.</td>
<td>Free tier covers personal use</td>
<td><code>CHRISXCOMPOSIO</code> — 1 month free on starter plan</td>
</tr>
<tr>
<td><a href="https://ngrok.com?ref=chrisraroque">ngrok</a> or similar</td>
<td>Expose your local port so Sendblue can reach it.</td>
<td>Free tier works</td>
<td>Working on getting one (if you work here, please reach out!)</td>
</tr>
</tbody>
</table>
<p><strong>Custom integrations welcome.</strong> Composio covers the common catalog, but you're free to add your own MCP servers under <code>server/integrations/</code> and register them in <code>server/integrations/registry.ts</code> — the dispatcher treats them the same as Composio-backed ones (just named toolkits the execution agent can spawn against). Useful for in-house APIs, local tools, or anything Composio doesn't ship.</p>
<hr>
<h2>Quickstart</h2>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="bash" data-theme="github-dark"><code data-language="bash" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#6A737D"># 1. Clone + install</span></span>
<span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> clone</span><span style="color:#9ECBFF"> https://github.com/raroque/boop-agent.git</span></span>
<span data-line=""><span style="color:#79B8FF">cd</span><span style="color:#9ECBFF"> boop-agent</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> install</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 2. Install Claude Code (one-time, global) and sign in</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> install</span><span style="color:#79B8FF"> -g</span><span style="color:#9ECBFF"> @anthropic-ai/claude-code</span></span>
<span data-line=""><span style="color:#B392F0">claude</span><span style="color:#6A737D">  # sign in, then Ctrl-C to exit</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 3. Interactive setup — writes .env.local, creates Convex deployment</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> run</span><span style="color:#9ECBFF"> setup</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 4. Install ngrok (one-time) and authorize it</span></span>
<span data-line=""><span style="color:#B392F0">brew</span><span style="color:#9ECBFF"> install</span><span style="color:#9ECBFF"> ngrok</span></span>
<span data-line=""><span style="color:#6A737D"># or grab from https://ngrok.com/download</span></span>
<span data-line=""><span style="color:#B392F0">ngrok</span><span style="color:#9ECBFF"> config</span><span style="color:#9ECBFF"> add-authtoken</span><span style="color:#F97583"> &#x3C;</span><span style="color:#9ECBFF">your-toke</span><span style="color:#E1E4E8">n</span><span style="color:#F97583">></span><span style="color:#6A737D">   # free at https://dashboard.ngrok.com</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 5. Start everything with one command — server, Convex, debug UI, and ngrok</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> run</span><span style="color:#9ECBFF"> dev</span></span></code></pre></figure>
<p><code>npm run dev</code> prints color-prefixed output from all four processes and shows a banner with your ngrok webhook URL once the tunnel is live.</p>
<pre><code>Public URL:        https://&#x3C;abc123>.ngrok.app
Sendblue webhook:  https://&#x3C;abc123>.ngrok.app/sendblue/webhook
</code></pre>
<p>On free ngrok, <strong>the webhook auto-registers with Sendblue every boot</strong> — no manual paste needed. For stable URLs (ngrok reserved or Cloudflare Tunnel), set the webhook once in the dashboard.</p>
<p>Text your Sendblue-provisioned number from a <strong>different</strong> phone. The agent replies.</p>
<blockquote>
<p><strong>⚠ ngrok free plan gives you a new URL every time.</strong> That means every time you restart <code>npm run dev</code>, your Sendblue webhook URL is dead until you paste the new one in.</p>
<p>If you're going to run this for more than a quick demo, <strong>strongly recommend one of:</strong></p>
<ul>
<li><strong>ngrok paid plan</strong> — gives you a reserved domain that stays the same forever</li>
<li><strong><a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/">Cloudflare Tunnel</a></strong> — free, stable subdomain, a bit more setup</li>
<li>Any other tunnel with a static URL (Tailscale Funnel, localtunnel reserved, etc.)</li>
</ul>
<p>If you use a non-ngrok tunnel, point it at <code>localhost:3456</code> yourself — <code>npm run dev</code> will still run the rest, just ignore its ngrok output and use your tunnel's URL.</p>
</blockquote>
<blockquote>
<p><strong>Gotcha:</strong> <code>SENDBLUE_FROM_NUMBER</code> must be your Sendblue-provisioned number (the one people text TO), not your personal cell. Sendblue's API requires it, and misconfiguring it returns either "missing required parameter: from_number" or "Cannot send messages to self".</p>
<p><strong>Fix in one command:</strong> <code>npm run sendblue:sync</code> pulls the right number from the Sendblue CLI and writes it to <code>.env.local</code>.</p>
</blockquote>
<hr>
<h2>How the Sendblue integration works</h2>
<p>Boop uses the <a href="https://github.com/sendblue-api/sendblue-cli">Sendblue CLI</a> (<code>@sendblue/cli</code>) to eliminate almost all manual dashboard work. Three NPM scripts wrap it:</p>
<table>
<thead>
<tr>
<th>Command</th>
<th>What it does</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>npm run setup</code></td>
<td>Interactive. Offers to run <code>sendblue login</code> / <code>sendblue setup</code> and pulls <code>api_key_id</code> + <code>api_secret_key</code> from <code>sendblue show-keys</code> into <code>.env.local</code>.</td>
</tr>
<tr>
<td><code>npm run sendblue:sync</code></td>
<td>Runs <code>sendblue lines</code>, parses your provisioned phone number, and writes <code>SENDBLUE_FROM_NUMBER</code> to <code>.env.local</code> in E.164 format. Run this anytime your number changes or got set wrong.</td>
</tr>
<tr>
<td><code>npm run sendblue:webhook -- &#x3C;url></code></td>
<td>Runs <code>sendblue webhooks list</code>, removes stale ngrok/tunnel hooks, and adds <code>&#x3C;url></code> as a <code>type=receive</code> inbound webhook. Called automatically by <code>npm run dev</code>.</td>
</tr>
</tbody>
</table>
<h3>The <code>npm run dev</code> lifecycle</h3>
<pre><code> 1. Preflight: confirm convex/_generated/ exists (else prompt to run setup).
 2. Spawn four children in parallel, each with a prefixed log stream:
       server │   (tsx watch server/index.ts)
       convex │   (npx convex dev — pushes schema + functions)
       debug  │   (vite dev server on :5173)
       ngrok  │   (if installed AND no static URL) exposes :PORT
 3. Wait for all four readiness signals:
       server → "listening on :PORT"
       convex → "Convex functions ready"
       debug  → "Local:  http://localhost:5173/"
       ngrok  → tunnel URL visible at http://127.0.0.1:4040
 4. Auto-register the webhook (FREE ngrok only, not reserved domains):
       webhook │ [webhook] removed stale https://old.ngrok-free.app/sendblue/webhook
       webhook │ [webhook] registered https://new.ngrok-free.app/sendblue/webhook (type=receive)
 5. Show the banner with dashboard + public URL + your Sendblue number.
</code></pre>
<p>The banner will look like:</p>
<pre><code>════════════════════════════════════════════════════════════════════
  Boop is ready — ngrok tunnel is live  (webhook auto-registered).

  🐶 Debug dashboard (click me):   http://localhost:5173
  🌐 Public URL:                   https://abc123.ngrok-free.app
  📮 Sendblue webhook (inbound):   https://abc123.ngrok-free.app/sendblue/webhook
  📱 Text this Sendblue number:    +13053369541  (from a DIFFERENT phone)
════════════════════════════════════════════════════════════════════
</code></pre>
<h3>When auto-register fires vs when it doesn't</h3>
<table>
<thead>
<tr>
<th>Setup</th>
<th>Auto-register fires?</th>
<th>Why</th>
</tr>
</thead>
<tbody>
<tr>
<td>Free ngrok (default)</td>
<td><strong>Yes</strong>, every boot</td>
<td>URL rotates; dashboard would be stale otherwise</td>
</tr>
<tr>
<td>Reserved <code>NGROK_DOMAIN</code></td>
<td>No</td>
<td>URL is stable; configure once in Sendblue dashboard</td>
</tr>
<tr>
<td>Static <code>PUBLIC_URL</code> (Cloudflare Tunnel etc.)</td>
<td>No</td>
<td>Same reason</td>
</tr>
<tr>
<td><code>SENDBLUE_AUTO_WEBHOOK=false</code></td>
<td>No</td>
<td>Manual opt-out</td>
</tr>
</tbody>
</table>
<h3>What you'll see in the server logs during a conversation</h3>
<p>When someone texts your Sendblue number, expect this sequence in your terminal:</p>
<pre><code>server │ [turn a3f21d] ← +14155551234: "what's on my calendar today?"
server │ [turn a3f21d] tool: recall({"query":"calendar today"})
server │ [turn a3f21d] tool: spawn_agent({"integrations":["google-calendar"],"task":"Pull today's events"})
server │ [agent 9e82c1] spawn: google-calendar [google-calendar] — "Pull today's events"
server │ [agent 9e82c1] tool: list_events
server │ [agent 9e82c1] done (completed, 2.1s, in/out tokens 1234/567)
server │ [turn a3f21d] → reply (3.4s, 140 chars): "Light day — just your 2pm with Sarah..."
server │ [sendblue] → sent 140 chars to +14155551234
</code></pre>
<p>Per-line anatomy:</p>
<ul>
<li><strong><code>[turn xxxxxx]</code></strong> — one iMessage round trip. Same id across <code>←</code> (incoming) → tool calls → <code>→ reply</code> → <code>[sendblue] sent</code>.</li>
<li><strong><code>[agent xxxxxx]</code></strong> — a spawned execution agent. Shows <code>spawn</code>, each <code>tool:</code> it invokes, and <code>done</code> with timing + token counts.</li>
<li><strong><code>[sendblue]</code></strong> — outbound send results. If Sendblue rejects, the error body is logged with a hint about the likely cause (from_number mismatch, self-send, etc.).</li>
</ul>
<p>The same events are written to Convex (<code>messages</code>, <code>executionAgents</code>, <code>agentLogs</code>, <code>memoryEvents</code> tables) and streamed to the debug dashboard in real time.</p>
<h3>When to re-run each Sendblue script</h3>
<ul>
<li><strong>First time / after losing <code>.env.local</code></strong> → <code>npm run setup</code> (walks through Sendblue + Convex together)</li>
<li><strong>Phone number looks wrong in the banner</strong> → <code>npm run sendblue:sync</code></li>
<li><strong>Webhook went stale in the dashboard and auto-register is off</strong> → <code>npm run sendblue:webhook -- https://your-url.example.com/sendblue/webhook</code></li>
</ul>
<h3>Disabling auto-register</h3>
<p>Add to <code>.env.local</code>:</p>
<pre><code>SENDBLUE_AUTO_WEBHOOK=false
</code></pre>
<p><code>npm run dev</code> will still show you the webhook URL in the banner so you can paste it yourself.</p>
<p>Visit <code>http://localhost:5173</code> for the debug dashboard (chat, agents, memory, events). You can also chat from the dashboard's Chat tab without Sendblue.</p>
<p><strong>This is the full first-run.</strong> You now have a working agent that chats, remembers, and schedules reminders. Enable integrations (Gmail, Calendar, Notion, Slack) when you want more — see the next section.</p>
<hr>
<h2>Architecture in 30 seconds</h2>
<pre><code>┌─────────────┐    webhook     ┌─────────────────────┐
│   iMessage  │ ─────────────► │ Sendblue → /webhook │
└─────────────┘                └──────────┬──────────┘
                                          │
                                          ▼
                          ┌────────────────────────────┐
                          │    Interaction agent       │
                          │    (dispatcher only)       │
                          │  • recall / write_memory   │
                          │  • spawn_agent(...)        │
                          └────────┬────────┬──────────┘
                                   │        │
                   ┌───────────────┘        └──────────────┐
                   ▼                                       ▼
           ┌───────────────┐                      ┌──────────────┐
           │   Memory      │                      │  Execution   │
           │ (Convex)      │                      │  agent(s)    │
           │ + cleaning    │                      │  + integrations│
           └───────────────┘                      └──────────────┘
</code></pre>
<ul>
<li><strong>Interaction agent</strong> (<code>server/interaction-agent.ts</code>) is the front door. It reads the user's message + recent history, optionally calls <code>recall</code>, writes memories, creates automations, and decides whether to answer directly or spawn a sub-agent.</li>
<li><strong>Execution agent</strong> (<code>server/execution-agent.ts</code>) is spawned per task. It loads only the integrations named in the spawn call and returns a tight answer.</li>
<li><strong>Memory</strong> (<code>server/memory/</code>) handles writes, recall, post-turn extraction, and daily cleaning. Stored in Convex.</li>
<li><strong>Automations</strong> (<code>server/automations.ts</code>) poll every 30s for due jobs, spawn an execution agent to run them, and push results back to the user.</li>
<li><strong>Integrations</strong> are provided by <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>. The dispatcher names toolkits by slug (<code>spawn_agent(integrations: ["gmail"])</code>); <code>server/composio.ts</code> opens a toolkit-scoped Composio session per spawn and wraps its tools as an MCP server. No per-integration code to write.</li>
</ul>
<p>Deep dive: <a href="./ARCHITECTURE.md">ARCHITECTURE.md</a>. Adding your own tools: <a href="./INTEGRATIONS.md">INTEGRATIONS.md</a>.</p>
<hr>
<h2>Skills</h2>
<p>Skills are reusable playbooks — <code>SKILL.md</code> files under <code>.claude/skills/</code> that teach the execution agent how to do a specific kind of task (write a YouTube script, draft a cold email, plan a trip, etc.).</p>
<p><strong>How the Agent SDK handles them:</strong> every <code>.claude/skills/*/SKILL.md</code> is loaded when the execution agent boots, and each skill's <code>description</code> gets injected into the agent's system prompt along with an instruction to pick the relevant one for the current task. You do <strong>not</strong> select skills per spawn — the agent picks based on which description matches. Only descriptions load upfront; the full SKILL.md body is pulled into context only when the agent actually invokes the skill, so adding more skills is cheap.</p>
<p>The SDK is pretty smart about picking the right skill as long as your <code>description</code> is specific and front-loads the trigger phrases ("Use when the user asks to write a video script, turn research into a YouTube video…"). Vague descriptions = missed invocations.</p>
<p>Wiring (in <code>server/execution-agent.ts</code>):</p>
<ul>
<li><code>settingSources: ["project"]</code> — tells the SDK to load <code>.claude/skills/</code></li>
<li><code>"Skill"</code> in <code>allowedTools</code> — enables the Skill tool</li>
</ul>
<p>Only the <strong>execution agent</strong> loads skills. The dispatcher (interaction-agent) stays in SDK isolation mode, so it never sees them — which is correct, because the dispatcher should never do work, only route.</p>
<p><strong>To add a skill:</strong> create <code>.claude/skills/&#x3C;kebab-name>/SKILL.md</code>:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="yaml" data-theme="github-dark"><code data-language="yaml" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">---</span></span>
<span data-line=""><span style="color:#85E89D">name</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">youtube-script-writer</span></span>
<span data-line=""><span style="color:#85E89D">description</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">Write a tight, retention-focused YouTube script from a topic or outline. Use when the user asks for a video script, wants to turn research into a video, or needs a hook rewritten.</span></span>
<span data-line=""><span style="color:#B392F0">---</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#9ECBFF">&#x3C;instructions the agent follows when this skill is invoked></span></span></code></pre></figure>
<p>There's a soft budget (~15k chars by default, via <code>SLASH_COMMAND_TOOL_CHAR_BUDGET</code>) for the combined skill-description block in context — if you end up with many skills, keep descriptions sharp so none get truncated.</p>
<p>Example included: <code>.claude/skills/youtube-script-writer/</code>.</p>
<hr>
<h2>Using your Claude Code subscription</h2>
<p>The Claude Agent SDK reuses the credentials Claude Code writes to your machine when you sign in. You do not need an <code>ANTHROPIC_API_KEY</code>.</p>
<ul>
<li>Install once: <code>npm install -g @anthropic-ai/claude-code</code></li>
<li>Run <code>claude</code> in a terminal, sign in.</li>
<li>That's it — the SDK finds the session automatically.</li>
</ul>
<p>If you'd prefer an API key (e.g. for a deployed server), set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> and the SDK will use it instead.</p>
<hr>
<h2>Environment variables</h2>
<p>Everything lives in <code>.env.local</code> (auto-created by <code>npm run setup</code>). See <code>.env.example</code> for the full list.</p>
<table>
<thead>
<tr>
<th>Var</th>
<th>Required</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>CONVEX_URL</code> / <code>VITE_CONVEX_URL</code></td>
<td>yes</td>
<td>Convex deployment URL. Written by <code>npx convex dev</code>.</td>
</tr>
<tr>
<td><code>SENDBLUE_API_KEY</code> / <code>SENDBLUE_API_SECRET</code></td>
<td>yes</td>
<td>From your Sendblue dashboard.</td>
</tr>
<tr>
<td><code>SENDBLUE_FROM_NUMBER</code></td>
<td>yes</td>
<td>Your Sendblue-provisioned number.</td>
</tr>
<tr>
<td><code>BOOP_MODEL</code></td>
<td>no</td>
<td>Default <code>claude-sonnet-4-6</code>.</td>
</tr>
<tr>
<td><code>BOOP_UPSTREAM_CHECK</code></td>
<td>no</td>
<td>Set to <code>false</code> to disable the new-version banner on <code>npm run dev</code>. Default: on.</td>
</tr>
<tr>
<td><code>PORT</code></td>
<td>no</td>
<td>Default <code>3456</code>.</td>
</tr>
<tr>
<td><code>PUBLIC_URL</code></td>
<td>no</td>
<td>Base URL used in the Sendblue webhook. Composio handles its own OAuth callbacks on <code>platform.composio.dev</code>, so this is just for inbound iMessage.</td>
</tr>
<tr>
<td><code>VOYAGE_API_KEY</code> <strong>or</strong> <code>OPENAI_API_KEY</code></td>
<td>optional</td>
<td>Unlocks vector recall. Falls back to substring.</td>
</tr>
<tr>
<td><code>COMPOSIO_API_KEY</code></td>
<td>optional</td>
<td>Enables integrations. Without it, plain chat + memory + automations still work. Get one at <a href="https://app.composio.dev/developers?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">app.composio.dev/developers</a>.</td>
</tr>
<tr>
<td><code>COMPOSIO_USER_ID</code></td>
<td>optional</td>
<td>Stable user id Composio keys connections under. Defaults to <code>boop-default</code>.</td>
</tr>
<tr>
<td><code>ANTHROPIC_API_KEY</code></td>
<td>optional</td>
<td>Bypass the Claude Code subscription.</td>
</tr>
</tbody>
</table>
<hr>
<h2>Integrations, via Composio</h2>
<p>Boop outsources 3rd-party service integrations to <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>. One API key unlocks ~1000 toolkits (Gmail, Slack, GitHub, Linear, Notion, Drive, Stripe, Supabase, HubSpot, Salesforce, Granola, and so on). Composio hosts the OAuth apps, manages token refresh, and exposes every toolkit as a set of Claude-ready tools. Boop never sees an access token.</p>
<h3>Quickstart</h3>
<ol>
<li>Grab an API key at <a href="https://app.composio.dev/developers?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">app.composio.dev/developers</a>.</li>
<li>Add it to <code>.env.local</code>:
<pre><code>COMPOSIO_API_KEY=sk-comp-...
</code></pre>
</li>
<li><code>npm run dev</code>.</li>
<li>Open the debug dashboard → <strong>Connections</strong> tab. You'll see a curated list of ~20 cards split into:
<ul>
<li><strong>Ready to connect</strong> — Composio manages the OAuth app. Click <strong>Connect</strong>, authenticate on Composio's hosted page, done.</li>
<li><strong>Needs one-time auth config</strong> — a few toolkits (Twitter/X, LinkedIn, Salesforce) require you to register your own OAuth app on their dev portal and paste the client ID/secret into <code>platform.composio.dev/auth-configs</code>. The card's <strong>Set up →</strong> link takes you straight there. Once registered, the card flips to Ready.</li>
</ul>
</li>
</ol>
<p>After a successful connect, the agent can use that toolkit immediately — no restart.</p>
<h3>How it wires in</h3>
<p>Boop keeps the dispatcher / executor split intact. Composio sits under the executor:</p>
<pre><code>interaction-agent:  spawn_agent(task, integrations: ["gmail", "slack"])
                              │
                              ▼
execution-agent:    for each slug, open a Composio session scoped to that toolkit:
                      composio.create(BOOP_USER, { toolkits: ["gmail"] })
                      session.tools()          ← returns only Gmail tools
                              │
                              ▼
                    createSdkMcpServer({ name: "gmail", tools })
                              │
                              ▼
                    Sub-agent sees mcp__gmail__GMAIL_*  — nothing else.
</code></pre>
<p>Key properties:</p>
<ul>
<li><strong>Per-spawn tool scope.</strong> The dispatcher picks which toolkits the sub-agent sees. Tens of tools per spawn, not thousands, so context stays tight and the agent stays fast.</li>
<li><strong>Toolkit slug = integration name.</strong> <code>spawn_agent(integrations: ["linear"])</code> works for any toolkit you've connected. Unknown slugs just log a warning and are skipped.</li>
<li><strong>No tokens on our side.</strong> Every tool call runs through Composio's proxy. If Composio goes down, integrations go down — but your server never holds user OAuth tokens.</li>
<li><strong>Multi-account per toolkit.</strong> Connect a second Gmail (work + personal) — each gets its own connection row you can alias. The dispatcher picks up all active connections for the slug.</li>
<li><strong>Identity resolution.</strong> Connection cards show the real account email (e.g. <code>chris@aloa.co</code>) resolved by calling the toolkit's own "who am I" tool through Composio (<code>GMAIL_GET_PROFILE</code>, etc.). Alias per connection if you want a friendlier label.</li>
</ul>
<h3>Adding toolkits beyond the curated list</h3>
<p>The ~20 toolkit catalog is hand-picked in <code>server/composio.ts:CURATED_TOOLKITS</code>. To surface another:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#6A737D">// server/composio.ts</span></span>
<span data-line=""><span style="color:#F97583">export</span><span style="color:#F97583"> const</span><span style="color:#79B8FF"> CURATED_TOOLKITS</span><span style="color:#F97583">:</span><span style="color:#B392F0"> CuratedToolkit</span><span style="color:#E1E4E8">[] </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> [</span></span>
<span data-line=""><span style="color:#6A737D">  // …existing entries…</span></span>
<span data-line=""><span style="color:#E1E4E8">  { slug: </span><span style="color:#9ECBFF">"airtable"</span><span style="color:#E1E4E8">, displayName: </span><span style="color:#9ECBFF">"Airtable"</span><span style="color:#E1E4E8">, authMode: </span><span style="color:#9ECBFF">"managed"</span><span style="color:#E1E4E8"> },</span></span>
<span data-line=""><span style="color:#E1E4E8">];</span></span></code></pre></figure>
<p><code>authMode: "managed"</code> is correct for most toolkits. Use <code>"byo"</code> only if you know Composio requires a custom OAuth app (Twitter/LinkedIn/Salesforce-style). If you guess wrong, the UI's auth-config fallback banner catches it and points you at the right dashboard page.</p>
<h3>Cost tracking</h3>
<p>Every execution agent's <code>total_cost_usd</code> comes straight from the Claude Agent SDK's <code>result</code> message (authoritative, matches Anthropic's billing). You'll see real dollar amounts in the Dashboard tab's Cost tile and per-agent cards.</p>
<p>Every LLM call — dispatcher turn, execution-agent run, memory extraction, consolidation (proposer / adversary / judge) — also writes a row to the <code>usageRecords</code> table with per-layer tokens (including cache read/write) and cost. <code>usageRecords:summary</code> gives you totals by source so you can see which layer is actually burning the bill. Each row reports the model the caller requested, not the model-routing the SDK did internally.</p>
<h3>A note on runaway cost</h3>
<p>Boop's <code>query()</code> calls don't currently set <code>maxTurns</code> or <code>maxBudgetUsd</code>. Those are hard stops the SDK exposes — set them and the agent aborts once the threshold hits, with whatever partial result it has.</p>
<p>Kept as-is intentionally for a single-user personal agent: every task is scoped tight (spawned by the dispatcher with a specific task string + a small integration list), integrations are Composio-scoped per spawn so the tool surface stays small, and the existing 15-minute heartbeat (<code>server/heartbeat.ts</code>) marks any long-running agent as <code>failed</code> and aborts it. In practice execution agents complete in under 60 seconds.</p>
<p>If you deploy Boop in a higher-throughput setting, or hand it integrations that allow looping (webhooks, scrapers), you probably want to set <code>maxTurns: 20</code> and <code>maxBudgetUsd: 2.00</code> on the <code>query()</code> call in <code>server/execution-agent.ts</code> as a belt-and-suspenders cap.</p>
<h3>Keeping it in sync</h3>
<p>Deeper dive — auth modes, toolkit scoping internals, multi-account flow, per-connection identity: <a href="./INTEGRATIONS.md">INTEGRATIONS.md</a>.</p>
<p>Upgrade path when upstream ships changes: run <code>/upgrade-boop</code> inside <code>claude</code> (the skill under <code>.claude/skills/upgrade-boop/</code>) — previews diffs, backs up, merges, surfaces <code>[BREAKING]</code> CHANGELOG entries. See <a href="./CONTRIBUTING.md">CONTRIBUTING.md</a> for contribution rules + the CHANGELOG / migration-skill conventions.</p>
<hr>
<h2>Project layout</h2>
<pre><code>boop-agent/
├── server/
│   ├── index.ts                   # Express + WS + HTTP routes
│   ├── sendblue.ts                # iMessage webhook, reply, typing indicator
│   ├── interaction-agent.ts       # Dispatcher
│   ├── execution-agent.ts         # Sub-agent runner
│   ├── automations.ts             # Cron loop
│   ├── automation-tools.ts        # create/list/toggle/delete MCP
│   ├── draft-tools.ts             # save_draft / send_draft / reject_draft MCP
│   ├── heartbeat.ts               # Stale-agent sweep
│   ├── consolidation.ts           # 3-phase adversarial pipeline (proposer → adversary → judge)
│   ├── usage.ts                   # aggregateUsageFromResult helper (shared cost aggregation)
│   ├── embeddings.ts              # Voyage / OpenAI wrapper
│   ├── composio.ts                # Composio SDK wrapper (session + toolkit scoping)
│   ├── composio-routes.ts         # /composio/* HTTP routes for the Debug UI
│   ├── broadcast.ts               # WS fanout
│   ├── convex-client.ts           # Convex HTTP client
│   ├── memory/
│   │   ├── types.ts
│   │   ├── tools.ts               # write_memory / recall (vector + substring)
│   │   ├── extract.ts             # Post-turn extraction
│   │   └── clean.ts               # Decay + archive + prune
│   └── integrations/
│       ├── registry.ts            # Integration loader
│       └── composio-loader.ts     # Registers each connected Composio toolkit
├── convex/
│   ├── schema.ts
│   ├── messages.ts
│   ├── memoryRecords.ts
│   ├── agents.ts
│   ├── automations.ts
│   ├── consolidation.ts
│   ├── conversations.ts
│   ├── drafts.ts
│   ├── memoryEvents.ts
│   ├── usageRecords.ts            # Append-only per-call cost log
│   └── sendblueDedup.ts
├── debug/                         # Dashboard: Dashboard / Agents / Automations / Memory / Events / Connections
├── scripts/
│   ├── setup.ts                   # Interactive setup CLI
│   ├── dev.mjs                    # One-command orchestrator (server + convex + vite + ngrok)
│   ├── preflight.mjs              # Checks convex/_generated exists before booting
│   ├── sendblue-sync.mjs          # Pulls phone number from `sendblue lines`
│   └── sendblue-webhook.mjs       # Registers inbound webhook via Sendblue CLI
├── README.md           ← you are here
├── ARCHITECTURE.md
└── INTEGRATIONS.md
</code></pre>
<hr>
<h2>Upgrading</h2>
<p>Boop is a fork-and-own template. You customize your copy freely — system prompts, memory thresholds, extra tools — and pull upstream fixes in on your own schedule.</p>
<p>The intended path is <strong>Claude Code-driven</strong>, modeled on NanoClaw:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="bash" data-theme="github-dark"><code data-language="bash" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">claude</span><span style="color:#6A737D">                 # inside your repo</span></span>
<span data-line=""><span style="color:#B392F0">/upgrade-boop</span></span></code></pre></figure>
<p><code>/upgrade-boop</code> is a skill in <code>.claude/skills/upgrade-boop/SKILL.md</code>. It:</p>
<ol>
<li>Refuses to run with a dirty working tree.</li>
<li>Creates a timestamped rollback tag.</li>
<li>Previews upstream changes bucketed by area (core / integrations / UI / schema / scripts / docs).</li>
<li>Merges (or cherry-picks, or rebases — your choice).</li>
<li>Runs <code>npm install</code> + <code>npm run typecheck</code>.</li>
<li>Parses <code>CHANGELOG.md</code> for <code>[BREAKING]</code> entries and offers to run the referenced migration skills.</li>
<li>Prints a rollback hash + any env-var additions you should copy into <code>.env.local</code>.</li>
</ol>
<p>Plain git works too, if you'd rather:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="bash" data-theme="github-dark"><code data-language="bash" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> remote</span><span style="color:#9ECBFF"> add</span><span style="color:#9ECBFF"> upstream</span><span style="color:#9ECBFF"> https://github.com/chris/boop-agent.git</span><span style="color:#6A737D">    # one-time</span></span>
<span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> fetch</span><span style="color:#9ECBFF"> upstream</span></span>
<span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> merge</span><span style="color:#9ECBFF"> upstream/main</span><span style="color:#6A737D">      # or: git rebase upstream/main</span></span></code></pre></figure>
<h3>New-version notifications</h3>
<p>Every time you run <code>npm run dev</code>, a small background check (<code>scripts/check-upstream.mjs</code>) asks your <code>upstream</code> remote if there are new commits. If there are, you'll see a banner up top with the count and a reminder to run <code>/upgrade-boop</code>. If you're up to date, or the check fails for any reason (offline, no <code>upstream</code> remote, timeout), it stays silent.</p>
<p>Behavior at a glance:</p>
<ul>
<li><code>upstream</code> set, new commits → banner with the count</li>
<li><code>upstream</code> set, up to date → silent</li>
<li>No <code>upstream</code> remote, on a fork → one-line hint on adding it</li>
<li>No <code>upstream</code> remote, on the canonical repo → silent (you <em>are</em> upstream)</li>
</ul>
<p>To turn it off:</p>
<ul>
<li><strong>Env var:</strong> add <code>BOOP_UPSTREAM_CHECK=false</code> to <code>.env.local</code></li>
<li><strong>Or comment it out:</strong> the call lives in <code>scripts/dev.mjs</code> — the <code>spawn("node", ["scripts/check-upstream.mjs"], ...)</code> block. Delete or comment that block and the check never runs.</li>
</ul>
<h3>CHANGELOG</h3>
<p>Every release lists additions under <a href="./CHANGELOG.md">CHANGELOG.md</a>, with <code>[BREAKING]</code> prefixes for anything that requires action. <code>/upgrade-boop</code> parses that format automatically.</p>
<hr>
<h2>Troubleshooting</h2>
<p><strong>Agent doesn't reply.</strong></p>
<ul>
<li>Check the server is running: <code>curl http://localhost:3456/health</code></li>
<li>Check the Sendblue webhook is pointed at <code>&#x3C;public-url>/sendblue/webhook</code></li>
<li>Watch server logs. Look for <code>[sendblue]</code> and <code>[interaction]</code> messages.</li>
</ul>
<p><strong>Convex errors / <code>VITE_CONVEX_URL is not set</code>.</strong></p>
<ul>
<li>Run <code>npx convex dev</code> manually. Ensure <code>.env.local</code> has both <code>CONVEX_URL</code> and <code>VITE_CONVEX_URL</code>.</li>
</ul>
<p><strong>"Could not find public function for X:Y".</strong></p>
<ul>
<li><code>CONVEX_DEPLOYMENT</code> and <code>CONVEX_URL</code> in <code>.env.local</code> are pointing at different projects. <code>convex dev</code> pushes functions to <code>CONVEX_DEPLOYMENT</code> but the client reads from <code>CONVEX_URL</code>. Fix: make sure the URL has the same name as the deployment — <code>CONVEX_DEPLOYMENT=dev:foo-bar-123</code> → <code>CONVEX_URL=https://foo-bar-123.convex.cloud</code>. Re-running <code>npm run setup</code> now auto-syncs these.</li>
</ul>
<p><strong>Agent replies but can't use my integration.</strong></p>
<ul>
<li>Check <code>COMPOSIO_API_KEY</code> is set in <code>.env.local</code>.</li>
<li>Check the toolkit shows as <strong>Connected</strong> in the Connections tab.</li>
<li>Watch server logs for <code>[composio] registered …</code> at boot and <code>[integrations] unknown integration: …</code> on spawn attempts.</li>
</ul>
<p><strong>I want to skip Sendblue for now.</strong></p>
<ul>
<li>The server exposes <code>POST /chat</code> with <code>{ conversationId, content }</code> — curl or a tiny client can drive the agent directly, no iMessage required.</li>
</ul>
<p><strong>Claude SDK says no credentials.</strong></p>
<ul>
<li>Run <code>claude</code> once and sign in, or set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code>.</li>
</ul>
<p><strong>"Cannot send messages to self" / "missing required parameter: from_number".</strong></p>
<ul>
<li><code>SENDBLUE_FROM_NUMBER</code> is set to your personal cell instead of your Sendblue-provisioned number. Run <code>npm run sendblue:sync</code> to pull the correct number from <code>sendblue lines</code> and write it to <code>.env.local</code>.</li>
</ul>
<p><strong>"Dashboard crashed" in the debug UI.</strong></p>
<ul>
<li>The ErrorBoundary caught something. Check the server logs (<code>server │</code> stream) and the browser console — both will have the real error. Most common cause: a new Convex function hasn't been deployed yet. Restart <code>npm run dev</code> so <code>convex dev</code> re-pushes.</li>
</ul>
<hr>
<h2>License</h2>
<p>MIT. Build whatever you want on top of this.</p>9:T446b,<h1>Architecture</h1>
<p>boop-agent is a small distributed system disguised as a single-server app. Four moving parts, each doing one job.</p>
<h2>The four parts</h2>
<pre><code>┌────────────────────────────────────────────────────────────────┐
│                      EXPRESS + WS SERVER                        │
│                                                                 │
│   POST /sendblue/webhook   ──────►  Interaction Agent           │
│   POST /chat                        (dispatcher, streams)       │
│   WS /ws                                  │                     │
│                                           │ spawn_agent         │
│                                           ▼                     │
│                                    Execution Agent(s)           │
│                                    (one per task)               │
│                                           │                     │
│                                           ▼                     │
│                                    Integrations (MCP)           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       ┌────────────┐         ┌────────────────┐
                       │  Convex    │◄───────►│  Debug UI      │
                       │  (truth)   │         │  (read-only)   │
                       └────────────┘         └────────────────┘
</code></pre>
<h3>1. Interaction agent — <code>server/interaction-agent.ts</code></h3>
<p>The front door. One instance per user turn. Its job is to <strong>decide</strong>, not to do.</p>
<ul>
<li>Reads the user's message + last 10 turns from Convex.</li>
<li>Has three tools via two MCP servers it owns:
<ul>
<li><code>boop-memory.recall(query)</code> — pull relevant memories.</li>
<li><code>boop-memory.write_memory(content, segment, importance, tier?)</code> — persist a durable fact.</li>
<li><code>boop-spawn.spawn_agent(task, integrations[], name?)</code> — kick off an execution agent.</li>
</ul>
</li>
<li>Its system prompt drills the DISPATCHER rule: answer directly for chit-chat, spawn an agent for real work.</li>
<li>Replies stream through Sendblue back to iMessage (markdown stripped, chunked to 2900 chars).</li>
</ul>
<h3>2. Execution agent — <code>server/execution-agent.ts</code></h3>
<p>Spawned per task. Ephemeral. One instance, one job, one result.</p>
<ul>
<li>Gets the specific <code>task</code> the interaction agent wrote (not the raw user message).</li>
<li>Loads <strong>only</strong> the integrations named in the spawn call.</li>
<li>System prompt drills: iMessage-friendly output, draft-before-send for any external action.</li>
<li>Logs every <code>tool_use</code>, <code>tool_result</code>, and text block to Convex so the debug dashboard can replay it.</li>
<li>Runs with <code>permissionMode: bypassPermissions</code> — the interaction agent is the gatekeeper.</li>
<li>Returns a string. That string becomes a tool-result back to the interaction agent, which rewrites it in its own voice.</li>
</ul>
<h3>3. Memory — <code>server/memory/</code></h3>
<p>Three files, three jobs.</p>
<p><strong><code>types.ts</code></strong> — shape + defaults.</p>
<ul>
<li>Tiers: <code>short</code> (decay 5%/day), <code>long</code> (2%/day), <code>permanent</code> (no decay).</li>
<li>Segments: <code>identity</code>, <code>preference</code>, <code>relationship</code>, <code>project</code>, <code>knowledge</code>, <code>context</code>.</li>
</ul>
<p><strong><code>tools.ts</code></strong> — the <code>boop-memory</code> MCP server. <code>recall</code> and <code>write_memory</code>. Each call emits a <code>memoryEvents</code> row so you can watch it live in the dashboard.</p>
<p><strong><code>extract.ts</code></strong> — fires post-turn, <strong>fire-and-forget</strong>. Sends <code>(userMsg, assistantReply)</code> to a Haiku/Sonnet pass with an extraction prompt, parses JSON facts, writes each one. The model is told to prefer fewer, higher-quality facts over many trivial ones.</p>
<p><strong><code>clean.ts</code></strong> — the memory-cleaning loop. Every 6 hours (configurable):</p>
<ol>
<li>Load active memories.</li>
<li>Compute an effective score: <code>importance × decay × reinforcement</code>.
<ul>
<li><code>decay = max(0, 1 − decayRate × daysSinceAccess)</code></li>
<li><code>reinforcement = 1 + log(1 + accessCount) × 0.1</code></li>
</ul>
</li>
<li>Below threshold <code>0.15</code> → archive. Below <code>0.05</code> → prune. Permanent memories are skipped.</li>
</ol>
<p>This is deliberately simple. Everything sophisticated (consolidation, adversary/judge debates, knowledge graphs, embeddings) was stripped out. Add them back if you need them — the hooks are already in the Convex schema.</p>
<h3>4. Automations — <code>server/automations.ts</code> + <code>server/automation-tools.ts</code></h3>
<p>The agent can schedule recurring work from any conversation. When the user says <em>"every morning at 8 summarize my calendar"</em>, the interaction agent calls <code>create_automation(name, cronExpr, task, integrations)</code>.</p>
<p>How it runs:</p>
<ul>
<li><strong><code>server/automations.ts</code></strong> starts a 30-second poll (<code>startAutomationLoop</code>) when the server boots.</li>
<li>On each tick it loads enabled automations from Convex, finds ones whose <code>nextRunAt</code> is ≤ now, and fires each one in parallel.</li>
<li>Firing = <code>spawnExecutionAgent({ task, integrations, conversationId, name: "auto:..." })</code> — the same sub-agent system the interaction agent uses.</li>
<li>The result is written as an <code>automationRun</code> row, and (if <code>notifyConversationId</code> points at an <code>sms:+...</code> conversation) pushed back out via Sendblue so the user sees it in iMessage.</li>
<li><code>nextRunAt</code> is recomputed with <code>croner</code> and stored.</li>
</ul>
<p>The four MCP tools exposed to the interaction agent (<code>server/automation-tools.ts</code>):</p>
<ul>
<li><code>create_automation(name, schedule, task, integrations, notify?)</code></li>
<li><code>list_automations(enabledOnly?)</code></li>
<li><code>toggle_automation(id, enabled)</code></li>
<li><code>delete_automation(id)</code></li>
</ul>
<p>Schedule is a standard 5-field cron expression. Croner also understands extended syntax (timezones, seconds) if you want to upgrade the tool description.</p>
<h3>5. Drafts — <code>server/draft-tools.ts</code></h3>
<p>Any external action (send email, create event, post Slack message) is staged, not committed, by the execution agent.</p>
<ul>
<li>Execution agents only have <code>save_draft(kind, summary, payload)</code>. The "real" send tools exist in each integration but the system prompt routes agents through <code>save_draft</code> first.</li>
<li>The interaction agent has <code>list_drafts</code>, <code>send_draft(draftId, integrations)</code>, <code>reject_draft(draftId)</code>.</li>
<li><code>send_draft</code> spawns a new execution agent with the stored payload as its task. This is the only path to actually committing an action.</li>
</ul>
<p>You can see every draft (pending, sent, rejected) in the Drafts tab of the debug dashboard, including the raw JSON payload.</p>
<h3>6. Heartbeat + lifecycle — <code>server/heartbeat.ts</code></h3>
<p>Every 60 seconds, scan <code>executionAgents</code> with status <code>running</code>. Any whose <code>startedAt</code> is older than 15 minutes gets marked <code>failed</code> and the in-process <code>AbortController</code> is triggered if it still exists. This handles both server restarts (controller gone, DB still "running") and genuinely stuck agents.</p>
<p>HTTP routes for the debug dashboard:</p>
<ul>
<li><code>POST /agents/:id/cancel</code> — abort an in-flight agent</li>
<li><code>POST /agents/:id/retry</code> — re-spawn an agent with the same task + integrations</li>
</ul>
<h3>7. Consolidation — <code>server/consolidation.ts</code></h3>
<p>Runs daily (or on-demand). A two-agent pipeline over the active memory set:</p>
<ol>
<li><strong>Proposer</strong> receives the full memory list and returns proposals:
<ul>
<li><code>merge</code> — combine several entries into one rewrite</li>
<li><code>supersede</code> — newer memory replaces older on a conflicting value</li>
<li><code>prune</code> — remove redundant or wrong entries</li>
</ul>
</li>
<li><strong>Judge</strong> approves or rejects each proposal with a rationale.</li>
<li>Approved proposals are applied via <code>supersedes</code> on <code>memoryRecords</code> (which archives the superseded memories automatically in the upsert mutation).</li>
</ol>
<p>Keeps memory sharper over time instead of noisier. The full run is logged in <code>consolidationRuns</code>.</p>
<h3>8. Integrations — Composio (<code>server/composio.ts</code>)</h3>
<p>Boop delegates all third-party integrations to <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>. One SDK, 1000+ toolkits, hosted auth.</p>
<p>Flow:</p>
<ol>
<li>User clicks <strong>Connect</strong> on a toolkit card in the debug dashboard's Connections tab.</li>
<li>Frontend → <code>POST /composio/toolkits/:slug/authorize</code> → backend calls <code>session.authorize(slug)</code> and returns Composio's hosted <code>redirectUrl</code>.</li>
<li>Popup opens the redirect URL. User authenticates. Composio stores the tokens on its side.</li>
<li>Popup closes → frontend calls <code>POST /composio/refresh</code> → backend re-runs <code>registerComposioToolkits()</code> which iterates <code>connectedAccounts.list({ userIds: [boopUserId()] })</code> and registers each active toolkit as an <code>IntegrationModule</code> keyed by its slug.</li>
<li><code>availableIntegrations()</code> now includes the new slug, so the dispatcher can spawn a sub-agent with it.</li>
</ol>
<p>On each spawn, <code>buildComposioIntegrationModule(slug).createServer()</code> opens a <strong>fresh toolkit-scoped Composio session</strong>:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#F97583">await</span><span style="color:#E1E4E8"> composio.</span><span style="color:#B392F0">create</span><span style="color:#E1E4E8">(</span><span style="color:#B392F0">boopUserId</span><span style="color:#E1E4E8">(), {</span></span>
<span data-line=""><span style="color:#E1E4E8">  toolkits: [slug],            </span><span style="color:#6A737D">// scope — sub-agent only sees this toolkit's tools</span></span>
<span data-line=""><span style="color:#E1E4E8">  manageConnections: </span><span style="color:#79B8FF">false</span><span style="color:#E1E4E8">,    </span><span style="color:#6A737D">// don't inject auth-management meta-tools</span></span>
<span data-line=""><span style="color:#E1E4E8">});</span></span></code></pre></figure>
<p>and returns an <code>McpSdkServerConfigWithInstance</code> via <code>createSdkMcpServer</code>. The sub-agent never sees the full Composio catalog — only the tools for the toolkits the dispatcher asked for.</p>
<p>HTTP routes (<code>server/composio-routes.ts</code>, mounted at <code>/composio</code>):</p>
<ul>
<li><code>GET  /status</code> — <code>{ enabled }</code>.</li>
<li><code>GET  /toolkits</code> — curated list merged with current connection state.</li>
<li><code>POST /toolkits/:slug/authorize</code> — returns <code>{ redirectUrl, connectionId }</code>.</li>
<li><code>POST /toolkits/:slug/disconnect</code> — revokes + refreshes registry.</li>
<li><code>POST /refresh</code> — re-runs the registry loader.</li>
</ul>
<p>Env:</p>
<ul>
<li><code>COMPOSIO_API_KEY</code> — required for integrations. Without it, plain chat + memory + automations still work.</li>
<li><code>COMPOSIO_USER_ID</code> — optional; defaults to <code>boop-default</code> for single-tenant use.</li>
</ul>
<hr>
<h2>Data model (Convex)</h2>
<p>Seven tables. Read <code>convex/schema.ts</code> for the exact shape.</p>
<table>
<thead>
<tr>
<th>Table</th>
<th>Role</th>
<th>Key fields</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>messages</code></td>
<td>iMessage + chat transcript</td>
<td>conversationId, role, content, turnId</td>
</tr>
<tr>
<td><code>conversations</code></td>
<td>Per-thread metadata</td>
<td>conversationId, messageCount, lastActivityAt</td>
</tr>
<tr>
<td><code>memoryRecords</code></td>
<td>The memory store</td>
<td>memoryId, content, tier, segment, importance, decayRate, accessCount, lifecycle, supersedes</td>
</tr>
<tr>
<td><code>executionAgents</code></td>
<td>One row per spawned agent</td>
<td>agentId, task, status, tokens, cost</td>
</tr>
<tr>
<td><code>agentLogs</code></td>
<td>Per-agent audit trail</td>
<td>agentId, logType, toolName, content</td>
</tr>
<tr>
<td><code>automations</code></td>
<td>Scheduled recurring tasks</td>
<td>automationId, schedule, task, integrations, enabled, nextRunAt</td>
</tr>
<tr>
<td><code>automationRuns</code></td>
<td>One row per automation run</td>
<td>runId, automationId, status, result, agentId</td>
</tr>
<tr>
<td><code>drafts</code></td>
<td>Staged external actions</td>
<td>draftId, kind, summary, payload, status</td>
</tr>
<tr>
<td><code>consolidationRuns</code></td>
<td>History of consolidation passes</td>
<td>runId, proposalsCount, mergedCount, prunedCount</td>
</tr>
<tr>
<td><code>sendblueDedup</code></td>
<td>Webhook dedup by <code>message_handle</code></td>
<td>handle, claimedAt</td>
</tr>
<tr>
<td><code>memoryEvents</code></td>
<td>Append-only event log for the debug UI</td>
<td>eventType, conversationId, memoryId, data</td>
</tr>
</tbody>
</table>
<p><code>memoryRecords</code> also carries a <code>vectorIndex("by_embedding")</code> with 1024-dimension vectors filtered by <code>lifecycle</code>.</p>
<p>Indexes are tight — search through the schema to see what's supported.</p>
<hr>
<h2>Message lifecycle</h2>
<p>Following a text from iMessage to reply, step by step:</p>
<pre><code>1.  Sendblue POST /sendblue/webhook
2.  sendblue.ts:  dedup + spawn handleUserMessage()
3.  interaction-agent:  save user msg, fetch recent history
4.  interaction-agent:  query Claude with memory + spawn tools
     ↳ may call recall / write_memory
     ↳ may call spawn_agent → execution-agent runs, returns text
5.  interaction-agent:  final text → broadcast + return
6.  sendblue.ts:  sendImessage() chunks + sends
7.  interaction-agent:  save assistant msg to Convex
8.  BACKGROUND: extract.ts pulls durable facts, writes memories
9.  LATER: clean.ts decays scores, archives or prunes
</code></pre>
<p>Steps 6–7 run in parallel where safe. Step 8 is fire-and-forget — the user never waits on extraction.</p>
<hr>
<h2>Why this shape</h2>
<p><strong>Dispatcher / executor split.</strong> The interaction agent has a tiny toolset and a short prompt so it's cheap, fast, and deterministic. The execution agent gets heavy tools (MCPs) but only runs when needed. Most casual turns never spawn an agent — they complete in one interaction-agent call.</p>
<p><strong>Memory lives next to execution, not in the model.</strong> Claude has no memory across turns. We re-hydrate the relevant slice every turn via <code>recall()</code>. Writing is explicit (<code>write_memory</code>) or inferred (<code>extract.ts</code>). Nothing is implicit.</p>
<p><strong>Integrations via Composio.</strong> Tool-calling is what the SDK does best. Composio handles the OAuth, token-refresh, and 1000+ service adapters we'd otherwise hand-roll. Each connected toolkit becomes an MCP server on demand, scoped to just that toolkit so the sub-agent's context stays small.</p>
<p><strong>Convex for state.</strong> Reactive queries power the debug UI without polling. Durable enough for real use, free tier generous enough for a personal agent.</p>
<hr>
<h2>What's intentionally missing</h2>
<ul>
<li><strong>No user auth.</strong> This is a single-user tool. Add Clerk or similar if you want multi-tenant.</li>
<li><strong>Single-process scheduler.</strong> The automation loop runs in-process. If you deploy multiple instances, you'll double-fire — add a lock in Convex or run a dedicated scheduler pod.</li>
<li><strong>No intelligence runs</strong> (proactive context gathering) — the original had it, it's complex, and it's opinionated about what it watches. Add it if you want.</li>
<li><strong>No knowledge graph</strong> — relationships between memories are represented via <code>supersedes</code> only, not a full graph.</li>
<li><strong>Skills library omitted</strong> — too Boop-specific; write your own prompts/policies in <code>server/*-agent.ts</code> system prompts.</li>
</ul>
<p>All of these are one-file additions. The point of the template is to give you the smallest surface that still actually works.</p>a:T180d,<h1>Integrations</h1>
<p>Boop's integrations are provided by <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>, a tool-aggregator that exposes 1000+ third-party services (Gmail, GitHub, Slack, Notion, Linear, Google Drive, HubSpot, Salesforce, …) behind one API.</p>
<p>You don't write integration code. You:</p>
<ol>
<li>Put <code>COMPOSIO_API_KEY</code> in <code>.env.local</code>.</li>
<li>Open the debug dashboard → <strong>Connections</strong> tab.</li>
<li>Click <strong>Connect</strong> on a toolkit.</li>
<li>Authenticate on Composio's hosted page. Composio stores the tokens and keeps them fresh.</li>
<li>The toolkit becomes available to <code>spawn_agent(integrations: [...])</code> by its slug.</li>
</ol>
<p>That's it.</p>
<hr>
<h2>How it hooks into Boop</h2>
<p>Each connected Composio toolkit is registered in Boop's integration registry (<code>server/integrations/registry.ts</code>) keyed by its slug. When the dispatcher calls:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">spawn_agent</span><span style="color:#E1E4E8">({ task: </span><span style="color:#9ECBFF">"…"</span><span style="color:#E1E4E8">, integrations: [</span><span style="color:#9ECBFF">"gmail"</span><span style="color:#E1E4E8">] })</span></span></code></pre></figure>
<p><code>buildMcpServersForIntegrations(["gmail"])</code> looks up the registered <code>gmail</code> module, opens a Composio session <strong>scoped to only the Gmail toolkit</strong>:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#F97583">const</span><span style="color:#79B8FF"> session</span><span style="color:#F97583"> =</span><span style="color:#F97583"> await</span><span style="color:#E1E4E8"> composio.</span><span style="color:#B392F0">create</span><span style="color:#E1E4E8">(</span><span style="color:#B392F0">boopUserId</span><span style="color:#E1E4E8">(), {</span></span>
<span data-line=""><span style="color:#E1E4E8">  toolkits: [</span><span style="color:#9ECBFF">"gmail"</span><span style="color:#E1E4E8">],</span></span>
<span data-line=""><span style="color:#E1E4E8">  manageConnections: </span><span style="color:#79B8FF">false</span><span style="color:#E1E4E8">,</span></span>
<span data-line=""><span style="color:#E1E4E8">});</span></span>
<span data-line=""><span style="color:#F97583">const</span><span style="color:#79B8FF"> tools</span><span style="color:#F97583"> =</span><span style="color:#F97583"> await</span><span style="color:#E1E4E8"> session.</span><span style="color:#B392F0">tools</span><span style="color:#E1E4E8">();</span></span></code></pre></figure>
<p>and wraps those tools as an MCP server for the sub-agent. The sub-agent sees only Gmail's tools (<code>mcp__gmail__GMAIL_SEND_EMAIL</code>, etc.) — no Slack, no GitHub, no 1000-tool context bloat.</p>
<p>Every tool call is logged to Convex as usual, so the Agents tab in the debug dashboard shows them with the right toolkit logo and a humanized name.</p>
<hr>
<h2>Curated toolkit list</h2>
<p>The Connections tab shows a hand-picked set in <code>server/composio.ts:CURATED_TOOLKITS</code>. Edit that array to add or remove cards — the slugs must match Composio's toolkit slugs (see <code>docs.composio.dev/toolkits</code> for the full catalog).</p>
<p>Current defaults: Gmail, Google Calendar, Google Drive, Google Sheets, Google Docs, Slack, GitHub, Linear, Notion, HubSpot, Salesforce, Discord, Twitter, LinkedIn, Trello, Asana, Jira, Airtable, Figma, Dropbox.</p>
<hr>
<h2>Disconnecting</h2>
<p>Click <strong>Disconnect</strong> on a connected card. That revokes the Composio connection and re-loads the integration registry — the toolkit drops out of <code>availableIntegrations()</code> immediately. Next time the dispatcher tries to spawn with that slug, it'll log <code>[integrations] unknown integration: …</code>.</p>
<hr>
<h2>Toolkits that need a one-time auth config</h2>
<p>Composio hosts managed OAuth apps for most popular toolkits (Gmail, Slack, GitHub, Linear, Notion, Google Calendar/Drive/Sheets/Docs, etc.) — click Connect and it just works. A handful of toolkits don't have a managed app on Composio's side (Twitter/X is the common one; Salesforce sometimes) because their developer policies make hosting a shared OAuth app impractical.</p>
<p>When you click Connect on one of those, Boop surfaces an amber banner explaining that you need to:</p>
<ol>
<li>Create an OAuth app on the toolkit's developer portal (e.g., <code>developer.twitter.com</code> for Twitter).</li>
<li>Open <a href="https://platform.composio.dev/auth-configs">platform.composio.dev/auth-configs</a>, pick the toolkit, and register your app's client ID + secret.</li>
<li>Come back to the Connections tab and click Connect again.</li>
</ol>
<p>This is a one-time setup per toolkit (not per user) — all users of your Boop instance reuse the same auth config after that.</p>
<h2>Notes</h2>
<ul>
<li><strong>Single-tenant by default.</strong> All connections are keyed under <code>COMPOSIO_USER_ID</code> (defaults to <code>boop-default</code>). Override if you manage Composio sessions elsewhere and want Boop to share that user.</li>
<li><strong>External actions still use the draft flow.</strong> Execution agents are prompted to call <code>save_draft</code> first for anything that writes to the outside world. The dispatcher's <code>send_draft</code> is the only path that actually commits.</li>
<li><strong>No tokens live in Boop.</strong> Composio stores OAuth credentials on their side. Boop never sees them.</li>
<li><strong>Tool names are Composio's canonical slugs</strong> (e.g., <code>GMAIL_LIST_MESSAGES</code>). The debug dashboard humanizes them for display.</li>
</ul>b:T121d,<h1>Contributing</h1>
<p>Boop is a small personal-agent template. The codebase stays tight because that's the whole point — it should be small enough to read cover-to-cover in an afternoon and fork without fear.</p>
<h2>What lands in source</h2>
<ul>
<li>Bug fixes</li>
<li>Security fixes</li>
<li>Simplifications (less code doing the same thing)</li>
<li>Clear improvements to core behavior — memory decay tuning, consolidation robustness, dispatcher policy, cost tracking, etc.</li>
<li>New channels, integrations, or runtime skills if they fit the template spirit (small, opinionated, well-scoped)</li>
</ul>
<p>Keep the diff focused — one concern per PR. A feature PR and a refactor PR should be two PRs.</p>
<h2>Bug-fix PRs</h2>
<ul>
<li>One fix per PR.</li>
<li>Update <code>CHANGELOG.md</code> under <strong>Unreleased</strong> with a one-line entry.</li>
<li>If the fix changes external behavior (env vars, Convex schema, HTTP routes, webhook shapes), mark the CHANGELOG entry <code>[BREAKING]</code> — see conventions below.</li>
</ul>
<h2>CHANGELOG conventions</h2>
<ul>
<li>
<p>Entries live under <strong>Unreleased</strong> until a release cut.</p>
</li>
<li>
<p>Prefix user-actionable changes with <code>[BREAKING]</code>.</p>
</li>
<li>
<p>If a breaking change needs a migration (backfill, env var rename, schema transform), ship a <strong>migration skill</strong> at <code>.claude/skills/&#x3C;name>/SKILL.md</code> that Claude can run against a user's fork, and reference it in the CHANGELOG:</p>
<pre><code>[BREAKING] &#x3C;description>. Run `/&#x3C;skill-name>` to &#x3C;action>.
</code></pre>
<p><code>/upgrade-boop</code> parses this format and offers to run the referenced skill during upgrades. The format is the only coupling — without a migration, just write <code>[BREAKING] &#x3C;description>.</code> without the skill reference.</p>
</li>
</ul>
<h2>Skills</h2>
<p>Two kinds of skills live in <code>.claude/skills/</code>:</p>
<p><strong>Migration skills</strong> — instruction-only <code>SKILL.md</code> triggered by <code>[BREAKING]</code> CHANGELOG entries during <code>/upgrade-boop</code>. Pure markdown, no branch, no supporting code. Example: <code>/upgrade-boop</code> itself is this shape.</p>
<p><strong>Runtime skills</strong> — <code>SKILL.md</code> loaded into the execution agent at spawn time via the Claude Agent SDK's <code>settingSources</code>. The model autonomously invokes them when a task matches the skill's <code>description</code>. Example: <code>.claude/skills/youtube-script-writer/</code>. See the <strong>Skills</strong> section in the README for wiring details.</p>
<p>Both are just Markdown under <code>.claude/skills/&#x3C;name>/SKILL.md</code> with YAML frontmatter. No branching model, no maintainer-owned sibling branches — features land directly on <code>main</code> like any normal project.</p>
<h2>Writing a migration skill</h2>
<ol>
<li>Fork, branch from <code>main</code>.</li>
<li>Create <code>.claude/skills/&#x3C;name>/SKILL.md</code>:
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="yaml" data-theme="github-dark"><code data-language="yaml" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">---</span></span>
<span data-line=""><span style="color:#85E89D">name</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">&#x3C;name></span></span>
<span data-line=""><span style="color:#85E89D">description</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">One-line trigger description — when /upgrade-boop should offer this.</span></span>
<span data-line=""><span style="color:#B392F0">---</span></span></code></pre></figure>
</li>
<li>Body: numbered operating steps Claude should execute. Lean on <code>git</code>, <code>npm</code>, file edits. Make the skill idempotent — a user running it twice should be safe.</li>
<li>Add the matching <code>[BREAKING]</code> line to <code>CHANGELOG.md</code> under <strong>Unreleased</strong>.</li>
<li>Open a PR with the code change + the SKILL.md + the CHANGELOG entry in one commit.</li>
</ol>
<h2>Writing a runtime skill</h2>
<ol>
<li>Create <code>.claude/skills/&#x3C;name>/SKILL.md</code> with a specific, trigger-rich <code>description</code> so the SDK's routing picks it up reliably.</li>
<li>Body: the playbook the execution agent should follow when it invokes this skill.</li>
<li>That's it — no server code changes needed. The execution agent already loads <code>.claude/skills/</code> via <code>settingSources: ["project"]</code>.</li>
</ol>c:Ta2e,<h1>Changelog</h1>
<p>Notable changes per release. <code>[BREAKING]</code> entries require action on your fork — <code>/upgrade-boop</code> will surface these and offer to run the relevant migration skill.</p>
<p>Format:</p>
<ul>
<li>One section per release.</li>
<li>Prefix breaking items with <code>[BREAKING]</code> and include a migration path (ideally a skill to run).</li>
</ul>
<hr>
<h2>Unreleased — Composio integration layer</h2>
<ul>
<li><strong>[BREAKING]</strong> Hand-built integrations (<code>/integrations/gmail</code>, <code>/integrations/google-calendar</code>, <code>/integrations/notion</code>, <code>/integrations/slack</code>, <code>/integrations/_template</code>) removed. To reconnect equivalents: set <code>COMPOSIO_API_KEY</code> in <code>.env.local</code>, open the Debug UI's Connections tab, click Connect on the toolkit you want. The dispatcher will see it under the same slug (<code>gmail</code>, <code>slack</code>, <code>notion</code>, <code>googlecalendar</code>).</li>
<li><strong>[BREAKING]</strong> Convex <code>connections</code> table dropped. Composio stores OAuth state on its side. Any existing rows in that table are discarded on the next <code>convex dev</code> push.</li>
<li><strong>[BREAKING]</strong> <code>server/oauth.ts</code> removed. The <code>/oauth/*</code> HTTP routes no longer exist. OAuth flows now live at <code>https://platform.composio.dev</code>.</li>
<li><strong>[BREAKING]</strong> Env vars removed: <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REFRESH_TOKEN</code>, <code>GOOGLE_ACCESS_TOKEN</code>, <code>SLACK_CLIENT_ID</code>, <code>SLACK_CLIENT_SECRET</code>, <code>SLACK_BOT_TOKEN</code>, <code>SLACK_USER_TOKEN</code>, <code>NOTION_TOKEN</code>. Delete from <code>.env.local</code>.</li>
<li>Added: <code>server/composio.ts</code>, <code>server/composio-routes.ts</code>, <code>server/integrations/composio-loader.ts</code>, <code>debug/src/components/ComposioSection.tsx</code>.</li>
<li>Added: <code>@composio/core</code>, <code>@composio/claude-agent-sdk</code> npm deps.</li>
<li>Added: env vars <code>COMPOSIO_API_KEY</code>, <code>COMPOSIO_USER_ID</code> (optional, defaults to <code>boop-default</code>).</li>
<li>Added: <code>/upgrade-boop</code> Claude Code skill for bringing upstream changes into a customized fork.</li>
<li>Added: <code>CHANGELOG.md</code> and <code>CONTRIBUTING.md</code>.</li>
<li>Fixed: Sendblue links updated from <code>sendblue.co</code> to <code>sendblue.com</code> (the <code>.co</code> host 301-redirects; API base aligned with Sendblue's own docs).</li>
</ul>d:Tb4d4,<p align="center">
  <img src="assets/boop.gif" alt="Boop" width="220" />
</p>
<h1>Boop</h1>
<p>An iMessage-based personal agent built on top of the <a href="https://docs.claude.com/en/api/agent-sdk/overview">Claude Agent SDK</a>.</p>
<p>📺 <strong>Watch the walkthrough:</strong> <a href="https://youtu.be/ZpmKjDDbqHs">YouTube — How I built Boop</a></p>
<p align="center">
  <img src="assets/imessage.jpg" alt="Boop replying inside iMessage" width="320" />
  <br>
  <sub><em>Boop in action — text it like a person, get back an answer with full context.</em></sub>
</p>
<blockquote>
<p><strong>This is a starting point, not a finished product.</strong>
It's the architecture I built for my own personal agent, opened up as a template so you can take it, text-enable your own Claude, and extend it however you want. Integrations are plugged in via <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a> — drop in an API key and connect Gmail, Slack, GitHub, Linear, Notion, and ~1000 others straight from the debug dashboard.</p>
</blockquote>
<pre><code> iMessage  →  Sendblue webhook  →  Interaction agent  →  Sub-agents (per task)
                                          │                    │
                                          ▼                    ▼
                                    Memory store  ←──  Integrations (your MCP tools)
</code></pre>
<p>Built on:</p>
<ul>
<li><a href="https://github.com/anthropics/claude-agent-sdk-typescript">Claude Agent SDK</a> — the loop, tool use, sub-agents, MCP</li>
<li><a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a> — integrations layer. One API key = Gmail, Slack, GitHub, Linear, Notion, Stripe, Supabase, + ~1000 more with hosted OAuth</li>
<li><a href="https://sendblue.com/?utm_source=raroque">Sendblue</a> — iMessage in/out (free on their agent plan)</li>
<li><a href="https://convex.link/chrisraroque">Convex</a> — real-time database for memory, agents, drafts</li>
<li>Your <a href="https://claude.com/code?ref=chrisraroque">Claude Code</a> subscription — no separate Anthropic API key required</li>
</ul>
<hr>
<h2>What you get</h2>
<ul>
<li><strong>iMessage in / iMessage out</strong> via Sendblue (with typing indicators and webhook dedup).</li>
<li><strong>Sendblue CLI integration</strong> — <code>npm run dev</code> auto-registers the inbound webhook for you every restart (no re-pasting into the dashboard when free ngrok rotates your URL).</li>
<li><strong>Dispatcher + workers</strong> pattern: a lean interaction agent decides what to do, spawns focused sub-agents that actually do the work.</li>
<li><strong>Pure dispatcher</strong> — the interaction agent has only memory + spawn + automation + draft tools. Web access, files, and integrations are explicitly denied to it; sub-agents get <code>WebSearch</code> / <code>WebFetch</code> / the integrations.</li>
<li><strong>Tiered memory</strong> (short / long / permanent) with post-turn extraction, decay, and cleaning.</li>
<li><strong>Vector search</strong> for recall when you add an embeddings key (Voyage or OpenAI) — falls back to substring.</li>
<li><strong>Memory consolidation</strong> — a daily 3-phase adversarial pipeline (proposer → adversary → judge) that merges duplicates, resolves contradictions, and prunes noise. Proposer and judge on Sonnet; adversary on Haiku for cheap skepticism. Runs every 24h by default, also triggerable manually via <code>POST /consolidate</code>.</li>
<li><strong>Automations</strong> — the agent can schedule recurring work from a text ("every morning at 8 summarize my calendar") and push results back to iMessage.</li>
<li><strong>Draft-and-send</strong> — any external action stages a draft first; the agent only commits when the user confirms.</li>
<li><strong>Heartbeat + retry</strong> — stuck agents auto-fail, debug dashboard can retry.</li>
<li><strong>Composio-powered integrations</strong> — one API key unlocks 1000+ toolkits. Connect Gmail, Slack, GitHub, Linear, Notion, Drive, HubSpot, etc. with a click from the debug dashboard. Composio handles OAuth + token refresh.</li>
<li><strong>Debug dashboard</strong> (React + Vite) with a Boop mascot — Dashboard (spend + tokens + agent status), Agents (timeline + integration logos), Automations, Memory (table + force-directed graph), Events, Connections.</li>
<li><strong>Convex</strong> for persistence — real-time, typed, free tier.</li>
<li><strong>Uses your Claude Code subscription</strong> — no separate Anthropic API key required.</li>
</ul>
<p align="center">
  <img src="assets/agents-view.jpg" alt="Agents view in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Agents tab — every spawned sub-agent with status, cost, tokens, turns, runtime, and the integrations it touched.</em></sub>
</p>
<p align="center">
  <img src="assets/automations.jpg" alt="Automations view in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Automations tab — schedule recurring jobs from a text ("every morning at 8 summarize my calendar") and watch them run.</em></sub>
</p>
<p align="center">
  <img src="assets/memory-graph.jpg" alt="Memory graph in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Memory tab — force-directed graph of clustered memories across short, long, and permanent tiers. Tabular view also available.</em></sub>
</p>
<p align="center">
  <img src="assets/connections.jpg" alt="Connections view in the Boop debug dashboard" width="900" />
  <br>
  <sub><em>Connections tab — Composio toolkits with OAuth handled for you. Click Connect and the agent can use it on the next message.</em></sub>
</p>
<hr>
<h2>Heads up before you use this</h2>
<ul>
<li><strong>This was never meant to be open-sourced.</strong> I built it for personal use and decided to share the architecture after enough people asked. It's not a product.</li>
<li><strong>Not optimized for cost or security.</strong> Use at your own risk. Review the code, set your own budgets, and don't trust it with anything you wouldn't trust yourself with.</li>
<li><strong>I'm open to PRs for optimizations</strong> — performance, bug fixes, DX improvements, new example integrations, better docs.</li>
</ul>
<hr>
<h2>Why is it named Boop?</h2>
<p align="center">
  <img src="assets/luna.jpeg" alt="Luna" width="220" />
  <br>
  <sub><em>Luna, the inspiration.</em></sub>
</p>
<p>Boop is meant to be a proactive agent — one that nudges you over iMessage with reminders, drafts, and little follow-ups. A small "boop" whenever it has something for you.</p>
<p>And it's named after my dog, Luna, who gives plenty of them.</p>
<hr>
<h2>A note on the native iOS app</h2>
<p>I'm working on open-sourcing the native iOS app I originally built for this. The rewrite is taking much longer to get right than I'd hoped, but it will happen. I don't personally use it anymore — but enough people have asked, and I want to make it happen.</p>
<p>If you want to see what it looked like before I transitioned to an iMessage-based agent, here's <a href="https://www.youtube.com/watch?v=_h2EnRfxMQE">the walkthrough on YouTube</a>.</p>
<hr>
<h2>Prerequisites</h2>
<p>You need accounts for these. Keep the tabs open — setup will ask for credentials from each.</p>
<blockquote>
<p><strong>You should be able to get away with the free plan for each service (except Claude Code), and I'm working to secure discounts for you guys on the pro plans. If you work at any of these companies, please reach out!</strong></p>
</blockquote>
<table>
<thead>
<tr>
<th>Service</th>
<th>Why</th>
<th>Free?</th>
<th>Discount code</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://claude.com/code?ref=chrisraroque">Claude Code</a></td>
<td>Powers the agent. Install it, sign in once, the SDK uses your session.</td>
<td>Subscription required</td>
<td>Working on getting one (if you work here, please reach out!)</td>
</tr>
<tr>
<td><a href="https://sendblue.com/?utm_source=raroque">Sendblue</a></td>
<td>iMessage bridge. Get a number, grab API keys.</td>
<td>Free on their agent plan</td>
<td><code>RAROQUE20</code> — 20% off for 6 months (helpful if you plan to commercialize)</td>
</tr>
<tr>
<td><a href="https://convex.link/chrisraroque">Convex</a></td>
<td>Database + realtime.</td>
<td>Free tier is plenty</td>
<td>Working on getting one (in touch with them 👀)</td>
</tr>
<tr>
<td><a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a></td>
<td>Integrations — one API key unlocks ~1000 toolkits. Optional if you just want chat + memory + automations without third-party access.</td>
<td>Free tier covers personal use</td>
<td><code>CHRISXCOMPOSIO</code> — 1 month free on starter plan</td>
</tr>
<tr>
<td><a href="https://ngrok.com?ref=chrisraroque">ngrok</a> or similar</td>
<td>Expose your local port so Sendblue can reach it.</td>
<td>Free tier works</td>
<td>Working on getting one (if you work here, please reach out!)</td>
</tr>
</tbody>
</table>
<p><strong>Custom integrations welcome.</strong> Composio covers the common catalog, but you're free to add your own MCP servers under <code>server/integrations/</code> and register them in <code>server/integrations/registry.ts</code> — the dispatcher treats them the same as Composio-backed ones (just named toolkits the execution agent can spawn against). Useful for in-house APIs, local tools, or anything Composio doesn't ship.</p>
<hr>
<h2>Quickstart</h2>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="bash" data-theme="github-dark"><code data-language="bash" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#6A737D"># 1. Clone + install</span></span>
<span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> clone</span><span style="color:#9ECBFF"> https://github.com/raroque/boop-agent.git</span></span>
<span data-line=""><span style="color:#79B8FF">cd</span><span style="color:#9ECBFF"> boop-agent</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> install</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 2. Install Claude Code (one-time, global) and sign in</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> install</span><span style="color:#79B8FF"> -g</span><span style="color:#9ECBFF"> @anthropic-ai/claude-code</span></span>
<span data-line=""><span style="color:#B392F0">claude</span><span style="color:#6A737D">  # sign in, then Ctrl-C to exit</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 3. Interactive setup — writes .env.local, creates Convex deployment</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> run</span><span style="color:#9ECBFF"> setup</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 4. Install ngrok (one-time) and authorize it</span></span>
<span data-line=""><span style="color:#B392F0">brew</span><span style="color:#9ECBFF"> install</span><span style="color:#9ECBFF"> ngrok</span></span>
<span data-line=""><span style="color:#6A737D"># or grab from https://ngrok.com/download</span></span>
<span data-line=""><span style="color:#B392F0">ngrok</span><span style="color:#9ECBFF"> config</span><span style="color:#9ECBFF"> add-authtoken</span><span style="color:#F97583"> &#x3C;</span><span style="color:#9ECBFF">your-toke</span><span style="color:#E1E4E8">n</span><span style="color:#F97583">></span><span style="color:#6A737D">   # free at https://dashboard.ngrok.com</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#6A737D"># 5. Start everything with one command — server, Convex, debug UI, and ngrok</span></span>
<span data-line=""><span style="color:#B392F0">npm</span><span style="color:#9ECBFF"> run</span><span style="color:#9ECBFF"> dev</span></span></code></pre></figure>
<p><code>npm run dev</code> prints color-prefixed output from all four processes and shows a banner with your ngrok webhook URL once the tunnel is live.</p>
<pre><code>Public URL:        https://&#x3C;abc123>.ngrok.app
Sendblue webhook:  https://&#x3C;abc123>.ngrok.app/sendblue/webhook
</code></pre>
<p>On free ngrok, <strong>the webhook auto-registers with Sendblue every boot</strong> — no manual paste needed. For stable URLs (ngrok reserved or Cloudflare Tunnel), set the webhook once in the dashboard.</p>
<p>Text your Sendblue-provisioned number from a <strong>different</strong> phone. The agent replies.</p>
<blockquote>
<p><strong>⚠ ngrok free plan gives you a new URL every time.</strong> That means every time you restart <code>npm run dev</code>, your Sendblue webhook URL is dead until you paste the new one in.</p>
<p>If you're going to run this for more than a quick demo, <strong>strongly recommend one of:</strong></p>
<ul>
<li><strong>ngrok paid plan</strong> — gives you a reserved domain that stays the same forever</li>
<li><strong><a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/">Cloudflare Tunnel</a></strong> — free, stable subdomain, a bit more setup</li>
<li>Any other tunnel with a static URL (Tailscale Funnel, localtunnel reserved, etc.)</li>
</ul>
<p>If you use a non-ngrok tunnel, point it at <code>localhost:3456</code> yourself — <code>npm run dev</code> will still run the rest, just ignore its ngrok output and use your tunnel's URL.</p>
</blockquote>
<blockquote>
<p><strong>Gotcha:</strong> <code>SENDBLUE_FROM_NUMBER</code> must be your Sendblue-provisioned number (the one people text TO), not your personal cell. Sendblue's API requires it, and misconfiguring it returns either "missing required parameter: from_number" or "Cannot send messages to self".</p>
<p><strong>Fix in one command:</strong> <code>npm run sendblue:sync</code> pulls the right number from the Sendblue CLI and writes it to <code>.env.local</code>.</p>
</blockquote>
<hr>
<h2>How the Sendblue integration works</h2>
<p>Boop uses the <a href="https://github.com/sendblue-api/sendblue-cli">Sendblue CLI</a> (<code>@sendblue/cli</code>) to eliminate almost all manual dashboard work. Three NPM scripts wrap it:</p>
<table>
<thead>
<tr>
<th>Command</th>
<th>What it does</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>npm run setup</code></td>
<td>Interactive. Offers to run <code>sendblue login</code> / <code>sendblue setup</code> and pulls <code>api_key_id</code> + <code>api_secret_key</code> from <code>sendblue show-keys</code> into <code>.env.local</code>.</td>
</tr>
<tr>
<td><code>npm run sendblue:sync</code></td>
<td>Runs <code>sendblue lines</code>, parses your provisioned phone number, and writes <code>SENDBLUE_FROM_NUMBER</code> to <code>.env.local</code> in E.164 format. Run this anytime your number changes or got set wrong.</td>
</tr>
<tr>
<td><code>npm run sendblue:webhook -- &#x3C;url></code></td>
<td>Runs <code>sendblue webhooks list</code>, removes stale ngrok/tunnel hooks, and adds <code>&#x3C;url></code> as a <code>type=receive</code> inbound webhook. Called automatically by <code>npm run dev</code>.</td>
</tr>
</tbody>
</table>
<h3>The <code>npm run dev</code> lifecycle</h3>
<pre><code> 1. Preflight: confirm convex/_generated/ exists (else prompt to run setup).
 2. Spawn four children in parallel, each with a prefixed log stream:
       server │   (tsx watch server/index.ts)
       convex │   (npx convex dev — pushes schema + functions)
       debug  │   (vite dev server on :5173)
       ngrok  │   (if installed AND no static URL) exposes :PORT
 3. Wait for all four readiness signals:
       server → "listening on :PORT"
       convex → "Convex functions ready"
       debug  → "Local:  http://localhost:5173/"
       ngrok  → tunnel URL visible at http://127.0.0.1:4040
 4. Auto-register the webhook (FREE ngrok only, not reserved domains):
       webhook │ [webhook] removed stale https://old.ngrok-free.app/sendblue/webhook
       webhook │ [webhook] registered https://new.ngrok-free.app/sendblue/webhook (type=receive)
 5. Show the banner with dashboard + public URL + your Sendblue number.
</code></pre>
<p>The banner will look like:</p>
<pre><code>════════════════════════════════════════════════════════════════════
  Boop is ready — ngrok tunnel is live  (webhook auto-registered).

  🐶 Debug dashboard (click me):   http://localhost:5173
  🌐 Public URL:                   https://abc123.ngrok-free.app
  📮 Sendblue webhook (inbound):   https://abc123.ngrok-free.app/sendblue/webhook
  📱 Text this Sendblue number:    +13053369541  (from a DIFFERENT phone)
════════════════════════════════════════════════════════════════════
</code></pre>
<h3>When auto-register fires vs when it doesn't</h3>
<table>
<thead>
<tr>
<th>Setup</th>
<th>Auto-register fires?</th>
<th>Why</th>
</tr>
</thead>
<tbody>
<tr>
<td>Free ngrok (default)</td>
<td><strong>Yes</strong>, every boot</td>
<td>URL rotates; dashboard would be stale otherwise</td>
</tr>
<tr>
<td>Reserved <code>NGROK_DOMAIN</code></td>
<td>No</td>
<td>URL is stable; configure once in Sendblue dashboard</td>
</tr>
<tr>
<td>Static <code>PUBLIC_URL</code> (Cloudflare Tunnel etc.)</td>
<td>No</td>
<td>Same reason</td>
</tr>
<tr>
<td><code>SENDBLUE_AUTO_WEBHOOK=false</code></td>
<td>No</td>
<td>Manual opt-out</td>
</tr>
</tbody>
</table>
<h3>What you'll see in the server logs during a conversation</h3>
<p>When someone texts your Sendblue number, expect this sequence in your terminal:</p>
<pre><code>server │ [turn a3f21d] ← +14155551234: "what's on my calendar today?"
server │ [turn a3f21d] tool: recall({"query":"calendar today"})
server │ [turn a3f21d] tool: spawn_agent({"integrations":["google-calendar"],"task":"Pull today's events"})
server │ [agent 9e82c1] spawn: google-calendar [google-calendar] — "Pull today's events"
server │ [agent 9e82c1] tool: list_events
server │ [agent 9e82c1] done (completed, 2.1s, in/out tokens 1234/567)
server │ [turn a3f21d] → reply (3.4s, 140 chars): "Light day — just your 2pm with Sarah..."
server │ [sendblue] → sent 140 chars to +14155551234
</code></pre>
<p>Per-line anatomy:</p>
<ul>
<li><strong><code>[turn xxxxxx]</code></strong> — one iMessage round trip. Same id across <code>←</code> (incoming) → tool calls → <code>→ reply</code> → <code>[sendblue] sent</code>.</li>
<li><strong><code>[agent xxxxxx]</code></strong> — a spawned execution agent. Shows <code>spawn</code>, each <code>tool:</code> it invokes, and <code>done</code> with timing + token counts.</li>
<li><strong><code>[sendblue]</code></strong> — outbound send results. If Sendblue rejects, the error body is logged with a hint about the likely cause (from_number mismatch, self-send, etc.).</li>
</ul>
<p>The same events are written to Convex (<code>messages</code>, <code>executionAgents</code>, <code>agentLogs</code>, <code>memoryEvents</code> tables) and streamed to the debug dashboard in real time.</p>
<h3>When to re-run each Sendblue script</h3>
<ul>
<li><strong>First time / after losing <code>.env.local</code></strong> → <code>npm run setup</code> (walks through Sendblue + Convex together)</li>
<li><strong>Phone number looks wrong in the banner</strong> → <code>npm run sendblue:sync</code></li>
<li><strong>Webhook went stale in the dashboard and auto-register is off</strong> → <code>npm run sendblue:webhook -- https://your-url.example.com/sendblue/webhook</code></li>
</ul>
<h3>Disabling auto-register</h3>
<p>Add to <code>.env.local</code>:</p>
<pre><code>SENDBLUE_AUTO_WEBHOOK=false
</code></pre>
<p><code>npm run dev</code> will still show you the webhook URL in the banner so you can paste it yourself.</p>
<p>Visit <code>http://localhost:5173</code> for the debug dashboard (chat, agents, memory, events). You can also chat from the dashboard's Chat tab without Sendblue.</p>
<p><strong>This is the full first-run.</strong> You now have a working agent that chats, remembers, and schedules reminders. Enable integrations (Gmail, Calendar, Notion, Slack) when you want more — see the next section.</p>
<hr>
<h2>Architecture in 30 seconds</h2>
<pre><code>┌─────────────┐    webhook     ┌─────────────────────┐
│   iMessage  │ ─────────────► │ Sendblue → /webhook │
└─────────────┘                └──────────┬──────────┘
                                          │
                                          ▼
                          ┌────────────────────────────┐
                          │    Interaction agent       │
                          │    (dispatcher only)       │
                          │  • recall / write_memory   │
                          │  • spawn_agent(...)        │
                          └────────┬────────┬──────────┘
                                   │        │
                   ┌───────────────┘        └──────────────┐
                   ▼                                       ▼
           ┌───────────────┐                      ┌──────────────┐
           │   Memory      │                      │  Execution   │
           │ (Convex)      │                      │  agent(s)    │
           │ + cleaning    │                      │  + integrations│
           └───────────────┘                      └──────────────┘
</code></pre>
<ul>
<li><strong>Interaction agent</strong> (<code>server/interaction-agent.ts</code>) is the front door. It reads the user's message + recent history, optionally calls <code>recall</code>, writes memories, creates automations, and decides whether to answer directly or spawn a sub-agent.</li>
<li><strong>Execution agent</strong> (<code>server/execution-agent.ts</code>) is spawned per task. It loads only the integrations named in the spawn call and returns a tight answer.</li>
<li><strong>Memory</strong> (<code>server/memory/</code>) handles writes, recall, post-turn extraction, and daily cleaning. Stored in Convex.</li>
<li><strong>Automations</strong> (<code>server/automations.ts</code>) poll every 30s for due jobs, spawn an execution agent to run them, and push results back to the user.</li>
<li><strong>Integrations</strong> are provided by <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>. The dispatcher names toolkits by slug (<code>spawn_agent(integrations: ["gmail"])</code>); <code>server/composio.ts</code> opens a toolkit-scoped Composio session per spawn and wraps its tools as an MCP server. No per-integration code to write.</li>
</ul>
<p>Deep dive: <a href="./ARCHITECTURE.md">ARCHITECTURE.md</a>. Adding your own tools: <a href="./INTEGRATIONS.md">INTEGRATIONS.md</a>.</p>
<hr>
<h2>Skills</h2>
<p>Skills are reusable playbooks — <code>SKILL.md</code> files under <code>.claude/skills/</code> that teach the execution agent how to do a specific kind of task (write a YouTube script, draft a cold email, plan a trip, etc.).</p>
<p><strong>How the Agent SDK handles them:</strong> every <code>.claude/skills/*/SKILL.md</code> is loaded when the execution agent boots, and each skill's <code>description</code> gets injected into the agent's system prompt along with an instruction to pick the relevant one for the current task. You do <strong>not</strong> select skills per spawn — the agent picks based on which description matches. Only descriptions load upfront; the full SKILL.md body is pulled into context only when the agent actually invokes the skill, so adding more skills is cheap.</p>
<p>The SDK is pretty smart about picking the right skill as long as your <code>description</code> is specific and front-loads the trigger phrases ("Use when the user asks to write a video script, turn research into a YouTube video…"). Vague descriptions = missed invocations.</p>
<p>Wiring (in <code>server/execution-agent.ts</code>):</p>
<ul>
<li><code>settingSources: ["project"]</code> — tells the SDK to load <code>.claude/skills/</code></li>
<li><code>"Skill"</code> in <code>allowedTools</code> — enables the Skill tool</li>
</ul>
<p>Only the <strong>execution agent</strong> loads skills. The dispatcher (interaction-agent) stays in SDK isolation mode, so it never sees them — which is correct, because the dispatcher should never do work, only route.</p>
<p><strong>To add a skill:</strong> create <code>.claude/skills/&#x3C;kebab-name>/SKILL.md</code>:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="yaml" data-theme="github-dark"><code data-language="yaml" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">---</span></span>
<span data-line=""><span style="color:#85E89D">name</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">youtube-script-writer</span></span>
<span data-line=""><span style="color:#85E89D">description</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">Write a tight, retention-focused YouTube script from a topic or outline. Use when the user asks for a video script, wants to turn research into a video, or needs a hook rewritten.</span></span>
<span data-line=""><span style="color:#B392F0">---</span></span>
<span data-line=""> </span>
<span data-line=""><span style="color:#9ECBFF">&#x3C;instructions the agent follows when this skill is invoked></span></span></code></pre></figure>
<p>There's a soft budget (~15k chars by default, via <code>SLASH_COMMAND_TOOL_CHAR_BUDGET</code>) for the combined skill-description block in context — if you end up with many skills, keep descriptions sharp so none get truncated.</p>
<p>Example included: <code>.claude/skills/youtube-script-writer/</code>.</p>
<hr>
<h2>Using your Claude Code subscription</h2>
<p>The Claude Agent SDK reuses the credentials Claude Code writes to your machine when you sign in. You do not need an <code>ANTHROPIC_API_KEY</code>.</p>
<ul>
<li>Install once: <code>npm install -g @anthropic-ai/claude-code</code></li>
<li>Run <code>claude</code> in a terminal, sign in.</li>
<li>That's it — the SDK finds the session automatically.</li>
</ul>
<p>If you'd prefer an API key (e.g. for a deployed server), set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> and the SDK will use it instead.</p>
<hr>
<h2>Environment variables</h2>
<p>Everything lives in <code>.env.local</code> (auto-created by <code>npm run setup</code>). See <code>.env.example</code> for the full list.</p>
<table>
<thead>
<tr>
<th>Var</th>
<th>Required</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>CONVEX_URL</code> / <code>VITE_CONVEX_URL</code></td>
<td>yes</td>
<td>Convex deployment URL. Written by <code>npx convex dev</code>.</td>
</tr>
<tr>
<td><code>SENDBLUE_API_KEY</code> / <code>SENDBLUE_API_SECRET</code></td>
<td>yes</td>
<td>From your Sendblue dashboard.</td>
</tr>
<tr>
<td><code>SENDBLUE_FROM_NUMBER</code></td>
<td>yes</td>
<td>Your Sendblue-provisioned number.</td>
</tr>
<tr>
<td><code>BOOP_MODEL</code></td>
<td>no</td>
<td>Default <code>claude-sonnet-4-6</code>.</td>
</tr>
<tr>
<td><code>BOOP_UPSTREAM_CHECK</code></td>
<td>no</td>
<td>Set to <code>false</code> to disable the new-version banner on <code>npm run dev</code>. Default: on.</td>
</tr>
<tr>
<td><code>PORT</code></td>
<td>no</td>
<td>Default <code>3456</code>.</td>
</tr>
<tr>
<td><code>PUBLIC_URL</code></td>
<td>no</td>
<td>Base URL used in the Sendblue webhook. Composio handles its own OAuth callbacks on <code>platform.composio.dev</code>, so this is just for inbound iMessage.</td>
</tr>
<tr>
<td><code>VOYAGE_API_KEY</code> <strong>or</strong> <code>OPENAI_API_KEY</code></td>
<td>optional</td>
<td>Unlocks vector recall. Falls back to substring.</td>
</tr>
<tr>
<td><code>COMPOSIO_API_KEY</code></td>
<td>optional</td>
<td>Enables integrations. Without it, plain chat + memory + automations still work. Get one at <a href="https://app.composio.dev/developers?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">app.composio.dev/developers</a>.</td>
</tr>
<tr>
<td><code>COMPOSIO_USER_ID</code></td>
<td>optional</td>
<td>Stable user id Composio keys connections under. Defaults to <code>boop-default</code>.</td>
</tr>
<tr>
<td><code>ANTHROPIC_API_KEY</code></td>
<td>optional</td>
<td>Bypass the Claude Code subscription.</td>
</tr>
</tbody>
</table>
<hr>
<h2>Integrations, via Composio</h2>
<p>Boop outsources 3rd-party service integrations to <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>. One API key unlocks ~1000 toolkits (Gmail, Slack, GitHub, Linear, Notion, Drive, Stripe, Supabase, HubSpot, Salesforce, Granola, and so on). Composio hosts the OAuth apps, manages token refresh, and exposes every toolkit as a set of Claude-ready tools. Boop never sees an access token.</p>
<h3>Quickstart</h3>
<ol>
<li>Grab an API key at <a href="https://app.composio.dev/developers?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">app.composio.dev/developers</a>.</li>
<li>Add it to <code>.env.local</code>:
<pre><code>COMPOSIO_API_KEY=sk-comp-...
</code></pre>
</li>
<li><code>npm run dev</code>.</li>
<li>Open the debug dashboard → <strong>Connections</strong> tab. You'll see a curated list of ~20 cards split into:
<ul>
<li><strong>Ready to connect</strong> — Composio manages the OAuth app. Click <strong>Connect</strong>, authenticate on Composio's hosted page, done.</li>
<li><strong>Needs one-time auth config</strong> — a few toolkits (Twitter/X, LinkedIn, Salesforce) require you to register your own OAuth app on their dev portal and paste the client ID/secret into <code>platform.composio.dev/auth-configs</code>. The card's <strong>Set up →</strong> link takes you straight there. Once registered, the card flips to Ready.</li>
</ul>
</li>
</ol>
<p>After a successful connect, the agent can use that toolkit immediately — no restart.</p>
<h3>How it wires in</h3>
<p>Boop keeps the dispatcher / executor split intact. Composio sits under the executor:</p>
<pre><code>interaction-agent:  spawn_agent(task, integrations: ["gmail", "slack"])
                              │
                              ▼
execution-agent:    for each slug, open a Composio session scoped to that toolkit:
                      composio.create(BOOP_USER, { toolkits: ["gmail"] })
                      session.tools()          ← returns only Gmail tools
                              │
                              ▼
                    createSdkMcpServer({ name: "gmail", tools })
                              │
                              ▼
                    Sub-agent sees mcp__gmail__GMAIL_*  — nothing else.
</code></pre>
<p>Key properties:</p>
<ul>
<li><strong>Per-spawn tool scope.</strong> The dispatcher picks which toolkits the sub-agent sees. Tens of tools per spawn, not thousands, so context stays tight and the agent stays fast.</li>
<li><strong>Toolkit slug = integration name.</strong> <code>spawn_agent(integrations: ["linear"])</code> works for any toolkit you've connected. Unknown slugs just log a warning and are skipped.</li>
<li><strong>No tokens on our side.</strong> Every tool call runs through Composio's proxy. If Composio goes down, integrations go down — but your server never holds user OAuth tokens.</li>
<li><strong>Multi-account per toolkit.</strong> Connect a second Gmail (work + personal) — each gets its own connection row you can alias. The dispatcher picks up all active connections for the slug.</li>
<li><strong>Identity resolution.</strong> Connection cards show the real account email (e.g. <code>chris@aloa.co</code>) resolved by calling the toolkit's own "who am I" tool through Composio (<code>GMAIL_GET_PROFILE</code>, etc.). Alias per connection if you want a friendlier label.</li>
</ul>
<h3>Adding toolkits beyond the curated list</h3>
<p>The ~20 toolkit catalog is hand-picked in <code>server/composio.ts:CURATED_TOOLKITS</code>. To surface another:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#6A737D">// server/composio.ts</span></span>
<span data-line=""><span style="color:#F97583">export</span><span style="color:#F97583"> const</span><span style="color:#79B8FF"> CURATED_TOOLKITS</span><span style="color:#F97583">:</span><span style="color:#B392F0"> CuratedToolkit</span><span style="color:#E1E4E8">[] </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> [</span></span>
<span data-line=""><span style="color:#6A737D">  // …existing entries…</span></span>
<span data-line=""><span style="color:#E1E4E8">  { slug: </span><span style="color:#9ECBFF">"airtable"</span><span style="color:#E1E4E8">, displayName: </span><span style="color:#9ECBFF">"Airtable"</span><span style="color:#E1E4E8">, authMode: </span><span style="color:#9ECBFF">"managed"</span><span style="color:#E1E4E8"> },</span></span>
<span data-line=""><span style="color:#E1E4E8">];</span></span></code></pre></figure>
<p><code>authMode: "managed"</code> is correct for most toolkits. Use <code>"byo"</code> only if you know Composio requires a custom OAuth app (Twitter/LinkedIn/Salesforce-style). If you guess wrong, the UI's auth-config fallback banner catches it and points you at the right dashboard page.</p>
<h3>Cost tracking</h3>
<p>Every execution agent's <code>total_cost_usd</code> comes straight from the Claude Agent SDK's <code>result</code> message (authoritative, matches Anthropic's billing). You'll see real dollar amounts in the Dashboard tab's Cost tile and per-agent cards.</p>
<p>Every LLM call — dispatcher turn, execution-agent run, memory extraction, consolidation (proposer / adversary / judge) — also writes a row to the <code>usageRecords</code> table with per-layer tokens (including cache read/write) and cost. <code>usageRecords:summary</code> gives you totals by source so you can see which layer is actually burning the bill. Each row reports the model the caller requested, not the model-routing the SDK did internally.</p>
<h3>A note on runaway cost</h3>
<p>Boop's <code>query()</code> calls don't currently set <code>maxTurns</code> or <code>maxBudgetUsd</code>. Those are hard stops the SDK exposes — set them and the agent aborts once the threshold hits, with whatever partial result it has.</p>
<p>Kept as-is intentionally for a single-user personal agent: every task is scoped tight (spawned by the dispatcher with a specific task string + a small integration list), integrations are Composio-scoped per spawn so the tool surface stays small, and the existing 15-minute heartbeat (<code>server/heartbeat.ts</code>) marks any long-running agent as <code>failed</code> and aborts it. In practice execution agents complete in under 60 seconds.</p>
<p>If you deploy Boop in a higher-throughput setting, or hand it integrations that allow looping (webhooks, scrapers), you probably want to set <code>maxTurns: 20</code> and <code>maxBudgetUsd: 2.00</code> on the <code>query()</code> call in <code>server/execution-agent.ts</code> as a belt-and-suspenders cap.</p>
<h3>Keeping it in sync</h3>
<p>Deeper dive — auth modes, toolkit scoping internals, multi-account flow, per-connection identity: <a href="./INTEGRATIONS.md">INTEGRATIONS.md</a>.</p>
<p>Upgrade path when upstream ships changes: run <code>/upgrade-boop</code> inside <code>claude</code> (the skill under <code>.claude/skills/upgrade-boop/</code>) — previews diffs, backs up, merges, surfaces <code>[BREAKING]</code> CHANGELOG entries. See <a href="./CONTRIBUTING.md">CONTRIBUTING.md</a> for contribution rules + the CHANGELOG / migration-skill conventions.</p>
<hr>
<h2>Project layout</h2>
<pre><code>boop-agent/
├── server/
│   ├── index.ts                   # Express + WS + HTTP routes
│   ├── sendblue.ts                # iMessage webhook, reply, typing indicator
│   ├── interaction-agent.ts       # Dispatcher
│   ├── execution-agent.ts         # Sub-agent runner
│   ├── automations.ts             # Cron loop
│   ├── automation-tools.ts        # create/list/toggle/delete MCP
│   ├── draft-tools.ts             # save_draft / send_draft / reject_draft MCP
│   ├── heartbeat.ts               # Stale-agent sweep
│   ├── consolidation.ts           # 3-phase adversarial pipeline (proposer → adversary → judge)
│   ├── usage.ts                   # aggregateUsageFromResult helper (shared cost aggregation)
│   ├── embeddings.ts              # Voyage / OpenAI wrapper
│   ├── composio.ts                # Composio SDK wrapper (session + toolkit scoping)
│   ├── composio-routes.ts         # /composio/* HTTP routes for the Debug UI
│   ├── broadcast.ts               # WS fanout
│   ├── convex-client.ts           # Convex HTTP client
│   ├── memory/
│   │   ├── types.ts
│   │   ├── tools.ts               # write_memory / recall (vector + substring)
│   │   ├── extract.ts             # Post-turn extraction
│   │   └── clean.ts               # Decay + archive + prune
│   └── integrations/
│       ├── registry.ts            # Integration loader
│       └── composio-loader.ts     # Registers each connected Composio toolkit
├── convex/
│   ├── schema.ts
│   ├── messages.ts
│   ├── memoryRecords.ts
│   ├── agents.ts
│   ├── automations.ts
│   ├── consolidation.ts
│   ├── conversations.ts
│   ├── drafts.ts
│   ├── memoryEvents.ts
│   ├── usageRecords.ts            # Append-only per-call cost log
│   └── sendblueDedup.ts
├── debug/                         # Dashboard: Dashboard / Agents / Automations / Memory / Events / Connections
├── scripts/
│   ├── setup.ts                   # Interactive setup CLI
│   ├── dev.mjs                    # One-command orchestrator (server + convex + vite + ngrok)
│   ├── preflight.mjs              # Checks convex/_generated exists before booting
│   ├── sendblue-sync.mjs          # Pulls phone number from `sendblue lines`
│   └── sendblue-webhook.mjs       # Registers inbound webhook via Sendblue CLI
├── README.md           ← you are here
├── ARCHITECTURE.md
└── INTEGRATIONS.md
</code></pre>
<hr>
<h2>Upgrading</h2>
<p>Boop is a fork-and-own template. You customize your copy freely — system prompts, memory thresholds, extra tools — and pull upstream fixes in on your own schedule.</p>
<p>The intended path is <strong>Claude Code-driven</strong>, modeled on NanoClaw:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="bash" data-theme="github-dark"><code data-language="bash" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">claude</span><span style="color:#6A737D">                 # inside your repo</span></span>
<span data-line=""><span style="color:#B392F0">/upgrade-boop</span></span></code></pre></figure>
<p><code>/upgrade-boop</code> is a skill in <code>.claude/skills/upgrade-boop/SKILL.md</code>. It:</p>
<ol>
<li>Refuses to run with a dirty working tree.</li>
<li>Creates a timestamped rollback tag.</li>
<li>Previews upstream changes bucketed by area (core / integrations / UI / schema / scripts / docs).</li>
<li>Merges (or cherry-picks, or rebases — your choice).</li>
<li>Runs <code>npm install</code> + <code>npm run typecheck</code>.</li>
<li>Parses <code>CHANGELOG.md</code> for <code>[BREAKING]</code> entries and offers to run the referenced migration skills.</li>
<li>Prints a rollback hash + any env-var additions you should copy into <code>.env.local</code>.</li>
</ol>
<p>Plain git works too, if you'd rather:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="bash" data-theme="github-dark"><code data-language="bash" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> remote</span><span style="color:#9ECBFF"> add</span><span style="color:#9ECBFF"> upstream</span><span style="color:#9ECBFF"> https://github.com/chris/boop-agent.git</span><span style="color:#6A737D">    # one-time</span></span>
<span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> fetch</span><span style="color:#9ECBFF"> upstream</span></span>
<span data-line=""><span style="color:#B392F0">git</span><span style="color:#9ECBFF"> merge</span><span style="color:#9ECBFF"> upstream/main</span><span style="color:#6A737D">      # or: git rebase upstream/main</span></span></code></pre></figure>
<h3>New-version notifications</h3>
<p>Every time you run <code>npm run dev</code>, a small background check (<code>scripts/check-upstream.mjs</code>) asks your <code>upstream</code> remote if there are new commits. If there are, you'll see a banner up top with the count and a reminder to run <code>/upgrade-boop</code>. If you're up to date, or the check fails for any reason (offline, no <code>upstream</code> remote, timeout), it stays silent.</p>
<p>Behavior at a glance:</p>
<ul>
<li><code>upstream</code> set, new commits → banner with the count</li>
<li><code>upstream</code> set, up to date → silent</li>
<li>No <code>upstream</code> remote, on a fork → one-line hint on adding it</li>
<li>No <code>upstream</code> remote, on the canonical repo → silent (you <em>are</em> upstream)</li>
</ul>
<p>To turn it off:</p>
<ul>
<li><strong>Env var:</strong> add <code>BOOP_UPSTREAM_CHECK=false</code> to <code>.env.local</code></li>
<li><strong>Or comment it out:</strong> the call lives in <code>scripts/dev.mjs</code> — the <code>spawn("node", ["scripts/check-upstream.mjs"], ...)</code> block. Delete or comment that block and the check never runs.</li>
</ul>
<h3>CHANGELOG</h3>
<p>Every release lists additions under <a href="./CHANGELOG.md">CHANGELOG.md</a>, with <code>[BREAKING]</code> prefixes for anything that requires action. <code>/upgrade-boop</code> parses that format automatically.</p>
<hr>
<h2>Troubleshooting</h2>
<p><strong>Agent doesn't reply.</strong></p>
<ul>
<li>Check the server is running: <code>curl http://localhost:3456/health</code></li>
<li>Check the Sendblue webhook is pointed at <code>&#x3C;public-url>/sendblue/webhook</code></li>
<li>Watch server logs. Look for <code>[sendblue]</code> and <code>[interaction]</code> messages.</li>
</ul>
<p><strong>Convex errors / <code>VITE_CONVEX_URL is not set</code>.</strong></p>
<ul>
<li>Run <code>npx convex dev</code> manually. Ensure <code>.env.local</code> has both <code>CONVEX_URL</code> and <code>VITE_CONVEX_URL</code>.</li>
</ul>
<p><strong>"Could not find public function for X:Y".</strong></p>
<ul>
<li><code>CONVEX_DEPLOYMENT</code> and <code>CONVEX_URL</code> in <code>.env.local</code> are pointing at different projects. <code>convex dev</code> pushes functions to <code>CONVEX_DEPLOYMENT</code> but the client reads from <code>CONVEX_URL</code>. Fix: make sure the URL has the same name as the deployment — <code>CONVEX_DEPLOYMENT=dev:foo-bar-123</code> → <code>CONVEX_URL=https://foo-bar-123.convex.cloud</code>. Re-running <code>npm run setup</code> now auto-syncs these.</li>
</ul>
<p><strong>Agent replies but can't use my integration.</strong></p>
<ul>
<li>Check <code>COMPOSIO_API_KEY</code> is set in <code>.env.local</code>.</li>
<li>Check the toolkit shows as <strong>Connected</strong> in the Connections tab.</li>
<li>Watch server logs for <code>[composio] registered …</code> at boot and <code>[integrations] unknown integration: …</code> on spawn attempts.</li>
</ul>
<p><strong>I want to skip Sendblue for now.</strong></p>
<ul>
<li>The server exposes <code>POST /chat</code> with <code>{ conversationId, content }</code> — curl or a tiny client can drive the agent directly, no iMessage required.</li>
</ul>
<p><strong>Claude SDK says no credentials.</strong></p>
<ul>
<li>Run <code>claude</code> once and sign in, or set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code>.</li>
</ul>
<p><strong>"Cannot send messages to self" / "missing required parameter: from_number".</strong></p>
<ul>
<li><code>SENDBLUE_FROM_NUMBER</code> is set to your personal cell instead of your Sendblue-provisioned number. Run <code>npm run sendblue:sync</code> to pull the correct number from <code>sendblue lines</code> and write it to <code>.env.local</code>.</li>
</ul>
<p><strong>"Dashboard crashed" in the debug UI.</strong></p>
<ul>
<li>The ErrorBoundary caught something. Check the server logs (<code>server │</code> stream) and the browser console — both will have the real error. Most common cause: a new Convex function hasn't been deployed yet. Restart <code>npm run dev</code> so <code>convex dev</code> re-pushes.</li>
</ul>
<hr>
<h2>License</h2>
<p>MIT. Build whatever you want on top of this.</p>e:T446b,<h1>Architecture</h1>
<p>boop-agent is a small distributed system disguised as a single-server app. Four moving parts, each doing one job.</p>
<h2>The four parts</h2>
<pre><code>┌────────────────────────────────────────────────────────────────┐
│                      EXPRESS + WS SERVER                        │
│                                                                 │
│   POST /sendblue/webhook   ──────►  Interaction Agent           │
│   POST /chat                        (dispatcher, streams)       │
│   WS /ws                                  │                     │
│                                           │ spawn_agent         │
│                                           ▼                     │
│                                    Execution Agent(s)           │
│                                    (one per task)               │
│                                           │                     │
│                                           ▼                     │
│                                    Integrations (MCP)           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       ┌────────────┐         ┌────────────────┐
                       │  Convex    │◄───────►│  Debug UI      │
                       │  (truth)   │         │  (read-only)   │
                       └────────────┘         └────────────────┘
</code></pre>
<h3>1. Interaction agent — <code>server/interaction-agent.ts</code></h3>
<p>The front door. One instance per user turn. Its job is to <strong>decide</strong>, not to do.</p>
<ul>
<li>Reads the user's message + last 10 turns from Convex.</li>
<li>Has three tools via two MCP servers it owns:
<ul>
<li><code>boop-memory.recall(query)</code> — pull relevant memories.</li>
<li><code>boop-memory.write_memory(content, segment, importance, tier?)</code> — persist a durable fact.</li>
<li><code>boop-spawn.spawn_agent(task, integrations[], name?)</code> — kick off an execution agent.</li>
</ul>
</li>
<li>Its system prompt drills the DISPATCHER rule: answer directly for chit-chat, spawn an agent for real work.</li>
<li>Replies stream through Sendblue back to iMessage (markdown stripped, chunked to 2900 chars).</li>
</ul>
<h3>2. Execution agent — <code>server/execution-agent.ts</code></h3>
<p>Spawned per task. Ephemeral. One instance, one job, one result.</p>
<ul>
<li>Gets the specific <code>task</code> the interaction agent wrote (not the raw user message).</li>
<li>Loads <strong>only</strong> the integrations named in the spawn call.</li>
<li>System prompt drills: iMessage-friendly output, draft-before-send for any external action.</li>
<li>Logs every <code>tool_use</code>, <code>tool_result</code>, and text block to Convex so the debug dashboard can replay it.</li>
<li>Runs with <code>permissionMode: bypassPermissions</code> — the interaction agent is the gatekeeper.</li>
<li>Returns a string. That string becomes a tool-result back to the interaction agent, which rewrites it in its own voice.</li>
</ul>
<h3>3. Memory — <code>server/memory/</code></h3>
<p>Three files, three jobs.</p>
<p><strong><code>types.ts</code></strong> — shape + defaults.</p>
<ul>
<li>Tiers: <code>short</code> (decay 5%/day), <code>long</code> (2%/day), <code>permanent</code> (no decay).</li>
<li>Segments: <code>identity</code>, <code>preference</code>, <code>relationship</code>, <code>project</code>, <code>knowledge</code>, <code>context</code>.</li>
</ul>
<p><strong><code>tools.ts</code></strong> — the <code>boop-memory</code> MCP server. <code>recall</code> and <code>write_memory</code>. Each call emits a <code>memoryEvents</code> row so you can watch it live in the dashboard.</p>
<p><strong><code>extract.ts</code></strong> — fires post-turn, <strong>fire-and-forget</strong>. Sends <code>(userMsg, assistantReply)</code> to a Haiku/Sonnet pass with an extraction prompt, parses JSON facts, writes each one. The model is told to prefer fewer, higher-quality facts over many trivial ones.</p>
<p><strong><code>clean.ts</code></strong> — the memory-cleaning loop. Every 6 hours (configurable):</p>
<ol>
<li>Load active memories.</li>
<li>Compute an effective score: <code>importance × decay × reinforcement</code>.
<ul>
<li><code>decay = max(0, 1 − decayRate × daysSinceAccess)</code></li>
<li><code>reinforcement = 1 + log(1 + accessCount) × 0.1</code></li>
</ul>
</li>
<li>Below threshold <code>0.15</code> → archive. Below <code>0.05</code> → prune. Permanent memories are skipped.</li>
</ol>
<p>This is deliberately simple. Everything sophisticated (consolidation, adversary/judge debates, knowledge graphs, embeddings) was stripped out. Add them back if you need them — the hooks are already in the Convex schema.</p>
<h3>4. Automations — <code>server/automations.ts</code> + <code>server/automation-tools.ts</code></h3>
<p>The agent can schedule recurring work from any conversation. When the user says <em>"every morning at 8 summarize my calendar"</em>, the interaction agent calls <code>create_automation(name, cronExpr, task, integrations)</code>.</p>
<p>How it runs:</p>
<ul>
<li><strong><code>server/automations.ts</code></strong> starts a 30-second poll (<code>startAutomationLoop</code>) when the server boots.</li>
<li>On each tick it loads enabled automations from Convex, finds ones whose <code>nextRunAt</code> is ≤ now, and fires each one in parallel.</li>
<li>Firing = <code>spawnExecutionAgent({ task, integrations, conversationId, name: "auto:..." })</code> — the same sub-agent system the interaction agent uses.</li>
<li>The result is written as an <code>automationRun</code> row, and (if <code>notifyConversationId</code> points at an <code>sms:+...</code> conversation) pushed back out via Sendblue so the user sees it in iMessage.</li>
<li><code>nextRunAt</code> is recomputed with <code>croner</code> and stored.</li>
</ul>
<p>The four MCP tools exposed to the interaction agent (<code>server/automation-tools.ts</code>):</p>
<ul>
<li><code>create_automation(name, schedule, task, integrations, notify?)</code></li>
<li><code>list_automations(enabledOnly?)</code></li>
<li><code>toggle_automation(id, enabled)</code></li>
<li><code>delete_automation(id)</code></li>
</ul>
<p>Schedule is a standard 5-field cron expression. Croner also understands extended syntax (timezones, seconds) if you want to upgrade the tool description.</p>
<h3>5. Drafts — <code>server/draft-tools.ts</code></h3>
<p>Any external action (send email, create event, post Slack message) is staged, not committed, by the execution agent.</p>
<ul>
<li>Execution agents only have <code>save_draft(kind, summary, payload)</code>. The "real" send tools exist in each integration but the system prompt routes agents through <code>save_draft</code> first.</li>
<li>The interaction agent has <code>list_drafts</code>, <code>send_draft(draftId, integrations)</code>, <code>reject_draft(draftId)</code>.</li>
<li><code>send_draft</code> spawns a new execution agent with the stored payload as its task. This is the only path to actually committing an action.</li>
</ul>
<p>You can see every draft (pending, sent, rejected) in the Drafts tab of the debug dashboard, including the raw JSON payload.</p>
<h3>6. Heartbeat + lifecycle — <code>server/heartbeat.ts</code></h3>
<p>Every 60 seconds, scan <code>executionAgents</code> with status <code>running</code>. Any whose <code>startedAt</code> is older than 15 minutes gets marked <code>failed</code> and the in-process <code>AbortController</code> is triggered if it still exists. This handles both server restarts (controller gone, DB still "running") and genuinely stuck agents.</p>
<p>HTTP routes for the debug dashboard:</p>
<ul>
<li><code>POST /agents/:id/cancel</code> — abort an in-flight agent</li>
<li><code>POST /agents/:id/retry</code> — re-spawn an agent with the same task + integrations</li>
</ul>
<h3>7. Consolidation — <code>server/consolidation.ts</code></h3>
<p>Runs daily (or on-demand). A two-agent pipeline over the active memory set:</p>
<ol>
<li><strong>Proposer</strong> receives the full memory list and returns proposals:
<ul>
<li><code>merge</code> — combine several entries into one rewrite</li>
<li><code>supersede</code> — newer memory replaces older on a conflicting value</li>
<li><code>prune</code> — remove redundant or wrong entries</li>
</ul>
</li>
<li><strong>Judge</strong> approves or rejects each proposal with a rationale.</li>
<li>Approved proposals are applied via <code>supersedes</code> on <code>memoryRecords</code> (which archives the superseded memories automatically in the upsert mutation).</li>
</ol>
<p>Keeps memory sharper over time instead of noisier. The full run is logged in <code>consolidationRuns</code>.</p>
<h3>8. Integrations — Composio (<code>server/composio.ts</code>)</h3>
<p>Boop delegates all third-party integrations to <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>. One SDK, 1000+ toolkits, hosted auth.</p>
<p>Flow:</p>
<ol>
<li>User clicks <strong>Connect</strong> on a toolkit card in the debug dashboard's Connections tab.</li>
<li>Frontend → <code>POST /composio/toolkits/:slug/authorize</code> → backend calls <code>session.authorize(slug)</code> and returns Composio's hosted <code>redirectUrl</code>.</li>
<li>Popup opens the redirect URL. User authenticates. Composio stores the tokens on its side.</li>
<li>Popup closes → frontend calls <code>POST /composio/refresh</code> → backend re-runs <code>registerComposioToolkits()</code> which iterates <code>connectedAccounts.list({ userIds: [boopUserId()] })</code> and registers each active toolkit as an <code>IntegrationModule</code> keyed by its slug.</li>
<li><code>availableIntegrations()</code> now includes the new slug, so the dispatcher can spawn a sub-agent with it.</li>
</ol>
<p>On each spawn, <code>buildComposioIntegrationModule(slug).createServer()</code> opens a <strong>fresh toolkit-scoped Composio session</strong>:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#F97583">await</span><span style="color:#E1E4E8"> composio.</span><span style="color:#B392F0">create</span><span style="color:#E1E4E8">(</span><span style="color:#B392F0">boopUserId</span><span style="color:#E1E4E8">(), {</span></span>
<span data-line=""><span style="color:#E1E4E8">  toolkits: [slug],            </span><span style="color:#6A737D">// scope — sub-agent only sees this toolkit's tools</span></span>
<span data-line=""><span style="color:#E1E4E8">  manageConnections: </span><span style="color:#79B8FF">false</span><span style="color:#E1E4E8">,    </span><span style="color:#6A737D">// don't inject auth-management meta-tools</span></span>
<span data-line=""><span style="color:#E1E4E8">});</span></span></code></pre></figure>
<p>and returns an <code>McpSdkServerConfigWithInstance</code> via <code>createSdkMcpServer</code>. The sub-agent never sees the full Composio catalog — only the tools for the toolkits the dispatcher asked for.</p>
<p>HTTP routes (<code>server/composio-routes.ts</code>, mounted at <code>/composio</code>):</p>
<ul>
<li><code>GET  /status</code> — <code>{ enabled }</code>.</li>
<li><code>GET  /toolkits</code> — curated list merged with current connection state.</li>
<li><code>POST /toolkits/:slug/authorize</code> — returns <code>{ redirectUrl, connectionId }</code>.</li>
<li><code>POST /toolkits/:slug/disconnect</code> — revokes + refreshes registry.</li>
<li><code>POST /refresh</code> — re-runs the registry loader.</li>
</ul>
<p>Env:</p>
<ul>
<li><code>COMPOSIO_API_KEY</code> — required for integrations. Without it, plain chat + memory + automations still work.</li>
<li><code>COMPOSIO_USER_ID</code> — optional; defaults to <code>boop-default</code> for single-tenant use.</li>
</ul>
<hr>
<h2>Data model (Convex)</h2>
<p>Seven tables. Read <code>convex/schema.ts</code> for the exact shape.</p>
<table>
<thead>
<tr>
<th>Table</th>
<th>Role</th>
<th>Key fields</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>messages</code></td>
<td>iMessage + chat transcript</td>
<td>conversationId, role, content, turnId</td>
</tr>
<tr>
<td><code>conversations</code></td>
<td>Per-thread metadata</td>
<td>conversationId, messageCount, lastActivityAt</td>
</tr>
<tr>
<td><code>memoryRecords</code></td>
<td>The memory store</td>
<td>memoryId, content, tier, segment, importance, decayRate, accessCount, lifecycle, supersedes</td>
</tr>
<tr>
<td><code>executionAgents</code></td>
<td>One row per spawned agent</td>
<td>agentId, task, status, tokens, cost</td>
</tr>
<tr>
<td><code>agentLogs</code></td>
<td>Per-agent audit trail</td>
<td>agentId, logType, toolName, content</td>
</tr>
<tr>
<td><code>automations</code></td>
<td>Scheduled recurring tasks</td>
<td>automationId, schedule, task, integrations, enabled, nextRunAt</td>
</tr>
<tr>
<td><code>automationRuns</code></td>
<td>One row per automation run</td>
<td>runId, automationId, status, result, agentId</td>
</tr>
<tr>
<td><code>drafts</code></td>
<td>Staged external actions</td>
<td>draftId, kind, summary, payload, status</td>
</tr>
<tr>
<td><code>consolidationRuns</code></td>
<td>History of consolidation passes</td>
<td>runId, proposalsCount, mergedCount, prunedCount</td>
</tr>
<tr>
<td><code>sendblueDedup</code></td>
<td>Webhook dedup by <code>message_handle</code></td>
<td>handle, claimedAt</td>
</tr>
<tr>
<td><code>memoryEvents</code></td>
<td>Append-only event log for the debug UI</td>
<td>eventType, conversationId, memoryId, data</td>
</tr>
</tbody>
</table>
<p><code>memoryRecords</code> also carries a <code>vectorIndex("by_embedding")</code> with 1024-dimension vectors filtered by <code>lifecycle</code>.</p>
<p>Indexes are tight — search through the schema to see what's supported.</p>
<hr>
<h2>Message lifecycle</h2>
<p>Following a text from iMessage to reply, step by step:</p>
<pre><code>1.  Sendblue POST /sendblue/webhook
2.  sendblue.ts:  dedup + spawn handleUserMessage()
3.  interaction-agent:  save user msg, fetch recent history
4.  interaction-agent:  query Claude with memory + spawn tools
     ↳ may call recall / write_memory
     ↳ may call spawn_agent → execution-agent runs, returns text
5.  interaction-agent:  final text → broadcast + return
6.  sendblue.ts:  sendImessage() chunks + sends
7.  interaction-agent:  save assistant msg to Convex
8.  BACKGROUND: extract.ts pulls durable facts, writes memories
9.  LATER: clean.ts decays scores, archives or prunes
</code></pre>
<p>Steps 6–7 run in parallel where safe. Step 8 is fire-and-forget — the user never waits on extraction.</p>
<hr>
<h2>Why this shape</h2>
<p><strong>Dispatcher / executor split.</strong> The interaction agent has a tiny toolset and a short prompt so it's cheap, fast, and deterministic. The execution agent gets heavy tools (MCPs) but only runs when needed. Most casual turns never spawn an agent — they complete in one interaction-agent call.</p>
<p><strong>Memory lives next to execution, not in the model.</strong> Claude has no memory across turns. We re-hydrate the relevant slice every turn via <code>recall()</code>. Writing is explicit (<code>write_memory</code>) or inferred (<code>extract.ts</code>). Nothing is implicit.</p>
<p><strong>Integrations via Composio.</strong> Tool-calling is what the SDK does best. Composio handles the OAuth, token-refresh, and 1000+ service adapters we'd otherwise hand-roll. Each connected toolkit becomes an MCP server on demand, scoped to just that toolkit so the sub-agent's context stays small.</p>
<p><strong>Convex for state.</strong> Reactive queries power the debug UI without polling. Durable enough for real use, free tier generous enough for a personal agent.</p>
<hr>
<h2>What's intentionally missing</h2>
<ul>
<li><strong>No user auth.</strong> This is a single-user tool. Add Clerk or similar if you want multi-tenant.</li>
<li><strong>Single-process scheduler.</strong> The automation loop runs in-process. If you deploy multiple instances, you'll double-fire — add a lock in Convex or run a dedicated scheduler pod.</li>
<li><strong>No intelligence runs</strong> (proactive context gathering) — the original had it, it's complex, and it's opinionated about what it watches. Add it if you want.</li>
<li><strong>No knowledge graph</strong> — relationships between memories are represented via <code>supersedes</code> only, not a full graph.</li>
<li><strong>Skills library omitted</strong> — too Boop-specific; write your own prompts/policies in <code>server/*-agent.ts</code> system prompts.</li>
</ul>
<p>All of these are one-file additions. The point of the template is to give you the smallest surface that still actually works.</p>f:T180d,<h1>Integrations</h1>
<p>Boop's integrations are provided by <a href="https://composio.dev/?utm_source=chris&#x26;utm_medium=youtube&#x26;utm_campaign=collab">Composio</a>, a tool-aggregator that exposes 1000+ third-party services (Gmail, GitHub, Slack, Notion, Linear, Google Drive, HubSpot, Salesforce, …) behind one API.</p>
<p>You don't write integration code. You:</p>
<ol>
<li>Put <code>COMPOSIO_API_KEY</code> in <code>.env.local</code>.</li>
<li>Open the debug dashboard → <strong>Connections</strong> tab.</li>
<li>Click <strong>Connect</strong> on a toolkit.</li>
<li>Authenticate on Composio's hosted page. Composio stores the tokens and keeps them fresh.</li>
<li>The toolkit becomes available to <code>spawn_agent(integrations: [...])</code> by its slug.</li>
</ol>
<p>That's it.</p>
<hr>
<h2>How it hooks into Boop</h2>
<p>Each connected Composio toolkit is registered in Boop's integration registry (<code>server/integrations/registry.ts</code>) keyed by its slug. When the dispatcher calls:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">spawn_agent</span><span style="color:#E1E4E8">({ task: </span><span style="color:#9ECBFF">"…"</span><span style="color:#E1E4E8">, integrations: [</span><span style="color:#9ECBFF">"gmail"</span><span style="color:#E1E4E8">] })</span></span></code></pre></figure>
<p><code>buildMcpServersForIntegrations(["gmail"])</code> looks up the registered <code>gmail</code> module, opens a Composio session <strong>scoped to only the Gmail toolkit</strong>:</p>
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="ts" data-theme="github-dark"><code data-language="ts" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#F97583">const</span><span style="color:#79B8FF"> session</span><span style="color:#F97583"> =</span><span style="color:#F97583"> await</span><span style="color:#E1E4E8"> composio.</span><span style="color:#B392F0">create</span><span style="color:#E1E4E8">(</span><span style="color:#B392F0">boopUserId</span><span style="color:#E1E4E8">(), {</span></span>
<span data-line=""><span style="color:#E1E4E8">  toolkits: [</span><span style="color:#9ECBFF">"gmail"</span><span style="color:#E1E4E8">],</span></span>
<span data-line=""><span style="color:#E1E4E8">  manageConnections: </span><span style="color:#79B8FF">false</span><span style="color:#E1E4E8">,</span></span>
<span data-line=""><span style="color:#E1E4E8">});</span></span>
<span data-line=""><span style="color:#F97583">const</span><span style="color:#79B8FF"> tools</span><span style="color:#F97583"> =</span><span style="color:#F97583"> await</span><span style="color:#E1E4E8"> session.</span><span style="color:#B392F0">tools</span><span style="color:#E1E4E8">();</span></span></code></pre></figure>
<p>and wraps those tools as an MCP server for the sub-agent. The sub-agent sees only Gmail's tools (<code>mcp__gmail__GMAIL_SEND_EMAIL</code>, etc.) — no Slack, no GitHub, no 1000-tool context bloat.</p>
<p>Every tool call is logged to Convex as usual, so the Agents tab in the debug dashboard shows them with the right toolkit logo and a humanized name.</p>
<hr>
<h2>Curated toolkit list</h2>
<p>The Connections tab shows a hand-picked set in <code>server/composio.ts:CURATED_TOOLKITS</code>. Edit that array to add or remove cards — the slugs must match Composio's toolkit slugs (see <code>docs.composio.dev/toolkits</code> for the full catalog).</p>
<p>Current defaults: Gmail, Google Calendar, Google Drive, Google Sheets, Google Docs, Slack, GitHub, Linear, Notion, HubSpot, Salesforce, Discord, Twitter, LinkedIn, Trello, Asana, Jira, Airtable, Figma, Dropbox.</p>
<hr>
<h2>Disconnecting</h2>
<p>Click <strong>Disconnect</strong> on a connected card. That revokes the Composio connection and re-loads the integration registry — the toolkit drops out of <code>availableIntegrations()</code> immediately. Next time the dispatcher tries to spawn with that slug, it'll log <code>[integrations] unknown integration: …</code>.</p>
<hr>
<h2>Toolkits that need a one-time auth config</h2>
<p>Composio hosts managed OAuth apps for most popular toolkits (Gmail, Slack, GitHub, Linear, Notion, Google Calendar/Drive/Sheets/Docs, etc.) — click Connect and it just works. A handful of toolkits don't have a managed app on Composio's side (Twitter/X is the common one; Salesforce sometimes) because their developer policies make hosting a shared OAuth app impractical.</p>
<p>When you click Connect on one of those, Boop surfaces an amber banner explaining that you need to:</p>
<ol>
<li>Create an OAuth app on the toolkit's developer portal (e.g., <code>developer.twitter.com</code> for Twitter).</li>
<li>Open <a href="https://platform.composio.dev/auth-configs">platform.composio.dev/auth-configs</a>, pick the toolkit, and register your app's client ID + secret.</li>
<li>Come back to the Connections tab and click Connect again.</li>
</ol>
<p>This is a one-time setup per toolkit (not per user) — all users of your Boop instance reuse the same auth config after that.</p>
<h2>Notes</h2>
<ul>
<li><strong>Single-tenant by default.</strong> All connections are keyed under <code>COMPOSIO_USER_ID</code> (defaults to <code>boop-default</code>). Override if you manage Composio sessions elsewhere and want Boop to share that user.</li>
<li><strong>External actions still use the draft flow.</strong> Execution agents are prompted to call <code>save_draft</code> first for anything that writes to the outside world. The dispatcher's <code>send_draft</code> is the only path that actually commits.</li>
<li><strong>No tokens live in Boop.</strong> Composio stores OAuth credentials on their side. Boop never sees them.</li>
<li><strong>Tool names are Composio's canonical slugs</strong> (e.g., <code>GMAIL_LIST_MESSAGES</code>). The debug dashboard humanizes them for display.</li>
</ul>10:T121d,<h1>Contributing</h1>
<p>Boop is a small personal-agent template. The codebase stays tight because that's the whole point — it should be small enough to read cover-to-cover in an afternoon and fork without fear.</p>
<h2>What lands in source</h2>
<ul>
<li>Bug fixes</li>
<li>Security fixes</li>
<li>Simplifications (less code doing the same thing)</li>
<li>Clear improvements to core behavior — memory decay tuning, consolidation robustness, dispatcher policy, cost tracking, etc.</li>
<li>New channels, integrations, or runtime skills if they fit the template spirit (small, opinionated, well-scoped)</li>
</ul>
<p>Keep the diff focused — one concern per PR. A feature PR and a refactor PR should be two PRs.</p>
<h2>Bug-fix PRs</h2>
<ul>
<li>One fix per PR.</li>
<li>Update <code>CHANGELOG.md</code> under <strong>Unreleased</strong> with a one-line entry.</li>
<li>If the fix changes external behavior (env vars, Convex schema, HTTP routes, webhook shapes), mark the CHANGELOG entry <code>[BREAKING]</code> — see conventions below.</li>
</ul>
<h2>CHANGELOG conventions</h2>
<ul>
<li>
<p>Entries live under <strong>Unreleased</strong> until a release cut.</p>
</li>
<li>
<p>Prefix user-actionable changes with <code>[BREAKING]</code>.</p>
</li>
<li>
<p>If a breaking change needs a migration (backfill, env var rename, schema transform), ship a <strong>migration skill</strong> at <code>.claude/skills/&#x3C;name>/SKILL.md</code> that Claude can run against a user's fork, and reference it in the CHANGELOG:</p>
<pre><code>[BREAKING] &#x3C;description>. Run `/&#x3C;skill-name>` to &#x3C;action>.
</code></pre>
<p><code>/upgrade-boop</code> parses this format and offers to run the referenced skill during upgrades. The format is the only coupling — without a migration, just write <code>[BREAKING] &#x3C;description>.</code> without the skill reference.</p>
</li>
</ul>
<h2>Skills</h2>
<p>Two kinds of skills live in <code>.claude/skills/</code>:</p>
<p><strong>Migration skills</strong> — instruction-only <code>SKILL.md</code> triggered by <code>[BREAKING]</code> CHANGELOG entries during <code>/upgrade-boop</code>. Pure markdown, no branch, no supporting code. Example: <code>/upgrade-boop</code> itself is this shape.</p>
<p><strong>Runtime skills</strong> — <code>SKILL.md</code> loaded into the execution agent at spawn time via the Claude Agent SDK's <code>settingSources</code>. The model autonomously invokes them when a task matches the skill's <code>description</code>. Example: <code>.claude/skills/youtube-script-writer/</code>. See the <strong>Skills</strong> section in the README for wiring details.</p>
<p>Both are just Markdown under <code>.claude/skills/&#x3C;name>/SKILL.md</code> with YAML frontmatter. No branching model, no maintainer-owned sibling branches — features land directly on <code>main</code> like any normal project.</p>
<h2>Writing a migration skill</h2>
<ol>
<li>Fork, branch from <code>main</code>.</li>
<li>Create <code>.claude/skills/&#x3C;name>/SKILL.md</code>:
<figure data-rehype-pretty-code-figure=""><pre style="background-color:#24292e;color:#e1e4e8" tabindex="0" data-language="yaml" data-theme="github-dark"><code data-language="yaml" data-theme="github-dark" style="display: grid;"><span data-line=""><span style="color:#B392F0">---</span></span>
<span data-line=""><span style="color:#85E89D">name</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">&#x3C;name></span></span>
<span data-line=""><span style="color:#85E89D">description</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">One-line trigger description — when /upgrade-boop should offer this.</span></span>
<span data-line=""><span style="color:#B392F0">---</span></span></code></pre></figure>
</li>
<li>Body: numbered operating steps Claude should execute. Lean on <code>git</code>, <code>npm</code>, file edits. Make the skill idempotent — a user running it twice should be safe.</li>
<li>Add the matching <code>[BREAKING]</code> line to <code>CHANGELOG.md</code> under <strong>Unreleased</strong>.</li>
<li>Open a PR with the code change + the SKILL.md + the CHANGELOG entry in one commit.</li>
</ol>
<h2>Writing a runtime skill</h2>
<ol>
<li>Create <code>.claude/skills/&#x3C;name>/SKILL.md</code> with a specific, trigger-rich <code>description</code> so the SDK's routing picks it up reliably.</li>
<li>Body: the playbook the execution agent should follow when it invokes this skill.</li>
<li>That's it — no server code changes needed. The execution agent already loads <code>.claude/skills/</code> via <code>settingSources: ["project"]</code>.</li>
</ol>11:Ta2e,<h1>Changelog</h1>
<p>Notable changes per release. <code>[BREAKING]</code> entries require action on your fork — <code>/upgrade-boop</code> will surface these and offer to run the relevant migration skill.</p>
<p>Format:</p>
<ul>
<li>One section per release.</li>
<li>Prefix breaking items with <code>[BREAKING]</code> and include a migration path (ideally a skill to run).</li>
</ul>
<hr>
<h2>Unreleased — Composio integration layer</h2>
<ul>
<li><strong>[BREAKING]</strong> Hand-built integrations (<code>/integrations/gmail</code>, <code>/integrations/google-calendar</code>, <code>/integrations/notion</code>, <code>/integrations/slack</code>, <code>/integrations/_template</code>) removed. To reconnect equivalents: set <code>COMPOSIO_API_KEY</code> in <code>.env.local</code>, open the Debug UI's Connections tab, click Connect on the toolkit you want. The dispatcher will see it under the same slug (<code>gmail</code>, <code>slack</code>, <code>notion</code>, <code>googlecalendar</code>).</li>
<li><strong>[BREAKING]</strong> Convex <code>connections</code> table dropped. Composio stores OAuth state on its side. Any existing rows in that table are discarded on the next <code>convex dev</code> push.</li>
<li><strong>[BREAKING]</strong> <code>server/oauth.ts</code> removed. The <code>/oauth/*</code> HTTP routes no longer exist. OAuth flows now live at <code>https://platform.composio.dev</code>.</li>
<li><strong>[BREAKING]</strong> Env vars removed: <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REFRESH_TOKEN</code>, <code>GOOGLE_ACCESS_TOKEN</code>, <code>SLACK_CLIENT_ID</code>, <code>SLACK_CLIENT_SECRET</code>, <code>SLACK_BOT_TOKEN</code>, <code>SLACK_USER_TOKEN</code>, <code>NOTION_TOKEN</code>. Delete from <code>.env.local</code>.</li>
<li>Added: <code>server/composio.ts</code>, <code>server/composio-routes.ts</code>, <code>server/integrations/composio-loader.ts</code>, <code>debug/src/components/ComposioSection.tsx</code>.</li>
<li>Added: <code>@composio/core</code>, <code>@composio/claude-agent-sdk</code> npm deps.</li>
<li>Added: env vars <code>COMPOSIO_API_KEY</code>, <code>COMPOSIO_USER_ID</code> (optional, defaults to <code>boop-default</code>).</li>
<li>Added: <code>/upgrade-boop</code> Claude Code skill for bringing upstream changes into a customized fork.</li>
<li>Added: <code>CHANGELOG.md</code> and <code>CONTRIBUTING.md</code>.</li>
<li>Fixed: Sendblue links updated from <code>sendblue.co</code> to <code>sendblue.com</code> (the <code>.co</code> host 301-redirects; API base aligned with Sendblue's own docs).</li>
</ul>2:[["$","$L6",null,{}],["$","$L7",null,{"docs":[{"id":"readme","label":"README","html":"$8"},{"id":"architecture","label":"Architecture","html":"$9"},{"id":"integrations","label":"Integrations","html":"$a"},{"id":"contributing","label":"Contributing","html":"$b"},{"id":"changelog","label":"Changelog","html":"$c"}],"children":[["$","article",null,{"id":"readme","className":"scroll-mt-20 pb-16 border-b border-border last:border-0","children":[["$","div",null,{"className":"mb-6 flex items-center gap-3","children":[["$","span",null,{"className":"px-2 py-0.5 rounded text-xs font-mono text-text-muted border border-border bg-bg-card","children":["README",".md"]}],["$","div",null,{"className":"flex-1 h-px bg-border"}]]}],["$","div",null,{"className":"prose-custom","dangerouslySetInnerHTML":{"__html":"$d"}}]]}],["$","article",null,{"id":"architecture","className":"scroll-mt-20 pb-16 border-b border-border last:border-0","children":[["$","div",null,{"className":"mb-6 flex items-center gap-3","children":[["$","span",null,{"className":"px-2 py-0.5 rounded text-xs font-mono text-text-muted border border-border bg-bg-card","children":["Architecture",".md"]}],["$","div",null,{"className":"flex-1 h-px bg-border"}]]}],["$","div",null,{"className":"prose-custom","dangerouslySetInnerHTML":{"__html":"$e"}}]]}],["$","article",null,{"id":"integrations","className":"scroll-mt-20 pb-16 border-b border-border last:border-0","children":[["$","div",null,{"className":"mb-6 flex items-center gap-3","children":[["$","span",null,{"className":"px-2 py-0.5 rounded text-xs font-mono text-text-muted border border-border bg-bg-card","children":["Integrations",".md"]}],["$","div",null,{"className":"flex-1 h-px bg-border"}]]}],["$","div",null,{"className":"prose-custom","dangerouslySetInnerHTML":{"__html":"$f"}}]]}],["$","article",null,{"id":"contributing","className":"scroll-mt-20 pb-16 border-b border-border last:border-0","children":[["$","div",null,{"className":"mb-6 flex items-center gap-3","children":[["$","span",null,{"className":"px-2 py-0.5 rounded text-xs font-mono text-text-muted border border-border bg-bg-card","children":["Contributing",".md"]}],["$","div",null,{"className":"flex-1 h-px bg-border"}]]}],["$","div",null,{"className":"prose-custom","dangerouslySetInnerHTML":{"__html":"$10"}}]]}],["$","article",null,{"id":"changelog","className":"scroll-mt-20 pb-16 border-b border-border last:border-0","children":[["$","div",null,{"className":"mb-6 flex items-center gap-3","children":[["$","span",null,{"className":"px-2 py-0.5 rounded text-xs font-mono text-text-muted border border-border bg-bg-card","children":["Changelog",".md"]}],["$","div",null,{"className":"flex-1 h-px bg-border"}]]}],["$","div",null,{"className":"prose-custom","dangerouslySetInnerHTML":{"__html":"$11"}}]]}]]}],["$","footer",null,{"className":"border-t border-border bg-bg-base","children":["$","div",null,{"className":"max-w-6xl mx-auto px-4 sm:px-6 py-10","children":[["$","div",null,{"className":"flex flex-col md:flex-row md:items-center justify-between gap-6","children":[["$","div",null,{"className":"flex items-center gap-2","children":[["$","$L12",null,{"src":"/assets/boop.png","alt":"Boop mascot","width":24,"height":24,"className":"rounded-sm opacity-80"}],["$","span",null,{"className":"text-sm font-semibold text-text-secondary","children":"Boop Agent"}]]}],["$","div",null,{"className":"flex flex-wrap items-center gap-5 text-sm text-text-secondary","children":[["$","a",null,{"href":"https://github.com/raroque/boop-agent","target":"_blank","rel":"noopener noreferrer","className":"hover:text-text-primary transition-colors flex items-center gap-1.5","children":[["$","svg",null,{"xmlns":"http://www.w3.org/2000/svg","width":14,"height":14,"viewBox":"0 0 24 24","fill":"none","stroke":"currentColor","strokeWidth":2,"strokeLinecap":"round","strokeLinejoin":"round","className":"lucide lucide-github","children":[["$","path","tonef",{"d":"M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"}],["$","path","9comsn",{"d":"M9 18c-4.51 2-5-2-7-2"}],"$undefined"]}]," GitHub"]}],["$","a",null,{"href":"https://youtu.be/ZpmKjDDbqHs","target":"_blank","rel":"noopener noreferrer","className":"hover:text-text-primary transition-colors flex items-center gap-1.5","children":[["$","svg",null,{"xmlns":"http://www.w3.org/2000/svg","width":14,"height":14,"viewBox":"0 0 24 24","fill":"none","stroke":"currentColor","strokeWidth":2,"strokeLinecap":"round","strokeLinejoin":"round","className":"lucide lucide-youtube","children":[["$","path","1q2vi4",{"d":"M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"}],["$","path","1jp15x",{"d":"m10 15 5-3-5-3z"}],"$undefined"]}]," YouTube"]}],["$","$L13",null,{"href":"/docs","className":"hover:text-text-primary transition-colors","children":"Docs"}],["$","a",null,{"href":"https://github.com/raroque/boop-agent/blob/main/LICENSE","target":"_blank","rel":"noopener noreferrer","className":"hover:text-text-primary transition-colors","children":"MIT License"}]]}],["$","p",null,{"className":"text-xs text-text-muted","children":"Built on Claude Agent SDK · Powered by Composio · Persisted with Convex"}]]}],["$","div",null,{"className":"mt-8 pt-6 border-t border-border text-xs text-text-muted","children":["© ",2026," Chris Raroque. Open source under the MIT License."]}]]}]}]]
