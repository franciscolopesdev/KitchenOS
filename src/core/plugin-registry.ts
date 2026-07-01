export interface ToolDefinition {
  declaration: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
  handler: (args: any) => Promise<any> | any;
}

export interface KitchenOSPlugin {
  name: string;
  tools?: ToolDefinition[];
  systemInstructions?: string[];
  init?: () => Promise<void> | void;
}

class PluginRegistry {
  private plugins: Map<string, KitchenOSPlugin> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a plugin, load its tools, and run its initialization hook.
   */
  async register(plugin: KitchenOSPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginRegistry] Plugin "${plugin.name}" is already registered. Overwriting.`);
    }
    
    this.plugins.set(plugin.name, plugin);

    // Register tools
    if (plugin.tools) {
      for (const tool of plugin.tools) {
        this.tools.set(tool.declaration.name, tool);
      }
    }

    // Run init hook if present
    if (plugin.init) {
      try {
        await plugin.init();
      } catch (err: any) {
        console.error(`[PluginRegistry] Error initializing plugin "${plugin.name}":`, err.message);
      }
    }

    console.log(`[PluginRegistry] Successfully loaded plugin: ${plugin.name}`);
  }

  getPlugins(): KitchenOSPlugin[] {
    return Array.from(this.plugins.values());
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns tools schema formatted for Gemini Function Calling
   */
  getGeminiToolsSchema(): any[] {
    const declarations = this.getTools().map(t => t.declaration);
    if (declarations.length === 0) return [];
    return [{ functionDeclarations: declarations }];
  }

  /**
   * Compiles system instructions from all loaded plugins
   */
  getSystemInstructions(): string {
    const instructions: string[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.systemInstructions) {
        instructions.push(...plugin.systemInstructions);
      }
    }
    return instructions.join('\n');
  }
}

export const pluginRegistry = new PluginRegistry();
export default pluginRegistry;
