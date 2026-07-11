# Orbi Market-Leader Gap Closure

Date: 2026-07-07

## Blunt Assessment

Realism score: 6/10.

Orbi is technically more serious than a demo clone: it has backend modules for
pricing, dispatch, payments, onboarding, health, realtime, audit and mobile
observability. The unrealistic part is assuming this can feel like Uber, Yango
or Bolt by adding screens. Market leaders win through operational density:
driver supply, fast support, trusted identity, payment reliability, map quality,
fraud controls, crash-free mobile sessions and years of local calibration.

Weakest part: perceived product quality on mobile. The codebase has many strong
domain decisions, but the driver and rider apps still looked uneven: cramped
bottom sheets, inconsistent card radii, decorative emoji in serious flows,
overlong buttons, and operational copy competing with the primary action.

One fix that raises the score most: make the first five mobile moments feel
decisive and calm:

- rider home: destination entry, upfront fare, nearby supply and SOS
- rider booking: route, service choice, payment, confirmation
- rider active trip: driver proof, pickup code, ETA, share/SOS
- driver cockpit: online state, earnings, active offer, fatigue
- driver offer: payout, pickup effort, trip effort, accept/decline

## Assumptions To Stop Making

- "Feature parity means competitiveness." It does not. A worse-looking app with
  many features loses to a calmer app with fewer but trusted moments.
- "The backend will compensate for weak UI." Riders and drivers judge trust
  before they understand architecture.
- "Burkina localization is just pricing and French copy." It also means support
  response time, mobile money failure handling, low-end Android performance,
  offline/retry behavior, pickup ambiguity and driver economics.
- "Market leaders are only a design benchmark." They are operations benchmarks.
  UI is the visible edge of a dispatch, safety, payment and support machine.

## Closed In This Pass

- A first shared native mobile UI layer now lives in `@orbi/ui/native`:
  `OrbiButton`, `OrbiSurface`, `OrbiStatusBanner` and `OrbiMetricTile`.
- Driver offer cards now have legible accept/decline actions instead of a
  clipped refusal button, and use the shared native button/surface primitives.
- Driver cockpit bottom sheet has enough height for real content and uses
  stronger CTA color hierarchy.
- Rider home bottom sheet now fits search plus service options and presents
  service choices as premium selectable rows using the shared surface primitive.
- Rider booking now uses shared surfaces, alert banners and CTA primitives for
  route summary, supply state, payment state, realtime sync and promo actions.
- Rider activity now uses shared metric tiles, status banners, surfaces and
  action buttons for trip tracking, driver identity, pickup code, route, share,
  incident, SOS and cancellation actions.
- Rider activity now blocks screen capture around active route, driver proof,
  pickup code, incident and SOS surfaces while preserving the explicit trip
  share action for intentional sharing.
- Rider account now uses shared surfaces, metric tiles, account status banners,
  wallet recharge controls and support submission buttons.
- Rider and driver account identity are now privacy-safe by default: profile
  emails and rider phone numbers are masked in account headers, incomplete
  identity values do not leak raw input, the shared rule lives in
  `@orbi/domain`, and the rider screen-capture guard remains active around the
  account surface.
- Rider payment selection now removes decorative emoji from money surfaces and
  uses sober method badges plus a shared secure-confirmation banner for Mobile
  Money.
- Rider payment selection no longer shows Wallet Orbi as a prototype
  "coming soon" card. Wallet now appears as a real selectable payment method
  only when the selected service exposes wallet support, with a secure wallet
  confirmation banner and the existing booking safety validation guarding
  unsupported payment methods.
- Rider Mobile Money selection now feeds the selected network and entered phone
  number into checkout creation, with pre-submit validation before the payment
  API is called. The payment surface is now functional, not only visual.
- Rider and driver mobile typography now removes arbitrary letter spacing across
  app screens, realtime widgets, offer cards, payment controls, logo wordmarks
  and shared mobile primitives so labels render more natively and consistently
  on small Android screens.
- Rider receipt now uses shared mobile surfaces, status banner and CTA buttons,
  with a more official share message and clearer secure-receipt/payment/support
  hierarchy after trip completion.
- Rider rating now uses shared mobile surfaces, status banners and CTA buttons,
  keeping the star interaction while making completion, error and skip states
  feel part of the same premium post-trip flow.
- Rider trip history now uses shared metric tiles, surfaces and CTA buttons,
  making completed trips, active follow-up, receipts and empty-state booking
  actions easier to scan and act on.
- Rider voice search now uses shared surfaces and status banners, with the
  emoji microphone replaced by a native drawn control so the voice flow feels
  like a product feature rather than a prototype demo.
- Rider booking voice and scheduling labels now remove decorative emoji from
  production copy and use native UI controls instead, preserving booking,
  pricing, supply and payment business logic.
- Driver cockpit now uses shared native buttons and alert banners for the
  availability toggle, navigation, offer list entry, onboarding setup, fatigue
  state and manual refresh.
- Driver offers and active-mission flow now use shared surfaces, status banners
  and CTA buttons for completion feedback, fatigue warnings, mission container,
  secondary rider actions, offline/suspended states and live refresh.
- Driver offers and active-mission flow now block screen capture around rider
  identity, pickup-code verification, route monitoring, incident and SOS
  controls.
- Driver profile now uses shared native surfaces, metric tiles and status
  banners for identity, verification, readiness, mission, suspension and
  profile-sync states.
- Driver profile now blocks screen capture while the sensitive identity,
  verification and document-review surface is mounted, matching the stronger
  privacy posture already used on rider account and driver earnings screens.
- Driver profile deep forms now use shared surfaces and action buttons for
  onboarding update, secure document-link preparation, dossier submission and
  support ticket actions.
- Driver onboarding now uses shared native surfaces, status banners and CTA
  buttons, with decorative emoji removed from the serious verification flow.
- Driver onboarding now blocks screen capture while phone, license, vehicle and
  document-readiness data are being entered, so sensitive onboarding data gets
  the same privacy posture as profile and earnings.
- Rider and driver authentication now use shared native surfaces, CTA buttons
  and error banners instead of one-off button/error styling.
- Mobile realtime hooks are exported through `@orbi/ui/native`; rider and
  driver apps no longer import from `@orbi/ui/src/*` internals.
- Admin shell visual tokens were tightened toward an operations-console feel:
  less one-note dark-blue styling, smaller radii, denser spacing and cleaner
  test-access/admin-session controls.
- Admin live ops top console now moves key KPI, status distribution, payment
  reconciliation and market-pressure surfaces out of inline styling into stable
  operations-console classes with cleaner copy.
- Admin driver onboarding review now has a clearer trust-ops hierarchy:
  identity, vehicle scope, document proof, decision guidance, audit history,
  signed document links and account suspension controls are visually separated
  and responsive instead of reading like one heavy card.
- Driver earnings removed decorative emoji from work/finance surfaces and moved
  toward a calmer financial hierarchy.
- Driver navigation copy no longer embeds decorative emoji in translated
  production labels.
- Mobile visual QA now runs through `scripts/testing/mobile-visual-capture.ps1`
  against real Expo web renders on small Android, standard Android and mobile
  web viewport sizes, writing PNGs plus a JSON report under
  `artifacts/mobile-visual-qa`.
- The visual QA pass exposed and closed a real runtime gap: Expo web was
  rendering blank because Metro could not resolve workspace packages
  (`@orbi/ui/native`, `@orbi/domain`). Rider and driver Metro configs now map
  these workspace source modules explicitly for pnpm/Windows/Expo web.
- The visual QA pass exposed and closed a privacy/runtime gap:
  `expo-screen-capture` was called directly on web and produced visible error
  overlays. Rider and driver now route sensitive-screen protection through
  platform-safe wrappers, preserving native anti-screen-capture behavior without
  crashing web QA.
- Sensitive mobile surfaces now have an explicit screen-capture coverage guard:
  rider auth, booking/payment, voice, receipt, activity and account; driver
  auth, onboarding, home cockpit, offers, profile and earnings. Static smoke
  tests fail if those screens lose the privacy wrapper.
- Incident evidence declarations now expose a concrete `expiresAt`, clamp
  retention to the 1h-72h support window inside the service layer, and carry
  the expiry into audit metadata and the shared API contract.
- Rider authentication small-screen polish now uses a real SVG eye affordance
  with a fixed touch target, removing the clipped text-symbol control detected
  at 360px width.
- Admin overview/preview no longer show fabricated headline numbers. A
  hardcoded "94,8%" completion rate (shown for any nonzero user count), a
  static "3 min 12 s" pickup time, and a revenue figure invented from
  `openRequests * 1850 XOF` were presented as live authenticated data on both
  the public `/admin/preview` page and the authenticated admin dashboard.
  Replaced with real 24h-windowed metrics: succeeded payment volume,
  completed/(completed+cancelled) trip ratio, and average
  createdAt→startedAt pickup duration.
- Instrumented the five operational KPIs this doc had flagged as a gap:
  crash-free session rate, first-booking conversion, offer acceptance,
  driver online duration and support first-response time. All derived from
  existing audit-log/session/trip/ticket history (no new tables needed) and
  exposed via a new cached `/admin/operational-kpis` endpoint, rendered in
  the admin console.
- Fixed a real cross-role authentication bug found via live device testing:
  rider and driver share one `users` table, but neither email/password
  sign-in nor phone-OTP verification ever checked that an account's actual
  role matched which app (rider vs driver) was authenticating — a driver's
  correct credentials could sign into the rider app and vice versa. Both
  paths now reject on role mismatch with the same generic "invalid
  credentials" message used for a wrong password (no distinct error, so an
  attacker still can't learn an email/phone is registered under a different
  role), without penalizing `failedLoginCount`/lockout since the credentials
  were valid — just for the wrong app.
- Fixed the shared mobile `ErrorBoundary`: it rendered the raw
  `error.message` (internal component/library names) directly on the crash
  screen, and — more importantly — a full render-tree crash was never
  actually reported to the backend at all, making it invisible to support.
  The fallback screen now always shows a fixed message, and every crash is
  reported through the existing critical-severity error-report pipeline
  (same one used for network/session errors), which also auto-opens a
  support ticket.

## Roadmap — Phased Plan (2026-07-11)

Closing "all gaps vs market leaders" conflates four different kinds of gap
that don't close the same way. Naming which kind a gap is prevents false
progress (shipping code that "looks closed" but changes nothing measurable).

- **A. Code-fixable now** — an engineering bug/gap, closed by editing code,
  verified by tests. Most items closed so far are this type.
- **B. Verifiable only on real traffic/devices** — the code is right, but the
  proof requires real usage (e.g. the operational KPIs above will read 0%/null
  until real riders and drivers generate data; native rendering/performance
  can only be confirmed on physical devices via a real build, not this
  environment).
- **C. Infra/deployment decisions** — requires the human operator, not just
  code (e.g. moving off the free-tier Render/Neon stack).
- **D. Business/operational, not code** — driver supply density, support
  staffing/SLAs, local pricing calibration. No amount of code closes these.

**Phase 0 — Stop the trust bleeding (immediate)**
- Full security audit across auth/payments/data-access (in progress
  2026-07-11 — see findings appended below as they're confirmed and fixed).
- Native-build hygiene checklist: the `RNSVGLinearGradient` crash showed
  there's no guard today preventing a JS change that depends on a native
  module version the last-built APK doesn't have. Needs a documented "does
  this change require a native rebuild" checklist, not just a memory note.
- Finish the pre-existing "Remaining Gaps" list below (mostly category A/B).

**Phase 1 — Measurable reliability (weeks)**
- Run the operational KPIs against real pilot traffic (category B — nothing
  to build, just needs usage).
- Harden payment reconciliation coverage (missed webhooks, refund edge cases)
  — real money is at stake here, higher priority than visual polish.
- Real low-end Android device testing (category B/C — needs a build + physical
  devices, not achievable from this sandboxed environment).

**Phase 2 — Product parity (continuous, in parallel)**
- Remaining scroll-depth/dark-mode/native-screen verification work.

**Phase 3 — Not code**
- Driver supply density, support response staffing, field-calibrated
  pricing/ETA (category D — tooling can support these, code alone can't
  close them).

## Remaining Gaps

- Extend screenshot QA beyond unauthenticated/auth redirects by injecting or
  provisioning demo sessions for protected rider and driver routes, then inspect
  booking, active trip, offers, onboarding, profile, earnings, receipts and
  error/loading/empty states visually.
- Continue replacing one-off mobile UI with the shared native primitives across
  remaining secondary rider/driver support and edge-case surfaces.
- Replace hardcoded preview assumptions with field-calibrated supply, ETA and
  pricing data (pricing scenario driver/request counts on the admin dashboard
  are still illustrative presets, not live-calibrated).
- Finish production-grade realtime backplane, payment reconciliation coverage,
  observability dashboards and support timelines before claiming leader-level
  readiness.
