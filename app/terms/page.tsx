import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service - AskFleming",
  description: "Terms of Service for AskFleming, an AI-powered medical assistant by Perkily",
  robots: {
    index: true,
    follow: true,
  },
}

export default function TermsOfServicePage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
              <p>
                By accessing and using AskFleming ("Service"), operated by Perkily ("Company", "we", "us", or "our"), 
                you accept and agree to be bound by the terms and provision of this agreement. If you do not agree 
                to these Terms of Service, please do not use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">2. Description of Service</h2>
              <p>
                AskFleming is an AI-powered medical assistant and multi-model chat application designed to provide 
                health information, medical insights, and AI assistance. The Service is intended for informational 
                purposes only and is not a substitute for professional medical advice, diagnosis, or treatment.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">3. Medical Disclaimer</h2>
              <p className="font-semibold text-red-600 dark:text-red-400">
                IMPORTANT: AskFleming is not a medical service and does not provide medical advice, diagnosis, or treatment.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  The information provided by AskFleming is for informational and educational purposes only.
                </li>
                <li>
                  Always seek the advice of your physician or other qualified health provider with any questions 
                  you may have regarding a medical condition.
                </li>
                <li>
                  Never disregard professional medical advice or delay in seeking it because of something you 
                  have read or received through AskFleming.
                </li>
                <li>
                  If you think you may have a medical emergency, call your doctor or emergency services immediately.
                </li>
                <li>
                  AskFleming does not recommend or endorse any specific tests, physicians, products, procedures, 
                  opinions, or other information that may be mentioned in the Service.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">4. User Accounts and Responsibilities</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  You are responsible for maintaining the confidentiality of your account credentials.
                </li>
                <li>
                  You are responsible for all activities that occur under your account.
                </li>
                <li>
                  You must provide accurate, current, and complete information when creating an account.
                </li>
                <li>
                  You must notify us immediately of any unauthorized use of your account.
                </li>
                <li>
                  You must be at least 18 years old to use this Service, or have parental consent if under 18.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">5. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for any illegal purpose or in violation of any laws.</li>
                <li>Transmit any harmful, offensive, or inappropriate content.</li>
                <li>Attempt to gain unauthorized access to the Service or its related systems.</li>
                <li>Interfere with or disrupt the Service or servers connected to the Service.</li>
                <li>Use the Service to violate the privacy or rights of others.</li>
                <li>Impersonate any person or entity or falsely state or misrepresent your affiliation.</li>
                <li>Use automated systems to access the Service without permission.</li>
                <li>Share your API keys or credentials with unauthorized parties.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">6. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by Perkily and are 
                protected by international copyright, trademark, patent, trade secret, and other intellectual 
                property laws. You may not copy, modify, distribute, sell, or lease any part of our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">7. User Content</h2>
              <p>
                You retain ownership of any content you submit, post, or display on or through the Service 
                ("User Content"). By submitting User Content, you grant us a worldwide, non-exclusive, 
                royalty-free license to use, reproduce, modify, and distribute your User Content solely for 
                the purpose of providing and improving the Service.
              </p>
              <p className="mt-4">
                You are solely responsible for your User Content and the consequences of posting or publishing it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">8. Data Privacy and Security</h2>
              <p>
                We take your privacy seriously. Please review our{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>{" "}
                to understand how we collect, use, and protect your information. We implement industry-standard 
                security measures including encryption to protect your data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">9. Third-Party Services</h2>
              <p>
                The Service may integrate with third-party AI models and services. Your use of these third-party 
                services is subject to their respective terms of service and privacy policies. We are not 
                responsible for the practices of third-party services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PERKILY AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY 
                INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR 
                REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER 
                INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">11. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless Perkily, its officers, directors, employees, and agents 
                from any claims, damages, losses, liabilities, and expenses (including legal fees) arising out of 
                or relating to your use of the Service, your User Content, or your violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">12. Service Modifications</h2>
              <p>
                We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) at any 
                time, with or without notice. We shall not be liable to you or any third party for any modification, 
                suspension, or discontinuation of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">13. Termination</h2>
              <p>
                We may terminate or suspend your account and access to the Service immediately, without prior notice 
                or liability, for any reason, including if you breach these Terms. Upon termination, your right to 
                use the Service will cease immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">14. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in 
                which Perkily operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">15. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will notify users of any material changes 
                by posting the new Terms on this page and updating the "Last updated" date. Your continued use of 
                the Service after such modifications constitutes your acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">16. Contact Information</h2>
              <p>
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Perkily</strong>
                <br />
                Email: support@perkily.io
                <br />
                Website: <Link href="https://askfleming.perkily.io" className="text-primary hover:underline">https://askfleming.perkily.io</Link>
              </p>
            </section>
          </div>

          <div className="mt-12 border-t pt-8">
            <Link 
              href="/" 
              className="text-primary hover:underline"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

