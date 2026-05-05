# Mobilis Prompt Pack

Use the prompts below to drive development of an excellent ride-hailing super app for cars and motorcycles in the same platform.

These prompts are tailored to your current monorepo:

- `pnpm` workspace at the repo root
- existing `apps/backend` NestJS + Prisma starter
- room to add rider, driver, and admin apps plus shared packages

## 1. Best Master Prompt

Paste this first when you want me to take ownership and build the application progressively.

```text
You are my principal engineer for the `mobilis` monorepo at `C:\Users\LENOVO\Desktop\mobilis`.

Your mission is to design and build a production-grade, Uber-like and Bolt-like mobility platform that supports both motorcycles and cars in the same application ecosystem. The product must feel premium, modern, scalable, and locally adaptable for African markets first, while staying globally competitive.

Build this as a serious startup-ready platform, not a demo. I want excellent architecture, clean folder structure, strong naming, thoughtful UX, robust backend design, and maintainable code. Make decisive engineering choices, but explain major tradeoffs briefly when they matter.

Core product requirements:
- One ecosystem with support for both motorcycle rides and car rides
- Rider experience
- Driver experience
- Admin and operations experience
- Real-time ride lifecycle
- Live driver location tracking
- Ride matching and dispatch foundations
- Pricing foundations for different vehicle categories
- Wallet/payment-ready architecture
- Ratings, trip history, support, and notifications
- Authentication and role-based authorization
- Scalable monorepo structure with reusable packages

Execution rules:
- Work directly in the codebase, creating all files, folders, configs, dependencies, and scripts needed
- Use the existing `pnpm` workspace and evolve it into a clean monorepo
- Keep the existing backend only if it helps; otherwise refactor it properly
- Do not stop at planning; implement
- Proceed in phases, but complete each phase with working code before moving on
- After each major phase, summarize what you changed, what is now working, and the next recommended step
- If something is ambiguous, make a strong reasonable assumption and continue
- Add environment examples, docs, and setup instructions as the project grows
- Prefer production-friendly defaults over toy examples
- Include validation, error handling, DTOs/types, modular architecture, and testable structure
- Preserve a high-quality developer experience
- Treat trust, payments, realtime consistency, and zero-downtime deployment as first-class requirements, not later polish
- When auditing, identify concrete code or architecture risks before adding new features
- Treat SLO, mobile crash/error taxonomy, admin risk posture and incident routing as part of the product surface, not invisible ops polish

Technical expectations:
- Monorepo with apps and shared packages
- Backend with NestJS and Prisma on PostgreSQL
- Shared domain types and validation where useful
- Mobile-ready client strategy and web admin strategy chosen intelligently by you
- API design that cleanly supports riders, drivers, dispatch, and admin
- Seed data and local development setup where possible
- Good scripts in root `package.json`
- Documentation in markdown as needed

Product expectations:
- The brand is `Mobilis`
- The app should feel revolutionary, elegant, fast, and trustworthy
- Design for future support of delivery, fleet management, subscriptions, scheduled rides, and promo systems even if not all are built immediately
- Prioritize a strong MVP foundation first, then extend

Start by:
1. Auditing the existing repo
2. Proposing the target monorepo architecture very briefly
3. Implementing the foundation immediately after that

Do not just give advice. Build the application.
```

## 2. Stronger Architecture Prompt

Use this if you want me to focus on setting up the full structure first.

```text
In the `mobilis` repo, design and implement the target monorepo architecture for a world-class multi-vertical ride-hailing platform for motorcycles and cars.

I want a structure similar in seriousness to a funded startup codebase. Create the apps, packages, tooling, scripts, and baseline documentation needed for long-term scale.

The architecture should support:
- `apps/backend` for API and realtime services
- `apps/rider-app` for customer-facing mobile/web experience
- `apps/driver-app` for driver-facing mobile/web experience
- `apps/admin-web` for operations and admin
- shared packages for config, types, ui/design tokens if useful, and domain logic

Your task:
- inspect the current repo
- decide the best frontend stack(s)
- scaffold everything cleanly
- wire workspace scripts
- add lint/format/typecheck/dev/build conventions
- create initial docs explaining the monorepo

Then implement enough starter code that the architecture is real, coherent, and ready for feature work.
```

## 3. Backend-First Prompt

Use this when you want me to focus deeply on the API and data model.

```text
In `C:\Users\LENOVO\Desktop\mobilis`, build the backend foundation for `Mobilis`, a premium ride-hailing platform for motorcycle and car transport.

Use NestJS + Prisma + PostgreSQL and implement a serious modular backend, not a tutorial project.

Build backend modules for:
- auth
- users
- riders
- drivers
- vehicles
- ride-requests
- trips
- pricing
- geo/location foundations
- notifications foundations
- payments/wallet foundations
- admin
- health/system

Requirements:
- robust Prisma schema for multi-role mobility platform
- DTO validation
- clear module boundaries
- environment config
- role-based authorization
- seed strategy
- API versioning strategy
- OpenAPI/swagger if appropriate
- testable service structure

Support both motorcycles and cars as first-class ride categories.
Include trip states such as requested, matched, driver-arriving, in-progress, completed, cancelled.

Do the work directly in the repository and leave the backend in a state that is substantially ready for rider and driver clients.
```

## 4. Database Design Prompt

Use this if you want me to get the data model right before everything else.

```text
Design and implement the production-minded Prisma schema for `Mobilis`, a mobility app supporting both motorcycles and cars.

The schema should support:
- users with roles
- rider profiles
- driver profiles
- vehicle records
- vehicle categories and service tiers
- trip requests
- trip assignments
- active trips
- trip events/status history
- saved places
- pricing structures
- wallets/payment records foundation
- ratings/reviews
- support tickets foundation
- notifications foundation
- auditability where useful

Do not keep this simplistic. Model the domain with enough depth to support real growth, while avoiding unnecessary overengineering.

After designing the schema:
- update Prisma files
- create migrations if appropriate
- add seed scaffolding
- explain the key modeling decisions briefly
```

## 5. Rider App Prompt

Use this when you want the customer-facing product built.

```text
Build the `Mobilis` rider application in the monorepo with premium UX.

This app must let a customer:
- sign up and sign in
- choose motorcycle or car
- set pickup and destination
- see estimated fare and ETA
- request a ride
- view trip status in real time
- see assigned driver and vehicle
- review trip history
- manage profile and saved places
- rate completed trips

Design direction:
- excellent, modern, startup-quality UI
- memorable visual identity
- mobile-first
- not generic
- fast and clean interaction design

Build the real app structure, screens, components, navigation, state management, API integration points, and reusable UI patterns.
```

## 6. Driver App Prompt

Use this when you want the driver side built well.

```text
Build the `Mobilis` driver application in the monorepo.

The driver app must support:
- onboarding foundations
- authentication
- profile and vehicle setup
- online/offline availability
- receiving trip offers
- accepting/rejecting rides
- navigating trip lifecycle
- trip earnings history
- ratings summary
- notifications/inbox foundations

Prioritize operational clarity, low-friction actions, and real-time readiness.

Implement the app structure, screens, API integration layer, driver state flows, and polished UI.
```

## 7. Admin Prompt

Use this when you want the operations dashboard.

```text
Build the `Mobilis` admin/operations web app in the monorepo.

The admin system should support:
- overview dashboard
- riders management
- drivers management
- vehicles management
- trips monitoring
- support/incident foundations
- pricing configuration foundations
- analytics foundations
- role-based admin access

I want an admin experience that feels professional, efficient, and immediately useful for real operations.

Implement the dashboard structure, layouts, major tables/views, route organization, and API integration foundations.
```

## 8. Real-Time and Dispatch Prompt

Use this when you want the app to start feeling alive.

```text
Implement the real-time ride and dispatch foundations for `Mobilis`.

I want the platform architecture to support:
- live driver location updates
- nearby driver discovery foundations
- ride request matching flow
- trip status broadcasting
- rider and driver real-time updates
- extensible event-driven design

Use the current monorepo and backend architecture. Choose the best realtime approach for the stack and integrate it cleanly.

Focus on correctness of architecture, event flow clarity, and future scalability more than fake visual demos.
```

## 9. World-Class UX Prompt

Use this when you want me to elevate the product from functional to outstanding.

```text
Upgrade `Mobilis` so the product experience feels world-class, premium, and distinctive rather than generic.

Improve:
- branding
- design system consistency
- typography
- spacing
- color strategy
- component polish
- empty states
- loading states
- transitions/motion
- trust and safety cues
- perceived speed

Preserve existing functionality while raising the visual and product quality significantly.

Make bold but disciplined design decisions.
```

## 10. Hardening Prompt

Use this after a few implementation phases.

```text
Harden the `Mobilis` codebase for serious development.

Improve:
- code quality
- validation
- error handling
- security basics
- environment management
- test coverage in critical paths
- DX scripts
- docs
- consistency across apps/packages

Audit the monorepo, identify weak spots, and implement concrete improvements directly in the repository.
```

## 11. Best Step-By-Step Sequence

If you want a highly effective sequence, use these prompts in order:

1. Use the master prompt
2. Use the backend-first prompt
3. Use the database design prompt
4. Use the rider app prompt
5. Use the driver app prompt
6. Use the admin prompt
7. Use the real-time and dispatch prompt
8. Use the world-class UX prompt
9. Use the hardening prompt

## 12. Very Short Command Prompt

Use this when you want a compact version:

```text
Open `C:\Users\LENOVO\Desktop\mobilis` and build `Mobilis`, a production-grade ride-hailing platform for both motorcycles and cars in one ecosystem. Use the existing pnpm monorepo, evolve the current NestJS backend properly, add the missing apps and packages, create all required files/folders/dependencies, and implement the platform phase by phase until it becomes a polished, startup-quality product. Do not only plan; build.
```

## 13. Best Practices For Prompting Me

To get the strongest results, add one short instruction when you paste a prompt:

- `Work directly in the repo and make the code changes now.`
- `Do not stop at planning.`
- `Make reasonable assumptions and continue.`
- `At the end, tell me what works and what the next best step is.`

## 14. Recommended Product Direction

If you want my recommendation, the best build direction is:

- Backend: NestJS + Prisma + PostgreSQL
- Rider app: Expo / React Native with real Android, iPhone, and web support
- Driver app: Expo / React Native with real Android, iPhone, and web support
- Admin web: Next.js
- Shared packages: types, config, api, design tokens, utilities
- Realtime: WebSockets or Socket.IO at first, with a clean abstraction for later scale

That gives us a serious foundation without making the first build too heavy.

## 15. Best Cross-Platform Master Prompt

Use this if you want me to continue with a very explicit cross-platform mandate.

```text
Continue building `Mobilis` in `C:\Users\LENOVO\Desktop\mobilis` as a truly cross-platform mobility platform.

I want:
- Android apps
- iPhone apps
- web access for rider and driver experiences where sensible
- a web admin console
- one coherent product ecosystem

Use the current monorepo and continue implementing directly in the repository.

Cross-platform expectations:
- rider and driver apps should be built with a serious shared Expo / React Native architecture that supports Android, iOS, and web
- admin should remain a polished web application
- shared domain logic, API types, config, and design tokens should live in reusable packages where useful
- do not create fragmented duplicate logic across platforms unless necessary

Build priorities:
1. make the cross-platform app foundations compile cleanly
2. create real navigation, layout, and feature structure for rider and driver apps
3. connect the apps to the backend through a clean API layer
4. improve the backend where needed to support these clients
5. keep the UX premium and distinctive

Execution rules:
- work directly in the repo
- do not stop at planning
- make reasonable assumptions and continue
- after each major phase, tell me what works now and what should come next

Do the work now.
```

## 16. Rider + Driver Cross-Platform Prompt

Use this when you want me to focus specifically on the user-facing cross-platform apps.

```text
In the `mobilis` monorepo, continue building the rider and driver apps as true cross-platform Expo applications for Android, iPhone, and web.

I want:
- production-quality folder structure
- route organization
- shared components where appropriate
- mobile-first screens that still work well on web
- strong theming and visual identity
- a clean API client layer
- realistic app state foundations

For the rider app, implement or improve:
- auth screens
- home / booking screen
- vehicle selection between motorcycle and car
- pickup / destination flow
- fare estimate view
- active trip view
- trip history
- profile and saved places

For the driver app, implement or improve:
- auth screens
- onboarding shell
- home / availability screen
- trip offers
- current trip flow
- earnings screen
- profile / vehicle screen

Keep the apps elegant, fast, and clearly designed for real users.
Build directly in the repo.
```

## 17. Cross-Platform Design System Prompt

Use this when you want me to unify the product visually across web and mobile.

```text
Create or improve the shared Mobilis design system so the rider app, driver app, and admin experience feel like one premium brand across Android, iPhone, and web.

I want:
- shared design tokens
- clear color system
- typography rules
- spacing scale
- reusable card, button, badge, list item, and empty/loading state patterns
- a bold but disciplined identity

Preserve platform appropriateness:
- mobile apps should feel native enough
- web should feel powerful and refined
- the brand should still feel coherent across all surfaces

Implement the code directly in the monorepo, not just a written proposal.
```

## 18. Excellent “Continue Building” Prompt

This is the strongest short prompt to paste after the current foundation:

```text
Continue building `Mobilis` from the current repository state. Treat the existing backend foundation, admin shell, rider shell, and driver shell as Phase 1. Now move into Phase 2 and make the platform truly cross-platform and startup-grade: improve the Expo apps for Android, iPhone, and web; deepen the backend for rider/driver workflows; keep the admin excellent; add reusable shared packages where needed; and keep implementing directly in the repo until the product is meaningfully more complete. Do not stop at planning.
```

## 19. French-First Burkina Faso Prompt

Use this when you want the active implementation to stay French-first for the Burkina Faso launch.

```text
Continue building `Mobilis` in `C:\Users\LENOVO\Desktop\mobilis` with a French-first product strategy for Burkina Faso.

Important product rule:
- all user-facing app content should be implemented in French first
- voice, place search, booking, driver operations, and admin wording should reflect a Burkina Faso launch context
- keep the architecture ready for English later, but do not make English the active default right now

Build directly in the repo and continue implementation across:
- rider app for Android, iPhone, and web
- driver app for Android, iPhone, and web
- admin web
- backend APIs
- shared packages

I want the app to feel premium, local, voice-aware, and more thoughtful than generic ride-hailing apps.

Do not stop at planning. Implement and tell me what works after each meaningful phase.
```
