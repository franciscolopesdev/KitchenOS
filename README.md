# 🍳 KitchenOS

> **An open-source AI-powered culinary operating system built with TypeScript, Node.js and the Model Context Protocol (MCP).**

KitchenOS is an experimental platform that combines AI agents, event-driven architecture, automation and modern web technologies to create a complete operating system for the kitchen.

Instead of being just a recipe app, KitchenOS acts as an intelligent cooking companion capable of managing inventory, tracking nutrition, planning meals, synchronizing with Notion, assisting during cooking sessions and exposing its capabilities through an MCP server.

The long-term vision is to build an extensible platform where AI can understand everything happening inside a kitchen and proactively help the user make better decisions.

---

# ✨ Features

* 🤖 MCP Server compatible with AI clients
* 🧠 AI Cooking Assistant
* 🎙️ Hands-Free Voice Mode
* 📦 Pantry & Inventory Management
* 🛒 Automatic Shopping Lists
* 🍽️ Cooking Session Manager
* 🥗 Nutrition & Macro Tracking
* 💧 Water Intake Tracking
* 📈 Culinary Timeline
* 🔄 Incremental Notion Synchronization
* 🔌 Plugin System
* ⚙️ Event-driven Automation Engine
* 📱 Progressive Web App (PWA)

---

# 🏗 Architecture

KitchenOS follows a modular event-driven architecture.

```text
                     Web Dashboard (React + PWA)
                               │
                     REST / WebSocket API
                               │
                    ┌───────────────────────┐
                    │     Kitchen Core      │
                    ├───────────────────────┤
                    │ Event Bus             │
                    │ Plugin Registry       │
                    │ Automation Engine     │
                    │ MCP Server            │
                    │ AI Integrations       │
                    └───────────┬───────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
      SQLite              Notion Sync          External APIs
      Drizzle ORM         Incremental          Gemini / Others
```

Every module communicates through an internal Event Bus, allowing new plugins and services to be added without tightly coupling the application.

---

# 🚀 Current Modules

## Event Bus

Asynchronous Pub/Sub system responsible for communication between modules.

Examples:

* session_started
* session_finished
* inventory_changed
* ingredient_depleted
* context_changed

---

## Plugin Registry

Every AI capability is exposed as a plugin.

Plugins can register:

* MCP Tools
* Event Handlers
* Automation Rules
* Prompt Instructions
* Background Jobs

No core modifications are required to extend the system.

---

## Automation Engine

Runs background rules that allow KitchenOS to proactively help the user.

Examples:

* Detect low inventory
* Suggest recipes
* Monitor ingredient expiration
* Generate shopping lists
* Recommend meals
* Trigger notifications

---

## Notion Synchronization

KitchenOS keeps local SQLite data synchronized with multiple interconnected Notion databases using an incremental synchronization strategy.

SQLite remains the source of truth while Notion provides a human-friendly interface for editing and visualization.

---

## AI Cooking Assistant

The assistant can:

* answer cooking questions
* modify recipes
* suggest substitutions
* adapt recipes for different equipment
* interact with MCP tools
* access the complete kitchen context

---

# 🛠 Tech Stack

## Backend

* TypeScript
* Node.js
* MCP SDK
* SQLite
* Drizzle ORM
* Notion API
* Gemini API

## Frontend

* React
* Vite
* TypeScript
* TailwindCSS
* PWA
* Web Speech API

## Architecture

* Event Bus
* Plugin System
* Rule Engine
* Incremental Synchronization
* Background Workers

---

# 🚧 Roadmap

## Core

* [x] MCP Server
* [x] Pantry Management
* [x] Shopping Lists
* [x] Nutrition Tracking
* [x] Notion Sync
* [x] Voice Assistant

## In Progress

* [ ] OCR Receipt Scanner
* [ ] Docker Deployment
* [ ] Smart Meal Planner
* [ ] Local LLM Support (Ollama)
* [ ] Home Assistant Integration
* [ ] Bluetooth Smart Scale
* [ ] AI Conversation Memory
* [ ] Multi-user Support

---

# 🤝 Contributing

KitchenOS is still under active development and I'd love feedback from experienced developers.

I'm especially looking for contributors interested in:

* TypeScript
* React
* Node.js
* MCP
* AI Agents
* Event-driven Architecture
* Plugin Systems
* Notion API
* SQLite
* PWA
* UI/UX
* Testing
* DevOps

Ideas, Issues, Pull Requests and architectural discussions are all welcome.

If you think part of the project is over-engineered, could be simplified or redesigned, please open a Discussion or Issue.

Constructive criticism is just as valuable as code contributions.

---

# 💡 Ideas for Contributors

* OCR receipt scanner
* Home Assistant integration
* Bluetooth smart scale support
* Docker images
* GitHub Actions
* Offline mode with Ollama
* Mobile-first interface
* AI meal planner
* Calendar integration
* Smart grocery recommendations
* Recipe versioning improvements
* AI memory improvements

---

# 📜 License

MIT License.
