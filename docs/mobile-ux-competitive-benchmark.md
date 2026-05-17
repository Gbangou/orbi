# Mobile UX Competitive Benchmark

Date: 2026-05-17

## Scope

This note captures the rider and driver UX patterns Orbi should match or beat for
vehicle choice, live tracking, driver trust and driver offer cards. It focuses on
Uber, Lyft, Yango and Bolt-like ride-hailing expectations, while keeping Orbi
localized for Burkina Faso operations.

## Competitor Signals

- Uber exposes available vehicle options before confirmation and may show price,
  ETA and busy-market messaging beside those options.
- Lyft emphasizes upfront rider pricing, and its driver product exposes upfront
  pay, pickup/drop-off details, time and distance factors before acceptance.
- Yango public rider copy highlights automatic ride cost calculation and real-time
  car visibility on the map.
- Lyft rider education material describes showing the driver photo, car and ETA
  after request.

Sources:
- https://help.uber.com/riders/article/%EC%B0%A8%EB%9F%89-%EC%84%9C%EB%B9%84%EC%8A%A4%EC%9D%98-%EC%B0%A8%EB%9F%89-%EC%98%B5%EC%85%98-%EC%84%A0%ED%83%9D%ED%95%98%EA%B8%B0?nodeId=53d5ef29-0fa5-4252-a48c-43ff244ce6ce
- https://help.lyft.com/hc/iw-us/all/articles/115012925707
- https://help.lyft.com/hc/en/all/articles/8668928544
- https://www.lyft.com/blog/posts/how-does-lyft-work
- https://yango.com/en_cg/rider

## Orbi Product Bar

- Vehicle cards must make moto versus car obvious without fragile image assets.
- Riders must see upfront fare, ETA, service feeling, payment readiness and
  availability context before confirming.
- During active trips, riders must see their position status, driver approach
  distance, movement freshness, verified driver identity, vehicle, plate and
  photo when uploaded.
- Drivers must see mission economics and operational effort at a glance:
  pickup distance, trip distance, estimated net payout, rider identity and
  vehicle compatibility.
- All live views must preserve degraded-mode copy when realtime or detailed trip
  data is unavailable.

## Current Implementation Direction

- Rider booking now uses richer React Native vehicle drawings, service tags and
  clearer upfront pricing/ETA hierarchy.
- Rider activity now pairs route monitoring metrics with a compact live approach
  preview, plus driver photo fallback, vehicle, plate and verification details.
- Driver home now renders reserved offers as mission cards with rider initials,
  route visual, moto/car symbol and fast economics.
