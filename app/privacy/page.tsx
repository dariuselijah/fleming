import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy - AskFleming",
  description: "Privacy Policy for AskFleming, an AI-powered medical assistant by Perkily",
  robots: {
    index: true,
    follow: true,
  },
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold">1. Introduction</h2>
              <p>
                Perkily ("Company", "we", "us", or "our") operates AskFleming ("Service"), an AI-powered medical 
                assistant. This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
                when you use our Service. We are committed to protecting your privacy and handling your data with care, 
                especially health-related information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">2. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold mt-4">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Account Information:</strong> Email address, display name, profile image (if provided)
                </li>
                <li>
                  <strong>Health Information:</strong> Health context, medical conditions, medications, allergies, 
                  family history, lifestyle factors (optional, provided by you)
                </li>
                <li>
                  <strong>Chat Messages:</strong> Conversations, questions, and interactions with the AI assistant
                </li>
                <li>
                  <strong>API Keys:</strong> Third-party API keys you provide for "Bring Your Own Key" (BYOK) functionality 
                  (encrypted and stored securely)
                </li>
                <li>
                  <strong>User Preferences:</strong> Settings, model preferences, and application configurations
                </li>
                <li>
                  <strong>File Uploads:</strong> Documents, images, or other files you upload for analysis
                </li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">2.2 Automatically Collected Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Usage Data:</strong> How you interact with the Service, features used, time spent
                </li>
                <li>
                  <strong>Device Information:</strong> Browser type, device type, operating system, IP address
                </li>
                <li>
                  <strong>Log Data:</strong> Access times, pages viewed, error logs
                </li>
                <li>
                  <strong>Cookies and Tracking:</strong> We use cookies and similar technologies to enhance your experience
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process your requests and deliver AI-powered responses</li>
                <li>Personalize your experience and provide relevant health information</li>
                <li>Send you service-related communications</li>
                <li>Monitor and analyze usage patterns to improve the Service</li>
                <li>Detect, prevent, and address technical issues and security threats</li>
                <li>Comply with legal obligations and enforce our Terms of Service</li>
                <li>Protect the rights, property, or safety of Perkily, our users, or others</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">4. Data Anonymization and Third-Party AI Services</h2>
              <p className="font-semibold text-blue-600 dark:text-blue-400">
                IMPORTANT: We take your privacy seriously, especially regarding health information.
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>
                  <strong>Anonymization:</strong> Before sending your messages to third-party AI providers (such as OpenAI, 
                  Anthropic, Google, etc.), we automatically remove personally identifiable information (PII) and protected 
                  health information (PHI), including names, email addresses, phone numbers, medical record numbers, and 
                  other identifiers.
                </li>
                <li>
                  <strong>Third-Party AI Providers:</strong> Your anonymized messages may be processed by third-party AI 
                  services. These providers have their own privacy policies and terms of service.
                </li>
                <li>
                  <strong>No Health Data Sharing:</strong> We do not share your identifiable health information with 
                  third-party AI providers. Only anonymized, de-identified content is sent for processing.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">5. Data Encryption and Security</h2>
              <p>We implement industry-standard security measures to protect your data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Encryption at Rest:</strong> All sensitive data, including messages and health information, 
                  is encrypted using AES-256-GCM encryption before storage in our database.
                </li>
                <li>
                  <strong>Encryption in Transit:</strong> All data transmitted between your device and our servers 
                  is encrypted using HTTPS/TLS.
                </li>
                <li>
                  <strong>API Key Protection:</strong> Your API keys are encrypted before storage and never exposed 
                  in plain text.
                </li>
                <li>
                  <strong>Access Controls:</strong> We implement strict access controls and authentication mechanisms 
                  to prevent unauthorized access to your data.
                </li>
                <li>
                  <strong>Regular Security Audits:</strong> We conduct regular security assessments and updates to 
                  maintain the highest security standards.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">6. Data Storage and Retention</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Storage Location:</strong> Your data is stored on secure servers, which may be located 
                  in different geographic regions.
                </li>
                <li>
                  <strong>Retention Period:</strong> We retain your data for as long as necessary to provide the 
                  Service and comply with legal obligations. You can request deletion of your data at any time.
                </li>
                <li>
                  <strong>Account Deletion:</strong> When you delete your account, we will delete or anonymize your 
                  personal information, subject to legal retention requirements.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">7. Information Sharing and Disclosure</h2>
              <p>We do not sell your personal information. We may share your information only in the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Service Providers:</strong> We may share information with trusted third-party service providers 
                  who assist us in operating the Service (e.g., cloud hosting, analytics), subject to strict confidentiality 
                  agreements.
                </li>
                <li>
                  <strong>Legal Requirements:</strong> We may disclose information if required by law, court order, or 
                  government regulation.
                </li>
                <li>
                  <strong>Protection of Rights:</strong> We may disclose information to protect our rights, property, or 
                  safety, or that of our users or others.
                </li>
                <li>
                  <strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your 
                  information may be transferred to the acquiring entity.
                </li>
                <li>
                  <strong>With Your Consent:</strong> We may share information with your explicit consent.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">8. Your Rights and Choices</h2>
              <p>You have the following rights regarding your personal information:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Access:</strong> You can access and review your personal information through your account settings.
                </li>
                <li>
                  <strong>Correction:</strong> You can update or correct your information at any time.
                </li>
                <li>
                  <strong>Deletion:</strong> You can request deletion of your account and associated data.
                </li>
                <li>
                  <strong>Data Portability:</strong> You can request a copy of your data in a portable format.
                </li>
                <li>
                  <strong>Opt-Out:</strong> You can opt out of certain data collection and processing activities.
                </li>
                <li>
                  <strong>Cookie Preferences:</strong> You can manage cookie preferences through your browser settings.
                </li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us at support@perkily.io.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">9. Children's Privacy</h2>
              <p>
                Our Service is not intended for children under the age of 18. We do not knowingly collect personal 
                information from children under 18. If you are a parent or guardian and believe your child has provided 
                us with personal information, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">10. International Data Transfers</h2>
              <p>
                Your information may be transferred to and processed in countries other than your country of residence. 
                These countries may have data protection laws that differ from those in your country. We take appropriate 
                measures to ensure your information receives adequate protection in accordance with this Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">11. HIPAA and Health Information</h2>
              <p>
                While we implement security measures and data protection practices, AskFleming is not a HIPAA-covered 
                entity. However, we are committed to protecting your health information and implementing security measures 
                that align with healthcare data protection best practices, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Encryption of health data at rest and in transit</li>
                <li>Anonymization of data before transmission to third-party services</li>
                <li>Access controls and authentication</li>
                <li>Audit logging and monitoring</li>
                <li>Data minimization and retention policies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">12. Cookies and Tracking Technologies</h2>
              <p>
                We use cookies and similar tracking technologies to track activity on our Service and hold certain 
                information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being 
                sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">13. Changes to This Privacy Policy</h2>
              <p>
                We may update our Privacy Policy from time to time. We will notify you of any changes by posting the 
                new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this 
                Privacy Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">14. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
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






