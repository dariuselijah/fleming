/**
 * Helper script to start ngrok tunnel and print Twilio webhook URLs.
 *
 * Usage:
 *   npm run dev:tunnel
 *
 * Prerequisites:
 *   - ngrok installed (brew install ngrok) and authed (ngrok config add-authtoken YOUR_TOKEN)
 *   - Next.js dev server already running on port 3000
 */

import { execSync, spawn } from "child_process"

const PORT = process.env.PORT || "3000"
const NGROK_API = "http://127.0.0.1:4040/api/tunnels"
const POLL_MS = 400
const MAX_ATTEMPTS = 60 // ~24s

function readTunnelUrlFromNgrokApi(): string | null {
  try {
    const out = execSync(`curl -sS --connect-timeout 1 --max-time 2 "${NGROK_API}"`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    const data = JSON.parse(out) as {
      tunnels?: { proto?: string; public_url?: string }[]
    }
    const httpsTunnel = data.tunnels?.find((t) => t.proto === "https")
    const url = httpsTunnel?.public_url
    return url?.startsWith("https://") ? url : null
  } catch {
    return null
  }
}

async function waitForPublicUrl(): Promise<string | null> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const url = readTunnelUrlFromNgrokApi()
    if (url) return url
    if (i === 0) {
      process.stdout.write("⏳ Waiting for ngrok (local API " + NGROK_API + ")…")
    } else if (i % 5 === 0) {
      process.stdout.write(".")
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  process.stdout.write("\n")
  return null
}

function main() {
  console.log("\n🚇 Starting ngrok tunnel to localhost:" + PORT + "...\n")

  try {
    execSync("which ngrok", { stdio: "pipe" })
  } catch {
    console.error("❌ ngrok is not installed. Install it with:\n")
    console.error("   brew install ngrok")
    console.error("   ngrok config add-authtoken YOUR_NGROK_TOKEN\n")
    console.error("   Get your token at https://dashboard.ngrok.com/get-started/your-authtoken\n")
    process.exit(1)
  }

  const ngrok = spawn("ngrok", ["http", PORT], {
    stdio: ["ignore", "pipe", "pipe"],
  })

  let printed = false
  const printOnce = (url: string) => {
    if (printed) return
    printed = true
    printConfig(url)
  }

  // ngrok v3 often writes INFO lines to stderr; surface errors
  ngrok.stderr?.on("data", (chunk: Buffer) => {
    const str = chunk.toString()
    if (/ERR|error|failed|authtoken|not found/i.test(str)) {
      process.stderr.write(str)
    }
    // Some builds log the public URL here
    const m = str.match(/(https:\/\/[a-z0-9][-a-z0-9.]*\.ngrok[-a-z0-9.]*\.[a-z]{2,})/i)
    if (m) printOnce(m[1])
  })

  ngrok.stdout?.on("data", (chunk: Buffer) => {
    const str = chunk.toString()
    const m = str.match(/(https:\/\/[a-z0-9][-a-z0-9.]*\.ngrok[-a-z0-9.]*\.[a-z]{2,})/i)
    if (m) printOnce(m[1])
  })

  ngrok.on("close", (code) => {
    console.log(`\n🛑 ngrok exited with code ${code ?? 0}`)
    process.exit(code ?? 0)
  })

  process.on("SIGINT", () => {
    ngrok.kill("SIGTERM")
    process.exit(0)
  })

  void (async () => {
    const url = await waitForPublicUrl()
    if (url) printOnce(url)
    if (!printed) {
      console.error(
        "\n❌ Could not read tunnel URL from ngrok (tried " +
          NGROK_API +
          ").\n\n" +
          "   • Is another ngrok already running? (Only one free tunnel per auth token sometimes.)\n" +
          "   • Run `ngrok http " +
          PORT +
          "` in a separate terminal and open http://127.0.0.1:4040\n" +
          "   • Ensure `ngrok config add-authtoken ...` was run.\n"
      )
    }
  })()
}

function printConfig(url: string) {
  console.log("\n" + "━".repeat(70))
  console.log(`\n✅ Tunnel active: ${url}\n`)
  console.log("📋 Add this to your .env:\n")
  console.log(`   TWILIO_WEBHOOK_BASE_URL=${url}\n`)
  console.log("📌 Twilio Webhook URLs:\n")
  console.log(`   Messaging Inbound: ${url}/api/comms/messaging/webhook`)
  console.log(`   Messaging Status:  ${url}/api/comms/messaging/status`)
  console.log(`   Voice Inbound:     ${url}/api/comms/voice/webhook`)
  console.log(`   Health Check:      ${url}/api/comms/messaging/webhook/health\n`)
  console.log("━".repeat(70))
  console.log("\n💡 Paste the WhatsApp Inbound URL into Twilio Console > Sandbox Configuration")
  console.log("   Keep this terminal running while testing.\n")
}

main()
