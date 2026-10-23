import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Resume Tailor" };

// Starting draft written for this app's actual data flows. The site owner should review it (and adapt it to their
// jurisdiction) before publishing; it is not legal advice. Set NEXT_PUBLIC_CONTACT_EMAIL to show a contact address.
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Back to Resume Tailor
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">How Resume Tailor handles your resume and job descriptions.</p>

      <Section title="The short version">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your resume and job descriptions are sent to an AI service (Anthropic&apos;s Claude) so they can be analysed.</li>
          <li>We don&apos;t store your files or their contents on our server, and we don&apos;t use them for anything else.</li>
          <li>Your resumes, jobs and edits are saved only in your own browser. You can back them up or delete them at any time.</li>
        </ul>
      </Section>

      <Section title="What happens when you upload a resume or add a job">
        <p>
          The file, pasted text or screenshot is sent to our server, which forwards it to Anthropic&apos;s Claude API to extract the
          content, check it, and suggest improvements. The result comes straight back to your browser. Our server handles your data in
          memory only for the length of the request and doesn&apos;t write it to disk or a database.
        </p>
        <p className="mt-3">
          When you paste a job link, our server fetches that public page to read the job description. It only connects to public
          websites.
        </p>
      </Section>

      <Section title="Anthropic (the AI provider)">
        <p>
          Anthropic processes this data to provide the analysis, under its commercial terms. By default, Anthropic doesn&apos;t use data
          sent through its API to train its models, and may keep it for a limited period for safety and abuse monitoring. See{" "}
          <a className="text-accent underline underline-offset-2" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">
            Anthropic&apos;s privacy policy
          </a>{" "}
          and{" "}
          <a className="text-accent underline underline-offset-2" href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer">
            commercial terms
          </a>{" "}
          for details.
        </p>
      </Section>

      <Section title="What's stored in your browser">
        <p>
          Your uploaded resumes, ATS results, jobs, tailored versions, layout choices and a few settings (for example, timing estimates
          for progress bars and whether you&apos;ve seen the notice on this page) are saved in your browser&apos;s local storage. They never
          leave your device unless you upload them again or download a backup. Clearing your browser data, or using{" "}
          <strong>Delete all my data</strong> at the bottom of every page, removes them.
        </p>
      </Section>

      <Section title="What our server keeps">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>No resume or job content.</strong> Error logs record the type of error only, never what you sent.
          </li>
          <li>
            <strong>Your IP address and the times of your AI requests,</strong> to limit how many requests one visitor can make (to
            prevent abuse and control costs). They&apos;re kept in our rate-limit store (Upstash) and deleted automatically within a
            day of your last request.
          </li>
          <li>Our hosting provider may keep standard request logs (such as time, page and IP address) under its own policies.</li>
          <li>
            <strong>Page-speed measurements</strong> (Vercel Speed Insights): how quickly pages load, with the page address, browser and
            device type. No cookies, nothing that identifies you, and never anything you typed or uploaded.
          </li>
        </ul>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>Don&apos;t upload anything you aren&apos;t comfortable sending to an AI service. You can remove details such as your phone number first.</li>
          <li>Use <strong>Back up all</strong> on the Upload page to keep a copy of your data as a file.</li>
          <li>Use <strong>Delete all my data</strong> to remove everything stored in this browser.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          {contact ? (
            <>
              Questions about privacy? Email{" "}
              <a className="text-accent underline underline-offset-2" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </>
          ) : (
            "Questions about privacy? Contact the owner of this website."
          )}
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-muted [&_strong]:text-foreground">{children}</div>
    </section>
  );
}
