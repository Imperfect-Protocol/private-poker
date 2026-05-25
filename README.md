This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Table Debug Console Commands

Open or hide the table debug console with `Ctrl` + `~`.

Commands typed into the debug console are local-only. They are not sent as chat and they are not printed in the console. Each command arms a one-shot test for the next matching outbound message from this browser.

- `/badsig` - badly signs the next outbound RTC message, testing transport BLS signature rejection and disagreement recirculation.
- `/badshuffle` - corrupts the shuffle trace in the next `SubmitPublicKey` wire message, testing shuffle verification failure.
- `/badunmask` - corrupts the next unmask submit wire message with a wrong valid G1 card point, testing final unmasking-history verification.
- `/badpk` - sends a wrong valid public key in the next `SubmitPublicKey` wire message, testing shuffle or unmask verification failure.
- `/dropnext` - silently drops the next outbound RTC message.
- `/dupenext` - sends the next outbound RTC message twice, testing duplicate-message handling.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
