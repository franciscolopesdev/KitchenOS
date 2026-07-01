# 🍳 KitchenOS - Prestige Culinary Engine

O **KitchenOS** é um sistema operacional culinário inteligente baseado em **Model Context Protocol (MCP)**, desenvolvido em **TypeScript** e **Node.js**. O sistema combina um banco de dados local **SQLite** (via **Drizzle ORM**) com **sincronização bidirecional incremental para 13 bases de dados no Notion**, permitindo uma interface de acompanhamento humana elegante e um motor de inteligência artificial autônomo.

A aplicação inclui um **Painel Web de Luxo** (disponível em `http://localhost:3030` e instalável como **PWA**) contendo um Console Assistente do Chef por voz ("Mãos Livres") e abas para gerenciamento de estoque, compras automáticas, linha do tempo (biografia culinária), controle de saúde (calorias, água, macros) e acompanhamento de metas culinárias.

---

## 🛠️ Arquitetura do Sistema

O KitchenOS foi arquitetado sobre o paradigma de **Companion Engine (Core Event-Bus)**, permitindo desacoplamento total entre o servidor e os módulos culinários:

1. **Event Bus (`src/core/event-bus.ts`)**: Um barramento de eventos assíncrono Pub/Sub para comunicação desacoplada de dados (ex: eventos de `context_changed`, `session_ended`, `item_depleted`).
2. **Plugin Registry (`src/core/plugin-registry.ts`)**: Registrador dinâmico que consolida regras de prompt de sistema, ferramentas da API do Gemini (MCP) e handlers de eventos para módulos plugáveis.
3. **Event Engine (`src/core/event-engine.ts`)**: Avaliador proativo de regras de comportamento em segundo plano. Permite que o sistema tome iniciativa própria (ex: alertar sobre ingredientes vencendo ou sugerir receitas com base no clima frio) sem depender do input do usuário.
4. **Notion Sync Engine (`src/notion/sync.ts`)**: Sincronizador incremental que pega dados locais e gerencia relações complexas e tabelas no Notion de forma automática.

---

## 💡 Recursos de Destaque

*   **Virtual Chef Console**: Interface de chat com o modelo Gemini que aceita comandos em linguagem natural para receitas, experimentos e substituições de ingredientes.
*   **Controle por Voz Mãos Livres**: Integrado na aba *Cooking Session*, o usuário pode utilizar comandos de voz (ex: "próximo passo", "voltar etapa", "pausar cronômetro") para operar o sistema sem tocar na tela durante o preparo.
*   **Culinary Reasoning Engine (CRE)**: Motor que simula dinamicamente a física térmica dos equipamentos do usuário (Air Fryer, Panela de Pressão, Forno) para adaptar automaticamente etapas, tempos e temperaturas das receitas com base nos utensílios ativos.
*   **Cognitive Behavior Engine (CBE)**: Aprendizado contínuo com base nos feedbacks qualitativos do cozinheiro pós-preparo, promovendo receitas automaticamente para novas versões (ex: `v1.1`) e definindo equipamentos preferidos de cozimento.
*   **Hidratação e Ingestão Ativa (Saúde)**: Painel de telemetria de saúde integrado, conectando consumo de água, pesagem diária e baixa automática de macros/calorias após o término de sessões culinárias.
*   **Suíte de Auto-Teste de DOM**: Painel diagnóstico flutuante no frontend capaz de validar de forma automatizada o funcionamento das abas de navegação e chamadas do console da IA.

---

## 🚀 Como Iniciar o Projeto

### Pré-requisitos
*   Node.js (versão 18 ou superior)
*   SQLite 3

### 1. Instalação
Clone o repositório e instale as dependências:
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:
```env
DB_FILE_NAME=kitchen_os.db
NOTION_TOKEN=secret_seu_token_aqui
NOTION_PARENT_PAGE_ID=id_da_sua_pagina_mae_aqui
# Opcional (Caso queira definir chaves no servidor. O frontend também permite salvar localmente no navegador)
GEMINI_API_KEY=AIzaSy...
```

### 3. Provisionar o Notion e o Banco de Dados Local
Execute as migrações locais do SQLite e configure automaticamente as 13 bases de dados interconectadas na sua página mãe do Notion:
```bash
# Rodar migrações do SQLite
npm run db:migrate

# Seed de dados iniciais (ingredientes e equipamentos base)
npm run db:seed

# Criar e estruturar as tabelas no Notion
npm run notion:setup
```

### 4. Executar o Painel Web (PWA)
Para rodar a interface de dashboard local em tempo real:
```bash
npm run ui
```
Abra o navegador no endereço **[http://localhost:3030](http://localhost:3030)**. Você verá a console operacional pronta para uso.

Para instalar como aplicativo nativo no computador ou celular, clique no botão de **Instalar** (ícone de `+`) no canto superior direito da barra de endereços do seu navegador Chrome/Edge.

### 5. Executar como Servidor MCP (Cursor ou Claude Desktop)
Para acoplar o KitchenOS como inteligência externa nas suas IDEs e ferramentas compatíveis com MCP:

Adicione a seguinte entrada de servidor na sua configuração:
```json
"kitchen-os": {
  "command": "npx",
  "args": [
    "-y",
    "tsx",
    "C:/caminho/para/seu/projeto/KitchenOS/src/index.ts"
  ],
  "env": {
    "DB_FILE_NAME": "C:/caminho/para/seu/projeto/KitchenOS/kitchen_os.db",
    "NOTION_TOKEN": "secret_seu_token",
    "NOTION_PARENT_PAGE_ID": "page_id_notion"
  }
}
```

---

## 🤝 Contribuição e Extensibilidade (Para a Comunidade)

O KitchenOS foi construído para ser modular. Desenvolvedores podem facilmente estender o sistema adicionando novos **Plugins** ou novas **Regras Proativas**.

### 1. Como Criar um Novo Plugin
Os plugins devem estender a classe `KitchenPlugin` (ou a base genérica de plugins) e expor suas ferramentas e instruções ao `pluginRegistry`.

Crie um novo arquivo em `src/plugins/meu-plugin.ts`:

```typescript
import { EventBus } from '../core/event-bus.js';
import { PluginRegistry } from '../core/plugin-registry.js';

export interface MyPluginConfig {
  apiKey?: string;
}

export class MyCustomPlugin {
  name = 'my_custom_plugin';
  
  constructor(private config: MyPluginConfig) {}

  // Gancho de inicialização do plugin
  async init(registry: PluginRegistry, eventBus: EventBus): Promise<void> {
    // 1. Registrar novas ferramentas MCP/Gemini
    registry.registerTool({
      name: 'send_whatsapp_alert',
      description: 'Envia uma mensagem de alerta culinário via gateway de mensagens.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'O texto do alerta.' }
        },
        required: ['message']
      },
      // Handler executado quando a IA chamar a ferramenta
      execute: async (args: { message: string }) => {
        console.log(`[MyPlugin] Enviando alerta: ${args.message}`);
        // Logica de integração externa aqui...
        return { success: true, status: 'Alerta disparado' };
      }
    });

    // 2. Ouvir eventos do Event Bus
    eventBus.subscribe('session_ended', async (data) => {
      console.log(`[MyPlugin] Sessão finalizada detectada! O chef avaliou com nota ${data.averageRating}`);
      // Poderia enviar uma notificação para um smartwatch, por exemplo.
    });

    // 3. Adicionar instruções personalizadas ao prompt do sistema da IA
    registry.registerSystemInstruction(
      'Sempre que uma refeição for finalizada com avaliação menor que 3, sugira ao cozinheiro registrar um feedback de técnica.'
    );
  }
}
```

Registre o plugin no boot do servidor em `src/services/webserver.ts` (ou no inicializador MCP em `src/index.ts`):
```typescript
import { MyCustomPlugin } from '../plugins/meu-plugin.js';
await pluginRegistry.register(new MyCustomPlugin({ apiKey: process.env.MY_API_KEY }));
```

### 2. Como Adicionar Nova Regra Proativa no Event Engine
As regras são processadas ciclicamente e podem disparar alertas no Telegram e no feed de notificações do painel web.

Crie uma regra em `src/plugins/kitchen-rules.ts`:

```typescript
import { Rule } from '../core/event-engine.js';
import { db } from '../db/client.js';

export const myCustomHealthRule: Rule = {
  id: 'health-pantry-check',
  name: 'Verificação Nutricional da Despensa',
  priority: 'Suggestion',
  cooldownSeconds: 43200, // Executa uma vez a cada 12 horas

  // Condição para o disparo da regra
  condition: async (context) => {
    // Verifica, por exemplo, se o usuário está com déficit de proteína planejada
    const hasLowProteinStocks = true; // Lógica de consulta no DB
    return hasLowProteinStocks;
  },

  // Ação disparada quando a condição retorna verdadeiro
  action: async (context) => {
    return {
      title: '🚨 Dica Nutricional da Chef',
      message: 'Notei que o estoque de ovos e frango está abaixo do limite sugerido para suas metas diárias. Deseja adicionar à lista de compras?',
      channels: ['telegram', 'ui'] // Envia pelo bot do Telegram e exibe na UI
    };
  }
};
```
Adicione a regra no array de carregamento dentro do `kitchenPlugin` em `src/plugins/kitchen-plugin.ts` ou injete dinamicamente.

### 🌟 Idéias de Projetos para a Comunidade:
*   **Integração Home Assistant / IoT**: Conectar timers do KitchenOS para pré-aquecer o forno físico automaticamente ou controlar a coifa de forma inteligente via Zigbee/WiFi.
*   **Scanner OCR de Notas Fiscais**: Adicionar uma ferramenta para tirar foto e fazer upload do cupom de compras de supermercado, utilizando a visão da IA para cadastrar automaticamente os itens e validades no estoque.
*   **Integração com Balança Inteligente**: Sincronizar o peso corporal registrado na aba *Saúde* direto via Bluetooth.
*   **Chat de Voz Bidirecional (Conversação Real)**: Implementar entrada por áudio e síntese de voz (TTS) para que a IA fale as respostas diretamente, permitindo uma interação natural sem precisar ler a tela enquanto o cozinheiro prepara os alimentos.
*   **Chat Interativo e Proativo**: Permitir que o Jarvis inicie conversas ativamente no feed do console do usuário. Exemplos: perguntar se o usuário deseja iniciar o próximo passo assim que um timer expirar, pedir um feedback qualitativo da receita logo após encerrar uma sessão culinária, ou sugerir o preparo de um ingrediente que está próximo de vencer.
*   **Planejador Nutricional Desperdício Zero (Smart Meal Planner)**: Criar um algoritmo inteligente de recomendação semanal que planeja o cardápio combinando os ingredientes do estoque de forma a consumir primeiro os itens perecíveis que estão mais próximos da data de validade.
*   **Modo Assistente Offline Compartilhado**: Adicionar suporte a modelos locais de linguagem (como Ollama/Llama 3) para tornar a console offline e segura contra falhas de internet.
