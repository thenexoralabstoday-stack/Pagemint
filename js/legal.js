// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Terms, privacy and refund policy. Each section is [heading, ...paragraphs].
// Keep these accurate to how the product actually works: if a data flow or price changes, update here.
const UPDATED = '18 September 2026';

export const LEGAL = {
  terms: {
    title: 'Terms of Service',
    updated: UPDATED,
    sections: [
      ['Who we are',
        'Pagemint is a product of Nexora Labs ("we", "us"). By using Pagemint you agree to these terms. If you do not agree, please do not use it.'],
      ['The service',
        'Pagemint is a set of PDF tools that runs in your web browser. Most tools process your files entirely on your own device. The AI tools send the text extracted from your document to our server to generate an answer, as described in the Privacy Policy.'],
      ['Accounts',
        'You sign in with a link sent to your email address. You are responsible for keeping access to that email account secure, since anyone who can read it can sign in as you.'],
      ['Plans and billing',
        'The Free plan is free and has daily limits. Pro is billed in advance, either monthly ($9) or yearly ($72), and renews automatically until you cancel. The 7-day Pro pass is a one-time payment of $5 and does not renew. Prices are in US dollars and exclude any taxes that apply.',
        'Payments are processed by Stripe. If we change the price of a subscription, we will tell existing subscribers at least 30 days in advance, and the new price applies from your next renewal.'],
      ['Cancelling and refunds',
        'You can cancel at any time from the Account page and keep Pro until the end of the period you have paid for. Refunds are covered by our Refund Policy.'],
      ['Acceptable use',
        'Only use Pagemint on documents you have the right to process. Do not use it to break the law or infringe anyone else\'s rights, and do not try to get around plan limits or disrupt the service.'],
      ['Your documents',
        'Your documents remain yours. We do not receive the files you open in Pagemint. Text sent to the AI tools is used only to answer your request and is not kept by us afterwards.'],
      ['AI output',
        'AI answers can be incomplete or wrong. Check anything important against the original document before relying on it.'],
      ['Availability',
        'We work to keep Pagemint running and useful, but it is provided "as is", without guarantees that it will always be available or error-free. We may add, change or remove features over time.'],
      ['Liability',
        'To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability to you is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.'],
      ['Ending the agreement',
        'You can stop using Pagemint at any time. We may suspend accounts that break these terms.'],
      ['Changes to these terms',
        'We may update these terms. The date at the top shows the latest version. If we make a significant change, we will email active subscribers before it takes effect.'],
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    sections: [
      ['The short version',
        'Your PDFs are processed in your browser and are never uploaded to us. We collect as little as we can: your email address if you sign in or buy, and whatever you choose to send us.'],
      ['What we do not collect',
        'The files you open in Pagemint. Editing, merging, splitting, compressing, signing, redacting and converting all happen on your device.'],
      ['What we do collect',
        'Your email address, when you sign in or pay, so we can send sign-in links and know which plan you are on.',
        'Payment details are handled by Stripe. We never see or store your card number.',
        'Messages you send through the contact form: your name, email address and message.',
        'When you use the AI tools, the text extracted from your document and your question are sent to our server and passed to Anthropic, our AI provider, to generate the answer. We do not store the text after the reply.',
        'Like any website, our hosting provider records technical request logs, such as IP addresses, for security and to keep the service running.'],
      ['Stored on your device',
        'Pagemint uses your browser\'s local storage for your theme, your sign-in session and your daily usage count. We do not use advertising or tracking cookies, and we do not run analytics.'],
      ['Who we share data with',
        'Only the providers that make Pagemint work: Stripe (payments), Resend (email), Anthropic (AI tools), Render (hosting), and Google Fonts and cdnjs, which serve the fonts and a code library the page loads. We do not sell your personal data.'],
      ['How long we keep it',
        'Payment records are kept by Stripe as long as needed for billing and legal requirements. Contact messages are kept as long as needed to deal with your request.'],
      ['Your rights',
        'You can ask us for a copy of the personal data we hold about you, or ask us to delete it, by emailing us. We will respond within 30 days.'],
      ['Children',
        'Pagemint is not directed at children under 13, and we do not knowingly collect their data.'],
    ],
  },

  refunds: {
    title: 'Refund Policy',
    updated: UPDATED,
    sections: [
      ['Yearly plans',
        'If you are not happy with Pro, ask for a refund within 14 days of being charged for a yearly plan and we will refund it in full.'],
      ['Monthly plans',
        'You can cancel at any time and keep Pro until the end of the month you have paid for. We do not refund partial months.'],
      ['7-day pass',
        'The 7-day pass is a one-time purchase that does not renew, so it is not refundable once bought.'],
      ['Mistakes are always refunded',
        'If you were charged by mistake, charged twice, or a paid feature does not work and we cannot fix it, email us within 14 days and we will refund you.'],
      ['How to ask',
        'Email us from the address you paid with. Refunds go back to your original payment method through Stripe and usually arrive within 5 to 10 business days.'],
      ['How to cancel',
        'Go to Account, then Manage billing. Cancelling stops future renewals; you keep access until the end of the paid period.'],
    ],
  },
};
