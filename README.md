<div align="center">
  <img src="public/logo.svg" alt="O.P.E.R.A.T.O.R Logo" width="200"/>
  
  # O.P.E.R.A.T.O.R
  
  ### Operational Platform for Enhanced Reasoning and Task Automation
  
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Version](https://img.shields.io/badge/version-1.0.0-purple.svg)](https://github.com/dexters-lab-ai/nexus/releases)
  [![Discord](https://img.shields.io/discord/YOUR_DISCORD_INVITE?color=7289da&logo=discord&logoColor=white)](https://discord.gg/OPERATORai)
  [![Twitter Follow](https://img.shields.io/twitter/follow/dexters_ai_lab?style=social)](https://twitter.com/dexters_ai_lab)
  
  ---
</div>

## 🌟 Overview

O.P.E.R.A.T.O.R is an advanced AI assistant that transforms natural language into automated browser and computer tasks. It combines multiple state-of-the-art language models with a powerful automation engine to understand and execute complex workflows across web and desktop applications.

## ✨ Key Features

### 🤖 Multi-Model Architecture
- **Diverse AI Models**: Choose from leading AI providers including OpenAI, Google, Alibaba, and ByteDance
- **Specialized Capabilities**: Each model excels in different areas (vision, reasoning, UI interaction, etc.)
- **Model Comparison**: Easily compare outputs from different models for optimal results

### 🛠️ Core Capabilities
- **Natural Language Understanding**: Convert plain English instructions into automated actions
- **Visual Grounding**: Advanced computer vision for precise UI element interaction
- **Workflow Automation**: Chain multiple tasks into complex, automated workflows
- **YAML Integration**: Define and execute tasks using structured YAML configuration
- **Cross-Platform**: Works seamlessly across Windows, macOS, and Linux

### 🎯 Use Cases
- **Smart Shopping Assistant**: Price comparisons, deal tracking, and purchase automation
- **Job Application Manager**: Automate job searches, applications, and follow-ups
- **Meeting Assistant**: Join, transcribe, and summarize meetings with action items
- **Workflow Automation**: Connect multiple applications and services in custom workflows
- **Data Extraction**: Scrape and organize web data intelligently

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm 8+
- Modern web browser (Chrome, Firefox, Edge, or Safari)
- API keys for your preferred AI providers

### Installation

```bash
# Clone the repository
git clone https://github.com/dexters-lab-ai/operator.git
cd operator

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Deployment

```bash
# Build frontend assets
npm run build

# Start production server
npm start
```

Access the application at `http://localhost:3400`

## 🧩 Features in Detail

### Multi-Model Support
O.P.E.R.A.T.O.R supports various AI models, each with unique strengths:

| Model | Provider | Strengths | Best For |
|-------|----------|-----------|----------|
| GPT-4o | OpenAI | Advanced reasoning, code generation | General tasks, complex workflows |
| Qwen-2.5-VL 72B | Alibaba | Visual grounding, UI interaction | Precise element targeting |
| Gemini-2.5-Pro | Visual understanding, multimodal | Research, data analysis |
| UI-TARS | ByteDance | End-to-end GUI automation | Complex UI workflows |
| Claude 3 Opus | Anthropic | Safety, instruction-following | Sensitive tasks |
| Grok-1 | xAI | Real-time data, conversational | Interactive tasks |

### Execution Modes

1. **Step Planning (Default)**
   - Processes tasks step-by-step with validation
   - Provides detailed progress updates
   - Ideal for complex or critical tasks

2. **Action Planning (Autopilot)**
   - Plans complete sequence of actions upfront
   - More efficient for routine tasks
   - Reduces completion time

3. **YAML Planning (Recommended)**
   - Uses structured YAML for precise control
   - Enables complex workflow definitions
   - Provides transparency and reproducibility

### YAML Workflow Automation

Define complex workflows using YAML:

```yaml
name: Research Assistant
version: 1.0
tasks:
  - name: Search Academic Papers
    action: web.search
    params:
      query: "machine learning applications in healthcare"
      source: "google_scholar"
      limit: 5
    
  - name: Extract Key Findings
    action: ai.analyze
    params:
      content: "{{task_1.results}}"
      instructions: "Summarize key findings and methodologies"
    
  - name: Generate Report
    action: docs.create
    params:
      title: "Research Summary - {{date}}"
      content: "{{task_2.summary}}"
      format: "markdown"
```

## 🛠️ Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
PORT=3400
NODE_ENV=development
API_KEYS={
  "openai": "your-openai-key",
  "google": "your-google-key",
  "qwen": "your-qwen-key"
}
```

### API Keys
Configure your API keys in the Settings panel:
1. Click the gear icon in the top-right corner
2. Navigate to "API Keys" tab
3. Enter your keys for each provider
4. Click "Save"

## 📚 Documentation

For detailed documentation, please visit our [Documentation Portal](https://dexters-ai-lab.gitbook.io/dexters-ai-lab/getting-started/publish-your-docs-1).

### Key Components
- **Frontend**: React with Vite, VanillaJs
- **Backend**: Node.js with Express
- **Real-time**: WebSocket integration
- **Database**: MongoDB (optional)

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) to get started.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Community

Join our growing community:

- [Dorahacks](https://dorahacks.io/buidl/24088/) - Follow the Buidl
- [GitHub Issues](https://github.com/dexters-lab-ai/Nexus/issues) - Report issues
- [Twitter](https://twitter.com/dexters_ai_lab) - Latest updates
- [Telegram](/) - Professional network

## 🙏 Acknowledgments

- Jesus first. All the amazing open-source projects that made this possible
- Our wonderful community of contributors and users
- The AI/ML community for continuous innovation

---

<div align="center">
  Made with ❤️ by the D.A.I.L Team
</div>
