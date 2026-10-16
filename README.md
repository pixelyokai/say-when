<p align="center">
  <a href="https://cal.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cal.com/logo-white.svg">
      <img src="https://cal.com/logo.svg" alt="Cal.com" height="40">
    </picture>
  </a>
</p>

# Say When

Book a meeting with people in other time zones by typing one sentence. You say when, it works out the rest.

This is a side project. I wanted to see what scheduling in Cal.com could feel like if you just wrote what you wanted, like "30 min with @lena and @priya next week, in the afternoon their time", and the page worked it out while you typed. It's an unofficial concept. It isn't made by Cal.com and isn't connected to them.

## What it does

- You type a sentence. `@` adds people, `/` picks a duration or meeting type, and `#` opens a date picker. Plain words work too ("lena tuesday at 3pm").
- As you type, everyone's day shows up on one timeline. Green is where it works for everyone.
- Drag the time slider and every person's local time moves with it.
- Slots are ranked by how comfortable the hour is for each person. Being free at 11pm still counts as a bad slot.
- If nothing works, it tells you the smallest change that would fix it, like dropping one rule or one person.
- Groups. Pick a few people from different teams, give the mix a name, and `@` it in the sentence like a person. You can create, edit and delete them from the Groups button.
- A few extras I added along the way: a rotating time when the same person keeps getting the late call, a link guests can open to pick times in their own time zone, and "same as last time" for groups you've met before.

## What isn't real

The ten people and their calendars are made up. They work in Marketing, Engineering, Product and Customer care, spread from San Francisco to Sydney. Nothing gets sent anywhere. There's no backend. It all runs in your browser, and the little it remembers (your groups, past meetings, your city) stays in local storage.

## Built with

- Next.js and Tailwind
- [coss ui](https://coss.com/ui) for every component, including the new Composer for the sentence box. The timeline drawing is the only custom part.

## Running it

```
npm install
npm run dev
```

Then open http://localhost:3000.

`npm run check:parser` runs the sentence parser against a list of test sentences.

## License

AGPL-3.0, the same license coss ui uses. The Cal.com name and logo belong to Cal.com, Inc. They're only here to say what this is a concept for.
