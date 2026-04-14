# First Users, First Data, First Disappointment

## Shipping it

I had one lesson working. Time to find out if anyone cared.

Built a landing page with a demand capture form: "Want more lessons? Leave your email." Added PostHog analytics with a funnel: `landing_viewed` → `lesson_started` → progress milestones at 25/50/75% → `lesson_completed` → `demand_submitted`.

## Pre-generating audio

ElevenLabs API calls during lesson playback added noticeable latency. A beat of silence before every line. So I built a generation script that pre-renders every segment to MP3 and stores them as static files. The app loads a manifest and plays local audio. Zero latency.

Built a fallback chain: static MP3 → ElevenLabs API → browser speech synthesis. If pre-generated audio exists, use it. If not, call the API live. If that fails, the browser reads it in a robot voice. Every lesson is always playable.

Deployed to Vercel. Spent an embarrassing amount of time debugging PostHog analytics that weren't recording. The PostHog API key had trailing whitespace. Classic.

## Polishing the lesson

Before sharing, I tightened lesson 2. Shortened the intro to reach the "aha moment" faster, the moment where you realize you can already say things in Spanish by applying simple patterns. Removed a countdown timer that was adding friction. Made the tutor voice more conversational. Multiple iterations over two days.

## The first test

Shared it with MBA classmates.

**Results:**
- 31 visitors
- 4 starts (13%)
- 1 completion (3%)
- 0 demand submissions

Rough. 87% of people who landed on the page didn't even click play. The one person who finished didn't leave their email.

But I wasn't sure what this meant. Was the product bad? Or was the audience wrong? MBA classmates are curious about everything, committed to nothing. They're not the people who wake up wanting to learn Spanish.

I filed it away and went to work on the content problem. One lesson isn't enough to validate anything.
