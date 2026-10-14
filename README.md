# FlyLow v2

**Describe the trip once. Search, track, and simulate booking only inside your approved rules.**

FlyLow is a flight-marketplace and constrained-commerce coursework prototype for flexible, price-sensitive travelers. It expands the original policy evaluator into a complete browser experience. All flights, providers, notifications, vault references, and purchases are simulated. No ticket is issued, payment taken, or airline contacted.

Repository: https://github.com/joconne8/flylow_v2

## What's built

| Route | Working functionality |
| --- | --- |
| `/` or `/search` | Airport search, exact or flexible dates, travelers, cabin, budget, bags, stops, layover, airline filters, sorting, and transparent prompt extraction into editable validated JSON |
| `/results` | Dynamically generated synthetic offers with match/fail/review badges, rule-by-rule details, price tracking, and authority setup |
| `/tracker` | Saved searches, manual offer checks, check history, mock email/SMS/push preferences, and in-app demo notifications |
| `/autobook` | Explicit authority approval, expiry, spending limit, confirmation threshold, immutable traveler/cabin/airline scope, revocation, policy-edit invalidation, repricing scenarios, and audit logs |
| `/vault` | Connect/disconnect a fictional traveler and payment profile using fake references; no sensitive-data entry |
| `/receipt/:id` | Persisted simulated receipt with pricing and decision audit trail |
| `/basic` | Separate original four-step policy-gate prototype for a simpler assignment walkthrough |

## Run locally

Use Node.js 24 and pnpm:

```sh
pnpm install
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/flylow dev
```

Open `http://localhost:3000`. On Replit, the configured FlyLow workflow supplies its port and base path automatically.

Build and serve the frontend:

```sh
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/flylow build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/flylow serve
```

No API keys or database are required. The workspace contains unused backend/shared scaffolding, but FlyLow v2 itself runs entirely in the browser. Its data is browser-local and does not sync between devices.

## Demo walkthrough

1. Search the default synthetic ORD–DUB round trip: outbound May 20–27, 2027, return August 10–17, 2027, $650 all-in, one economy traveler, one checked bag.
2. Inspect fixture A ($612, match), B ($651, fails the cap), and C ($600, unknown fare brand and bag allowance, needs review).
3. Track the search, open Track, and click **Check offers now** to record a local sample and mock notification. Nothing runs in the background.
4. Connect the fictional profile in Vault.
5. Open Auto-book, review the exact policy and traveler/cabin/airline scope, set a future expiry, spending cap and confirmation threshold, and explicitly approve.
6. Check for matching fares and simulate booking. Use the repricing controls to test an unchanged fare, a fare above the cap, or missing baggage/fare information.
7. For a fare above the confirmation threshold, explicitly confirm. The app reprices and validates again before creating a receipt. Repeat requests for the same authority and offer reuse the existing receipt.

The original, more basic first webpage is kept separately at **`/basic`**. It is still a complete policy-gate simulation and links back to expanded FlyLow v2 at `/`.

An approved authority is a snapshot. Changing the general search creates a new draft, not a change to an existing authority. **Edit policy** on an authority invalidates it; a new approval is required.

## AI and provider transparency

The natural-language feature is a **deterministic rule-based parser, not a live LLM**. It supports the disclosed airport vocabulary, month/day windows, budget, bags, and restrictions. Ambiguous Chicago airports, vague date ranges, and missing years ask for clarification. Unspecified restrictions are labeled assumptions for review. Parsing never grants booking permission.

`FlightProvider` exposes `searchFlights`, `priceOffer`, and `createOrder`. `DemoProvider`, `AmadeusSandboxProvider`, and `DuffelSandboxProvider` implement those methods with local synthetic data. The Amadeus/Duffel names illustrate provider adapter boundaries only: **they are MOCK adapters, not connected to either supplier's sandbox or production API**.

The finite catalog covers origins ORD, MDW, and JFK and destinations DUB, LHR, CDG, AMS, FRA, MAD, and LIS. Anywhere and Europe expand to that same disclosed seven-destination catalog. Prices are generated demo values, not market information.

Email, SMS, and push preferences produce only local in-app notification examples. No messages are sent. The mock vault uses fictional Demo Traveler and a "Visa ending 4242" display label, not an actual card number or token. Never enter real passwords, credentials, card numbers, CVVs, or passport data into this prototype.

## Booking guardrails

- Validated policy and explicit approval; no implicit authority from parsing or searching.
- Immutable approved route/date/rule and traveler/cabin/airline scope.
- Enabled, unrevoked, unexpired authority and connected mock vault required.
- All-in USD price, baggage, fare, dates, transfers, stops, and layovers rechecked after repricing.
- Missing fare or baggage details require review, not optimistic booking.
- Confirmation above the approved threshold, followed by another reprice and gate.
- Unavailable fares, inconsistent provider responses, or stale confirmed totals cannot create a successful receipt.
- Deterministic idempotency key and duplicate receipt suppression.
- Persisted local audit log and clearly marked simulated receipts.

Local integrity checks are defensive demo protections, not a security boundary: a real service would enforce authorization, policy integrity, and idempotency on a trusted server.

## Testing

**Executed checks:** all 15 automated logic tests passed; frontend TypeScript checks and production build passed. A consolidated browser walkthrough also passed in a fresh isolated browser context on October 14, 2026. No application console errors were observed.

| Case | Observed logic result | Status |
| --- | --- | --- |
| Typical | Fixture A matches, unchanged reprice produces an auditable simulated receipt; repeat purchase returns DUPLICATE | Pass |
| Challenge | Fixture B fails at $651; price-rise scenario rejects; threshold requires confirmation; final unavailable or inconsistent fare cannot book | Pass |
| Invalid/incomplete | Fixture C and missing-detail reprice require review; missing vault, expired/revoked/edited/disabled/malformed authority blocks | Pass |

Additional tests cover airport/date/year clarification, actual hard filters, all three mock providers, receipt serialization, malformed storage recovery, tracker samples, and notification preferences.

Reproduce:

```sh
pnpm --filter @workspace/flylow typecheck
pnpm --filter @workspace/api-server exec esbuild \
  ../../artifacts/flylow/src/lib/v2.test.ts \
  ../../artifacts/flylow/src/lib/assignment.test.ts \
  --bundle --platform=node --format=esm --outdir=/tmp/flylow-v2-tests
node --test /tmp/flylow-v2-tests/*.js
```

The original six tests exercise the legacy Assignment 2 policy modules, including their original canned request parser. The v2 application uses the separate rule-based parser and has nine additional tests.

### Browser walkthrough

| Case | Browser actions and observations | Status |
| --- | --- | --- |
| Typical | Searched defaults and inspected A $612; saved tracker and recorded a $518 best-fare check; SMS preference, history, and notification survived reload. Connected mock vault, approved $650 authority with $600 threshold; A waited for confirmation, then produced a $612 simulated receipt and audit trail that survived reload | Pass |
| Challenge | Changed final repricing to a risen fare: $657 was rejected, no receipt. Retried unchanged and booked. Repeated A under the same authority returned the existing receipt with duplicate suppression, not another order | Pass |
| Invalid/incomplete | Missing-bag/fare repricing on another offer required review, no order. Editing authority cap to $640 invalidated it and a subsequent purchase was blocked. Empty/negative search budget stayed on Search with validation errors | Pass |

Other verified UI behaviors: fixture B $651 failed the cap, C $600 showed unknown bags/fare; Chicago, year, and vague date windows required explicit answers; the resulting draft was labeled Not approved. Mock provider and no-ticket/no-payment disclosures were visible. At a 390px viewport the form fit without document overflow; navigation was horizontally scrollable.

Minor UX caveats: Auto-book/Vault navigation links require horizontal scrolling on narrow phones. Offer buttons can remain visually enabled after authority invalidation, but the warning and purchase gate correctly block them.

## Known limitations

1. **No live travel or AI services.** Finite synthetic catalog, rule-based language extraction, mock supplier flows, no real availability, tickets, payments, or delivery of notifications.
2. **Browser-local demo persistence.** Trackers, authorities, receipts, and logs use localStorage. No user accounts, multi-device sync, server-side enforcement, or continuous monitoring. Clearing browser storage removes saved demo data.
3. **Restricted commerce model.** Round-trip USD searches only, finite airports and grammar, fictional profiles, and no real cancellations/refunds or supplier credential vault. Passing prototype guardrails is not production booking readiness.

## AI-assisted development

Replit Agent and specialized design/testing assistants helped implement and verify this prototype. Development assistance is separate from the rule-based "AI" experience inside FlyLow.

## Assignment submission

Public code repository: https://github.com/joconne8/flylow_v2

The Replit preview is not yet a verified published prototype link. Publish through Replit and verify the resulting URL while logged out before submission. Nothing has been submitted to Canvas.

Suggested Canvas note: **Test results and known limitations are in README.md under Testing and Known limitations.**
