// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { ConfigEnv, PluginOption, UserConfig } from "vite";

const lovableConfig = defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // In dev, Start also serves every CSS file in the module graph from /@tanstack-start/styles.css.
    // __root.tsx already links the compiled styles.css, and the extra copy sent tw-animate-css
    // through lightningcss on its own, which warned about Tailwind's @theme and @utility.
    dev: { ssrStyles: { enabled: false } },
  },
});

const TSCONFIG_PATHS_PLUGIN = "vite-tsconfig-paths";

function isTsconfigPathsPlugin(plugin: PluginOption): boolean {
  return !!plugin && "name" in plugin && plugin.name === TSCONFIG_PATHS_PLUGIN;
}

// The wrapper always adds the vite-tsconfig-paths plugin, which Vite 8 replaces with the built-in
// resolve.tsconfigPaths and warns about on every start. Swap the plugin for the built-in option.
// The package stays installed, because the wrapper imports it.
export default async (env: ConfigEnv): Promise<UserConfig> => {
  const config = await lovableConfig(env);
  return {
    ...config,
    plugins: (config.plugins ?? []).filter((plugin) => !isTsconfigPathsPlugin(plugin)),
    resolve: { ...config.resolve, tsconfigPaths: true },
  };
};
