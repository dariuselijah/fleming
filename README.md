# AskFleming

[askfleming.perkily.io](https://askfleming.perkily.io)

**AskFleming** is an AI-powered medical assistant and multi-model chat application designed for both general users and healthcare professionals. It supports a wide range of models, including Grok-4, GPT-4o, Claude, Gemini, and local models via Ollama. With its "Bring Your Own Key" (BYOK) support, users can easily integrate their own API keys.

![AskFleming cover](./public/cover_fleming.jpg)

## Key Features:

- **AI Medical Assistant:** Get instant medical insights, health advice, and AI assistance powered by leading models like Grok-4 and GPT-4o.
- **Multi-Model Support:** Seamlessly switch between different AI models to find the best one for your needs.
- **Healthcare Agent:** A specialized AI assistant for healthcare professionals, providing evidence-based clinical guidance, differential diagnoses, and treatment recommendations.
- **BYOK and Local Models:** Use your own API keys or run models locally with Ollama for greater control and privacy.
- **File Uploads and Data Analysis:** Upload files and analyze data with ease.
- **Customizable and Self-Hostable:** Tailor the application to your specific needs and host it on your own infrastructure.

## Quick Start

### Option 1: With OpenAI (Cloud)

```bash
git clone https://github.com/ibelick/fleming.git
cd fleming
npm install
echo "OPENAI_API_KEY=your-key" > .env.local
npm run dev
```

### Option 2: With Ollama (Local)

```bash
# Install and start Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.2  # or any model you prefer

# Clone and run Fleming
git clone https://github.com/ibelick/fleming.git
cd fleming
npm install
npm run dev
```

Fleming will automatically detect your local Ollama models!

### Option 3: Docker with Ollama

```bash
git clone https://github.com/ibelick/fleming.git
cd fleming
docker-compose -f docker-compose.ollama.yml up
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ibelick/fleming)

To unlock features like auth, file uploads, see [INSTALL.md](./INSTALL.md).

## Built with

- [prompt-kit](https://prompt-kit.com/) — AI components
- [shadcn/ui](https://ui.shadcn.com) — core components
- [motion-primitives](https://motion-primitives.com) — animated components
- [vercel ai sdk](https://vercel.com/blog/introducing-the-vercel-ai-sdk) — model integration, AI features
- [supabase](https://supabase.com) — auth and storage

## Sponsors

<a href="https://vercel.com/oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

## License

Apache License 2.0

## Notes

This is a beta release. The codebase is evolving and may change.
